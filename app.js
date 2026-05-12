// ─── CONFIG ────────────────────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://taichungaccident.onrender.com';

// ─── STATE ─────────────────────────────────────────────────────────
let currentRole = 'public';
let currentView = 'search';
const chartInstances = {};

// ─── CONSTANTS ─────────────────────────────────────────────────────
const COLORS = ['#00d4ff','#ff6b35','#7c3aed','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#14b8a6','#8b5cf6'];
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#1e3a5f';

// ─── HELPERS ───────────────────────────────────────────────────────
function getFilters() {
  const year = document.getElementById('yearSelect').value;
  const checkedBoxes = Array.from(document.querySelectorAll('#monthOptions input:checked')).map(cb => cb.value);
  const months = (checkedBoxes.includes('all') || checkedBoxes.length === 0) ? '' : checkedBoxes.join(',');
  return { year, months };
}

function buildQS() {
  const { year, months } = getFilters();
  let qs = `year=${year}`;
  if (months) qs += `&months=${months}`;
  return qs;
}

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function loading(id) {
  document.getElementById(id).innerHTML = `
    <div class="state-box"><div class="spinner"></div><div class="state-text">資料載入中，請稍候…</div></div>`;
}

function errorState(id, msg = '載入失敗，請稍後再試') {
  document.getElementById(id).innerHTML = `
    <div class="state-box">
      <div class="state-icon">⚠️</div>
      <div class="state-text" style="color:var(--danger)">${msg}</div>
    </div>`;
}

function destroyChart(key) {
  if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}

// ─── MONTH DROPDOWN ────────────────────────────────────────────────
function toggleMonthDropdown() {
  const options = document.getElementById('monthOptions');
  const arrow = document.querySelector('.select-arrow');
  options.classList.toggle('show');
  arrow.style.transform = options.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

document.addEventListener('click', function(event) {
  const dropdown = document.getElementById('monthDropdown');
  if (dropdown && !dropdown.contains(event.target)) {
    document.getElementById('monthOptions').classList.remove('show');
    document.querySelector('.select-arrow').style.transform = 'rotate(0deg)';
  }
});

function handleMonthChange(checkbox) {
  const allBox = document.querySelector('#monthOptions input[value="all"]');
  const monthBoxes = Array.from(document.querySelectorAll('#monthOptions input:not([value="all"])'));

  if (checkbox.value === 'all' && checkbox.checked) {
    monthBoxes.forEach(cb => cb.checked = false);
  } else if (checkbox.checked) {
    allBox.checked = false;
  }

  if (document.querySelectorAll('#monthOptions input:checked').length === 0) {
    allBox.checked = true;
  }
  updateMonthDisplay();
}

function updateMonthDisplay() {
  const checkedBoxes = Array.from(document.querySelectorAll('#monthOptions input:checked'));
  const display = document.getElementById('monthDisplay');

  if (checkedBoxes.some(cb => cb.value === 'all')) {
    display.textContent = '全年';
  } else {
    const texts = checkedBoxes.map(cb => cb.parentElement.textContent.trim());
    display.textContent = texts.length <= 2 ? texts.join(', ') : `已選 ${texts.length} 個月`;
  }
}

// ─── MOBILE NAV ────────────────────────────────────────────────────
function toggleMobileNav() {
  const nav = document.getElementById('navPanel');
  const btn = document.getElementById('mobileNavToggle');
  const overlay = document.getElementById('navOverlay');

  // 動態取得 header 實際高度，讓 nav 從 header 下方開始
  const headerH = document.querySelector('header').getBoundingClientRect().height;
  nav.style.top = headerH + 'px';
  overlay.style.top = headerH + 'px';

  const isOpen = nav.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  overlay.classList.toggle('show', isOpen);
}

function closeMobileNav() {
  document.getElementById('navPanel').classList.remove('open');
  document.getElementById('mobileNavToggle').classList.remove('open');
  document.getElementById('navOverlay').classList.remove('show');
}

// ─── ROLE SWITCH ───────────────────────────────────────────────────
function setRole(role, event) {
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  if (event?.target) event.target.classList.add('active');

  const govBtns = document.querySelectorAll('.nav-btn.gov-only');
  const govTitle = document.getElementById('govSectionTitle');
  if (role === 'gov') {
    govBtns.forEach(b => b.style.display = 'flex');
    govTitle.style.display = 'block';
  } else {
    govBtns.forEach(b => b.style.display = 'none');
    govTitle.style.display = 'none';
    const govViews = ['equip-injury','drinking-injury','weather-loc','road-defect','time-factor','drunk-rank'];
    if (govViews.includes(currentView)) switchView('search');
  }
}

// ─── VIEW SWITCH ───────────────────────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const viewMap = {
    'search':          'viewSearch',
    'factors':         'viewFactors',
    'district':        'viewDistrict',
    'hourly':          'viewHourly',
    'equip-injury':    'viewEquipInjury',
    'drinking-injury': 'viewDrinkingInjury',
    'weather-loc':     'viewWeatherLoc',
    'road-defect':     'viewRoadDefect',
    'time-factor':     'viewTimeFactor',
    'drunk-rank':      'viewDrunkRank',
  };
  const loaders = {
    'factors':         loadFactors,
    'district':        loadDistrict,
    'hourly':          loadHourly,
    'equip-injury':    loadEquipInjury,
    'drinking-injury': loadDrinkingInjury,
    'weather-loc':     loadWeatherLoc,
    'road-defect':     loadRoadDefect,
    'time-factor':     loadTimeFactor,
    'drunk-rank':      loadDrunkRank,
  };

  currentView = view;
  const el = document.getElementById(viewMap[view]);
  if (el) el.style.display = 'block';
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

  if (loaders[view]) loaders[view]();

  // 手機版：切換後自動關閉側邊 nav
  closeMobileNav();
}

