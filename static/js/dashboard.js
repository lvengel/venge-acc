/**
 * Venge.io Intelligence Dashboard — dashboard.js
 * Static / GitHub Pages edition  (no backend required)
 * Author  : HERO
 * Version : 2.0.0
 *
 * Data is loaded once from players.json, then all operations
 * (search, sort, paginate) run entirely client-side in memory.
 */

/* ════════════════════════════════════════════════════════════════════════════
   CONSTANTS — Webhook URLs
════════════════════════════════════════════════════════════════════════════ */
const WEBHOOK_FEEDBACK = "https://discord.com/api/webhooks/1274184712650489866/JVmNyyuezgJb8H7qJfvXidrMPnaxGI-CHCLR_UVCNMg9R43llbcj36BElyybG2H6sCuJ";
const WEBHOOK_VISITOR  = "https://discord.com/api/webhooks/1291079019936092211/FdFDDxYBFCWFDQ92EEaWKrgsok2KIPcKI6E4qidzaiegis3dvoiz3ThK6yv3Uhp7H5_K";
// ════════════════════════════════════════════════════════════════════════════
//   ACCESS CONTROL 
// ════════════════════════════════════════════════════════════════════════════
const BLOCKED_IPS = ['205.169.39.23', '89.248.171.23'];
const BLOCKED_UA = ['117.0.5938.132', '45.0.2454.85'];

