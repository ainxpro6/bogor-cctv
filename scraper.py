"""
BSW Kota Bogor CCTV Scraper
Scrapes live HLS streams and metadata from https://bsw.kotabogor.go.id/cctv
"""

import os
import re
import ssl
import json
import csv
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# Bypass SSL verification if needed
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
}

def fetch_url(url, timeout=12):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def check_stream_active(m3u8_url, timeout=6):
    """Pings the m3u8 playlist to see if it is online"""
    if not m3u8_url:
        return False
    try:
        req = urllib.request.Request(m3u8_url, headers=HEADERS)
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as resp:
            content = resp.read(512).decode('utf-8', errors='ignore')
            return resp.status == 200 and '#EXTM3U' in content
    except Exception:
        return False

def clean_title(title):
    if not title:
        return "CCTV Kota Bogor"
    # Remove HTML tags
    t = re.sub(r'<[^>]+>', '', title).strip()
    # Remove trailing 'Kota Bogor'
    t = re.sub(r'\s*Kota\s+Bogor\s*$', '', t, flags=re.IGNORECASE).strip()
    # Remove leading CCTV / CCTV-
    t = re.sub(r'^CCTV\s*[-–:]*\s*', '', t, flags=re.IGNORECASE).strip()
    # Normalize multiple spaces
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def categorize_location(name, full_title):
    text = f"{name} {full_title}".upper()
    
    # Categorization rules for Kota Bogor districts & hotspots
    if any(k in text for k in ['KUJANG', 'KAPTEN MUSLIHAT', 'DJUANDA', 'JUANDA', 'PALEDANG', 'SURYAKENCANA', 'SURKEN', 'GANG AUT', 'SEMPUR', 'BALAI KOTA', 'SUDIRMAN', 'SAWOJAJAR', 'PASAR ANYAR', 'BOGOR TRADE MALL', 'BTM', 'DEWI SARTIKA', 'PAKUAN']):
        return "Bogor Tengah"
    elif any(k in text for k in ['TAJUR', 'BARANANGSIANG', 'SUKASARI', 'KATULAMPA', 'SINDANGRASA', 'BOGOR RAYA', 'KUNTUM', 'PAJAJARAN TIMUR']):
        return "Bogor Timur"
    elif any(k in text for k in ['WARUNG JAMBU', 'JAMBU DUA', 'BANGBARUNG', 'INDRAPRASTA', 'PANDU RAYA', 'KEDUNGHALANG', 'CIBULUH', 'CILUAR', 'TALANG', 'POMAD']):
        return "Bogor Utara"
    elif any(k in text for k in ['EMPANG', 'BATUTULIS', 'BONDONGAN', 'CIPAKU', 'PAMOYANAN', 'MULYAHARJA', 'DURAN TIGA', 'CIPAKU']):
        return "Bogor Selatan"
    elif any(k in text for k in ['GUNUNG BATU', 'SEMERU', 'CILENDEK', 'BUBULAK', 'PASIR KUDA', 'MENTENG', 'LOJI', 'DRAMAGA']):
        return "Bogor Barat"
    elif any(k in text for k in ['CIBADAK', 'JL.BARU', 'JALAN BARU', 'SHOLEH ISKANDAR', 'YASMIN', 'KAYU MANIS', 'KEBON PEDES', 'SUKADAMAI', 'KEDUNG BADAK', 'SALABENDA', 'AIR MANCUR', 'RE MARTADINATA']):
        return "Tanah Sareal"
    elif any(k in text for k in ['TOL', 'BORR', 'JAGORAWI']):
        return "Jalur Tol & Ciawi"
    elif 'PAJAJARAN' in text:
        return "Jl. Pajajaran"
    else:
        return "Wilayah Kota Bogor"

