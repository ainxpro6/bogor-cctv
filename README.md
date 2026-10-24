# BSW Kota Bogor CCTV Scraper & Surveillance SPA

Aplikasi Single Page Application (SPA) modern dan scraper otomatis untuk siaran langsung 93 CCTV publik dari portal [BSW Kota Bogor (Bogor Single Window)](https://bsw.kotabogor.go.id/cctv).

---

## ⚡ Fitur Utama

1. **Scraper Otomatis (`scraper.py`)**:
   - Mengekstrak **93 kamera CCTV** publik Kota Bogor secara *multi-threaded* (14 workers paralel).
   - Menemukan URL streaming langsung **HLS (`.m3u8`)** pada server `restreamer*.kotabogor.go.id`.
   - Menguji keaktifan feed video secara real-time (83 siaran online aktif).
   - Mengelompokkan CCTV secara otomatis ke dalam distrik/zona (Bogor Tengah, Tanah Sareal, Bogor Timur, Bogor Utara, Bogor Barat, Bogor Selatan, Jl. Pajajaran, Tol/Ciawi).
   - Menghasilkan output: `cctv_bogor.json`, `cctv_bogor.js`, `cctv_bogor.csv`, dan playlist VLC `bogor_cctv.m3u`.

2. **Single Page Application (SPA - `index.html`)**:
   - **Modern Surveillance Command Center UI**: Tampilan dark mode cyberpunk dengan glassmorphism dan tipografi modern (*Plus Jakarta Sans* & *JetBrains Mono*).
   - **Zero-CORS Direct Playback**: Menggunakan `hls.js` untuk memutar siaran HLS resolusi 720p langsung tanpa kendala CORS.
   - **In-Card Live Preview**: Klik tombol play pada kartu mana saja untuk memutar siaran langsung di tempat.
   - **Cinema / Spotlight Modal**: Mode layar fokus 16:9 dengan tombol Play/Pause, PiP (Picture-in-Picture), Fullscreen, dan navigasi kamera (*Arrow Left / Arrow Right*).
   - **Snapshot / Tangkapan Layar**: Fitur tangkapan layar instan (*Save frame to PNG*) dengan watermark resmi Kota Bogor.
   - **Surveillance Matrix (Multi-Cam Grid)**: Menonton 4 kamera (2x2) atau 9 kamera (3x3) sekaligus secara bersamaan dengan preset lokasi (Pusat Kota, Jalan Baru, Taman Kota, Tol/Ciawi).
   - **Watchlist / Favorit**: Simpan kamera favorit di browser melalui `localStorage`.
   - **Pencarian & Filter Instan**: Pencarian real-time berdasarkan nama jalan, landmark, ID kamera, atau distrik.
   - **Ekspor Playlist M3U**: Unduh playlist M3U sekali klik untuk diputar di **VLC Media Player**, Smart TV, atau aplikasi IPTV favorit.
   - **Mobile-First Responsive Layout**:
     - Adaptif untuk smartphone layar sentuh (iPhone, Android) dan tablet.
     - Navigasi tab & filter wilayah horizontal swipeable dengan sentuhan jari.
     - Density Switcher khusus HP: Mode 1 Kolom (Feed Penuh) & 2 Kolom (Grid Ringkas).
     - Fullscreen Cinema Modal di smartphone dengan kontrol tap-to-show overlay dan orientasi landscape immersion.
     - Floating button *Kembali ke Atas* (Back to Top) saat menelusuri 93 kamera.
     - Dukungan iOS notch / Dynamic Island (`viewport-fit=cover` & safe-area insets).

---

## 🚀 Cara Menjalankan

### 1. Membuka SPA di Browser
Cukup buka file `index.html` langsung di browser, atau jalankan server lokal:
```bash
python -m http.server 8080
```
Buka di browser: `http://localhost:8080/index.html`

### 2. Menjalankan Scraper Ulang (Untuk Memperbarui Data)
```bash
python scraper.py
```

### 3. Memutar di VLC Media Player
Buka VLC -> Seret file `bogor_cctv.m3u` ke dalam jendela VLC. Anda dapat langsung menonton seluruh 93 kamera seperti saluran TV!

---

## 📁 Struktur Berkas

- [`index.html`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/index.html) - Halaman utama Single Page Application
- [`style.css`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/style.css) - Desain antarmuka Surveillance Command Center
- [`app.js`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/app.js) - Logika SPA, Hls.js player, matrix view, snapshot tool
- [`scraper.py`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/scraper.py) - Script scraper multi-thread CCTV BSW Kota Bogor
- [`cctv_bogor.json`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/cctv_bogor.json) - Database JSON katalog CCTV
- [`cctv_bogor.js`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/cctv_bogor.js) - Payload JS mandiri untuk dukungan offline `file:///`
- [`bogor_cctv.m3u`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/bogor_cctv.m3u) - Playlist format M3U untuk VLC / IPTV
- [`cctv_bogor.csv`](file:///c:/Users/user/Documents/Coding/Scrap%20bsw/cctv_bogor.csv) - Format spreadsheet CSV
