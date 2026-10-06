const $ = id => document.getElementById(id);
const send = msg => new Promise(resolve => chrome.runtime.sendMessage(msg, result => {
  const error = chrome.runtime.lastError;
  resolve(error ? { ok: false, error: error.message } : result);
}));
function hint(id, text, error = false) {
  $(id).textContent = text;
  $(id).className = 'hint' + (error ? ' err' : '');
}
async function refresh() {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  const status = await send({ type: 'kw:status' });
  if (!status?.ok) {
    $('status-pill').textContent = 'Unavailable';
    hint('ahrefs-hint', status?.error || 'Could not load settings. Reopen the extension.', true);
    return;
  }
  $('status-pill').textContent = status.ahrefsConfigured ? 'Ready' : 'Add DR key';
  $('status-pill').className = 'pill ' + (status.ahrefsConfigured ? 'pill-ok' : 'pill-warn');
  $('f-ahrefs').placeholder = status.ahrefsConfigured ? '•••• (saved — retype to change)' : 'Paste your Ahrefs APIv3 key';
  $('ahrefs-status').innerHTML = status.ahrefsConfigured ? '<span class="ok">✓ API key saved</span>' : '<span class="warn">Add your API key to enable Domain Rating</span>';
  $('rdap-status').innerHTML = '<span class="ok">✓ Ready — no key needed</span>';
  $('cache-info').textContent = `${status.cache?.drCache || 0} DR · ${status.cache?.ageCache || 0} site age entries cached`;
}
async function action(button, hintId, job) {
  button.disabled = true;
  try { await job(); } catch (error) { hint(hintId, error.message, true); }
  finally { button.disabled = false; }
}
$('b-save2').addEventListener('click', e => action(e.currentTarget, 'ahrefs-hint', async () => {
  const key = $('f-ahrefs').value.trim();
  if (!key) return hint('ahrefs-hint', 'Enter a key to save or replace it. Your saved key is unchanged.');
  const result = await send({ type: 'kw:saveSettings', patch: { ahrefsKey: key } });
  if (!result?.ok) return hint('ahrefs-hint', result?.error || 'Could not save the key.', true);
  $('f-ahrefs').value = '';
  await refresh();
  hint('ahrefs-hint', 'Saved. You can now test your connection.');
}));
for (const [id, type, hintId] of [['b-test-ahrefs', 'kw:testAhrefs', 'ahrefs-hint'], ['b-test-rdap', 'kw:testRdap', 'rdap-hint']]) {
  $(id).addEventListener('click', e => action(e.currentTarget, hintId, async () => {
    hint(hintId, 'Testing…');
    const result = await send({ type });
    if (!result?.ok) return hint(hintId, result?.error || 'Test failed. Try again.', true);
    hint(hintId, type === 'kw:testAhrefs' ? `✓ ahrefs.com DR ${result.result.dr}` : `✓ google.com age ${result.result.age}`);
  }));
}
$('b-clear-cache').addEventListener('click', e => action(e.currentTarget, 'cache-info', async () => {
  const result = await send({ type: 'kw:clearCache' });
  if (!result?.ok) return hint('cache-info', result?.error || 'Could not clear cache.', true);
  await refresh();
  hint('cache-info', 'Cache cleared. Fresh data will load on your next Google search.');
}));
document.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); chrome.tabs.create({ url: a.href });
}));
refresh();