def scrape_cctv_catalog():
    print("=" * 60)
    print("BSW KOTA BOGOR - CCTV LIVE SCRAPER")
    print("=" * 60)

    # 1. Fetch main CCTV page
    main_url = "https://bsw.kotabogor.go.id/cctv"
    html = None
    try:
        print(f"[*] Fetching master directory: {main_url} ...")
        html = fetch_url(main_url)
    except Exception as e:
        print(f"[!] Warning: Failed fetching live ({e}), falling back to page.html if available...")
        if os.path.exists("page.html"):
            with open("page.html", encoding="utf-8") as f:
                html = f.read()
        else:
            raise RuntimeError("Could not fetch page and no local page.html found.")

    # 2. Extract items from HTML
    # Matches card item blocks
    matches = re.findall(
        r'<div class="col-md-2 mb-3 cctv-item">.*?<img\s+src="([^"]+)".*?<h6[^>]*>\s*<a\s+href="(https?://bsw\.kotabogor\.go\.id/cctv/(\d+)/detail)"[^>]*>\s*([^<]+?)\s*</a>',
        html,
        re.DOTALL
    )

    print(f"[+] Discovered {len(matches)} CCTV items in portal.")

    items_to_process = []
    for icon, detail_url, cid, raw_name in matches:
        items_to_process.append({
            'id': int(cid),
            'raw_name': raw_name.strip(),
            'name': clean_title(raw_name),
            'detail_url': detail_url,
            'icon': icon,
        })

    # Sort by ID ascending
    items_to_process.sort(key=lambda x: x['id'])

    # 3. Concurrently fetch detail pages
    results = []
    print(f"[*] Extracting streaming endpoints across {len(items_to_process)} feeds with 12 parallel threads...")

    def process_item(item):
        cid = item['id']
        url = item['detail_url']
        try:
            detail_html = fetch_url(url, timeout=12)
            # Find stream source (.m3u8)
            sources = re.findall(r'<source[^>]+src=[\'"]([^\'"]+)[\'"]', detail_html, re.IGNORECASE)
            stream_url = sources[0] if sources else None
            
            # Find h2 title
            h2 = re.findall(r'<h2[^>]*>(.*?)</h2>', detail_html, re.DOTALL | re.IGNORECASE)
            full_title = clean_title(h2[0]) if h2 else item['name']

            # Check if active
            is_active = check_stream_active(stream_url, timeout=5) if stream_url else False

            category = categorize_location(item['name'], full_title)

            return {
                'id': cid,
                'name': item['name'],
                'full_title': full_title,
                'category': category,
                'stream_url': stream_url,
                'detail_url': url,
                'icon': item['icon'],
                'is_active': is_active,
                'status': 'online' if is_active else 'offline',
                'stream_type': 'HLS / m3u8',
            }
        except Exception as e:
            return {
                'id': cid,
                'name': item['name'],
                'full_title': item['name'],
                'category': categorize_location(item['name'], item['name']),
                'stream_url': None,
                'detail_url': url,
                'icon': item['icon'],
                'is_active': False,
                'status': 'error',
                'error': str(e),
                'stream_type': 'unknown',
            }

    completed_count = 0
    with ThreadPoolExecutor(max_workers=14) as executor:
        future_map = {executor.submit(process_item, it): it for it in items_to_process}
        for future in as_completed(future_map):
            res = future.result()
            results.append(res)
            completed_count += 1
            status_symbol = "[ONLINE]" if res.get('is_active') else "[STANDBY]"
            print(f"[{completed_count:02d}/{len(items_to_process)}] ID {res['id']:<4} {status_symbol:<9} {res['name'][:30]:<30} -> {res.get('stream_url', 'No stream')[:45]}")

    # Sort results by ID
    results.sort(key=lambda x: x['id'])

    # Summary statistics
    total = len(results)
    online_count = sum(1 for r in results if r.get('is_active'))
    streams_found = sum(1 for r in results if r.get('stream_url'))

    print("=" * 60)
    print(f"SCRAPING COMPLETE!")
    print(f"Total cameras: {total}")
    print(f"Stream endpoints extracted: {streams_found}/{total}")
    print(f"Live active streams verified: {online_count}/{total}")
    print("=" * 60)

    # 4. Save JSON
    json_path = "cctv_bogor.json"
    metadata = {
        'source': 'BSW Kota Bogor (Bogor Single Window)',
        'source_url': 'https://bsw.kotabogor.go.id/cctv',
        'scraped_at': time.strftime("%Y-%m-%d %H:%M:%S"),
        'total': total,
        'online_count': online_count,
        'cameras': results,
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"[+] Saved JSON catalog to {json_path}")

    # 5. Save JS file for SPA embed without CORS/local file fetch issues
    js_path = "cctv_bogor.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("/* Auto-generated CCTV Data for BSW Kota Bogor */\n")
        f.write(f"window.BOGOR_CCTV_DATA = {json.dumps(metadata, indent=2, ensure_ascii=False)};\n")
    print(f"[+] Saved JavaScript catalog to {js_path}")

    # 6. Save CSV
    csv_path = "cctv_bogor.csv"
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['ID', 'Name', 'Full Title', 'Category', 'Status', 'Is Active', 'Stream URL (m3u8)', 'Detail URL'])
        for r in results:
            writer.writerow([
                r['id'],
                r['name'],
                r['full_title'],
                r['category'],
                r['status'],
                r['is_active'],
                r.get('stream_url', ''),
                r['detail_url'],
            ])
    print(f"[+] Saved CSV catalog to {csv_path}")

    return metadata

if __name__ == '__main__':
    scrape_cctv_catalog()
