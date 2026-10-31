/**
 * script.js
 * Sales Dashboard 2024 — Vanilla JavaScript + Chart.js
 *
 * Arsitektur:
 *  1. loadData()         — Fetch sales_data.json
 *  2. applyFilters()     — Filter data berdasarkan dropdown
 *  3. updateKPI()        — Hitung & tampilkan 4 KPI card
 *  4. updateAllCharts()  — Panggil semua fungsi update chart
 *  5. Setiap fungsi chart memanage instance Chart.js-nya sendiri
 */

'use strict';

// ─── Palet warna konsisten di seluruh dashboard ──────────────────────────────
const PALETTE = {
  blue:   '#3b82f6',
  emerald:'#10b981',
  violet: '#8b5cf6',
  amber:  '#f59e0b',
  rose:   '#f43f5e',
  sky:    '#0ea5e9',
  teal:   '#14b8a6',
  orange: '#f97316',
  indigo: '#6366f1',
  lime:   '#84cc16',
};

const COLORS_MULTI = Object.values(PALETTE);

// ─── State global ─────────────────────────────────────────────────────────────
let allData    = [];   // Semua data dari JSON
let filteredData = []; // Data setelah filter diterapkan

// Menyimpan instance Chart.js agar bisa di-destroy sebelum render ulang
const charts = {};

// ─── Inisialisasi saat DOM siap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Pasang event listener ke setiap filter select
  ['filterRegion', 'filterCategory', 'filterCustomer', 'filterChannel'].forEach(id => {
    document.getElementById(id).addEventListener('change', onFilterChange);
  });

  // Tombol reset filter
  document.getElementById('btnReset').addEventListener('click', resetFilters);
});

// ─── 1. Load data dari JSON ───────────────────────────────────────────────────
async function loadData() {
  try {
    const response = await fetch('sales_data.json');
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    allData = await response.json();
    filteredData = [...allData];
    updateDashboard();
  } catch (err) {
    console.error('Gagal memuat sales_data.json:', err);
    alert('Gagal memuat data. Pastikan file sales_data.json tersedia dan dashboard dijalankan via server (bukan file://).');
  }
}

// ─── 2. Handler perubahan filter ─────────────────────────────────────────────
function onFilterChange() {
  filteredData = applyFilters();
  updateDashboard();
}

// ─── 3. Terapkan semua filter aktif ──────────────────────────────────────────
function applyFilters() {
  const region   = document.getElementById('filterRegion').value;
  const category = document.getElementById('filterCategory').value;
  const customer = document.getElementById('filterCustomer').value;
  const channel  = document.getElementById('filterChannel').value;

  return allData.filter(row => {
    if (region   !== 'all' && row.region           !== region)   return false;
    if (category !== 'all' && row.product_category !== category) return false;
    if (customer !== 'all' && row.customer_type    !== customer) return false;
    if (channel  !== 'all' && row.sales_channel    !== channel)  return false;
    return true;
  });
}

// ─── 4. Reset semua filter ke default ────────────────────────────────────────
function resetFilters() {
  ['filterRegion', 'filterCategory', 'filterCustomer', 'filterChannel'].forEach(id => {
    document.getElementById(id).value = 'all';
  });
  filteredData = [...allData];
  updateDashboard();
}

// ─── 5. Update seluruh dashboard sekaligus ───────────────────────────────────
function updateDashboard() {
  updateKPI(filteredData);
  updateAllCharts(filteredData);
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARDS
// ─────────────────────────────────────────────────────────────────────────────
function updateKPI(data) {
  const totalRevenue      = data.reduce((sum, r) => sum + r.revenue, 0);
  const totalTransactions = data.length;
  const totalQuantity     = data.reduce((sum, r) => sum + r.quantity, 0);
  const avgDiscount       = data.length
    ? data.reduce((sum, r) => sum + r.discount, 0) / data.length
    : 0;

  document.getElementById('kpiRevenue').textContent      = formatIDR(totalRevenue);
  document.getElementById('kpiTransactions').textContent = totalTransactions.toLocaleString('id-ID');
  document.getElementById('kpiQuantity').textContent     = totalQuantity.toLocaleString('id-ID');
  document.getElementById('kpiDiscount').textContent     = (avgDiscount * 100).toFixed(1) + '%';

  // Sub-keterangan dinamis
  document.getElementById('kpiRevenueSub').textContent      = `Dari ${totalTransactions} transaksi`;
  document.getElementById('kpiTransactionsSub').textContent = `${totalTransactions} order tercatat`;
  document.getElementById('kpiQuantitySub').textContent     = `${totalQuantity.toLocaleString('id-ID')} unit terjual`;
  document.getElementById('kpiDiscountSub').textContent     = `Avg diskon per transaksi`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEMUA CHARTS
// ─────────────────────────────────────────────────────────────────────────────
function updateAllCharts(data) {
  renderSalesTrend(data);
  renderRegionChart(data);
  renderCategoryChart(data);
  renderQtyCategoryChart(data);
  renderSalesRepChart(data);
  renderCustomerTypeChart(data);
  renderPaymentChart(data);
  renderChannelChart(data);
  renderScatterChart(data);
  renderTop10Chart(data);
}

// ─── Helper: Hancurkan chart lama sebelum render ulang ───────────────────────
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

// ─── Helper: Grup data berdasarkan key tertentu, sum revenue ─────────────────
function groupByRevenue(data, key) {
  return data.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + row.revenue;
    return acc;
  }, {});
}

