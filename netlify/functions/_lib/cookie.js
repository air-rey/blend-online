// Session cookie built with signed JWTs (jose). The cookie carries
// person_id, resource_slug, grant_id, agreement_status. It is HttpOnly,
// Secure, SameSite=Lax, and scoped to one resource. Setting it does NOT
// grant access to any other resource.
const { SignJWT, jwtVerify } = require('jose');
const cookie = require('cookie');

const COOKIE_NAME = 'bx_session';
const ALGO = 'HS256';
// 14 day session cap. Each grant also has its own expires_at that server
// code must check on every request (session cookie age is only an upper
// bound; the grant can expire or be revoked sooner).
const COOKIE_MAX_AGE_SEC = 14 * 24 * 60 * 60;

function keyBytes () {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('Missing SESSION_SECRET (32+ chars) in env.');
  }
  return new TextEncoder().encode(s);
}

async function makeSession (payload) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: ALGO })
    .setIssuedAt(now)
    .setExpirationTime(now + COOKIE_MAX_AGE_SEC)
    .setIssuer('blendxr')
    .setAudience('deal-room')
    .sign(keyBytes());
}

async function readSession (headers) {
  try {
    const raw = headers.cookie || headers.Cookie || '';
    const parsed = cookie.parse(raw);
    const jwt = parsed[COOKIE_NAME];
    if (!jwt) return null;
    const { payload } = await jwtVerify(jwt, keyBytes(), {
      issuer: 'blendxr',
      audience: 'deal-room'
    });
    return payload;
  } catch (_) {
    return null;
  }
}

function setCookieHeader (token) {
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC
  });
}

function clearCookieHeader () {
  return cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
}

module.exports = { makeSession, readSession, setCookieHeader, clearCookieHeader, COOKIE_NAME };
