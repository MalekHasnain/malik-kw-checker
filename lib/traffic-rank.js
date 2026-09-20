// KW Checker — Open PageRank API (Global Traffic Rank & PageRank)
// Supports both modern Keywords Everywhere OPR keys (opr_live_...) and legacy DomCop keys.
// API Reference: https://openpagerank.keywordseverywhere.com/

import { getSettings } from './settings.js';
import { cacheGet, cacheSet } from './cache.js';
import { getBaseDomain } from './rdap.js';

const TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export function formatRank(rank) {
  if (!rank || rank === '0' || rank === 0) return null;
  const n = typeof rank === 'string' ? parseInt(rank.replace(/[^0-9]/g, ''), 10) : rank;
  if (!n || isNaN(n)) return null;
  if (n >= 1000000) return '#' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '#' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return '#' + n;
}

async function queryModernOprApi(key, uniqueRoots) {
  const url = 'https://openpagerank.keywordseverywhere.com/v1/domains/bulk';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key.trim()}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ domains: uniqueRoots })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OPR HTTP ${res.status}: ${text.slice(0, 150)}`);
  }

  const data = await res.json();
  const map = {};
  const items = data.results || data.response || [];

  for (const item of items) {
    const domain = (item.domain || '').toLowerCase();
    const rank = formatRank(item.rank);
    const prVal = item.open_page_rank != null ? item.open_page_rank : item.page_rank_decimal;
    const pageRank = prVal != null ? Number(prVal).toFixed(1) : null;
    map[domain] = { rank, pageRank, rawRank: item.rank };
    await cacheSet(`opr:${domain}`, { rank, pageRank, rawRank: item.rank }, TTL);
  }

  return map;
}

async function queryLegacyOprApi(key, uniqueRoots) {
  const queryParams = uniqueRoots.map(r => `domains[]=${encodeURIComponent(r)}`).join('&');
  const url = `https://openpagerank.com/api/v1.0/getPageRank?${queryParams}`;

  const res = await fetch(url, {
    headers: {
      'API-OPR': key.trim(),
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OPR HTTP ${res.status}: ${text.slice(0, 150)}`);
  }

  const data = await res.json();
  const map = {};
  const items = data.response || [];

  for (const item of items) {
    const domain = (item.domain || '').toLowerCase();
    const rank = formatRank(item.rank);
    const pageRank = item.page_rank_decimal != null ? Number(item.page_rank_decimal).toFixed(1) : null;
    map[domain] = { rank, pageRank, rawRank: item.rank };
    await cacheSet(`opr:${domain}`, { rank, pageRank, rawRank: item.rank }, TTL);
  }

  return map;
}

export async function bulkTrafficRank(domains) {
  const s = await getSettings();
  const key = s.openPageRankKey;
  if (!key) {
    return Object.fromEntries(domains.map(d => [d, { domain: d, rank: null, pageRank: null, configured: false }]));
  }

  const results = {};
  const missingDomains = [];

  // Check cache first for each domain
  for (const d of domains) {
    const root = getBaseDomain(d);
    const cacheKey = `opr:${root}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      results[d] = { domain: d, ...cached, configured: true };
    } else {
      missingDomains.push({ original: d, root });
    }
  }

  if (missingDomains.length === 0) return results;

  const uniqueRoots = [...new Set(missingDomains.map(m => m.root))].slice(0, 100);

  try {
    let map = {};
    // Modern opr_live_ keys use the bulk endpoint; legacy keys use the query-param endpoint
    if (key.startsWith('opr_') || key.includes('live')) {
      map = await queryModernOprApi(key, uniqueRoots);
    } else {
      try {
        map = await queryModernOprApi(key, uniqueRoots);
      } catch {
        map = await queryLegacyOprApi(key, uniqueRoots);
      }
    }

    for (const m of missingDomains) {
      const info = map[m.root] || { rank: null, pageRank: null };
      results[m.original] = { domain: m.original, ...info, configured: true };
    }
  } catch (err) {
    for (const m of missingDomains) {
      results[m.original] = { domain: m.original, rank: null, pageRank: null, error: String(err?.message || err), configured: true };
    }
  }

  return results;
}

export async function testOpenPageRank() {
  const s = await getSettings();
  if (!s.openPageRankKey) throw new Error('Enter an Open PageRank API key first.');
  const res = await bulkTrafficRank(['google.com']);
  const info = res['google.com'];
  if (info?.error) throw new Error(info.error);
  if (!info?.rank && !info?.pageRank) throw new Error('No rank data returned. Check your API key.');
  return info;
}