// ─── SEARCH ────────────────────────────────────────────────────────

// 序號查詢（保留）
async function searchAccident() {
  const { months } = getFilters();
  if (!months || months.includes(',')) {
    alert('查詢單筆事故時，請在右上角選擇「單一月份」以避免重複序號！');
    return;
  }
  const serial = document.getElementById('serialInput').value.trim();
  if (!serial) { alert('請輸入事故序號'); return; }

  const result = document.getElementById('searchResult');
  result.innerHTML = `<div class="state-box"><div class="spinner"></div><div class="state-text">查詢中…</div></div>`;

  try {
    const data = await apiFetch(`/api/search?serial=${encodeURIComponent(serial)}&${buildQS()}`);
    if (!data.found) {
      result.innerHTML = `<div class="state-box"><div class="state-icon">🔍</div><div class="state-text">查無此序號的事故資料</div></div>`;
      return;
    }
    renderSingleResult(data.data, result);
  } catch(e) {
    result.innerHTML = `<div class="state-box"><div class="state-icon">⚠️</div><div class="state-text" style="color:var(--danger)">查詢失敗：${e.message}</div></div>`;
  }
}

function renderSingleResult(d, container) {
  const fields = [
    ['序號','序號'], ['年','年'], ['月','月'], ['日','日'], ['時','時'], ['分','分'],
    ['區','區'], ['死亡數量','死亡數量'], ['受傷數量','受傷數量'], ['天候','天候'],
    ['道路照明設備','照明'], ['道路類別','道路類別'], ['道路速限','速限'],
    ['道路型態','道路型態'], ['事故位置','事故位置'], ['路面鋪裝','路面'],
    ['路面狀態','路面狀態'], ['路面缺陷','路面缺陷'], ['障礙物','障礙物'],
    ['號誌種類','號誌'], ['事故類型及型態','事故類型'], ['肇事因素主要','主要肇因'],
    ['受傷程度','受傷程度'], ['主要傷處','主要傷處'], ['保護裝備','保護裝備'],
    ['飲酒情形','飲酒情形'], ['肇事逃逸','肇事逃逸'], ['GPS座標X','GPS 經度'], ['GPS座標Y','GPS 緯度'],
  ];
  const items = fields.map(([key, label]) => {
    const val = d[key] ?? '—';
    return `<div class="result-item"><div class="result-label">${label}</div><div class="result-value">${val}</div></div>`;
  }).join('');
  container.innerHTML = `
    <div class="result-card">
      <div class="result-card-header">
        <span style="color:var(--accent);font-weight:700">事故序號：${d['序號'] ?? '—'}</span>
        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:auto">${d['年'] ?? ''}年${d['月'] ?? ''}月${d['日'] ?? ''}日 ${d['時'] ?? ''}:${(d['分']??'').toString().padStart(2,'0')}</span>
      </div>
      <div class="result-grid">${items}</div>
    </div>`;
}

