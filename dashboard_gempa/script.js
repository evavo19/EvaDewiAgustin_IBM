/* ============================================================
   script.js – Dashboard Gempa Terkini Indonesia
   Vanilla JavaScript · Chart.js · BMKG API
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** BMKG public API endpoints */
const BMKG_RECENT_URL  = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json';
const BMKG_LATEST_URL  = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
const FALLBACK_URL     = './gempa_data.json';

/** BMKG image base URL for shake-map */
const BMKG_IMG_BASE    = 'https://data.bmkg.go.id/DataMKG/TEWS/';

/** Rows displayed per page in the table */
const ROWS_PER_PAGE    = 10;

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────

let allEarthquakes   = [];   // raw data (all)
let filteredData     = [];   // after filter applied
let currentPage      = 1;
let sortColumn       = 'Tanggal';
let sortDirection    = 'desc';  // 'asc' | 'desc'

// Chart instances (kept to allow destroy/re-render on filter change)
const charts = {};

// ─────────────────────────────────────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Get element by ID with type safety shortcut */
const $ = id => document.getElementById(id);

/** Show/hide element (toggle hidden class) */
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with a timeout.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load all earthquake data:
 *   1) Try BMKG recent (15 events) + latest (1 event)
 *   2) On any failure, fall back to local gempa_data.json
 */