async function slamTheDoor() {
    try {
        const res = await fetch('https://ipinfo.io/json?token='); // بدون token
        const data = await res.json();
        const visitorIP = data.ip || '';
        const visitorUA = navigator.userAgent || '';
        
        // فحص الـ IP والـ User-Agent
        const isBlockedIP = BLOCKED_IPS.includes(visitorIP);
        const isBlockedUA = BLOCKED_UA.some(ua => visitorUA.includes(ua));
        
        if (isBlockedIP || isBlockedUA) {
            // استبدل محتوى الصفحة برسالة حظر
            document.body.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    background: #0A0F1E;
                    color: #FF4444;
                    font-family: 'Rajdhani', sans-serif;
                    text-align: center;
                ">
                    <h1 style="font-size: 3rem; margin-bottom: 1rem;">🚫 ACCESS DENIED</h1>
                    <p style="font-size: 1.2rem; color: #888; margin-bottom: 2rem;">
                        Your IP (${visitorIP}) has been logged and reported for abuse.
                    </p>
                    <div style="
                        padding: 1rem 2rem;
                        background: rgba(255,68,68,0.1);
                        border: 1px solid #FF4444;
                        border-radius: 8px;
                    ">
                        <code style="color: #FFAA00;"># This incident will be reported</code>
                    </div>
                    <p style="margin-top: 3rem; color: #666; font-size: 0.9rem;">
                        Venge.io Intelligence • Made by HERO
                    </p>
                </div>
            `;
            
            
            throw new Error("Access denied - blocked user");
        }
    } catch(e) {
        // إذاما يتضررو)
        if (!e.message.includes("Blocked") && !e.message.includes("Access denied")) {
            console.debug("[Access Control] IP check failed, allowing access.");
        }
    }
}

slamTheDoor();
/* ════════════════════════════════════════════════════════════════════════════
   APPLICATION STATE
════════════════════════════════════════════════════════════════════════════ */
const state = {
  allPlayers:     [],         // raw data from players.json
  filteredPlayers: [],        // after search filter
  displayedPlayers: [],       // after sort
  page:    1,
  limit:   Number(localStorage.getItem('venge_limit') || 50),
  search:  '',
  sort:    'risk_score',
  order:   'desc',
};

/* ════════════════════════════════════════════════════════════════════════════
   DOM REFERENCES
════════════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const els = {
  tableBody:      $('tableBody'),
  tableContainer: $('tableContainer'),
  loadOverlay:    $('loadOverlay'),
  pagination:     $('pagination'),
  tableMeta:      $('tableMeta'),
  searchInput:    $('searchInput'),
  limitSelect:    $('limitSelect'),
  loadStatus:     $('loadStatus'),
  sidebarToggle:  $('sidebarToggle'),
  sidebar:        $('sidebar'),

  // Sidebar stats
  valPlayers: $('val-players'),
  valClans:   $('val-clans'),
  valGuesses: $('val-guesses'),
  valHvt:     $('val-hvt'),

  // Player modal
  playerModal:   $('playerModal'),
  modalClose:    $('modalClose'),
  modalUsername: $('modalUsername'),
  modalClan:     $('modalClan'),
  modalAvatar:   $('modalAvatar'),
  modalRisk:     $('modalRiskBadge'),
  mKdr:          $('mKdr'),
  mScore:        $('mScore'),
  mTimesSeen:    $('mTimesSeen'),
  mTotalGuesses: $('mTotalGuesses'),
  mFirstSeen:    $('mFirstSeen'),
  mLastSeen:     $('mLastSeen'),
  modalGuesses:  $('modalGuesses'),

  // Feedback modal
  feedbackModal:  $('feedbackModal'),
  feedbackClose:  $('feedbackClose'),
  fabBtn:         $('fabBtn'),
  fbName:         $('fbName'),
  fbMessage:      $('fbMessage'),
  feedbackSubmit: $('feedbackSubmit'),
  feedbackStatus: $('feedbackStatus'),

  toastContainer: $('toastContainer'),
};

/* ════════════════════════════════════════════════════════════════════════════
   UTILITY HELPERS
════════════════════════════════════════════════════════════════════════════ */

/** Escape HTML to prevent XSS — all user data goes through this */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Risk score (0–1) → CSS class suffix */
function riskClass(score) {
  if (score >= 0.6) return 'risk-high';
  if (score >= 0.3) return 'risk-medium';
  return 'risk-low';
}

/** Format a date string nicely */
function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return ts; }
}

/** Number with locale commas */
const fmtNum = n => (n != null ? Number(n).toLocaleString() : '—');

/** Copy text to clipboard */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.textContent = '✓ copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1800);
    }
    showToast('Copied!', 'success');
  }).catch(() => showToast('Copy failed', 'error'));
}

/** Transient toast notification */
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  els.toastContainer.appendChild(t);
  setTimeout(() => {
    t.classList.add('fade-out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, 2400);
}

/** Simple debounce */
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

/** Animated counter */
function animateCount(el, target) {
  const dur = 900;
  const start = performance.now();
  (function tick(now) {
    const pct  = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - pct, 3);
    el.textContent = Math.round(target * ease).toLocaleString();
    if (pct < 1) requestAnimationFrame(tick);
  })(start);
}

/* ════════════════════════════════════════════════════════════════════════════
   DATA LOADING
════════════════════════════════════════════════════════════════════════════ */
async function loadData() {
  try {
    const res  = await fetch('players.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.allPlayers = Array.isArray(data) ? data : [];
    els.loadStatus.textContent = `${state.allPlayers.length.toLocaleString()} players loaded`;

    computeStats();
    applyFilter();
    els.loadOverlay.style.display  = 'none';
    els.tableContainer.style.display = '';

  } catch (err) {
    console.error('[Dashboard] Failed to load players.json:', err);
    els.loadOverlay.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <h3>Could not load players.json</h3>
        <p>${esc(err.message)}</p>
        <p style="margin-top:8px;font-size:.75rem;color:var(--text-muted)">
          Run <code>python export_data.py</code> first, then refresh.
        </p>
      </div>`;
    els.loadStatus.textContent = 'Error loading data';
  }
}

/** Compute sidebar stats from all loaded players */
function computeStats() {
  const players = state.allPlayers;
  const clans   = new Set(players.map(p => p.clan_name).filter(Boolean));
  const guesses = players.reduce((s, p) => s + (p.total_guesses || 0), 0);
  const hvt     = players.filter(p => (p.risk_score || 0) > 0.5).length;

  animateCount(els.valPlayers, players.length);
  animateCount(els.valClans,   clans.size);
  animateCount(els.valGuesses, guesses);
  animateCount(els.valHvt,     hvt);
}

/* ════════════════════════════════════════════════════════════════════════════
   FILTER / SORT / PAGINATE  (all client-side, optimised for 3000+ rows)
════════════════════════════════════════════════════════════════════════════ */

/** Filter players by search query */
function applyFilter() {
  const q = state.search.toLowerCase();
  state.filteredPlayers = q
    ? state.allPlayers.filter(p =>
        (p.username  || '').toLowerCase().includes(q) ||
        (p.clan_name || '').toLowerCase().includes(q) ||
        (p.clan_tag  || '').toLowerCase().includes(q)
      )
    : state.allPlayers.slice();

  state.page = 1;
  applySort();
}

/** Sort the filtered list */
function applySort() {
  const { sort, order } = state;

  state.displayedPlayers = state.filteredPlayers.slice().sort((a, b) => {
    let av = a[sort] ?? '';
    let bv = b[sort] ?? '';

    // String comparison for text cols
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();

    if (av < bv) return order === 'asc' ? -1 : 1;
    if (av > bv) return order === 'asc' ?  1 : -1;
    return 0;
  });

  renderTable();
}

/* ════════════════════════════════════════════════════════════════════════════
   RENDERING
════════════════════════════════════════════════════════════════════════════ */
function renderTable() {
  const total   = state.displayedPlayers.length;
  const from    = (state.page - 1) * state.limit;
  const to      = Math.min(from + state.limit, total);
  const slice   = state.displayedPlayers.slice(from, to);

  // Meta
  els.tableMeta.textContent = total
    ? `Showing ${(from + 1).toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} players`
    : 'No results';

  if (!slice.length) {
    els.tableBody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <h3>No players found</h3>
          <p>Try a different search term.</p>
        </div>
      </td></tr>`;
    renderPagination(total);
    return;
  }

  // Build rows using a document fragment for performance
  const frag = document.createDocumentFragment();

  slice.forEach((p, i) => {
    const globalRank = from + i + 1;
    const rc  = riskClass(p.risk_score || 0);
    const rPct = Math.round((p.risk_score || 0) * 100);
    const pass = p.top_guesses?.[0]?.password || '';

    const tr = document.createElement('tr');
    tr.dataset.username = p.username;

    // Build inner HTML using safe esc() for all user data
    tr.innerHTML = `
      <td class="td-rank">${globalRank}</td>
      <td><span class="username-cell">${esc(p.username)}</span></td>
      <td>
        ${p.clan_name
          ? `<div class="clan-cell">
               <span class="clan-name">${esc(p.clan_name)}</span>
               ${p.clan_tag ? `<span class="clan-tag">[${esc(p.clan_tag)}]</span>` : ''}
             </div>`
          : '<span style="color:var(--text-muted)">—</span>'}
      </td>
      <td>
        <div class="risk-wrap">
          <div class="risk-bar-bg">
            <div class="risk-bar-fill ${rc}" style="width:${rPct}%"></div>
          </div>
          <span class="risk-val ${rc}">${(p.risk_score || 0).toFixed(2)}</span>
        </div>
      </td>
      <td><span class="kdr-cell">${p.kdr != null ? Number(p.kdr).toFixed(2) : '—'}</span></td>
      <td><span class="score-cell">${fmtNum(p.score)}</span></td>
      <td>
        ${pass
          ? `<div class="pass-cell">
               <span class="pass-text" title="${esc(pass)}">${esc(pass)}</span>
               <button class="copy-btn" data-pass="${esc(pass)}">copy</button>
             </div>`
          : '<span class="pass-empty">none</span>'}
      </td>`;

    // Row click → modal
    tr.addEventListener('click', e => {
      if (e.target.classList.contains('copy-btn')) return;
      openPlayerModal(p);
    });

    // Copy button in row
    const cpBtn = tr.querySelector('.copy-btn[data-pass]');
    if (cpBtn) {
      cpBtn.addEventListener('click', e => {
        e.stopPropagation();
        copyText(cpBtn.dataset.pass, cpBtn);
      });
    }

    frag.appendChild(tr);
  });

  els.tableBody.innerHTML = '';
  els.tableBody.appendChild(frag);

  renderPagination(total);
}

/* ── Pagination ────────────────────────────────────────────────────────── */
function renderPagination(total) {
  const totalPages = Math.ceil(total / state.limit) || 1;
  const cur        = state.page;

  let html = `<button class="page-btn" id="prevBtn" ${cur === 1 ? 'disabled' : ''}>← Prev</button>`;

  buildPageRange(cur, totalPages).forEach(p => {
    html += p === '…'
      ? `<button class="page-btn" disabled>…</button>`
      : `<button class="page-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
  });

  html += `<button class="page-btn" id="nextBtn" ${cur >= totalPages ? 'disabled' : ''}>Next →</button>`;
  els.pagination.innerHTML = html;

  els.pagination.querySelector('#prevBtn')?.addEventListener('click', () => changePage(cur - 1));
  els.pagination.querySelector('#nextBtn')?.addEventListener('click', () => changePage(cur + 1));
  els.pagination.querySelectorAll('[data-page]').forEach(b => {
    b.addEventListener('click', () => changePage(Number(b.dataset.page)));
  });
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total));
  const arr = [...set].sort((a, b) => a - b);
  const out = []; let prev = 0;
  arr.forEach(p => { if (p - prev > 1) out.push('…'); out.push(p); prev = p; });
  return out;
}