// ─── 多條件查詢 state ───────────────────────────────────────────
let multiPage = 1;
let multiTotal = 0;
const multiPerPage = 20;

async function initSearchFilters() {
  try {
    const opts = await apiFetch(`/api/filter-options?${buildQS()}`);
    const distSel = document.getElementById('filterDistrict');
    const causeSel = document.getElementById('filterCause');
    const injSel = document.getElementById('filterInjury');
    if (!distSel) return;

    distSel.innerHTML = '<option value="">（全部行政區）</option>' +
      opts.districts.map(d => `<option value="${d}">${d}</option>`).join('');
    causeSel.innerHTML = '<option value="">（全部肇因）</option>' +
      opts.causes.map(c => `<option value="${c.code}">${c.label}</option>`).join('');
    injSel.innerHTML = '<option value="">（全部受傷程度）</option>' +
      opts.injuries.map(i => `<option value="${i.code}">${i.label}</option>`).join('');
  } catch(e) { /* silently fail */ }
}

async function searchMulti(resetPage = true) {
  if (resetPage) multiPage = 1;
  const district = document.getElementById('filterDistrict')?.value ?? '';
  const cause    = document.getElementById('filterCause')?.value ?? '';
  const injury   = document.getElementById('filterInjury')?.value ?? '';
  const result   = document.getElementById('multiResult');
  result.innerHTML = `<div class="state-box"><div class="spinner"></div><div class="state-text">查詢中…</div></div>`;

  try {
    const qs = buildQS();
    const params = new URLSearchParams({ district, cause, injury, page: multiPage, per_page: multiPerPage });
    const data = await apiFetch(`/api/search-multi?${qs}&${params}`);
    multiTotal = data.total;
    renderMultiResult(data, result, district, cause, injury);
  } catch(e) {
    result.innerHTML = `<div class="state-box"><div class="state-icon">⚠️</div><div class="state-text" style="color:var(--danger)">查詢失敗：${e.message}</div></div>`;
  }
}

function renderMultiResult(data, container, district, cause, injury) {
  if (data.total === 0) {
    container.innerHTML = `<div class="state-box"><div class="state-icon">🔍</div><div class="state-text">查無符合條件的事故資料</div></div>`;
    return;
  }
  const totalPages = Math.ceil(data.total / multiPerPage);
  const rows = data.data.map(d => `
    <tr>
      <td>${d['序號'] ?? '—'}</td>
      <td>${d['年'] ?? ''}/${d['月'] ?? ''}/${d['日'] ?? ''}<br><span style="font-size:0.75rem;color:var(--text-muted)">${d['時'] ?? ''}:${(d['分']??'').toString().padStart(2,'0')}</span></td>
      <td>${d['區'] ?? '—'}</td>
      <td>${d['肇事因素主要'] ?? '—'}</td>
      <td>${d['受傷程度'] ?? '—'}</td>
      <td>${d['死亡數量'] ?? 0} 死 / ${d['受傷數量'] ?? 0} 傷</td>
    </tr>`).join('');

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
      <span style="font-size:0.82rem;color:var(--text-muted)">共 <b style="color:var(--accent)">${data.total}</b> 筆，第 ${multiPage}/${totalPages} 頁</span>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-secondary" style="padding:0.35rem 0.75rem;font-size:0.8rem" onclick="multiPage=Math.max(1,multiPage-1);searchMulti(false)" ${multiPage<=1?'disabled':''}>← 上頁</button>
        <button class="btn btn-secondary" style="padding:0.35rem 0.75rem;font-size:0.8rem" onclick="multiPage=Math.min(${totalPages},multiPage+1);searchMulti(false)" ${multiPage>=totalPages?'disabled':''}>下頁 →</button>
      </div>
    </div>
    <div class="data-table-wrap">
      <table>
        <thead><tr><th>序號</th><th>時間</th><th>行政區</th><th>主要肇因</th><th>受傷程度</th><th>傷亡</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}


