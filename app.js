/**
 * BSW KOTA BOGOR CCTV - COMMAND CENTER SPA LOGIC
 * High-performance streaming interface with HLS.js, Surveillance Matrix,
 * Snapshot Capture, Filter/Search, and Watchlist.
 */

(function () {
  'use strict';

  // --- APP STATE ---
  const state = {
    allCameras: [],
    filteredCameras: [],
    favorites: new Set(JSON.parse(localStorage.getItem('bogor_cctv_favs') || '[]')),
    activeTab: 'grid', // 'grid' | 'matrix' | 'favorites' | 'm3u'
    activeCategory: 'ALL',
    statusFilter: 'all', // 'all' | 'online' | 'standby'
    searchQuery: '',
    sortBy: 'id-asc',
    gridDensity: localStorage.getItem('bogor_cctv_density') || (window.innerWidth <= 640 ? 'cols-1' : 'cols-3'),
    matrixSize: 4, // 4 (2x2) or 9 (3x3)
    matrixCamIds: [79, 76, 75, 122], // Default iconic spots: Tugu Kujang, Muslihat, Gang Aut, Sempur
    activeHlsPlayers: new Map(), // cardId -> Hls instance
    matrixHlsPlayers: new Map(), // slotIndex -> Hls instance
    cinemaHls: null,
    currentCinemaCam: null,
  };

  // --- DOM ELEMENTS ---
  const el = {
    clockTime: document.getElementById('clockTime'),
    clockDate: document.getElementById('clockDate'),
    onlineCount: document.getElementById('onlineCount'),
    totalCount: document.getElementById('totalCount'),
    activeViewCount: document.getElementById('activeViewCount'),
    searchInput: document.getElementById('searchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    statusSelect: document.getElementById('statusSelect'),
    sortSelect: document.getElementById('sortSelect'),
    categoryPills: document.getElementById('categoryPills'),
    cctvGrid: document.getElementById('cctvGrid'),
    gridContainer: document.getElementById('gridContainer'),
    matrixContainer: document.getElementById('matrixContainer'),
    matrixGrid: document.getElementById('matrixGrid'),
    matrixLayoutSelect: document.getElementById('matrixLayoutSelect'),
    matrixPresetSelect: document.getElementById('matrixPresetSelect'),
    m3uViewContainer: document.getElementById('m3uViewContainer'),
    densityBtns: document.querySelectorAll('.density-btn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    resultsCounter: document.getElementById('resultsCounter'),
    // Cinema Modal
    cinemaModal: document.getElementById('cinemaModal'),
    cinemaVideo: document.getElementById('cinemaVideo'),
    cinemaTitle: document.getElementById('cinemaTitle'),
    cinemaId: document.getElementById('cinemaId'),
    cinemaCategory: document.getElementById('cinemaCategory'),
    cinemaStreamUrl: document.getElementById('cinemaStreamUrl'),
    cinemaBswLink: document.getElementById('cinemaBswLink'),
    cinemaCloseBtn: document.getElementById('cinemaCloseBtn'),
    cinemaPlayBtn: document.getElementById('cinemaPlayBtn'),
    cinemaMuteBtn: document.getElementById('cinemaMuteBtn'),
    cinemaPipBtn: document.getElementById('cinemaPipBtn'),
    cinemaSnapshotBtn: document.getElementById('cinemaSnapshotBtn'),
    cinemaFullscreenBtn: document.getElementById('cinemaFullscreenBtn'),
    cinemaPrevBtn: document.getElementById('cinemaPrevBtn'),
    cinemaNextBtn: document.getElementById('cinemaNextBtn'),
    cinemaStatusPill: document.getElementById('cinemaStatusPill'),
    cinemaResolution: document.getElementById('cinemaResolution'),
    cinemaFps: document.getElementById('cinemaFps'),
    toastContainer: document.getElementById('toastContainer'),
    btnBackToTop: document.getElementById('btnBackToTop'),
    btnDownloadM3u: document.getElementById('btnDownloadM3u'),
    btnDownloadJson: document.getElementById('btnDownloadJson'),
    btnDownloadCsv: document.getElementById('btnDownloadCsv'),
  };

  // --- INITIALIZATION ---
  async function initApp() {
    startClock();
    setupEventListeners();
    applyGridDensity(state.gridDensity);

    // Load data from window.BOGOR_CCTV_DATA or fetch fallback
    try {
      if (window.BOGOR_CCTV_DATA && window.BOGOR_CCTV_DATA.cameras) {
        state.allCameras = window.BOGOR_CCTV_DATA.cameras;
      } else {
        const res = await fetch('cctv_bogor.json');
        if (!res.ok) throw new Error('Failed to load JSON');
        const data = await res.json();
        state.allCameras = data.cameras;
      }
    } catch (err) {
      console.warn('Fallback loading error:', err);
      showToast('Gagal memuat cctv_bogor.json secara otomatis.', 'error');
    }

    updateHeaderStats();
    buildCategoryPills();
    filterAndRender();
  }

  // --- CLOCK & TELEMETRY ---
  function startClock() {
    function tick() {
      const now = new Date();
      // Format WIB (UTC+7)
      const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' };
      const optionsDate = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' };
      
      if (el.clockTime) el.clockTime.textContent = now.toLocaleTimeString('id-ID', optionsTime) + ' WIB';
      if (el.clockDate) el.clockDate.textContent = now.toLocaleDateString('id-ID', optionsDate);
    }
    tick();
    setInterval(tick, 1000);
  }

  function updateHeaderStats() {
    const total = state.allCameras.length;
    const online = state.allCameras.filter(c => c.is_active).length;
    if (el.totalCount) el.totalCount.textContent = total;
    if (el.onlineCount) el.onlineCount.textContent = online;
    
    // Update tabs badge pill
    const favTabCount = document.getElementById('favTabCount');
    if (favTabCount) favTabCount.textContent = state.favorites.size;
  }

  // --- CATEGORY PILLS ---
  function buildCategoryPills() {
    if (!el.categoryPills) return;

    // Tally by category
    const catCounts = { ALL: state.allCameras.length };
    state.allCameras.forEach(c => {
      const cat = c.category || 'Lainnya';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    const categories = [
      { key: 'ALL', label: 'Semua CCTV' },
      { key: 'Bogor Tengah', label: 'Bogor Tengah' },
      { key: 'Tanah Sareal', label: 'Tanah Sareal' },
      { key: 'Bogor Timur', label: 'Bogor Timur' },
      { key: 'Bogor Utara', label: 'Bogor Utara' },
      { key: 'Bogor Barat', label: 'Bogor Barat' },
      { key: 'Bogor Selatan', label: 'Bogor Selatan' },
      { key: 'Jl. Pajajaran', label: 'Jl. Pajajaran' },
      { key: 'Jalur Tol & Ciawi', label: 'Tol & Ciawi' },
      { key: 'Wilayah Kota Bogor', label: 'Wilayah Lain' },
    ];

    let html = '';
    categories.forEach(item => {
      const count = catCounts[item.key] || 0;
      if (count === 0 && item.key !== 'ALL') return;
      const isActive = state.activeCategory === item.key ? 'active' : '';
      html += `
        <button class="cat-pill ${isActive}" data-category="${item.key}">
          <span>${item.label}</span>
          <span class="cat-count">${count}</span>
        </button>
      `;
    });

    el.categoryPills.innerHTML = html;

    // Attach click events
    el.categoryPills.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        el.categoryPills.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeCategory = btn.dataset.category;
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        filterAndRender();
      });
    });
  }

  // --- FILTER & SORT LOGIC ---
  function filterAndRender() {
    let list = [...state.allCameras];

    // Filter by Tab
    if (state.activeTab === 'favorites') {
      list = list.filter(c => state.favorites.has(c.id));
    }

    // Filter by Category
    if (state.activeCategory !== 'ALL') {
      list = list.filter(c => c.category === state.activeCategory);
    }

    // Filter by Status
    if (state.statusFilter === 'online') {
      list = list.filter(c => c.is_active);
    } else if (state.statusFilter === 'standby') {
      list = list.filter(c => !c.is_active);
    }

    // Filter by Search Query
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase().trim();
      list = list.filter(c => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.full_title.toLowerCase().includes(q) ||
          (c.category && c.category.toLowerCase().includes(q)) ||
          c.id.toString() === q
        );
      });
    }

    // Sort list
    if (state.sortBy === 'id-asc') {
      list.sort((a, b) => a.id - b.id);
    } else if (state.sortBy === 'id-desc') {
      list.sort((a, b) => b.id - a.id);
    } else if (state.sortBy === 'name-asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sortBy === 'status-online') {
      list.sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0));
    }

    state.filteredCameras = list;

    // Update result counter text
    if (el.resultsCounter) {
      el.resultsCounter.innerHTML = `Menampilkan <strong>${list.length}</strong> dari <strong>${state.allCameras.length}</strong> CCTV`;
    }
    if (el.activeViewCount) {
      el.activeViewCount.textContent = list.length;
    }

    renderGrid(list);
  }

  // --- RENDER GRID CARDS ---
  function renderGrid(cameras) {
    if (!el.cctvGrid) return;

    // Destroy active card HLS players to prevent leaks
    destroyAllCardPlayers();

    if (cameras.length === 0) {
      el.cctvGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          <h3>Tidak Ada CCTV yang Cocok</h3>
          <p>Coba kata kunci lain atau ubah filter distrik / status di atas.</p>
        </div>
      `;
      return;
    }

    const cardsHtml = cameras.map(cam => createCardHtml(cam)).join('');
    el.cctvGrid.innerHTML = cardsHtml;

    // Attach card event listeners
    cameras.forEach(cam => {
      attachCardListeners(cam);
    });
  }

  function createCardHtml(cam) {
    const isFav = state.favorites.has(cam.id);
    const statusClass = cam.is_active ? 'live' : 'standby';
    const statusText = cam.is_active ? 'LIVE' : 'STANDBY';

    return `
      <div class="cctv-card" id="card-${cam.id}" data-id="${cam.id}">
        <!-- Card Media / Player Area -->
        <div class="card-media" id="media-wrap-${cam.id}">
          <div class="card-overlay-top">
            <span class="status-badge ${statusClass}">${statusText}</span>
            <span class="card-id-badge">#${cam.id}</span>
          </div>

          <video id="video-card-${cam.id}" playsinline muted loop style="display: none;"></video>

          <!-- Initial Placeholder / Play Trigger -->
          <div class="video-placeholder" id="placeholder-${cam.id}" title="Klik untuk memutar live">
            <div class="cam-icon-glow">
              <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span class="play-hint">KLIK UNTUK LIVE PREVIEW</span>
          </div>

          <div class="card-overlay-bottom">
            <button class="media-btn btn-toggle-card-play" data-id="${cam.id}" title="Putar / Hentikan di Kartu">
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            <button class="media-btn btn-open-cinema" data-id="${cam.id}" title="Buka Layar Cinema / Spotlight">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Card Body Details -->
        <div class="cctv-card-body">
          <div class="card-title-row">
            <h4 class="cctv-title" title="${cam.full_title}">${cam.name}</h4>
            <button class="fav-btn ${isFav ? 'favorited' : ''}" data-id="${cam.id}" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
              <svg width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
              </svg>
            </button>
          </div>

          <div class="cctv-meta-row">
            <span class="location-tag">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              ${cam.category}
            </span>
            <span class="stream-tech-tag">HLS 720p</span>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="cctv-card-footer">
          <div class="action-links">
            <button class="btn btn-sm btn-glass btn-copy-stream" data-stream="${cam.stream_url || ''}" title="Salin URL Stream .m3u8">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              <span>M3U8</span>
            </button>
            <button class="btn btn-sm btn-glass btn-add-matrix" data-id="${cam.id}" title="Tambahkan ke Matrix Wall">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              <span>Wall</span>
            </button>
          </div>
          <button class="btn btn-sm btn-primary btn-open-cinema" data-id="${cam.id}">
            <span>Tonton Live</span>
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  function attachCardListeners(cam) {
    const cardEl = document.getElementById(`card-${cam.id}`);
    if (!cardEl) return;

    // Placeholder click -> play in card
    const placeholder = document.getElementById(`placeholder-${cam.id}`);
    if (placeholder) {
      placeholder.addEventListener('click', () => toggleCardPlayback(cam));
    }

    // Play/Pause button in card media overlay
    const playBtn = cardEl.querySelector('.btn-toggle-card-play');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCardPlayback(cam);
      });
    }

    // Open Cinema view
    cardEl.querySelectorAll('.btn-open-cinema').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCinemaView(cam);
      });
    });

    // Favorite button
    const favBtn = cardEl.querySelector('.fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(cam.id, favBtn);
      });
    }

    // Copy M3U8 link
    const copyBtn = cardEl.querySelector('.btn-copy-stream');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(cam.stream_url, 'Link HLS m3u8 berhasil disalin!');
      });
    }

    // Add to matrix
    const addWallBtn = cardEl.querySelector('.btn-add-matrix');
    if (addWallBtn) {
      addWallBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addCamToMatrix(cam.id);
      });
    }
  }

  // --- PLAY IN CARD (HLS.JS) ---
  function toggleCardPlayback(cam) {
    const video = document.getElementById(`video-card-${cam.id}`);
    const placeholder = document.getElementById(`placeholder-${cam.id}`);
    const playBtn = document.querySelector(`#card-${cam.id} .btn-toggle-card-play`);
    if (!video || !placeholder) return;

    // If currently playing, stop it
    if (state.activeHlsPlayers.has(cam.id)) {
      stopCardPlayback(cam.id);
      return;
    }

    if (!cam.stream_url) {
      showToast('Kamera ini tidak memiliki link streaming aktif.', 'warn');
      return;
    }

    // Start playback
    placeholder.style.display = 'none';
    video.style.display = 'block';

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.loadSource(cam.stream_url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Autoplay blocked:', e));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('Network error, retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('Media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              stopCardPlayback(cam.id);
              showToast(`Gagal memutar stream #${cam.id}`, 'error');
              break;
          }
        }
      });

      state.activeHlsPlayers.set(cam.id, hls);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari iOS/macOS
      video.src = cam.stream_url;
      video.play().catch(e => console.log('Autoplay blocked:', e));
      state.activeHlsPlayers.set(cam.id, { destroy: () => { video.pause(); video.src = ''; } });
    }

    // Change icon to pause/stop
    if (playBtn) {
      playBtn.innerHTML = `
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      `;
      playBtn.title = 'Hentikan Preview';
    }
  }

  function stopCardPlayback(camId) {
    const video = document.getElementById(`video-card-${camId}`);
    const placeholder = document.getElementById(`placeholder-${camId}`);
    const playBtn = document.querySelector(`#card-${camId} .btn-toggle-card-play`);

    if (state.activeHlsPlayers.has(camId)) {
      const hls = state.activeHlsPlayers.get(camId);
      hls.destroy();
      state.activeHlsPlayers.delete(camId);
    }

    if (video) {
      video.pause();
      video.src = '';
      video.style.display = 'none';
    }
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
    if (playBtn) {
      playBtn.innerHTML = `
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
      playBtn.title = 'Putar di Kartu';
    }
  }

  function destroyAllCardPlayers() {
    state.activeHlsPlayers.forEach((hls, camId) => {
      try { hls.destroy(); } catch (e) {}
    });
    state.activeHlsPlayers.clear();
  }

  // --- CINEMA / SPOTLIGHT VIEW ---
  function openCinemaView(cam) {
    state.currentCinemaCam = cam;

    if (!el.cinemaModal || !el.cinemaVideo) return;

    // Set metadata
    if (el.cinemaTitle) el.cinemaTitle.textContent = cam.full_title || cam.name;
    if (el.cinemaId) el.cinemaId.textContent = `#${cam.id}`;
    if (el.cinemaCategory) el.cinemaCategory.textContent = cam.category;
    if (el.cinemaStreamUrl) el.cinemaStreamUrl.textContent = cam.stream_url || 'Tidak tersedia';
    if (el.cinemaBswLink) el.cinemaBswLink.href = cam.detail_url;

    if (el.cinemaStatusPill) {
      el.cinemaStatusPill.className = `status-badge ${cam.is_active ? 'live' : 'standby'}`;
      el.cinemaStatusPill.textContent = cam.is_active ? 'LIVE ONLINE' : 'STANDBY';
    }

    // Show modal
    el.cinemaModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Play Stream
    startCinemaStream(cam.stream_url);
  }

  function startCinemaStream(streamUrl) {
    if (state.cinemaHls) {
      state.cinemaHls.destroy();
      state.cinemaHls = null;
    }

    const video = el.cinemaVideo;
    if (!video) return;

    if (!streamUrl) {
      showToast('Kamera ini tidak memiliki streaming URL aktif.', 'warn');
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 45,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (e, data) => {
        video.play().catch(err => console.log('Cinema autoplay prevented:', err));
        if (el.cinemaPlayBtn) el.cinemaPlayBtn.innerHTML = getPauseIcon();
      });

      hls.on(Hls.Events.LEVEL_LOADED, (e, data) => {
        const details = data.details;
        if (el.cinemaResolution && video.videoWidth && video.videoHeight) {
          el.cinemaResolution.textContent = `${video.videoWidth}x${video.videoHeight}`;
        } else if (el.cinemaResolution) {
          el.cinemaResolution.textContent = '1280x720 HLS';
        }
      });

      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              showToast('Gagal memuat feed video HLS.', 'error');
              break;
          }
        }
      });

      state.cinemaHls = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(e => console.log('Cinema native play error:', e));
    }
  }

  function closeCinemaView() {
    if (state.cinemaHls) {
      state.cinemaHls.destroy();
      state.cinemaHls = null;
    }
    if (el.cinemaVideo) {
      el.cinemaVideo.pause();
      el.cinemaVideo.src = '';
    }
    if (el.cinemaModal) {
      el.cinemaModal.style.display = 'none';
    }
    document.body.style.overflow = '';
    state.currentCinemaCam = null;
  }

  function navigateCinema(direction) {
    if (!state.currentCinemaCam) return;
    const list = state.filteredCameras.length > 0 ? state.filteredCameras : state.allCameras;
    const currentIndex = list.findIndex(c => c.id === state.currentCinemaCam.id);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = list.length - 1;
    if (nextIndex >= list.length) nextIndex = 0;

    openCinemaView(list[nextIndex]);
  }

  // --- SNAPSHOT CAPTURE (SAVE PNG) ---
  function captureSnapshot() {
    const video = el.cinemaVideo;
    if (!video || video.readyState < 2) {
      showToast('Video belum siap diambil gambarnya!', 'warn');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Add watermark overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(16, canvas.height - 54, 460, 42);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('BSW KOTA BOGOR LIVE CCTV', 26, canvas.height - 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px sans-serif';
      const camName = state.currentCinemaCam ? state.currentCinemaCam.name : 'CCTV';
      ctx.fillText(`${camName} • ${new Date().toLocaleString('id-ID')}`, 26, canvas.height - 14);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const filename = `CCTV_Bogor_${state.currentCinemaCam ? state.currentCinemaCam.id : 'snap'}_${Date.now()}.png`;
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Tangkapan layar tersimpan: ${filename}`, 'success');
      }, 'image/png');
    } catch (err) {
      console.error('Snapshot capture error:', err);
      showToast('Gagal mengambil screenshot (CORS restriction pada stream)', 'error');
    }
  }

  // --- SURVEILLANCE MATRIX WALL ---
  function renderMatrixWall() {
    if (!el.matrixGrid) return;

    destroyAllMatrixPlayers();

    el.matrixGrid.className = `matrix-grid layout-${state.matrixSize === 4 ? '2x2' : '3x3'}`;

    const slots = [];
    for (let i = 0; i < state.matrixSize; i++) {
      const camId = state.matrixCamIds[i] || state.allCameras[i % state.allCameras.length]?.id;
      const cam = state.allCameras.find(c => c.id === camId) || state.allCameras[0];
      slots.push({ slotIndex: i, cam });
    }

    el.matrixGrid.innerHTML = slots.map(s => `
      <div class="matrix-tile" id="matrix-tile-${s.slotIndex}">
        <div class="matrix-tile-header">
          <select class="matrix-cam-select" data-slot="${s.slotIndex}">
            ${state.allCameras.map(c => `
              <option value="${c.id}" ${c.id === s.cam.id ? 'selected' : ''}>
                #${c.id} ${c.name}
              </option>
            `).join('')}
          </select>
          <button class="media-btn btn-sm btn-matrix-mute" data-slot="${s.slotIndex}" title="Mute/Unmute">
            <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          </button>
        </div>
        <video id="video-matrix-${s.slotIndex}" playsinline muted loop autoplay></video>
      </div>
    `).join('');

    // Attach stream and change listener
    slots.forEach(s => {
      initMatrixSlotStream(s.slotIndex, s.cam.stream_url);

      const select = document.querySelector(`.matrix-cam-select[data-slot="${s.slotIndex}"]`);
      if (select) {
        select.addEventListener('change', (e) => {
          const newCamId = parseInt(e.target.value);
          const newCam = state.allCameras.find(c => c.id === newCamId);
          if (newCam) {
            state.matrixCamIds[s.slotIndex] = newCamId;
            initMatrixSlotStream(s.slotIndex, newCam.stream_url);
          }
        });
      }

      const muteBtn = document.querySelector(`.btn-matrix-mute[data-slot="${s.slotIndex}"]`);
      if (muteBtn) {
        muteBtn.addEventListener('click', () => {
          const v = document.getElementById(`video-matrix-${s.slotIndex}`);
          if (v) {
            v.muted = !v.muted;
            muteBtn.style.color = v.muted ? '#fff' : '#10b981';
          }
        });
      }
    });
  }

  function initMatrixSlotStream(slotIndex, streamUrl) {
    const video = document.getElementById(`video-matrix-${slotIndex}`);
    if (!video || !streamUrl) return;

    if (state.matrixHlsPlayers.has(slotIndex)) {
      state.matrixHlsPlayers.get(slotIndex).destroy();
      state.matrixHlsPlayers.delete(slotIndex);
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 20,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Matrix play suppressed:', e));
      });

      state.matrixHlsPlayers.set(slotIndex, hls);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(e => console.log(e));
    }
  }

  function destroyAllMatrixPlayers() {
    state.matrixHlsPlayers.forEach((hls) => {
      try { hls.destroy(); } catch (e) {}
    });
    state.matrixHlsPlayers.clear();
  }

  function addCamToMatrix(camId) {
    if (!state.matrixCamIds.includes(camId)) {
      state.matrixCamIds.unshift(camId);
      if (state.matrixCamIds.length > 9) state.matrixCamIds.pop();
    }
    showToast(`CCTV #${camId} ditambahkan ke Matrix Surveillance Wall!`, 'success');
  }

  function applyMatrixPreset(preset) {
    const presets = {
      pusat_kota: [79, 76, 75, 122, 130, 133, 134, 111, 204],
      jalan_baru: [170, 169, 171, 163, 172, 176, 175, 177, 161],
      taman_kota: [122, 130, 128, 129, 124, 126, 127, 210, 211],
      tol_ciawi: [175, 177, 215, 108, 173, 174, 181, 182, 79],
    };

    if (presets[preset]) {
      state.matrixCamIds = [...presets[preset]];
      renderMatrixWall();
      showToast(`Preset "${preset.replace('_', ' ').toUpperCase()}" diterapkan!`, 'success');
    }
  }

  // --- FAVORITES TOGGLE ---
  function toggleFavorite(camId, btn) {
    if (state.favorites.has(camId)) {
      state.favorites.delete(camId);
      if (btn) {
        btn.classList.remove('favorited');
        btn.querySelector('svg').setAttribute('fill', 'none');
      }
      showToast(`CCTV #${camId} dihapus dari Favorit`, 'info');
    } else {
      state.favorites.add(camId);
      if (btn) {
        btn.classList.add('favorited');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
      }
      showToast(`CCTV #${camId} disimpan ke Favorit`, 'success');
    }
    localStorage.setItem('bogor_cctv_favs', JSON.stringify([...state.favorites]));
    updateHeaderStats();

    if (state.activeTab === 'favorites') {
      filterAndRender();
    }
  }

  // --- CLIPBOARD & TOAST ---
  function copyToClipboard(text, successMsg) {
    if (!text) {
      showToast('Link streaming tidak tersedia', 'warn');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMsg, 'success');
    });
  }

  function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" fill="none" stroke="#06b6d4" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- DOWNLOAD HELPERS ---
  function triggerDownload(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`File ${filename} berhasil diunduh!`, 'success');
  }

  function downloadM3u() {
    let m3u = '#EXTM3U name="BSW Kota Bogor Live CCTV"\n\n';
    state.allCameras.forEach(cam => {
      if (cam.stream_url) {
        m3u += `#EXTINF:-1 tvg-id="${cam.id}" tvg-name="${cam.name}" group-title="${cam.category}",${cam.full_title}\n`;
        m3u += `${cam.stream_url}\n\n`;
      }
    });
    triggerDownload(m3u, 'bogor_cctv.m3u', 'application/x-mpegurl');
  }

  function downloadJson() {
    const out = {
      source: 'BSW Kota Bogor',
      total: state.allCameras.length,
      downloaded_at: new Date().toISOString(),
      cameras: state.allCameras,
    };
    triggerDownload(JSON.stringify(out, null, 2), 'bogor_cctv.json', 'application/json');
  }

  function downloadCsv() {
    let csv = 'ID,Name,Full Title,Category,Status,Stream URL,Detail URL\n';
    state.allCameras.forEach(c => {
      csv += `"${c.id}","${c.name.replace(/"/g, '""')}","${c.full_title.replace(/"/g, '""')}","${c.category}","${c.status}","${c.stream_url || ''}","${c.detail_url}"\n`;
    });
    triggerDownload(csv, 'bogor_cctv.csv', 'text/csv');
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Search input
    if (el.searchInput) {
      el.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (el.searchClearBtn) {
          el.searchClearBtn.style.display = state.searchQuery ? 'block' : 'none';
        }
        filterAndRender();
      });
    }

    if (el.searchClearBtn) {
      el.searchClearBtn.addEventListener('click', () => {
        if (el.searchInput) el.searchInput.value = '';
        state.searchQuery = '';
        el.searchClearBtn.style.display = 'none';
        filterAndRender();
      });
    }

    // Status filter select
    if (el.statusSelect) {
      el.statusSelect.addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        filterAndRender();
      });
    }

    // Sort select
    if (el.sortSelect) {
      el.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        filterAndRender();
      });
    }

    // View tab switching
    el.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        const tab = btn.dataset.tab;
        state.activeTab = tab;
        switchTab(tab);
      });
    });

    // Grid density controls
    el.densityBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const density = btn.dataset.density;
        applyGridDensity(density);
      });
    });

    // Floating Back to Top
    if (el.btnBackToTop) {
      el.btnBackToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
          el.btnBackToTop.classList.add('visible');
        } else {
          el.btnBackToTop.classList.remove('visible');
        }
      }, { passive: true });
    }

    // Matrix Layout Select (2x2 or 3x3)
    if (el.matrixLayoutSelect) {
      el.matrixLayoutSelect.addEventListener('change', (e) => {
        state.matrixSize = parseInt(e.target.value);
        renderMatrixWall();
      });
    }

    // Matrix Preset Select
    if (el.matrixPresetSelect) {
      el.matrixPresetSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          applyMatrixPreset(e.target.value);
          e.target.value = '';
        }
      });
    }

    // Modal Cinema controls
    if (el.cinemaCloseBtn) el.cinemaCloseBtn.addEventListener('click', closeCinemaView);
    if (el.cinemaModal) {
      el.cinemaModal.addEventListener('click', (e) => {
        if (e.target === el.cinemaModal) closeCinemaView();
      });

      // Mobile Touch Tap to show/hide controls in Cinema mode
      const playerWrap = el.cinemaModal.querySelector('.modal-player-wrap');
      let hideControlsTimer = null;
      if (playerWrap) {
        const toggleControlsOnTouch = () => {
          playerWrap.classList.add('show-controls');
          clearTimeout(hideControlsTimer);
          hideControlsTimer = setTimeout(() => {
            playerWrap.classList.remove('show-controls');
          }, 4000);
        };
        playerWrap.addEventListener('touchstart', toggleControlsOnTouch, { passive: true });
        playerWrap.addEventListener('click', toggleControlsOnTouch);
      }
    }

    if (el.cinemaPlayBtn) {
      el.cinemaPlayBtn.addEventListener('click', () => {
        const v = el.cinemaVideo;
        if (!v) return;
        if (v.paused) {
          v.play();
          el.cinemaPlayBtn.innerHTML = getPauseIcon();
        } else {
          v.pause();
          el.cinemaPlayBtn.innerHTML = getPlayIcon();
        }
      });
    }

    if (el.cinemaMuteBtn) {
      el.cinemaMuteBtn.addEventListener('click', () => {
        const v = el.cinemaVideo;
        if (!v) return;
        v.muted = !v.muted;
        el.cinemaMuteBtn.style.color = v.muted ? 'var(--text-muted)' : 'var(--accent-emerald)';
      });
    }

    if (el.cinemaPipBtn) {
      el.cinemaPipBtn.addEventListener('click', () => {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
        } else if (el.cinemaVideo && el.cinemaVideo.requestPictureInPicture) {
          el.cinemaVideo.requestPictureInPicture();
        }
      });
    }

    if (el.cinemaFullscreenBtn) {
      el.cinemaFullscreenBtn.addEventListener('click', () => {
        const wrap = el.cinemaModal.querySelector('.modal-player-wrap');
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (wrap && wrap.requestFullscreen) {
          wrap.requestFullscreen();
        }
      });
    }

    if (el.cinemaSnapshotBtn) el.cinemaSnapshotBtn.addEventListener('click', captureSnapshot);
    if (el.cinemaPrevBtn) el.cinemaPrevBtn.addEventListener('click', () => navigateCinema(-1));
    if (el.cinemaNextBtn) el.cinemaNextBtn.addEventListener('click', () => navigateCinema(1));

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (el.cinemaModal && el.cinemaModal.style.display === 'flex') {
        if (e.key === 'Escape') closeCinemaView();
        if (e.key === 'ArrowLeft') navigateCinema(-1);
        if (e.key === 'ArrowRight') navigateCinema(1);
        if (e.key === ' ' || e.key === 'k') {
          e.preventDefault();
          if (el.cinemaPlayBtn) el.cinemaPlayBtn.click();
        }
      }
    });

    // Downloads
    if (el.btnDownloadM3u) el.btnDownloadM3u.addEventListener('click', downloadM3u);
    if (el.btnDownloadJson) el.btnDownloadJson.addEventListener('click', downloadJson);
    if (el.btnDownloadCsv) el.btnDownloadCsv.addEventListener('click', downloadCsv);
  }

  function switchTab(tab) {
    if (tab === 'matrix') {
      if (el.gridContainer) el.gridContainer.style.display = 'none';
      if (el.m3uViewContainer) el.m3uViewContainer.style.display = 'none';
      if (el.matrixContainer) {
        el.matrixContainer.style.display = 'flex';
        renderMatrixWall();
      }
    } else if (tab === 'm3u') {
      destroyAllMatrixPlayers();
      if (el.gridContainer) el.gridContainer.style.display = 'none';
      if (el.matrixContainer) el.matrixContainer.style.display = 'none';
      if (el.m3uViewContainer) el.m3uViewContainer.style.display = 'block';
    } else {
      // 'grid' or 'favorites'
      destroyAllMatrixPlayers();
      if (el.matrixContainer) el.matrixContainer.style.display = 'none';
      if (el.m3uViewContainer) el.m3uViewContainer.style.display = 'none';
      if (el.gridContainer) el.gridContainer.style.display = 'block';
      filterAndRender();
    }
  }

  function applyGridDensity(density) {
    state.gridDensity = density;
    localStorage.setItem('bogor_cctv_density', density);
    if (el.cctvGrid) {
      el.cctvGrid.className = `cctv-grid ${density}`;
    }
    el.densityBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.density === density);
    });
  }

  function getPlayIcon() {
    return `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  }

  function getPauseIcon() {
    return `<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
