// KW Checker — popup

const $ = id => document.getElementById(id);
const send = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));

function setHint(id, text, isError) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'hint' + (isError ? ' err' : '');
}

async function refresh() {
  const st = await send({ type: 'kw:status' });
  if (!st?.ok) { $('status-pill').textContent = 'error'; return; }

  const s = st.settings;
  $('f-clientid').value = s.googleClientId || '';
  $('f-devtoken').placeholder = s.developerToken ? '•••• (saved — retype to change)' : 'from Ads account → API Center';
  $('f-customerid').value = s.customerId || '';
  $('f-logincid').value = s.loginCustomerId || '';
  $('f-ahrefs').placeholder = s.ahrefsKey ? '•••• (saved — retype to change)' : 'from app.ahrefs.com → Account → API keys';
  $('f-opr').placeholder = s.openPageRankKey ? '•••• (saved — retype to change)' : 'from openpagerank.com';
  $('f-moz').placeholder = s.mozToken ? '•••• (saved — retype to change)' : 'from moz.com/api';

  const pill = $('status-pill');
  if (st.googleConfigured && st.googleSignedIn && st.ahrefsConfigured) {
    pill.textContent = 'ready'; pill.className = 'pill pill-ok';
  } else {
    pill.textContent = 'setup needed'; pill.className = 'pill pill-warn';
  }

  $('google-status').innerHTML = st.googleConfigured
    ? (st.googleSignedIn ? '<span class="ok">✓ configured & connected</span>' : '<span class="warn">configured — not connected</span>')
    : '<span class="warn">not configured</span>';
  $('ahrefs-status').innerHTML = st.ahrefsConfigured
    ? '<span class="ok">✓ key saved</span>'
    : '<span class="warn">no key</span>';
  $('rdap-status').innerHTML = '<span class="ok">✓ no key needed</span>';
  $('tech-status').innerHTML = '<span class="ok">✓ built-in — no key needed</span>';
  $('opr-status').innerHTML = st.openPageRankConfigured
    ? '<span class="ok">✓ key saved</span>'
    : '<span class="warn">optional — no key</span>';
  $('moz-status').innerHTML = st.mozConfigured
    ? '<span class="ok">✓ token saved</span>'
    : '<span class="warn">optional — no token</span>';

  const c = st.cache;
  $('cache-info').textContent = c ? `${c.keywordCache} keyword · ${c.drCache} DR · ${c.ageCache} age entries cached` : '';

  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
}

async function save() {
  const patch = {
    googleClientId: $('f-clientid').value.trim(),
    customerId: $('f-customerid').value.trim(),
    loginCustomerId: $('f-logincid').value.trim()
  };
  if ($('f-devtoken').value.trim()) patch.developerToken = $('f-devtoken').value.trim();
  if ($('f-ahrefs').value.trim()) patch.ahrefsKey = $('f-ahrefs').value.trim();
  if ($('f-opr').value.trim()) patch.openPageRankKey = $('f-opr').value.trim();
  if ($('f-moz').value.trim()) patch.mozToken = $('f-moz').value.trim();

  await send({ type: 'kw:saveSettings', patch });
  setHint('google-hint', 'Saved.');
  setHint('ahrefs-hint', 'Saved.');
  setHint('opr-hint', 'Saved.');
  setHint('moz-hint', 'Saved.');
  refresh();
}

async function connect() {
  setHint('google-hint', 'Opening Google sign-in…');
  const r = await send({ type: 'kw:connect' });
  if (r?.ok) { setHint('google-hint', 'Connected ✓'); refresh(); }
  else setHint('google-hint', r?.error || 'failed', true);
}

async function runTest(kind, hintId) {
  setHint(hintId, 'Testing…');
  const r = await send({ type: kind });
  if (r?.ok) {
    const res = r.result;
    let txt = '✓ works';
    if (kind === 'kw:testGoogle' && res) txt = `✓ “${res.keyword}” vol ${res.volume ?? '—'} / ${res.competition}`;
    if (kind === 'kw:testAhrefs' && res) txt = `✓ ahrefs.com DR ${res.dr}`;
    if (kind === 'kw:testRdap' && res) txt = `✓ google.com age ${res.age} (registered ${res.registered.slice(0, 10)})`;
    if (kind === 'kw:testTech' && res) txt = `✓ shopify.com detected: ${res.framework || 'Shopify'}`;
    if (kind === 'kw:testOpenPageRank' && res) txt = `✓ google.com Rank ${res.rank || 'n/a'} (PR ${res.pageRank || 'n/a'})`;
    if (kind === 'kw:testMoz' && res) txt = `✓ moz.com DA ${res.da} (PA ${res.pa})`;
    setHint(hintId, txt);
  } else {
    setHint(hintId, r?.error || 'failed', true);
  }
}

$('b-save')?.addEventListener('click', save);
$('b-save2')?.addEventListener('click', save);
$('b-save3')?.addEventListener('click', save);
$('b-save4')?.addEventListener('click', save);

$('b-connect')?.addEventListener('click', connect);
$('b-test-google')?.addEventListener('click', () => runTest('kw:testGoogle', 'google-hint'));
$('b-test-ahrefs')?.addEventListener('click', () => runTest('kw:testAhrefs', 'ahrefs-hint'));
$('b-test-tech')?.addEventListener('click', () => runTest('kw:testTech', 'tech-hint'));
$('b-test-rdap')?.addEventListener('click', () => runTest('kw:testRdap', 'rdap-hint'));
$('b-test-opr')?.addEventListener('click', () => runTest('kw:testOpenPageRank', 'opr-hint'));
$('b-test-moz')?.addEventListener('click', () => runTest('kw:testMoz', 'moz-hint'));

$('b-clear-cache')?.addEventListener('click', async () => {
  await send({ type: 'kw:clearCache' });
  setHint('cache-info', 'Cache cleared.');
  refresh();
});
$('b-disconnect')?.addEventListener('click', async () => {
  await send({ type: 'kw:disconnect' });
  refresh();
});

// Ensure all external links open cleanly in a new browser tab
document.querySelectorAll('a[href]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (a.href) chrome.tabs.create({ url: a.href });
  });
});

refresh();
