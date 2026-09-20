// KW Checker — Moz Domain Authority (DA) & Page Authority (PA)
// Uses Moz API v2 url_metrics endpoint with x-moz-token
// Free tier available at https://moz.com/api

import { getSettings } from './settings.js';
import { cacheGet, cacheSet } from './cache.js';
import { getBaseDomain } from './rdap.js';

const TTL = 24 * 60 * 60 * 1000; // 24h

export async function bulkMozMetrics(domains) {
  const s = await getSettings();
  if (!s.mozToken) {
    return Object.fromEntries(domains.map(d => [d, { domain: d, da: null, pa: null, configured: false }]));
  }

  const results = {};
  const missingDomains = [];

  for (const d of domains) {
    const root = getBaseDomain(d);
    const key = `moz:${root}`;
    const cached = await cacheGet(key);
    if (cached) {
      results[d] = { domain: d, ...cached, configured: true };
    } else {
      missingDomains.push({ original: d, root });
    }
  }

  if (missingDomains.length === 0) return results;

  const uniqueRoots = [...new Set(missingDomains.map(m => m.root))].slice(0, 50);

  try {
    const res = await fetch('https://lsapi.seomoz.com/v2/url_metrics', {
      method: 'POST',
      headers: {
        'x-moz-token': s.mozToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targets: uniqueRoots })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      for (const m of missingDomains) {
        results[m.original] = { domain: m.original, da: null, pa: null, error: `Moz HTTP ${res.status}`, configured: true };
      }
      return results;
    }

    const data = await res.json();
    const map = {};
    const items = data.results_by_target || data.results || [];

    for (const item of items) {
      const root = getBaseDomain(item.page || item.root_domain || item.subdomain || '');
      const da = typeof item.domain_authority === 'number' ? Math.round(item.domain_authority) : null;
      const pa = typeof item.page_authority === 'number' ? Math.round(item.page_authority) : null;
      if (root) {
        map[root] = { da, pa };
        await cacheSet(`moz:${root}`, { da, pa }, TTL);
      }
    }

    for (const m of missingDomains) {
      const info = map[m.root] || { da: null, pa: null };
      results[m.original] = { domain: m.original, ...info, configured: true };
    }
  } catch (err) {
    for (const m of missingDomains) {
      results[m.original] = { domain: m.original, da: null, pa: null, error: String(err?.message || err), configured: true };
    }
  }

  return results;
}

export async function testMoz() {
  const s = await getSettings();
  if (!s.mozToken) throw new Error('Enter a Moz API Token first.');
  const res = await bulkMozMetrics(['moz.com']);
  const info = res['moz.com'];
  if (info?.error) throw new Error(info.error);
  if (info?.da == null) throw new Error('No DA returned from Moz. Check token permissions.');
  return info;
}
