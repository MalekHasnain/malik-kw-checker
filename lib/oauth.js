// KW Checker — Google OAuth 2.0 (authorization code + PKCE) for the Google Ads API
// Uses chrome.identity.launchWebAuthFlow with a "Web application" OAuth client.
// The client must list https://<extension-id>.chromiumapp.org/ as an authorized redirect URI.

const SCOPE = 'https://www.googleapis.com/auth/adwords';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// stored under this key: { access_token, expires_at, refresh_token }
const STORE_KEY = 'google_oauth';

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64url(buf);
}

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return b64url(bytes);
}

async function getStored() {
  const stored = await chrome.storage.local.get(STORE_KEY);
  return stored[STORE_KEY] || null;
}

async function setStored(o) {
  await chrome.storage.local.set({ [STORE_KEY]: o });
}

export function redirectURL() {
  return chrome.identity.getRedirectURL('oauth2');
}

export async function authorize(clientId) {
  const verifier = randomVerifier();
  const challenge = await sha256(verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectURL(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',       // get a refresh token
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  const url = `${AUTH_URL}?${params}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!responseUrl) throw new Error('Authorization cancelled');
  const code = new URL(responseUrl).searchParams.get('code');
  if (!code) throw new Error('No authorization code in response');

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectURL()
    })
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  await setStored({
    access_token: tokens.access_token,
    expires_at: Date.now() + (tokens.expires_in - 60) * 1000,
    refresh_token: tokens.refresh_token
  });
  return true;
}

export async function getAccessToken(clientId) {
  const st = await getStored();
  if (!st) throw new Error('Not signed in to Google. Open KW Checker popup and click Connect.');
  if (st.access_token && st.expires_at > Date.now()) return st.access_token;
  if (!st.refresh_token) throw new Error('Google session expired — reconnect in the popup.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: st.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const tokens = await res.json();
  await setStored({
    ...st,
    access_token: tokens.access_token,
    expires_at: Date.now() + (tokens.expires_in - 60) * 1000
  });
  return tokens.access_token;
}

export async function signedOut() {
  return !(await getStored());
}

export async function logout() {
  await chrome.storage.local.remove(STORE_KEY);
}
