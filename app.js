'use strict';

const EXTRA_SCOPES = {
  birthday: 'https://www.googleapis.com/auth/user.birthday.read',
  phone: 'https://www.googleapis.com/auth/user.phonenumbers.read',
  address: 'https://www.googleapis.com/auth/user.addresses.read',
  gender: 'https://www.googleapis.com/auth/user.gender.read',
  organization: 'https://www.googleapis.com/auth/user.organization.read'
};
const FIELD_LABELS = {
  sub: 'Unique Google account ID',
  name: 'Full display name',
  given_name: 'Given name',
  family_name: 'Family name',
  email: 'Email address',
  email_verified: 'Email verified',
  picture: 'Profile picture URL',
  locale: 'Preferred language / locale',
  hosted_domain: 'Google Workspace hosted domain'
};
const PAGE_TITLES = {
  overview: 'Overview', data: 'Data explorer', permissions: 'Permissions',
  possibilities: 'What else is possible?', privacy: 'Privacy & setup'
};

const el = id => document.getElementById(id);
const state = { connected: false, demo: false, configured: false, data: null, csrf: null, page: 'overview' };
const SAMPLE = {
  identity: {
    sub: '123456789012345678901', name: 'Alex Example', given_name: 'Alex',
    family_name: 'Example', email: 'alex.example@example.com', email_verified: true,
    picture: null, locale: 'en', hosted_domain: null
  },
  userinfo: {
    sub: '123456789012345678901', name: 'Alex Example', given_name: 'Alex',
    family_name: 'Example', email: 'alex.example@example.com', email_verified: true,
    locale: 'en'
  },
  idTokenClaims: {
    iss: 'https://accounts.google.com', aud: 'EXAMPLE_CLIENT_ID',
    sub: '123456789012345678901', email: 'alex.example@example.com',
    email_verified: true, name: 'Alex Example', given_name: 'Alex',
    family_name: 'Example', picture: null, iat: 1710000000, exp: 1710003600
  },
  people: null, peopleError: null,
  scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
  fetchedAt: null
};