// ─── SEARCH TAB SWITCHER ───────────────────────────────────────────
function switchSearchTab(tab) {
  document.getElementById('searchTabSerial').style.display = tab === 'serial' ? 'block' : 'none';
  document.getElementById('searchTabMulti').style.display  = tab === 'multi'  ? 'block' : 'none';
  document.getElementById('tabSerial').classList.toggle('active', tab === 'serial');
  document.getElementById('tabMulti').classList.toggle('active',  tab === 'multi');
  if (tab === 'multi') initSearchFilters();
}

function clearMultiFilters() {
  ['filterDistrict','filterCause','filterInjury'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ─── FACTORS ───────────────────────────────────────────────────────
async function loadFactors() {
  loading('factorsContent');
  try {
    const data = await apiFetch(`/api/causing-factors?top=10&${buildQS()}`);
    const maxVal = Math.max(...data.map(d => d.count));
    const rows = data.map((d, i) => `
      <tr>
        <td><span class="rank-badge rank-${i+1}">${i+1}</span></td>
        <td>${d.factor}</td>
        <td style="width:200px">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div class="progress-bar-wrap" style="flex:1">
              <div class="progress-bar" style="width:${(d.count/maxVal*100).toFixed(1)}%;background:${COLORS[i%10]}"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);min-width:40px;text-align:right">${d.count}</span>
          </div>
        </td>
      </tr>`).join('');
    document.getElementById('factorsContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">前10大肇事因素 Bar Chart</div>
        <div class="chart-canvas-wrap"><canvas id="factorsChart"></canvas></div>
      </div>
      <div class="data-table-wrap">
        <table><thead><tr><th>#</th><th>肇事因素</th><th>次數分佈</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
    destroyChart('factors');
    chartInstances.factors = new Chart(document.getElementById('factorsChart'), {
      type: 'bar',
      data: {
        labels: data.map(d => d.factor.length > 14 ? d.factor.slice(0,14)+'…' : d.factor),
        datasets: [{ data: data.map(d => d.count), backgroundColor: COLORS, borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#1e3a5f' } }
        }
      }
    });
  } catch(e) { errorState('factorsContent', `載入失敗：${e.message}`); }
}

// ─── DISTRICT ──────────────────────────────────────────────────────
async function loadDistrict() {
  loading('districtContent');
  try {
    const data = await apiFetch(`/api/district-frequency?${buildQS()}`);
    const sorted = [...data].sort((a,b) => b.count - a.count);
    const maxVal = sorted[0]?.count || 1;
    const rows = sorted.map((d, i) => `
      <tr>
        <td><span class="rank-badge rank-${i+1}">${i+1}</span></td>
        <td>${d.district}</td>
        <td style="width:220px">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div class="progress-bar-wrap" style="flex:1">
              <div class="progress-bar" style="width:${(d.count/maxVal*100).toFixed(1)}%;background:${COLORS[i%10]}"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);min-width:40px;text-align:right">${d.count}</span>
          </div>
        </td>
      </tr>`).join('');
    document.getElementById('districtContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">各行政區事故次數</div>
        <div class="chart-canvas-wrap"><canvas id="districtChart"></canvas></div>
      </div>
      <div class="data-table-wrap">
        <table><thead><tr><th>#</th><th>行政區</th><th>事故次數</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
    destroyChart('district');
    chartInstances.district = new Chart(document.getElementById('districtChart'), {
      type: 'doughnut',
      data: {
        labels: sorted.map(d => d.district),
        datasets: [{ data: sorted.map(d => d.count), backgroundColor: COLORS.concat(COLORS), borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#64748b', font: { size: 11 }, boxWidth: 12, padding: 8 } }
        }
      }
    });
  } catch(e) { errorState('districtContent', `載入失敗：${e.message}`); }
}

// ─── HOURLY ────────────────────────────────────────────────────────
async function loadHourly() {
  loading('hourlyContent');
  try {
    const data = await apiFetch(`/api/hourly-distribution?${buildQS()}`);
    const sorted = [...data].sort((a,b) => a.hour - b.hour);
    const peak = sorted.reduce((max, d) => d.count > max.count ? d : max, sorted[0]);
    document.getElementById('hourlyContent').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.1rem" class="stats-row-3">
        <div class="chart-wrap" style="margin:0;text-align:center">
          <div class="chart-title">尖峰時刻</div>
          <div style="font-size:1.8rem;font-weight:900;color:var(--accent2);font-family:var(--font-mono)">${peak?.hour ?? '?'}:00</div>
          <div style="color:var(--text-muted);font-size:0.8rem">${peak?.count ?? 0} 件事故</div>
        </div>
        <div class="chart-wrap" style="margin:0;text-align:center">
          <div class="chart-title">總事故數</div>
          <div style="font-size:1.8rem;font-weight:900;color:var(--accent);font-family:var(--font-mono)">${sorted.reduce((s,d)=>s+d.count,0).toLocaleString()}</div>
          <div style="color:var(--text-muted);font-size:0.8rem">筆事故記錄</div>
        </div>
        <div class="chart-wrap" style="margin:0;text-align:center">
          <div class="chart-title">高危時段（6-9時）</div>
          <div style="font-size:1.8rem;font-weight:900;color:var(--warning);font-family:var(--font-mono)">${sorted.filter(d=>d.hour>=6&&d.hour<9).reduce((s,d)=>s+d.count,0).toLocaleString()}</div>
          <div style="color:var(--text-muted);font-size:0.8rem">件事故</div>
        </div>
      </div>
      <div class="chart-wrap">
        <div class="chart-title">24小時事故分佈</div>
        <div class="chart-canvas-wrap"><canvas id="hourlyChart"></canvas></div>
      </div>`;
    destroyChart('hourly');
    chartInstances.hourly = new Chart(document.getElementById('hourlyChart'), {
      type: 'line',
      data: {
        labels: sorted.map(d => `${d.hour}時`),
        datasets: [{
          data: sorted.map(d => d.count),
          borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)',
          fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 5,
          pointBackgroundColor: sorted.map(d => d.hour === peak?.hour ? '#ff6b35' : '#00d4ff')
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#1e3a5f' } }
        }
      }
    });
  } catch(e) { errorState('hourlyContent', `載入失敗：${e.message}`); }
}

// ─── EQUIP × INJURY ────────────────────────────────────────────────
async function loadEquipInjury() {
  loading('equipInjuryContent');
  try {
    const data = await apiFetch(`/api/equipment-injury?${buildQS()}`);
    const equips = [...new Set(data.map(d => d['保護裝備']))];
    const injuries = [...new Set(data.map(d => d['主要傷處']))];
    const datasets = injuries.map((inj, i) => ({
      label: inj,
      data: equips.map(eq => {
        const found = data.find(d => d['保護裝備'] === eq && d['主要傷處'] === inj);
        return found ? found.count : 0;
      }),
      backgroundColor: COLORS[i % COLORS.length],
      borderRadius: 3,
    }));
    document.getElementById('equipInjuryContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">保護裝備 × 主要傷處（Stacked Bar）</div>
        <div class="chart-canvas-wrap" style="height:360px"><canvas id="equipInjuryChart"></canvas></div>
      </div>`;
    destroyChart('equipInjury');
    chartInstances.equipInjury = new Chart(document.getElementById('equipInjuryChart'), {
      type: 'bar',
      data: { labels: equips, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
          y: { stacked: true, ticks: { color: '#64748b' }, grid: { color: '#1e3a5f' } }
        },
        plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 10 }, boxWidth: 10 } } }
      }
    });
  } catch(e) { errorState('equipInjuryContent', `載入失敗：${e.message}`); }
}

// ─── DRINKING × INJURY ─────────────────────────────────────────────
async function loadDrinkingInjury() {
  loading('drinkingInjuryContent');
  try {
    const data = await apiFetch(`/api/drinking-injury?${buildQS()}`);
    const drinks = [...new Set(data.map(d => d['飲酒情形']))];
    const injuries = [...new Set(data.map(d => d['受傷程度']))];
    const datasets = injuries.map((inj, i) => ({
      label: inj,
      data: drinks.map(dr => {
        const found = data.find(d => d['飲酒情形'] === dr && d['受傷程度'] === inj);
        return found ? found.count : 0;
      }),
      backgroundColor: COLORS[i % COLORS.length],
      borderRadius: 3,
    }));
    document.getElementById('drinkingInjuryContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">飲酒程度 × 受傷程度（Stacked Bar）</div>
        <div class="chart-canvas-wrap" style="height:340px"><canvas id="drinkingInjuryChart"></canvas></div>
      </div>`;
    destroyChart('drinkingInjury');
    chartInstances.drinkingInjury = new Chart(document.getElementById('drinkingInjuryChart'), {
      type: 'bar',
      data: { labels: drinks.map(d => d.length > 18 ? d.slice(0,18)+'…' : d), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e3a5f' } },
          y: { stacked: true, ticks: { color: '#64748b' }, grid: { color: '#1e3a5f' } }
        },
        plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 10 }, boxWidth: 10 } } }
      }
    });
  } catch(e) { errorState('drinkingInjuryContent', `載入失敗：${e.message}`); }
}

// ─── WEATHER × LOCATION ────────────────────────────────────────────
async function loadWeatherLoc() {
  loading('weatherLocContent');
  try {
    const data = await apiFetch(`/api/weather-location?${buildQS()}`);
    const weathers = [...new Set(data.map(d => d['天候']))];
    const locations = [...new Set(data.map(d => d['事故位置']))];
    const datasets = locations.slice(0,8).map((loc, i) => ({
      label: loc,
      data: weathers.map(w => {
        const found = data.find(d => d['天候'] === w && d['事故位置'] === loc);
        return found ? found.count : 0;
      }),
      backgroundColor: COLORS[i % COLORS.length],
      borderRadius: 3,
    }));
    document.getElementById('weatherLocContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">天候 × 事故位置（Grouped Bar，前8種位置）</div>
        <div class="chart-canvas-wrap" style="height:360px"><canvas id="weatherLocChart"></canvas></div>
      </div>`;
    destroyChart('weatherLoc');
    chartInstances.weatherLoc = new Chart(document.getElementById('weatherLocChart'), {
      type: 'bar',
      data: { labels: weathers, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e3a5f' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#1e3a5f' } }
        },
        plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 9 }, boxWidth: 10 } } }
      }
    });
  } catch(e) { errorState('weatherLocContent', `載入失敗：${e.message}`); }
}