function changePage(page) {
  const totalPages = Math.ceil(state.displayedPlayers.length / state.limit) || 1;
  if (page < 1 || page > totalPages) return;
  state.page = page;
  renderTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Sorting ───────────────────────────────────────────────────────────── */
function handleSort(col) {
  if (state.sort === col) {
    state.order = state.order === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort  = col;
    state.order = col === 'username' || col === 'clan_name' ? 'asc' : 'desc';
  }
  state.page = 1;

  document.querySelectorAll('.sortable').forEach(th => {
    th.classList.remove('active');
    th.querySelector('.sort-arrow').textContent = '↑';
  });
  const active = document.querySelector(`.sortable[data-col="${col}"]`);
  if (active) {
    active.classList.add('active');
    active.querySelector('.sort-arrow').textContent = state.order === 'asc' ? '↑' : '↓';
  }

  applySort();
}

/* ════════════════════════════════════════════════════════════════════════════
   PLAYER MODAL
════════════════════════════════════════════════════════════════════════════ */
function openPlayerModal(p) {
  // Header
  els.modalUsername.textContent = p.username;
  els.modalAvatar.textContent   = (p.username[0] || '?').toUpperCase();
  els.modalClan.textContent     = p.clan_name
    ? (p.clan_tag ? `${p.clan_name} [${p.clan_tag}]` : p.clan_name)
    : 'No clan';

  // Risk badge
  const rc = riskClass(p.risk_score || 0);
  const rPct = Math.round((p.risk_score || 0) * 100);
  els.modalRisk.textContent  = `${rPct}% Risk`;
  const badgeColor = rc === 'risk-high' ? 'var(--red)' : rc === 'risk-medium' ? 'var(--orange)' : 'var(--green)';
  const badgeBg    = rc === 'risk-high' ? 'rgba(255,68,68,.15)' : rc === 'risk-medium' ? 'rgba(255,170,0,.15)' : 'rgba(0,204,136,.15)';
  els.modalRisk.style.cssText = `background:${badgeBg};color:${badgeColor};padding:5px 14px;border-radius:20px;font-family:var(--font-mono);font-size:.75rem;font-weight:600`;

  // Stats
  els.mKdr.textContent          = p.kdr != null ? Number(p.kdr).toFixed(2)    : '—';
  els.mScore.textContent        = fmtNum(p.score);
  els.mTimesSeen.textContent    = fmtNum(p.times_seen)    || '1';
  els.mTotalGuesses.textContent = fmtNum(p.total_guesses) || '0';
  els.mFirstSeen.textContent    = fmtDate(p.first_seen);
  els.mLastSeen.textContent     = fmtDate(p.last_seen);

  // Guesses (from top_guesses array in the JSON — no network call needed!)
  renderGuesses(p.top_guesses || []);

  openModal(els.playerModal);
}

function renderGuesses(guesses) {
  if (!guesses.length) {
    els.modalGuesses.innerHTML = '<div class="guess-loading">No guesses on record.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  guesses.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = 'guess-card';
    card.innerHTML = `
      <span class="guess-rank">${i + 1}</span>
      <div class="guess-info">
        <div class="guess-password">${esc(g.password)}</div>
        <div class="guess-meta">
          <span class="confidence-badge conf-${esc(g.confidence)}">${esc(g.confidence)}</span>
          ${g.generation_method ? `<span class="guess-method">${esc(g.generation_method)}</span>` : ''}
          ${g.complexity_score != null ? `<span class="guess-method">complexity: ${Number(g.complexity_score).toFixed(1)}</span>` : ''}
        </div>
      </div>
      <button class="copy-btn" data-pass="${esc(g.password)}">copy</button>`;

    card.querySelector('.copy-btn').addEventListener('click', e => {
      copyText(e.currentTarget.dataset.pass, e.currentTarget);
    });
    frag.appendChild(card);
  });

  els.modalGuesses.innerHTML = '';
  els.modalGuesses.appendChild(frag);
}