function notice(message) {
  const box = el('app-alert');
  box.textContent = message;
  box.hidden = !message;
}
function go(page) {
  if (!Object.hasOwn(PAGE_TITLES, page)) return;
  state.page = page;
  document.querySelectorAll('[data-section]').forEach(section => {
    section.hidden = section.dataset.section !== page;
  });
  document.querySelectorAll('[data-page]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.page === page);
    button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
  });
  el('current-page-title').textContent = PAGE_TITLES[page];
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function hasBasic(scope) {
  const scopes = state.data?.scopes || [];
  const aliases = {
    openid: ['openid'],
    email: ['email', 'https://www.googleapis.com/auth/userinfo.email'],
    profile: ['profile', 'https://www.googleapis.com/auth/userinfo.profile']
  };
  return aliases[scope].some(s => scopes.includes(s));
}
function valueToText(value) {
  if (value === null || value === undefined || value === '') return 'Not provided by Google';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function setCopyLabel(button, original) {
  button.textContent = 'Copied!';
  window.setTimeout(() => { button.textContent = original; }, 1100);
}
function createQuickRow(label, value) {
  const row = document.createElement('div');
  row.className = 'quick-row';
  const k = document.createElement('span');
  k.textContent = label;
  const v = document.createElement('strong');
  v.textContent = valueToText(value);
  row.append(k, v);
  return row;
}
function renderProfile() {
  const user = state.data.identity;
  const avatar = el('profile-photo');
  avatar.replaceChildren();
  const url = user.picture;
  let safePhoto = false;
  try {
    const u = new URL(url);
    safePhoto = u.protocol === 'https:' && (u.hostname === 'googleusercontent.com' || u.hostname.endsWith('.googleusercontent.com'));
  } catch { /* no image */ }
  if (safePhoto) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Google account profile picture';
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => { avatar.textContent = (user.name || 'G').slice(0, 1).toUpperCase(); };
    avatar.appendChild(image);
  } else {
    avatar.textContent = (user.name || 'G').slice(0, 1).toUpperCase();
  }
  el('profile-name').textContent = user.name || 'Google account';
  el('profile-email').textContent = user.email || 'Email not provided';
  el('field-count').textContent = Object.values(user).filter(x => x !== null && x !== undefined && x !== '').length;
  el('scope-count').textContent = state.data.scopes.length;
  el('extra-count').textContent = Object.values(EXTRA_SCOPES).filter(s => state.data.scopes.includes(s)).length;
  const quick = el('quick-fields');
  quick.replaceChildren();
  ['sub', 'email', 'email_verified', 'given_name', 'family_name', 'locale'].forEach(key => {
    quick.appendChild(createQuickRow(FIELD_LABELS[key], user[key]));
  });
}
function renderRaw() {
  const user = state.data.identity;
  const fields = el('all-fields');
  fields.replaceChildren();
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const item = document.createElement('div');
    item.className = 'field-item';
    const k = document.createElement('span');
    k.className = 'field-label';
    k.textContent = label;
    const v = document.createElement('span');
    v.className = 'field-value';
    v.textContent = valueToText(user[key]);
    if (user[key] === undefined || user[key] === null || user[key] === '') v.classList.add('missing');
    item.append(k, v);
    fields.append(item);
  }
  el('json-userinfo').textContent = JSON.stringify(state.data.userinfo, null, 2);
  el('json-claims').textContent = JSON.stringify(state.data.idTokenClaims, null, 2);
  el('json-people').hidden = !state.data.people;
  if (state.data.people) el('json-people').textContent = JSON.stringify(state.data.people, null, 2);
  el('people-message').textContent = state.data.peopleError || (
    state.data.people ? 'Only fields authorized and actually returned by the People API are listed below.' :
      'Not requested. Extra profile permissions are optional.'
  );
  el('last-fetched').textContent = state.data.fetchedAt ? `Received ${new Date(state.data.fetchedAt).toLocaleString()}` : 'Sample data only';
  el('data-status').textContent = state.demo ? 'Fictional sample data' : 'Actual Google response';
}
function renderPermissions() {
  for (const scope of ['openid', 'email', 'profile']) {
    const badge = document.querySelector(`[data-basic="${scope}"]`);
    const granted = state.connected && hasBasic(scope);
    badge.textContent = granted ? '✓ Granted' : 'Not granted';
    badge.classList.toggle('granted', granted);
  }
  for (const [field, scope] of Object.entries(EXTRA_SCOPES)) {
    const row = document.querySelector(`[data-extra="${field}"]`);
    const badge = row.querySelector('.extra-status');
    const checkbox = row.querySelector('input');
    const granted = state.connected && state.data.scopes.includes(scope);
    badge.textContent = granted ? '✓ Granted' : 'Not granted';
    badge.classList.toggle('granted', granted);
    checkbox.disabled = !state.connected || state.demo || granted;
    if (checkbox.disabled) checkbox.checked = false;
  }
  const scopes = el('scope-list');
  scopes.replaceChildren();
  if (state.connected) {
    state.data.scopes.forEach(scope => {
      const chip = document.createElement('span');
      chip.className = 'scope-chip';
      chip.textContent = scope;
      scopes.append(chip);
    });
  } else {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'Sign in to see your scopes.';
    scopes.appendChild(span);
  }
  refreshRequestButton();
}
function refreshRequestButton() {
  const btn = el('request-extra');
  const selected = document.querySelectorAll('.permission-checkbox:checked').length;
  btn.disabled = !state.connected || state.demo || selected === 0;
  btn.textContent = !state.connected ? 'Sign in to request access' : state.demo ? 'Unavailable in sample mode' : selected ? `Request ${selected} permission${selected === 1 ? '' : 's'} →` : 'Select permissions above';
}
function render() {
  document.body.classList.toggle('is-connected', state.connected);
  el('demo-banner').hidden = !state.demo;
  el('profile-zone').hidden = !state.connected;
  el('intro-zone').hidden = state.connected;
  el('data-empty').hidden = state.connected;
  el('data-connected').hidden = !state.connected;
  el('top-logout').hidden = !state.connected || state.demo;
  el('logout-main').disabled = !state.connected || state.demo;
  const status = el('session-label');
  status.replaceChildren();
  const dot = document.createElement('span'); dot.className = 'status-dot';
  status.append(dot, document.createTextNode(state.demo ? 'Sample mode' : state.connected ? 'Google connected' : 'Not connected'));
  if (state.connected) {
    el('hero-heading').textContent = state.demo ? 'Sample Google account overview' : 'You’re connected to Google.';
    el('hero-subtitle').textContent = state.demo ? 'This is fictional data to demonstrate the dashboard. Sign in to see only your own real data.' : 'Explore the exact identity details returned by Google. Additional private data remains inaccessible without a separate permission request.';
    el('hero-actions').hidden = true;
    renderProfile();
    renderRaw();
  } else {
    el('hero-heading').replaceChildren();
    el('hero-heading').append(document.createTextNode('What does Google '));
    const em = document.createElement('em'); em.textContent = 'share';
    el('hero-heading').append(em, document.createTextNode(' about you?'));
    el('hero-subtitle').textContent = 'Connect your Google account to see the exact profile fields this website receives, with full transparency about permissions and what stays private.';
    el('hero-actions').hidden = false;
  }
  renderPermissions();
}
function switchToDemo() {
  state.demo = true;
  state.connected = true;
  state.data = structuredClone(SAMPLE);
  state.csrf = null;
  notice('');
  render();
  go('overview');
}
function clearDemo() {
  state.demo = false;
  state.connected = false;
  state.data = null;
  state.csrf = null;
  notice('');
  render();
  go('overview');
}
async function reloadStatus() {
  try {
    const resp = await fetch('/api/status', { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.ok) throw new Error('Could not reach the app server.');
    const data = await resp.json();
    state.configured = data.configured;
    state.demo = false;
    state.connected = data.connected;
    state.data = data.connected ? data : null;
    state.csrf = data.csrf;
    render();
    if (!data.configured) {
      notice('Google sign-in is not set up yet. Configure your Google credentials in your hosting environment variables. See the deployment guide. Sample mode works without credentials.');
    }
  } catch {
    notice('This project needs its Node.js backend. Deploy it as a Web Service, not a static-only GitHub Pages website. You can still explore fictional sample data.');
    render();
  }
}
async function logout() {
  if (!state.connected || state.demo) return;
  try {
    const response = await fetch('/api/signout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'x-csrf-token': state.csrf }
    });
    if (!response.ok) throw new Error();
    state.connected = false; state.data = null; state.csrf = null;
    await reloadStatus();
    notice('Signed out. Your local session was erased. To revoke the app’s Google permissions, visit Google Account → Third-party connections.');
    go('overview');
  } catch { notice('Sign-out failed. Please try again.'); }
}
async function requestMore() {
  const fields = [...document.querySelectorAll('.permission-checkbox:checked')].map(input => input.value);
  if (!fields.length || !state.connected || state.demo) return;
  el('request-extra').disabled = true;
  try {
    const response = await fetch('/api/request-more', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': state.csrf },
      body: JSON.stringify({ fields })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    if (typeof result.url !== 'string' || !result.url.startsWith('https://accounts.google.com/')) throw new Error('Invalid authorization URL.');
    window.location.assign(result.url);
  } catch (err) {
    notice(err.message || 'Could not request permissions.');
    go('permissions');
    refreshRequestButton();
  }
}
function exportData() {
  if (!state.data) return;
  const payload = {
    note: state.demo ? 'FICTIONAL SAMPLE DATA - NOT FROM GOOGLE' : 'Your own Google account data returned to Account Lens',
    exportedAt: new Date().toISOString(),
    identity: state.data.identity,
    grantedScopes: state.data.scopes,
    openIdUserInfo: state.data.userinfo,
    verifiedIdTokenClaims: state.data.idTokenClaims,
    peopleApiResponse: state.data.people,
    peopleApiError: state.data.peopleError
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.demo ? 'account-lens-SAMPLE.json' : 'my-google-account-lens.json';
  document.body.append(anchor);
  anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function copyJSON(which, button) {
  if (!state.data) return;
  const sources = { userinfo: state.data.userinfo, claims: state.data.idTokenClaims, people: state.data.people };
  if (!sources[which]) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(sources[which], null, 2));
    setCopyLabel(button, 'Copy JSON');
  } catch { notice('Clipboard access was blocked by your browser.'); }
}

function initEvents() {
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => go(button.dataset.page)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  el('launch-demo').addEventListener('click', switchToDemo);
  el('exit-demo').addEventListener('click', clearDemo);
  el('top-logout').addEventListener('click', logout);
  el('logout-main').addEventListener('click', logout);
  el('request-extra').addEventListener('click', requestMore);
  el('view-raw').addEventListener('click', () => go('data'));
  el('export-json').addEventListener('click', exportData);
  document.querySelectorAll('.permission-checkbox').forEach(box => box.addEventListener('change', refreshRequestButton));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copyJSON(button.dataset.copy, button)));
}

initEvents();
render();
reloadStatus().then(() => {
  const error = new URLSearchParams(window.location.search).get('error');
  const messages = {
    setup: 'Google sign-in needs your Client ID, Client Secret, and a valid redirect URI. Check README.md.',
    invalid_state: 'The Google sign-in state was invalid or expired. Please try again.',
    permission_denied: 'Google permissions were not granted. Nothing extra was accessed.',
    no_code: 'Google did not return an authorization code.',
    different_account: 'You chose a different Google account during the extra permission request. Your previous session was not changed.',
    authorization_failed: 'Google authorization failed. Check your OAuth setup, test users, and API configuration.'
  };
  if (error) notice(messages[error] || 'Could not complete Google sign-in.');
  if (error || window.location.search) {
    window.history.replaceState({}, '', window.location.pathname);
  }
});
