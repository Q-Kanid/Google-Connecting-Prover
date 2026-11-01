'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { OAuth2Client } = require('google-auth-library');
const { createClient } = require('redis');
const { RedisStore } = require('connect-redis');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
const SESSION_SECRET = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL || '';
const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;
if (redisClient) redisClient.on('error', err => console.error('Redis connection issue:', err.message));
const sessionStore = redisClient ? new RedisStore({ client: redisClient, prefix: 'account-lens:sess:' }) : undefined;
const configured = Boolean(
  CLIENT_ID && CLIENT_SECRET && SESSION_SECRET &&
  CLIENT_ID.includes('.apps.googleusercontent.com') &&
  !CLIENT_ID.includes('YOUR_') &&
  !CLIENT_SECRET.includes('YOUR_') &&
  SESSION_SECRET.length >= 32 &&
  !SESSION_SECRET.includes('REPLACE_')
);

if (isProduction) app.set('trust proxy', 1); // Only use behind a trusted reverse proxy.
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.warn('Set a strong SESSION_SECRET in .env (32+ characters).');
}
if (!configured) {
  console.warn('Google OAuth is not configured. See README.md and .env.example.');
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"]
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(express.json({ limit: '12kb' }));
app.use(session({
  name: 'account.lens.sid',
  store: sessionStore,
  secret: SESSION_SECRET || 'SET_A_LONG_RANDOM_SESSION_SECRET_BEFORE_USING_THIS_APP',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 // 1-hour local demo session
  }
  // Local development uses memory; production requires a Redis-backed store.
}));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/auth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const EXTRA = {
  birthday: { scope: 'https://www.googleapis.com/auth/user.birthday.read', field: 'birthdays' },
  phone: { scope: 'https://www.googleapis.com/auth/user.phonenumbers.read', field: 'phoneNumbers' },
  address: { scope: 'https://www.googleapis.com/auth/user.addresses.read', field: 'addresses' },
  gender: { scope: 'https://www.googleapis.com/auth/user.gender.read', field: 'genders' },
  organization: { scope: 'https://www.googleapis.com/auth/user.organization.read', field: 'organizations' }
};
const BASIC_SCOPES = ['openid', 'email', 'profile'];
const oauthClient = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const random = () => crypto.randomBytes(32).toString('hex');

function grantedList(scopeText = '') {
  return [...new Set(String(scopeText).split(/\s+/).filter(Boolean))];
}
function hasScope(scopes, needed) {
  return scopes.includes(needed);
}
function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(err => err ? reject(err) : resolve());
  });
}
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => err ? reject(err) : resolve());
  });
}
function csrfOK(req) {
  const expected = req.session?.csrf;
  const actual = req.get('x-csrf-token');
  return typeof expected === 'string' && typeof actual === 'string' &&
    expected.length === actual.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
async function googleRequest(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    throw new Error(`Google API returned HTTP ${response.status}`);
  }
  return response.json();
}

app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (isProduction && (!redisClient || !redisClient.isReady)) return res.sendStatus(503);
  res.status(200).json({ ok: true });
});

app.get('/api/status', (req, res) => {
  if (!req.session.csrf) req.session.csrf = random();
  const account = req.session.account;
  res.json({
    configured,
    connected: Boolean(account),
    ...(account ? {
      identity: account.identity,
      userinfo: account.userinfo,
      idTokenClaims: account.idTokenClaims,
      people: account.people || null,
      peopleError: account.peopleError || null,
      scopes: account.scopes || [],
      fetchedAt: account.fetchedAt,
      csrf: req.session.csrf
    } : {})
  });
});

async function startGoogleAuth(req, mode, selected = []) {
  if (!configured) throw new Error('not_configured');
  const { codeVerifier, codeChallenge } = await oauthClient.generateCodeVerifierAsync();
  const state = random();
  const previousExtras = mode === 'extra' && req.session.account
    ? Object.values(EXTRA).filter(item => hasScope(req.session.account.scopes, item.scope)).map(item => item.scope)
    : [];
  const scopes = [...new Set([
    ...BASIC_SCOPES,
    ...previousExtras,
    ...selected.map(k => EXTRA[k].scope)
  ])];
  req.session.oauth = {
    state, codeVerifier, mode,
    timestamp: Date.now(),
    expectedSub: mode === 'extra' ? req.session.account?.identity?.sub : null
  };
  const url = oauthClient.generateAuthUrl({
    access_type: 'online', // Do not request refresh tokens/background access.
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    include_granted_scopes: true,
    ...(mode === 'login' ? { prompt: 'select_account' } : { prompt: 'consent' })
  });
  await saveSession(req);
  return url;
}

app.get('/auth/google', async (req, res) => {
  try { res.redirect(await startGoogleAuth(req, 'login')); }
  catch { res.redirect('/?error=setup'); }
});