async function loadData() {
  let recentData  = null;
  let latestGempa = null;
  let usedFallback = false;

  try {
    // Fetch both endpoints in parallel for speed
    const [recentJson, latestJson] = await Promise.all([
      fetchWithTimeout(BMKG_RECENT_URL),
      fetchWithTimeout(BMKG_LATEST_URL)
    ]);

    // BMKG recent: { Infogempa: { gempa: [...] } }
    recentData  = recentJson?.Infogempa?.gempa ?? [];
    // BMKG latest: { Infogempa: { gempa: { ... } } }  (single object, not array)
    latestGempa = latestJson?.Infogempa?.gempa ?? null;

    if (recentData.length === 0) throw new Error('Data kosong dari BMKG');

  } catch (err) {
    console.warn('BMKG fetch gagal, menggunakan data cadangan:', err.message);
    usedFallback = true;

    try {
      const fallbackJson = await fetchWithTimeout(FALLBACK_URL);
      recentData  = fallbackJson?.Infogempa?.gempa ?? [];
      // Use first item as "latest" when falling back
      latestGempa = recentData[0] ?? null;
    } catch (fallbackErr) {
      // Even fallback failed – show error banner
      showError('Tidak dapat memuat data (BMKG & file cadangan gagal): ' + fallbackErr.message);
      return;
    }
  }

  // Update data source badge
  const badge = $('data-source-badge');
  if (usedFallback) {
    badge.textContent = '⚠ Data Cadangan (Offline)';
    badge.className = badge.className.replace('bg-slate-600 text-slate-300', 'bg-amber-500 text-white');
  } else {
    badge.textContent = '● Data Live – BMKG';
    badge.className = badge.className.replace('bg-slate-600 text-slate-300', 'bg-green-600 text-white');
  }

  // Timestamp
  $('last-updated').textContent = 'Diperbarui: ' + new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  $('last-updated').classList.remove('hidden');

  // Normalise & store
  allEarthquakes = normaliseData(recentData);
  filteredData   = [...allEarthquakes];

  // Render dashboard
  renderLatestCard(latestGempa);
  applyFilters();   // builds KPIs, charts, table

  hide('loading-overlay');
  show('dashboard-content');
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise raw BMKG array items into consistent numeric fields.
 * BMKG sends Magnitude and Kedalaman as strings like "5.2" and "10 km".
 */
function normaliseData(raw) {
  return raw.map(item => {
    // Parse depth: "10 km" → 10
    const depthStr  = item.Kedalaman ?? '0';
    const depthNum  = parseFloat(depthStr.replace(/[^0-9.]/g, '')) || 0;

    // Parse magnitude: "5.2" → 5.2
    const magNum    = parseFloat(item.Magnitude) || 0;

    // Date + time: try DateTime ISO first, fall back to Tanggal + Jam
    let dateObj = null;
    if (item.DateTime) {
      dateObj = new Date(item.DateTime);
    } else if (item.Tanggal && item.Jam) {
      // e.g. "31 Okt 2026" + "03:12:45 WIB"
      const cleaned = item.Tanggal + ' ' + item.Jam.replace(' WIB', '').replace(' WITA', '').replace(' WIT', '');
      dateObj = new Date(cleaned);
    }

    // Derive date string for grouping (YYYY-MM-DD)
    const dateKey = dateObj && !isNaN(dateObj)
      ? dateObj.toISOString().slice(0, 10)
      : item.Tanggal ?? '';

    return {
      ...item,
      _mag:     magNum,
      _depth:   depthNum,
      _dateObj: dateObj,
      _dateKey: dateKey,
      _depthCat: depthCategory(depthNum),
    };
  });
}

/** Map depth (km) to a category string */
function depthCategory(km) {
  if (km <= 60)  return 'dangkal';
  if (km <= 300) return 'menengah';
  return 'dalam';
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BANNER
// ─────────────────────────────────────────────────────────────────────────────

function showError(msg) {
  hide('loading-overlay');
  show('error-banner');
  $('error-message').textContent = msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// LATEST EARTHQUAKE CARD
// ─────────────────────────────────────────────────────────────────────────────

/** Render the highlighted card for the most recent earthquake */
function renderLatestCard(gempa) {
  if (!gempa) return;

  const mag       = parseFloat(gempa.Magnitude) || 0;
  const { bg, text, label } = magStyle(mag);
  const depthNum  = parseFloat((gempa.Kedalaman ?? '').replace(/[^0-9.]/g, '')) || 0;
  const depthCat  = depthCategory(depthNum);
  const shakeImg  = gempa.Shakemap ? BMKG_IMG_BASE + gempa.Shakemap : null;

  $('latest-card').innerHTML = `
    <!-- Magnitude circle -->
    <div class="latest-mag-circle ${bg} ${text}">
      <span class="text-2xl font-black leading-none">${mag.toFixed(1)}</span>
      <span class="text-xs font-semibold mt-0.5">SR</span>
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0">
      <div class="flex flex-wrap items-center gap-2 mb-1">
        <span class="text-xs font-bold uppercase tracking-widest ${text.replace('text-', 'text-')} ${bg} px-2 py-0.5 rounded-full">${label}</span>
        <span class="depth-badge depth-${depthCat}">${depthCat.charAt(0).toUpperCase() + depthCat.slice(1)} · ${gempa.Kedalaman}</span>
      </div>
      <h3 class="font-bold text-slate-800 text-base leading-snug">${gempa.Wilayah ?? '–'}</h3>
      <p class="text-slate-500 text-xs mt-0.5">${gempa.Tanggal ?? ''} &nbsp;·&nbsp; ${gempa.Jam ?? ''}</p>
      ${gempa.Lintang ? `<p class="text-slate-400 text-xs mt-0.5">${gempa.Lintang} &nbsp;/&nbsp; ${gempa.Bujur}</p>` : ''}
      <p class="text-xs mt-2 ${gempa.Potensi && gempa.Potensi.toLowerCase().includes('tsunami') && !gempa.Potensi.toLowerCase().includes('tidak')
        ? 'text-red-600 font-semibold' : 'text-slate-500'}">
        ${gempa.Potensi ?? ''}
      </p>
    </div>

    ${shakeImg ? `
    <!-- Shake map thumbnail -->
    <div class="mt-2 sm:mt-0 sm:ml-auto flex-shrink-0">
      <img src="${shakeImg}" alt="Peta guncangan" class="rounded-lg w-28 h-28 object-cover border border-slate-200 shadow" />
    </div>` : ''}
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/** Read current filter values from UI controls */
function getFilterValues() {
  return {
    magMin:  parseFloat($('filter-mag-min').value) || 0,
    magMax:  parseFloat($('filter-mag-max').value) || 10,
    depth:   $('filter-depth').value,
    region:  $('filter-region').value.trim().toLowerCase(),
  };
}

/**
 * Apply all active filters to allEarthquakes,
 * then re-render KPIs, charts, and table.
 */
function applyFilters() {
  const { magMin, magMax, depth, region } = getFilterValues();

  filteredData = allEarthquakes.filter(eq => {
    if (eq._mag < magMin || eq._mag > magMax) return false;
    if (depth && eq._depthCat !== depth) return false;
    if (region && !(eq.Wilayah ?? '').toLowerCase().includes(region)) return false;
    return true;
  });

  $('filter-count').textContent = filteredData.length;
  $('filter-total').textContent = allEarthquakes.length;

  currentPage = 1;   // reset to first page on filter change

  renderKPIs();
  renderAllCharts();
  renderTable();
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARDS
// ─────────────────────────────────────────────────────────────────────────────

function renderKPIs() {
  const data = filteredData;

  // Total
  $('val-total').textContent     = data.length;
  $('val-total-sub').textContent = `${allEarthquakes.length} total tersedia`;

  if (data.length === 0) {
    ['val-max-mag', 'val-avg-mag', 'val-avg-depth'].forEach(id => $(id).textContent = '–');
    $('val-max-mag-sub').textContent = '';
    return;
  }

  // Max magnitude
  const maxEq = data.reduce((a, b) => (b._mag > a._mag ? b : a));
  $('val-max-mag').textContent     = maxEq._mag.toFixed(1);
  $('val-max-mag-sub').textContent = maxEq.Wilayah ?? '';

  // Avg magnitude
  const avgMag = data.reduce((s, eq) => s + eq._mag, 0) / data.length;
  $('val-avg-mag').textContent = avgMag.toFixed(2);

  // Avg depth
  const avgDepth = data.reduce((s, eq) => s + eq._depth, 0) / data.length;
  $('val-avg-depth').textContent = avgDepth.toFixed(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────────────────

/** Default Chart.js global font */
Chart.defaults.font.family = "-apple-system, 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#64748b';

/** Destroy existing chart instance if present, then create new */
function makeChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  const ctx = $(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, config);
}

function renderAllCharts() {
  renderTrendChart();
  renderMagnitudeChart();
  renderDepthChart();
  renderRegionChart();
  renderScatterChart();
}

/* ---- 1. Trend: gempa count per date ---- */
function renderTrendChart() {
  const counts = {};
  filteredData.forEach(eq => {
    counts[eq._dateKey] = (counts[eq._dateKey] || 0) + 1;
  });

  // Sort dates ascending
  const labels = Object.keys(counts).sort();
  const values = labels.map(d => counts[d]);

  // Format labels to short date display
  const displayLabels = labels.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  });

  makeChart('chart-trend', {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [{
        label: 'Jumlah Gempa',
        data: values,
        fill: true,
        backgroundColor: 'rgba(249,115,22,0.12)',
        borderColor: '#f97316',
        borderWidth: 2.5,
        pointBackgroundColor: '#f97316',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => 'Tanggal: ' + items[0].label,
            label: item  => `${item.raw} kejadian`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

/* ---- 2. Magnitude distribution (doughnut) ---- */
function renderMagnitudeChart() {
  // Categories: < 3, 3–4, 4–5, 5–6, 6–7, ≥ 7
  const cats   = ['< 3.0', '3.0–3.9', '4.0–4.9', '5.0–5.9', '6.0–6.9', '≥ 7.0'];
  const colors = ['#bae6fd', '#86efac', '#fde68a', '#fed7aa', '#fca5a5', '#9f1239'];
  const counts = new Array(6).fill(0);

  filteredData.forEach(({ _mag }) => {
    if      (_mag < 3) counts[0]++;
    else if (_mag < 4) counts[1]++;
    else if (_mag < 5) counts[2]++;
    else if (_mag < 6) counts[3]++;
    else if (_mag < 7) counts[4]++;
    else               counts[5]++;
  });

  makeChart('chart-magnitude', {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: item => ` ${item.label}: ${item.raw} kejadian`
          }
        }
      }
    }
  });
}

/* ---- 3. Depth distribution (pie) ---- */
function renderDepthChart() {
  let dangkal = 0, menengah = 0, dalam = 0;
  filteredData.forEach(({ _depthCat }) => {
    if      (_depthCat === 'dangkal')  dangkal++;
    else if (_depthCat === 'menengah') menengah++;
    else                               dalam++;
  });

  makeChart('chart-depth', {
    type: 'pie',
    data: {
      labels: ['Dangkal (≤60 km)', 'Menengah (61–300 km)', 'Dalam (>300 km)'],
      datasets: [{
        data: [dangkal, menengah, dalam],
        backgroundColor: ['#fbbf24', '#818cf8', '#a78bfa'],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: item => ` ${item.label}: ${item.raw} kejadian`
          }
        }
      }
    }
  });
}

/* ---- 4. Top 10 regions (horizontal bar) ---- */
function renderRegionChart() {
  const regionCount = {};
  filteredData.forEach(({ Wilayah }) => {
    const key = (Wilayah ?? 'Tidak Diketahui').split(',').pop().trim();
    regionCount[key] = (regionCount[key] || 0) + 1;
  });

  // Sort and take top 10
  const sorted = Object.entries(regionCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = sorted.map(([r]) => r);
  const values = sorted.map(([, c]) => c);

  // Colour bars by rank (gradient-ish from orange to amber)
  const bgColors = values.map((_, i) => {
    const t = i / Math.max(values.length - 1, 1);
    const r = Math.round(249 + (251 - 249) * t);
    const g = Math.round(115 + (191 - 115) * t);
    const b = Math.round(22  + (36  - 22 ) * t);
    return `rgba(${r},${g},${b},0.85)`;
  });

  makeChart('chart-region', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Gempa',
        data: values,
        backgroundColor: bgColors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => ` ${item.raw} kejadian`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: '#f1f5f9' }
        },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

/* ---- 5. Scatter: Magnitude vs Depth ---- */
function renderScatterChart() {
  // Map depth category to colour
  const colorMap = { dangkal: '#fbbf24', menengah: '#818cf8', dalam: '#a78bfa' };

  const points = filteredData.map(eq => ({
    x: eq._mag,
    y: eq._depth,
    label: eq.Wilayah,
    cat: eq._depthCat,
  }));

  // Three datasets by depth category for legend
  const categories = ['dangkal', 'menengah', 'dalam'];
  const catLabels  = ['Dangkal', 'Menengah', 'Dalam'];

  const datasets = categories.map((cat, i) => ({
    label: catLabels[i],
    data: points.filter(p => p.cat === cat).map(p => ({ x: p.x, y: p.y, label: p.label })),
    backgroundColor: colorMap[cat] + 'cc',
    borderColor:     colorMap[cat],
    borderWidth: 1,
    pointRadius: 5,
    pointHoverRadius: 8,
  }));

  makeChart('chart-scatter', {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pt = ctx.raw;
              return [
                ` Wilayah: ${pt.label ?? '–'}`,
                ` Mag: ${pt.x.toFixed(1)}  ·  Kedalaman: ${pt.y} km`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Magnitudo (SR)', font: { size: 11 } },
          grid: { color: '#f1f5f9' }
        },
        y: {
          title: { display: true, text: 'Kedalaman (km)', font: { size: 11 } },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE
// ─────────────────────────────────────────────────────────────────────────────

/** Render paginated, sorted table rows */
function renderTable() {
  // Sort filteredData by current sort column/direction
  const sorted = [...filteredData].sort((a, b) => {
    let va, vb;
    switch (sortColumn) {
      case 'Magnitude':
        va = a._mag; vb = b._mag; break;
      case 'Kedalaman':
        va = a._depth; vb = b._depth; break;
      default: // Tanggal
        va = a._dateObj ? a._dateObj.getTime() : 0;
        vb = b._dateObj ? b._dateObj.getTime() : 0;
    }
    return sortDirection === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const end   = Math.min(start + ROWS_PER_PAGE, sorted.length);
  const page  = sorted.slice(start, end);

  // Update pagination UI
  $('page-current').textContent   = currentPage;
  $('page-total').textContent     = totalPages;
  $('page-range-info').textContent = sorted.length > 0
    ? `Baris ${start + 1}–${end} dari ${sorted.length}`
    : '';

  $('btn-prev-page').disabled = currentPage <= 1;
  $('btn-next-page').disabled = currentPage >= totalPages;

  const tbody = $('gempa-table-body');
  tbody.innerHTML = '';

  if (page.length === 0) {
    show('table-empty');
    return;
  }
  hide('table-empty');

  page.forEach(eq => {
    const { bg: magBg, text: magText } = magStyle(eq._mag);
    const hasTsunami = (eq.Potensi ?? '').toLowerCase().includes('tsunami')
      && !(eq.Potensi ?? '').toLowerCase().includes('tidak');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap">
        <p class="font-medium text-slate-700 text-xs">${eq.Tanggal ?? '–'}</p>
        <p class="text-slate-400 text-xs">${eq.Jam ?? ''}</p>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="mag-badge ${magBadgeClass(eq._mag)}">${eq._mag.toFixed(1)}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="depth-badge depth-${eq._depthCat}">${eq.Kedalaman}</span>
      </td>
      <td class="px-4 py-3 text-slate-600 text-xs max-w-xs">${eq.Wilayah ?? '–'}</td>
      <td class="px-4 py-3 text-xs ${hasTsunami ? 'potensi-tsunami' : 'potensi-no-tsunami'}">
        ${eq.Potensi ?? '–'}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update sort icons
  document.querySelectorAll('.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === sortColumn) {
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      if (icon) icon.textContent = sortDirection === 'asc' ? '↑' : '↓';
    } else {
      if (icon) icon.textContent = '↕';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Return Tailwind bg/text colour classes and label based on magnitude */
function magStyle(mag) {
  if (mag >= 7)   return { bg: 'bg-rose-900',   text: 'text-rose-200',   label: 'Dahsyat ≥7'  };
  if (mag >= 6)   return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Kuat M6+'    };
  if (mag >= 5)   return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Sedang M5+'  };
  if (mag >= 4)   return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Lemah M4+'   };
  if (mag >= 3)   return { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Kecil M3+'   };
  return           { bg: 'bg-sky-100',     text: 'text-sky-700',    label: 'Mikro <3'    };
}

/** Return CSS class for magnitude badge colour */
function magBadgeClass(mag) {
  if (mag >= 7)  return 'mag-great';
  if (mag >= 6)  return 'mag-major';
  if (mag >= 5)  return 'mag-strong';
  if (mag >= 4)  return 'mag-moderate';
  if (mag >= 3)  return 'mag-low';
  return 'mag-minor';
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce utility – delay rapid-fire calls (e.g. slider/input) */
function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function attachEventListeners() {
  // Magnitude slider – update displayed value + filter
  const magMinSlider = $('filter-mag-min');
  const magMaxSlider = $('filter-mag-max');

  const updateMagDisplay = debounce(() => {
    // Enforce min <= max
    if (parseFloat(magMinSlider.value) > parseFloat(magMaxSlider.value)) {
      magMinSlider.value = magMaxSlider.value;
    }
    $('filter-mag-min-val').textContent = parseFloat(magMinSlider.value).toFixed(1);
    $('filter-mag-max-val').textContent = parseFloat(magMaxSlider.value).toFixed(1);
    applyFilters();
  }, 150);

  magMinSlider.addEventListener('input', () => {
    $('filter-mag-min-val').textContent = parseFloat(magMinSlider.value).toFixed(1);
    updateMagDisplay();
  });
  magMaxSlider.addEventListener('input', () => {
    $('filter-mag-max-val').textContent = parseFloat(magMaxSlider.value).toFixed(1);
    updateMagDisplay();
  });

  // Depth category dropdown
  $('filter-depth').addEventListener('change', applyFilters);

  // Region text search (debounced)
  $('filter-region').addEventListener('input', debounce(applyFilters, 300));

  // Reset button
  $('btn-reset-filter').addEventListener('click', () => {
    magMinSlider.value = 0;
    magMaxSlider.value = 10;
    $('filter-mag-min-val').textContent = '0';
    $('filter-mag-max-val').textContent = '10';
    $('filter-depth').value  = '';
    $('filter-region').value = '';
    applyFilters();
  });

  // Table sort (event delegation on thead)
  document.querySelectorAll('#gempa-table .sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn    = col;
        sortDirection = 'desc';
      }
      renderTable();
    });
  });

  // Pagination
  $('btn-prev-page').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTable(); }
  });
  $('btn-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);
    if (currentPage < totalPages) { currentPage++; renderTable(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

/** Bootstrap: attach listeners, then load data */
async function init() {
  attachEventListeners();
  await loadData();
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', init);