// ─── ROAD DEFECT ───────────────────────────────────────────────────
async function loadRoadDefect() {
  loading('roadDefectContent');
  try {
    const data = await apiFetch(`/api/road-defect-district?${buildQS()}`);
    const districts = [...new Set(data.map(d => d['區']))].sort();
    const defects = ['路面鬆軟', '隆起或凹陷不平', '有坑洞'];
    const datasets = defects.map((def, i) => ({
      label: def,
      data: districts.map(dis => {
        const found = data.find(d => d['區'] === dis && d['路面缺陷'] === def);
        return found ? found.count : 0;
      }),
      backgroundColor: COLORS[i],
      borderRadius: 3,
    }));
    const rows = districts.map(dis => {
      const total = defects.reduce((s, def) => {
        const f = data.find(d => d['區'] === dis && d['路面缺陷'] === def);
        return s + (f ? f.count : 0);
      }, 0);
      const cells = defects.map(def => {
        const f = data.find(d => d['區'] === dis && d['路面缺陷'] === def);
        return `<td style="text-align:center;font-family:var(--font-mono)">${f ? f.count : 0}</td>`;
      }).join('');
      return `<tr><td>${dis}</td>${cells}<td style="text-align:center;font-weight:700;font-family:var(--font-mono);color:var(--accent2)">${total}</td></tr>`;
    }).join('');
    document.getElementById('roadDefectContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">各區路面缺陷肇事次數</div>
        <div class="chart-canvas-wrap" style="height:320px"><canvas id="roadDefectChart"></canvas></div>
      </div>
      <div class="data-table-wrap matrix-wrap">
        <table class="matrix-table">
          <thead><tr><th>行政區</th>${defects.map(d=>`<th>${d}</th>`).join('')}<th>合計</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    destroyChart('roadDefect');
    chartInstances.roadDefect = new Chart(document.getElementById('roadDefectChart'), {
      type: 'bar',
      data: { labels: districts, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e3a5f' } },
          y: { stacked: true, ticks: { color: '#64748b' }, grid: { color: '#1e3a5f' } }
        },
        plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { size: 10 }, boxWidth: 10 } } }
      }
    });
  } catch(e) { errorState('roadDefectContent', `載入失敗：${e.message}`); }
}