app.post('/api/request-more', async (req, res) => {
  if (!req.session.account) return res.status(401).json({ error: 'Sign in first.' });
  if (!csrfOK(req)) return res.status(403).json({ error: 'Invalid request token.' });
  const chosen = req.body?.fields;
  if (!Array.isArray(chosen) || chosen.length > 5 ||
      !chosen.every(v => typeof v === 'string' && Object.hasOwn(EXTRA, v))) {
    return res.status(400).json({ error: 'Invalid permissions selection.' });
  }
  const missing = [...new Set(chosen)].filter(k => !req.session.account.scopes.includes(EXTRA[k].scope));
  if (!missing.length) return res.status(400).json({ error: 'Choose a permission you have not already granted.' });
  try { res.json({ url: await startGoogleAuth(req, 'extra', missing) }); }
  catch { res.status(500).json({ error: 'Could not start authorization.' }); }
});

app.get('/auth/google/callback', async (req, res) => {
  const flow = req.session.oauth;
  delete req.session.oauth;
  const state = req.query.state;
  if (!flow || typeof state !== 'string' || state !== flow.state ||
      Date.now() - flow.timestamp > 10 * 60 * 1000) {
    return res.redirect('/?error=invalid_state');
  }
  if (req.query.error) return res.redirect('/?error=permission_denied');
  if (typeof req.query.code !== 'string') return res.redirect('/?error=no_code');
  try {
    const { tokens } = await oauthClient.getToken({
      code: req.query.code,
      codeVerifier: flow.codeVerifier,
      redirect_uri: REDIRECT_URI
    });
    if (!tokens.id_token || !tokens.access_token) throw new Error('Missing tokens');
    const ticket = await oauthClient.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID });
    const claims = ticket.getPayload();
    if (!claims?.sub) throw new Error('Missing account identity');
    if (flow.mode === 'extra' && (!flow.expectedSub || claims.sub !== flow.expectedSub)) {
      return res.redirect('/?error=different_account');
    }

    const userinfo = await googleRequest('https://openidconnect.googleapis.com/v1/userinfo', tokens.access_token);
    if (userinfo.sub !== claims.sub) throw new Error('Account identity mismatch');

    const scopes = grantedList(tokens.scope);
    const identity = {
      sub: claims.sub,
      name: userinfo.name || claims.name || null,
      given_name: userinfo.given_name || claims.given_name || null,
      family_name: userinfo.family_name || claims.family_name || null,
      email: userinfo.email || claims.email || null,
      email_verified: userinfo.email_verified ?? claims.email_verified ?? null,
      picture: userinfo.picture || claims.picture || null,
      locale: userinfo.locale || claims.locale || null,
      hosted_domain: claims.hd || null
    };

    const account = {
      identity, userinfo, idTokenClaims: claims,
      scopes, fetchedAt: new Date().toISOString(),
      people: null, peopleError: null
    };

    const extraGranted = Object.values(EXTRA).filter(item => scopes.includes(item.scope));
    if (extraGranted.length) {
      const fields = [...new Set(['names', 'emailAddresses', 'photos', ...extraGranted.map(v => v.field)])];
      try {
        const url = new URL('https://people.googleapis.com/v1/people/me');
        url.searchParams.set('personFields', fields.join(','));
        url.searchParams.append('sources', 'READ_SOURCE_TYPE_PROFILE');
        account.people = await googleRequest(url.toString(), tokens.access_token);
      } catch (err) {
        account.peopleError = `People API could not load (${err.message}). Check that People API is enabled and permission was granted.`;
      }
    }

    if (flow.mode === 'login') await regenerateSession(req);
    req.session.csrf = random();
    req.session.account = account;
    // Token is used only to fetch permitted data above and then discarded.
    // No access or refresh token is stored in session or sent to browser.
    await saveSession(req);
    return res.redirect('/?connected=1');
  } catch (err) {
    console.error('Google authorization failed:', err.message);
    return res.redirect('/?error=authorization_failed');
  }
});

app.post('/api/signout', (req, res) => {
  if (!csrfOK(req)) return res.status(403).json({ error: 'Invalid request token.' });
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Could not sign out.' });
    res.clearCookie('account.lens.sid');
    res.json({ success: true, note: 'Local session ended; Google grant not revoked.' });
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  maxAge: 0
}));

async function startServer() {
  if (isProduction) {
    if (!configured) throw new Error('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and a secure SESSION_SECRET before deploying.');
    if (!REDIRECT_URI.startsWith('https://')) throw new Error('Production GOOGLE_REDIRECT_URI must start with https://');
    if (!redisUrl) throw new Error('Production requires REDIS_URL for server-side session storage.');
  }
  if (redisClient) await redisClient.connect();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Google Account Lens listening on port ${PORT}.`);
    console.log(configured ? 'OAuth settings loaded.' : 'OAuth not configured; sample mode available locally.');
  });
}
startServer().catch(err => {
  console.error('Startup error:', err.message);
  process.exit(1);
});
