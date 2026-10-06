// KW Checker — content script: injects keyword widget + domain badges on Google SERPs

(() => {
  // Per-query guard instead of global — allows re-injection on SPA navigation
  const url = new URL(location.href);
  const query = url.searchParams.get('q');
  if (!query || url.searchParams.has('tbm') // skip image/video/news tabs
      || url.searchParams.get('udm') === '2') {
    return;
  }

  // Avoid double-run for the same query in the same page context
  if (window.__kwCheckerLastQuery === query) return;
  window.__kwCheckerLastQuery = query;

  // ---------- Messaging with retry (Bug 6: service worker sleep) ----------

  async function send(msg, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        if (res !== undefined) return res;
        // undefined response means service worker was waking up — retry
      } catch {
        // Extension context invalidated or similar — retry
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    return undefined; // all retries exhausted
  }

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

  // Bug 5: Wait for organic results to appear (lazy-loaded SERPs)
  function waitForOrganics(timeoutMs = 3000) {
    return new Promise(resolve => {
      const results = collectOrganic();
      if (results.length > 0) return resolve(results);

      const observer = new MutationObserver(() => {
        const results = collectOrganic();
        if (results.length > 0) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(results);
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(collectOrganic()); // return whatever we have, even if empty
      }, timeoutMs);
    });
  }

  // Bug 3: Improved mount point discovery with more fallbacks
  function mountPoint() {
    return document.getElementById('topstuff')
      || document.getElementById('appbar')
      || document.querySelector('#main #search')
      || document.querySelector('#search')
      || document.getElementById('rso')
      || document.getElementById('center_col')
      || document.getElementById('rcnt')
      || document.querySelector('div.g');  // last resort: first organic result
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
      // Insert before mount if it's an organic result, otherwise after
      if (mount.classList?.contains('g')) {
        mount.parentElement.insertBefore(existing, mount);
      } else {
        mount.insertAdjacentElement('afterend', existing);
      }
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
          <span class="kwc-query">\u201C${esc(query)}\u201D</span>
          <button class="kwc-toggle" id="kwc-toggle" title="Related keywords" aria-expanded="false" aria-controls="kwc-tablewrap">Related \u25BE</button>
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
          <span>By <a href="https://www.facebook.com/MalikHasnain22/" target="_blank" rel="noopener noreferrer">Malik Hasnain ↗</a> · Google Ads data</span>
          <span>Domain Rating by <a href="https://ahrefs.com/" target="_blank" rel="noopener">Ahrefs</a></span>
        </div>
      </div>`;

    document.getElementById('kwc-toggle')?.addEventListener('click', () => {
      const wrap = document.getElementById('kwc-tablewrap');
      if (wrap) {
        wrap.hidden = !wrap.hidden;
        const toggle = document.getElementById('kwc-toggle');
        toggle.setAttribute('aria-expanded', String(!wrap.hidden));
        toggle.textContent = wrap.hidden ? 'Related ▾' : 'Related ▴';
      }
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

  function daClass(da) {
    if (da === null) return 'kwc-da-none';
    if (da >= 60) return 'kwc-da-high';
    if (da >= 30) return 'kwc-da-mid';
    return 'kwc-da-low';
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

      let pills = `
        <span class="kwc-dr ${drClass(dr)}" title="${info?.drError ? esc(info.drError) : 'Domain Rating by Ahrefs'}">DR ${dr ?? '?'}</span>
        <span class="kwc-age" title="${info?.registered ? 'Registered ' + esc(info.registered) : (info?.ageError ? esc(info.ageError) : 'Site age')}">${age ?? '?'}</span>`;

      if (info?.da != null) {
        pills += `<span class="kwc-da ${daClass(info.da)}" title="Domain Authority by Moz (PA ${info.pa ?? 'n/a'})">DA ${info.da}</span>`;
      }
      if (info?.rank) {
        pills += `<span class="kwc-rank" title="Global Traffic Rank: ${esc(info.rank)}${info.pageRank ? ' · PageRank ' + esc(info.pageRank) : ''}">${esc(info.rank)}</span>`;
      }
      if (info?.framework) {
        pills += `<span class="kwc-tech" title="CMS / Framework: ${esc(info.framework)}">${esc(info.framework)}</span>`;
      }

      badge.innerHTML = pills;

      badge.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        const details = [
          `Domain: ${host}`,
          `------------------------------`,
          `Ahrefs DR: ${dr ?? 'n/a'}${info?.drError ? ' (' + info.drError + ')' : ''}`,
          info?.da != null ? `Moz DA: ${info.da} (PA: ${info.pa ?? 'n/a'})` : null,
          `Site Age: ${age ?? 'n/a'}${info?.registered ? ' — registered ' + info.registered.slice(0, 10) : ''}`,
          info?.rank ? `Traffic Rank: ${info.rank}${info?.pageRank ? ' (PageRank: ' + info.pageRank + ')' : ''}` : null,
          info?.framework ? `CMS / Framework: ${info.framework}` : null
        ].filter(Boolean).join('\n');
        alert(details);
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

  // ---------- Cleanup old widget on re-run ----------

  function cleanup() {
    const oldWidget = document.getElementById(WIDGET_ID);
    if (oldWidget) oldWidget.remove();
    document.querySelectorAll('.kwc-badge').forEach(b => b.remove());
  }

  // ---------- Main ----------

  async function run() {
    cleanup();

    // Placeholder widget immediately so it's clear the extension is active
    renderWidget(null, 'loading\u2026');

    // Bug 5: Wait for organic results with MutationObserver retry
    const organics = await waitForOrganics(3000);
    const domains = organics.map(o => o.host);

    const res = await send({ type: 'kw:analyze', q: query, domains });

    if (!res || !res.ok) {
      renderWidget(null, res?.error || 'background error');
      return;
    }

    renderWidget(res.keyword, res.keywordError);
    renderBadges(organics, res.domains || {});
  }

  // Bug 4: SPA navigation detection — watch for url changes (pagination etc.)
  // Use both setInterval and popstate for comprehensive coverage
  let lastQ = query;

  function checkNavigation() {
    const q = new URL(location.href).searchParams.get('q');
    if (q && q !== lastQ) {
      lastQ = q;
      window.__kwCheckerLastQuery = null; // reset per-query guard
      location.reload(); // simplest correct behavior across Google's dynamic SERPs
    }
  }

  setInterval(checkNavigation, 1000);
  window.addEventListener('popstate', checkNavigation);
  window.addEventListener('hashchange', checkNavigation);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    run();
  } else {
    document.addEventListener('DOMContentLoaded', run);
  }
})();