// ─── TIME × FACTOR ─────────────────────────────────────────────────
async function loadTimeFactor() {
  loading('timeFactorContent');
  try {
    const data = await apiFetch(`/api/time-factor?${buildQS()}`);
    const periods = [...new Set(data.map(d => d['時段']))];
    const html = periods.map(period => {
      const items = data.filter(d => d['時段'] === period).slice(0,5);
      const maxCount = items[0]?.count || 1;
      const rows = items.map((item, i) => `
        <tr>
          <td><span class="rank-badge rank-${i+1}">${i+1}</span></td>
          <td style="font-size:0.82rem">${item['肇事因素主要']}</td>
          <td>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <div class="progress-bar-wrap" style="flex:1;min-width:60px">
                <div class="progress-bar" style="width:${(item.count/maxCount*100).toFixed(1)}%;background:${COLORS[i]}"></div>
              </div>
              <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted)">${item.count}</span>
            </div>
          </td>
        </tr>`).join('');
      return `
        <div class="chart-wrap" style="margin-bottom:1rem">
          <div class="chart-title">${period}</div>
          <div class="data-table-wrap"><table>
            <thead><tr><th>#</th><th>肇事因素</th><th>次數</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </div>`;
    }).join('');
    document.getElementById('timeFactorContent').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem">${html}</div>`;
  } catch(e) { errorState('timeFactorContent', `載入失敗：${e.message}`); }
}