/* ════════════════════════════════════════════════════════════════════════════
   MODAL OPEN / CLOSE
════════════════════════════════════════════════════════════════════════════ */
function openModal(overlay) {
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(overlay) {
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

/* ════════════════════════════════════════════════════════════════════════════
   FEEDBACK — Discord Webhook
════════════════════════════════════════════════════════════════════════════ */
async function submitFeedback() {
  const name    = els.fbName.value.trim()    || 'Anonymous';
  const message = els.fbMessage.value.trim();

  if (!message) { setFbStatus('Please enter a message.', 'error'); return; }

  els.feedbackSubmit.disabled     = true;
  els.feedbackSubmit.textContent  = 'Sending…';
  setFbStatus('', '');

  const embed = {
    title:       '📬 New Feedback — Venge.io Intelligence Dashboard',
    description: message,
    color:       0x00D2FF,
    author:      { name },
    footer:      { text: 'Venge.io Intelligence • Made by HERO' },
    timestamp:   new Date().toISOString(),
    fields: [
      { name: 'From',     value: name,         inline: true },
      { name: 'Platform', value: 'GitHub Pages', inline: true },
    ],
  };

  try {
    const res = await fetch(WEBHOOK_FEEDBACK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ embeds: [embed] }),
    });

    if (res.ok || res.status === 204) {
      setFbStatus('✓ Feedback sent! Thank you.', 'success');
      els.fbName.value    = '';
      els.fbMessage.value = '';
      showToast('Feedback delivered to Discord!', 'success');
      setTimeout(() => closeModal(els.feedbackModal), 1800);
    } else {
      setFbStatus(`Discord returned ${res.status}.`, 'error');
    }
  } catch (e) {
    setFbStatus('Network error — please try again.', 'error');
  } finally {
    els.feedbackSubmit.disabled    = false;
    els.feedbackSubmit.innerHTML   = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      Send to Discord`;
  }
}

function setFbStatus(msg, type) {
  els.feedbackStatus.textContent = msg;
  els.feedbackStatus.className   = `feedback-status ${type}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   VISITOR TRACKING — silent, non-blocking, sent to second webhook
════════════════════════════════════════════════════════════════════════════ */
async function trackVisitor() {
  try {
    // Collect browser / device info without any external calls first
    const device = {
      screen:   `${screen.width}×${screen.height}`,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      language: navigator.language || 'unknown',
      platform: navigator.platform || 'unknown',
      ua:       navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      referrer: document.referrer || 'direct',
      url:      location.href,
    };

    // Try to get IP / geo from ipinfo.io (more reliable than ipapi.co)
    let geo = {};
    let isLocal = false;
    
    try {
      const geoRes = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) });
      if (geoRes.ok) {
        geo = await geoRes.json();
        // Check if IP is local or undefined
        if (!geo.ip || geo.ip === '127.0.0.1' || geo.ip === '::1' || geo.ip === '0.0.0.0' || geo.bogon === true) {
          isLocal = true;
        }
      } else {
        isLocal = true;
      }
    } catch { 
      isLocal = true;
    }

    // Build embed fields
    let embedTitle, embedColor, ipValue, countryValue, cityValue, regionValue, ispValue;

    if (isLocal) {
      embedTitle = '💻 Local Development — Venge.io Dashboard';
      embedColor = 0x888888; // Gray
      ipValue      = '127.0.0.1 (Local)';
      countryValue = 'Local Machine';
      cityValue    = 'Development';
      regionValue  = 'Local';
      ispValue     = 'Local Network';
    } else {
      embedTitle = '👁️ New Visitor — Venge.io Intelligence Dashboard';
      embedColor = 0x7B68EE; // Purple
      ipValue      = geo.ip      || 'unknown';
      countryValue = geo.country || 'unknown';
      cityValue    = geo.city    || 'unknown';
      regionValue  = geo.region  || 'unknown';
      ispValue     = geo.org     || 'unknown';
    }

    const embed = {
      title:  embedTitle,
      color:  embedColor,
      footer: { text: 'Visitor Tracker • Made by HERO' },
      timestamp: new Date().toISOString(),
      fields: [
        { name: '🌐 IP',        value: ipValue,                         inline: true  },
        { name: '🏳️ Country',   value: countryValue,                    inline: true  },
        { name: '🏙️ City',      value: cityValue,                       inline: true  },
        { name: '🌍 Region',    value: regionValue,                     inline: true  },
        { name: '🕐 Timezone',  value: device.timezone,                 inline: true  },
        { name: '🔌 ISP',       value: ispValue,                        inline: true  },
        { name: '🖥️ Screen',   value: device.screen,                   inline: true  },
        { name: '📐 Viewport',  value: device.viewport,                 inline: true  },
        { name: '🌐 Language',  value: device.language,                 inline: true  },
        { name: '💻 Platform',  value: device.platform,                 inline: true  },
        { name: '🔗 Referrer',  value: device.referrer,                 inline: false },
        { name: '📍 URL',       value: device.url.slice(0, 200),        inline: false },
        { name: '🤖 User Agent', value: device.ua.slice(0, 300),        inline: false },
      ],
    };

    await fetch(WEBHOOK_VISITOR, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ embeds: [embed] }),
    });

  } catch (e) {
    // Visitor tracking must NEVER break the UI
    console.debug('[Tracker] silently failed:', e.message);
  }
}
/* ════════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════════════════════ */
function attachListeners() {

  // Sidebar toggle (mobile)
  els.sidebarToggle.addEventListener('click', () => els.sidebar.classList.toggle('open'));

  // Search (debounced)
  const dSearch = debounce(() => {
    state.search = els.searchInput.value.trim();
    applyFilter();
  }, 300);
  els.searchInput.addEventListener('input', dSearch);

  // Limit selector — persist to localStorage
  els.limitSelect.value = String(state.limit);
  els.limitSelect.addEventListener('change', () => {
    state.limit = Number(els.limitSelect.value);
    localStorage.setItem('venge_limit', String(state.limit));
    state.page  = 1;
    renderTable();
  });

  // Sort headers
  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.col));
  });

  // Player modal close
  els.modalClose.addEventListener('click', () => closeModal(els.playerModal));
  els.playerModal.addEventListener('click', e => { if (e.target === els.playerModal) closeModal(els.playerModal); });

  // Feedback modal
  els.fabBtn.addEventListener('click', () => { setFbStatus('', ''); openModal(els.feedbackModal); });
  els.feedbackClose.addEventListener('click', () => closeModal(els.feedbackModal));
  els.feedbackModal.addEventListener('click', e => { if (e.target === els.feedbackModal) closeModal(els.feedbackModal); });
  els.feedbackSubmit.addEventListener('click', submitFeedback);

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal(els.playerModal);
      closeModal(els.feedbackModal);
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   INIT — set default sort indicator, load data, track visitor
════════════════════════════════════════════════════════════════════════════ */
function init() {
  attachListeners();

  // Mark default sort column in header
  const defaultTh = document.querySelector(`.sortable[data-col="${state.sort}"]`);
  if (defaultTh) {
    defaultTh.classList.add('active');
    defaultTh.querySelector('.sort-arrow').textContent = state.order === 'asc' ? '↑' : '↓';
  }

  loadData();

  // Fire visitor tracker without awaiting — must never block the UI
  trackVisitor();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