// ─── Helper: Grup data berdasarkan key tertentu, sum quantity ────────────────
function groupByQuantity(data, key) {
  return data.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + row.quantity;
    return acc;
  }, {});
}

// ─── Helper: Format angka ke IDR singkat (misal: "Rp 1,23 M") ───────────────
function formatIDR(value) {
  if (value >= 1_000_000_000) return 'Rp ' + (value / 1_000_000_000).toFixed(2) + ' B';
  if (value >= 1_000_000)     return 'Rp ' + (value / 1_000_000).toFixed(1) + ' Jt';
  return 'Rp ' + value.toLocaleString('id-ID');
}

// ─── Helper: Format tooltip revenue lengkap ──────────────────────────────────
function formatIDRFull(value) {
  return 'Rp ' + value.toLocaleString('id-ID');
}

// ─── Opsi default tooltip ────────────────────────────────────────────────────
const defaultTooltip = {
  callbacks: {
    label: ctx => ' ' + formatIDRFull(ctx.parsed.y ?? ctx.parsed)
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHART 1 — Sales Trend (Line)
// ─────────────────────────────────────────────────────────────────────────────
function renderSalesTrend(data) {
  // Agregasi revenue per bulan (YYYY-MM)
  const monthly = {};
  data.forEach(row => {
    const month = row.date.slice(0, 7); // "2024-01"
    monthly[month] = (monthly[month] || 0) + row.revenue;
  });

  // Urutkan berdasarkan bulan
  const labels = Object.keys(monthly).sort();
  const values = labels.map(k => monthly[k]);

  // Label tampil sebagai nama bulan singkat
  const labelNames = labels.map(l => {
    const [y, m] = l.split('-');
    return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
  });

  destroyChart('salesTrend');
  const ctx = document.getElementById('chartSalesTrend').getContext('2d');

  // Gradient fill di bawah garis
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, 'rgba(59,130,246,0.25)');
  gradient.addColorStop(1, 'rgba(59,130,246,0.00)');

  charts.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labelNames,
      datasets: [{
        label: 'Revenue',
        data: values,
        borderColor: PALETTE.blue,
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: PALETTE.blue,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + formatIDRFull(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => formatIDR(v),
            maxTicksLimit: 6,
            font: { size: 11 },
          },
          grid: { color: '#f3f4f6' }
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 2 — Revenue per Region (Doughnut)
// ─────────────────────────────────────────────────────────────────────────────
function renderRegionChart(data) {
  const grouped = groupByRevenue(data, 'region');
  const labels  = Object.keys(grouped);
  const values  = Object.values(grouped);

  // Warna dengan transparansi untuk efek Polar Area yang lembut
  const bgColors  = [
    'rgba(59,130,246,0.75)',   // blue
    'rgba(16,185,129,0.75)',   // emerald
    'rgba(139,92,246,0.75)',   // violet
    'rgba(245,158,11,0.75)',   // amber
  ];
  const bdrColors = [PALETTE.blue, PALETTE.emerald, PALETTE.violet, PALETTE.amber];

  destroyChart('region');
  const ctx = document.getElementById('chartRegion').getContext('2d');

  charts.region = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: bdrColors,
        borderWidth: 2,
        borderAlign: 'inner',   // border di dalam area agar rapi
        hoverBackgroundColor: bdrColors,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      startAngle: -Math.PI / 2,  // mulai dari atas (12 o'clock)
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatIDRFull(ctx.parsed.r)}`
          }
        }
      },
      scales: {
        r: {
          ticks: {
            callback: v => formatIDR(v),
            font: { size: 10 },
            backdropColor: 'transparent',
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
          angleLines: { color: 'rgba(0,0,0,0.06)' },
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 3 — Revenue per Product Category (Bar)
// ─────────────────────────────────────────────────────────────────────────────
function renderCategoryChart(data) {
  const grouped = groupByRevenue(data, 'product_category');
  // Urutkan dari tertinggi
  const sorted  = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const labels  = sorted.map(e => e[0]);
  const values  = sorted.map(e => e[1]);

  destroyChart('category');
  const ctx = document.getElementById('chartCategory').getContext('2d');

  charts.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: [PALETTE.blue, PALETTE.emerald, PALETTE.violet, PALETTE.amber],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Horizontal bar
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + formatIDRFull(ctx.parsed.x) } }
      },
      scales: {
        x: {
          ticks: { callback: v => formatIDR(v), font: { size: 11 } },
          grid: { color: '#f3f4f6' }
        },
        y: {
          ticks: { font: { size: 12 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 4 — Quantity Sold per Category (Bar vertikal)
// ─────────────────────────────────────────────────────────────────────────────
function renderQtyCategoryChart(data) {
  const grouped = groupByQuantity(data, 'product_category');
  const sorted  = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const labels  = sorted.map(e => e[0]);
  const values  = sorted.map(e => e[1]);

  destroyChart('qtyCategory');
  const ctx = document.getElementById('chartQtyCategory').getContext('2d');

  charts.qtyCategory = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Qty',
        data: values,
        backgroundColor: [PALETTE.sky, PALETTE.teal, PALETTE.orange, PALETTE.rose],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString('id-ID')} unit` } }
      },
      scales: {
        y: {
          ticks: { font: { size: 11 } },
          grid: { color: '#f3f4f6' }
        },
        x: {
          ticks: { font: { size: 12 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 5 — Sales per Sales Representative (Horizontal Bar)
// ─────────────────────────────────────────────────────────────────────────────
function renderSalesRepChart(data) {
  const grouped = groupByRevenue(data, 'sales_rep');
  const sorted  = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const labels  = sorted.map(e => e[0]);
  const values  = sorted.map(e => e[1]);

  destroyChart('salesRep');
  const ctx = document.getElementById('chartSalesRep').getContext('2d');

  charts.salesRep = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: COLORS_MULTI.slice(0, labels.length),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + formatIDRFull(ctx.parsed.x) } }
      },
      scales: {
        x: {
          ticks: { callback: v => formatIDR(v), font: { size: 11 } },
          grid: { color: '#f3f4f6' }
        },
        y: {
          ticks: { font: { size: 12 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 6 — Customer Type Distribution (Pie)
// ─────────────────────────────────────────────────────────────────────────────
function renderCustomerTypeChart(data) {
  const grouped = groupByRevenue(data, 'customer_type');
  const labels  = Object.keys(grouped);
  const values  = Object.values(grouped);

  destroyChart('customerType');
  const ctx = document.getElementById('chartCustomerType').getContext('2d');

  charts.customerType = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.blue, PALETTE.emerald],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatIDRFull(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 7 — Payment Method Usage (Doughnut)
// ─────────────────────────────────────────────────────────────────────────────
function renderPaymentChart(data) {
  const grouped = data.reduce((acc, row) => {
    acc[row.payment_method] = (acc[row.payment_method] || 0) + 1; // hitung frekuensi
    return acc;
  }, {});
  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  destroyChart('payment');
  const ctx = document.getElementById('chartPayment').getContext('2d');

  charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.violet, PALETTE.amber, PALETTE.sky],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed} transaksi`
          }
        }
      },
      cutout: '58%',
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 8 — Sales Channel Distribution (Pie)
// ─────────────────────────────────────────────────────────────────────────────
function renderChannelChart(data) {
  const grouped = data.reduce((acc, row) => {
    acc[row.sales_channel] = (acc[row.sales_channel] || 0) + row.revenue;
    return acc;
  }, {});
  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  destroyChart('channel');
  const ctx = document.getElementById('chartChannel').getContext('2d');

  charts.channel = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.teal, PALETTE.orange],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatIDRFull(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 9 — Discount vs Sales (Scatter Plot)
//           X = discount (%), Y = revenue
// ─────────────────────────────────────────────────────────────────────────────
function renderScatterChart(data) {
  const points = data.map(row => ({
    x: +(row.discount * 100).toFixed(1),
    y: row.revenue,
  }));

  destroyChart('scatter');
  const ctx = document.getElementById('chartScatter').getContext('2d');

  charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Transaksi',
        data: points,
        backgroundColor: 'rgba(99,102,241,0.5)',
        borderColor: PALETTE.indigo,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Diskon ${ctx.parsed.x}% | Revenue ${formatIDRFull(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Diskon (%)', font: { size: 11 } },
          ticks: { font: { size: 11 } },
          grid: { color: '#f3f4f6' }
        },
        y: {
          title: { display: true, text: 'Revenue', font: { size: 11 } },
          ticks: { callback: v => formatIDR(v), font: { size: 10 } },
          grid: { color: '#f3f4f6' }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART 10 — Top 10 Highest Sales (Horizontal Bar)
//             Berdasarkan revenue per transaksi
// ─────────────────────────────────────────────────────────────────────────────
function renderTop10Chart(data) {
  // Ambil 10 transaksi dengan revenue tertinggi
  const top10 = [...data]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Label: "Nama Produk – Sales Rep"
  const labels = top10.map(r => `${r.product_name} (${r.sales_rep})`);
  const values = top10.map(r => r.revenue);

  destroyChart('top10');
  const ctx = document.getElementById('chartTop10').getContext('2d');

  charts.top10 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: COLORS_MULTI.slice(0, 10),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + formatIDRFull(ctx.parsed.x) } }
      },
      scales: {
        x: {
          ticks: { callback: v => formatIDR(v), font: { size: 11 } },
          grid: { color: '#f3f4f6' }
        },
        y: {
          ticks: { font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}