// ─── DRUNK RANK ────────────────────────────────────────────────────
async function loadDrunkRank() {
  loading('drunkRankContent');
  try {
    const data = await apiFetch(`/api/drunk-driving-district?${buildQS()}`);
    const maxVal = data[0]?.count || 1;
    const rows = data.map((d, i) => `
      <tr>
        <td><span class="rank-badge rank-${i+1}">${d.rank}</span></td>
        <td>${d.district}</td>
        <td style="width:220px">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div class="progress-bar-wrap" style="flex:1">
              <div class="progress-bar" style="width:${(d.count/maxVal*100).toFixed(1)}%;background:${i<3?'var(--danger)':COLORS[i%10]}"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);min-width:40px;text-align:right">${d.count}</span>
          </div>
        </td>
      </tr>`).join('');
    document.getElementById('drunkRankContent').innerHTML = `
      <div class="chart-wrap">
        <div class="chart-title">各區酒駕肇事次數 Radar Chart</div>
        <div class="chart-canvas-wrap" style="height:320px"><canvas id="drunkRankChart"></canvas></div>
      </div>
      <div class="data-table-wrap">
        <table><thead><tr><th>名次</th><th>行政區</th><th>酒駕事故次數</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
    destroyChart('drunkRank');
    chartInstances.drunkRank = new Chart(document.getElementById('drunkRankChart'), {
      type: 'radar',
      data: {
        labels: data.map(d => d.district),
        datasets: [{
          label: '酒駕次數',
          data: data.map(d => d.count),
          backgroundColor: 'rgba(239,68,68,0.15)',
          borderColor: '#ef4444',
          pointBackgroundColor: '#ef4444',
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            ticks: { color: '#64748b', font: { size: 9 }, backdropColor: 'transparent' },
            grid: { color: '#1e3a5f' },
            pointLabels: { color: '#94a3b8', font: { size: 9 } }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  } catch(e) { errorState('drunkRankContent', `載入失敗：${e.message}`); }
}

// ─── EVENT LISTENERS ───────────────────────────────────────────────
document.getElementById('serialInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchAccident();
});