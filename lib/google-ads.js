// KW Checker — Google Ads API keyword ideas (volume / CPC / competition)
// Endpoint: POST /v{N}/customers/{cid}/generateKeywordIdeas:generateKeywordIdeas
// Free to use; requires OAuth token + developer token (basic access is fine for keyword planning).

import { getSettings, normalizeCustomerId } from './settings.js';
import * as oauth from './oauth.js';
import { cacheGetOrSet } from './cache.js';

const TTL = 30 * 24 * 60 * 60 * 1000; // 30 days — metrics refresh monthly

function competitionLabel(c) {
  if (c === 'LOW') return 'Low';
  if (c === 'MEDIUM') return 'Med';
  if (c === 'HIGH') return 'High';
  return '—';
}

function microsToCents(m) {
  if (m === undefined || m === null || m === '0') return null;
  return Math.round(Number(m) / 10000); // micros -> cents
}

function mapIdea(idea) {
  const m = idea.keywordMetrics || {};
  return {
    keyword: idea.text || '',
    volume: m.avgMonthlySearches ?? null,
    // avgMonthlySearches is a low bucket when the account has no spend; keep raw.
    bucketed: m.avgMonthlySearches !== undefined && m.avgMonthlySearches <= 10 ? true : false,
    competition: competitionLabel(m.competition),
    cpcLowCents: microsToCents(m.lowTopOfPageBidMicros),
    cpcHighCents: microsToCents(m.highTopOfPageBidMicros),
    trend: (m.monthlySearchVolumes || []).map(v => ({
      month: v.month ? `${v.month.year}-${String(v.month.month).padStart(2, '0')}` : null,
      searches: v.monthlySearches ?? null
    }))
  };
}

export async function keywordMetrics(query) {
  const s = await getSettings();
  const cid = normalizeCustomerId(s.customerId);
  if (!cid || !s.developerToken || !s.googleClientId) {
    throw new Error('Google Ads not configured — open the KW Checker popup.');
  }

  const key = `kw:${s.apiVersion}:${cid}:${query.toLowerCase()}`;
  return cacheGetOrSet(key, TTL, async () => {
    const token = await oauth.getAccessToken(s.googleClientId);
    const url = `https://googleads.googleapis.com/${s.apiVersion}/customers/${cid}/generateKeywordIdeas:generateKeywordIdeas`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': s.developerToken,
        'Content-Type': 'application/json',
        ...(s.loginCustomerId ? { 'login-customer-id': normalizeCustomerId(s.loginCustomerId) } : {})
      },
      body: JSON.stringify({
        keywordSeed: { keywords: [query] },
        pageSize: 30
      })
    });

    if (!res.ok) {
      const body = await res.text();
      let msg = body;
      try {
        const j = JSON.parse(body);
        const e = j.error;
        msg = e ? `${e.status || ''} ${e.message || ''}`.trim() : body;
      } catch { /* raw */ }
      if (/DEVELOPER_TOKEN_NOT_APPROVED/i.test(msg)) {
        throw new Error('Developer token not approved yet (basic access pending) — see popup.');
      }
      if (/CUSTOMER_NOT_FOUND|INVALID_CUSTOMER_ID/i.test(msg)) {
        throw new Error('Google Ads customer ID not found — check it in the popup.');
      }
      if (res.status === 429 || /RATE_EXCEEDED|RESOURCE_EXHAUSTED/i.test(msg)) {
        throw new Error('Google Ads rate limit hit — retry in a minute.');
      }
      if (res.status === 401) {
        throw new Error('Google auth expired — reconnect in the popup.');
      }
      throw new Error(`Google Ads API: ${msg.slice(0, 300)}`);
    }

    const data = await res.json();
    const ideas = (data.keywordIdeas || []).map(mapIdea).filter(i => i.keyword);
    const exact = ideas.find(i => i.keyword.toLowerCase() === query.toLowerCase()) || null;
    return { exact, ideas };
  });
}

// Lightweight probe used by the popup "Test" button.
export async function testConnection() {
  const r = await keywordMetrics('coffee');
  return r.exact || r.ideas[0] || null;
}
