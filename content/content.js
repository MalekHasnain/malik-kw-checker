// KW Checker — content script: injects keyword widget + domain badges on Google SERPs

(() => {
  if (window.__kwCheckerLoaded) return;
  window.__kwCheckerLoaded = true;

  const url = new URL(location.href);
  const query = url.searchParams.get('q');
  if (!query || url.searchParams.has('tbm') // skip image/video/news tabs
      || url.searchParams.get('udm') === '2') {
    return;
  }

  const send = (msg) => new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));

  // ---------- DOM helpers ----------

  function collectOrganic() {
    // Primary: Google's result-title heading (h3.LC20lb — stable for years).
    // Fallback: any h3 inside an organic anchor for older layouts.
    const out = [];
    const seen = new Set();
    const add = (h3) => {
      const a = h3.closest('a');
      if (!a) return;
      let host;
      try { host = new URL(a.href).hostname.replace(/^www\./, ''); } catch { return; }
      if (!host || host.endsWith('google.com') || seen.has(host)) return;
      seen.add(host);
      const container = a.closest('div.g, div.tF2Cxc, div.MjjYud') || a;
      out.push({ host, container, href: a.href });
    };
    document.querySelectorAll('h3.LC20lb').forEach(add);
    if (out.length === 0) {
      document.querySelectorAll('a[href^="http"] h3').forEach(add);
    }
    return out;
  }

  function mountPoint() {
    return document.getElementById('topstuff')
      || document.getElementById('appbar')
      || document.querySelector('#main #search')
      || document.querySelector('#search');
  }

  // ---------- Widget ----------

  const WIDGET_ID = 'kw-checker-widget';

  function fmtVol(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function fmtCents(c) {
    if (c === null || c === undefined) return '—';
    if (c >= 100) return '$' + (c / 100).toFixed(2);
    return String(c) + '\u00A2';
  }

  function sparkline(trend) {
    const pts = (trend || []).filter(t => t.searches !== null).map(t => t.searches);
    if (pts.length < 2) return '';
    const max = Math.max(...pts, 1);
    const w = 150, h = 28;
    const step = w / (pts.length - 1);
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p / max) * (h - 3) - 1.5).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="kwc-spark"><path d="${path}" fill="none" stroke="#1a73e8" stroke-width="1.5"/></svg>`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderWidget(keyword, error) {
    let existing = document.getElementById(WIDGET_ID);
    if (!existing) {
      const mount = mountPoint();
      if (!mount) return;
      existing = document.createElement('div');
      existing.id = WIDGET_ID;
      mount.insertAdjacentElement('afterend', existing);
    }

    if (error) {
      existing.innerHTML = `
        <div class="kwc-card kwc-error">
          <span class="kwc-logo">KW</span>
          <span>Keyword data unavailable: ${esc(error)}</span>
        </div>`;
      return;
    }

    const e = keyword?.exact;
    const ideas = (keyword?.ideas || []).slice(0, 20);
    const rows = ideas.map(i => `
      <tr>
        <td class="kwc-kw">${esc(i.keyword)}</td>
        <td>${fmtVol(i.volume)}</td>
        <td>${i.cpcHighCents !== null ? fmtCents(i.cpcLowCents) + ' – ' + fmtCents(i.cpcHighCents) : '—'}</td>
        <td>${esc(i.competition)}</td>
      </tr>`).join('');

    existing.innerHTML = `
      <div class="kwc-card">
        <div class="kwc-head">
          <span class="kwc-logo">KW</span>
          <span class="kwc-title">Checker</span>
          <span class="kwc-query">“${esc(query)}”</span>
          <button class="kwc-toggle" id="kwc-toggle" title="Related keywords">Related ▾</button>
        </div>
        <div class="kwc-metrics">
          <div class="kwc-metric"><label>Volume</label><b>${e ? fmtVol(e.volume) : '—'}</b></div>
          <div class="kwc-metric"><label>CPC (top)</label><b>${e ? (e.cpcHighCents !== null ? fmtCents(e.cpcLowCents) + ' – ' + fmtCents(e.cpcHighCents) : '—') : '—'}</b></div>
          <div class="kwc-metric"><label>Competition</label><b>${e ? esc(e.competition) : '—'}</b></div>
          <div class="kwc-metric kwc-trend"><label>12-mo</label>${e ? sparkline(e.trend) : '—'}</div>
        </div>
        <div class="kwc-tablewrap" id="kwc-tablewrap" hidden>
          <table class="kwc-table">
            <thead><tr><th>Keyword</th><th>Vol</th><th>CPC</th><th>Comp</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <button class="kwc-csv" id="kwc-csv">Export CSV</button>
        </div>
        <div class="kwc-foot">
          <span>Keyword data: Google Ads API</span>
          <span>Domain Rating by <a href="https://ahrefs.com/" target="_blank" rel="noopener">Ahrefs</a></span>
        </div>
      </div>`;

    document.getElementById('kwc-toggle')?.addEventListener('click', () => {
      const wrap = document.getElementById('kwc-tablewrap');
      if (wrap) wrap.hidden = !wrap.hidden;
    });
    document.getElementById('kwc-csv')?.addEventListener('click', () => {
      const csv = ['Keyword,Volume,CPC Low (cents),CPC High (cents),Competition']
        .concat(ideas.map(i => `"${i.keyword.replace(/"/g, '""')}",${i.volume ?? ''},${i.cpcLowCents ?? ''},${i.cpcHighCents ?? ''},${i.competition}`))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kw-checker-${query.replace(/[^\w]+/g, '-').slice(0, 40)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }

  // ---------- Result badges ----------

  function drClass(dr) {
    if (dr === null) return 'kwc-dr-none';
    if (dr >= 60) return 'kwc-dr-high';
    if (dr >= 30) return 'kwc-dr-mid';
    return 'kwc-dr-low';
  }

  // The site name in the result header row, e.g. "Canva" next to the favicon.
  // Current markup: <span class="VuuXrf">. Fallbacks: small h3, favicon sibling.
  function findSiteName(container) {
    const span = container.querySelector('span.VuuXrf');
    if (span) return span;
    const img = container.querySelector('img.XNo5Ab, img[src*="favicon"], img[src*="favicons"]');
    if (img && img.nextElementSibling && !img.nextElementSibling.querySelector?.('h3.LC20lb')) return img.nextElementSibling;
    const h3 = container.querySelector('h3:not(.LC20lb)');
    return h3 || null;
  }

  function renderBadges(organics, domainInfo) {
    for (const { host, container } of organics) {
      if (container.querySelector('.kwc-badge')) continue;
      const info = domainInfo[host];
      const badge = document.createElement('span');
      badge.className = 'kwc-badge';
      badge.dataset.host = host;
      const dr = info ? info.dr : null;
      const age = info ? info.age : null;
      badge.innerHTML = `
        <span class="kwc-dr ${drClass(dr)}" title="${info?.drError ? esc(info.drError) : 'Domain Rating by Ahrefs'}">DR ${dr ?? '?'}</span>
        <span class="kwc-age" title="${info?.registered ? 'Registered ' + esc(info.registered) : (info?.ageError ? esc(info.ageError) : 'Site age (RDAP)')}">${age ?? '?'}</span>`;
      badge.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        alert(`${host}\nDR: ${dr ?? 'n/a'}${info?.drError ? ' (' + info.drError + ')' : ''}\nAge: ${age ?? 'n/a'}${info?.registered ? ' — registered ' + info.registered : ''}`);
      });
      // Placement: on the header row, immediately after the site name ("after Canva")
      badge.classList.add('kwc-inline');
      const titleH3 = container.querySelector('h3.LC20lb')
        || container.querySelector('a[href^="http"] h3');
      const siteName = findSiteName(container);
      const permlinkRow = container.querySelector('cite')?.parentElement;
      if (siteName && siteName !== titleH3) {
        // Append INSIDE the site-name element — flows inline with its text,
        // guaranteeing the same visual row: "Canva [DR 93] [25y 4m]"
        siteName.appendChild(badge);
      } else if (titleH3) {
        titleH3.appendChild(badge);
      } else if (permlinkRow) {
        permlinkRow.appendChild(badge);
      } else {
        container.appendChild(badge);
      }
    }
  }

  // ---------- Main ----------

  async function run() {
    // Placeholder widget immediately so it's clear the extension is active
    renderWidget(null, 'loading…');

    const organics = collectOrganic();
    const domains = organics.map(o => o.host);

    const res = await send({ type: 'kw:analyze', q: query, domains });

    if (!res || !res.ok) {
      renderWidget(null, res?.error || 'background error');
      return;
    }

    renderWidget(res.keyword, res.keywordError);
    renderBadges(organics, res.domains || {});
  }

  // Google is an SPA-ish page; watch for url changes (pagination etc.)
  let lastQ = query;
  setInterval(() => {
    const q = new URL(location.href).searchParams.get('q');
    if (q !== lastQ) {
      lastQ = q;
      if (q) location.reload(); // simplest correct behavior across Google's dynamic SERPs
    }
  }, 1000);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    run();
  } else {
    document.addEventListener('DOMContentLoaded', run);
  }
})();
