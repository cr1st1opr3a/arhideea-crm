// Every request (pages, API, files) must carry a valid Cloudflare Access token.
// Cloudflare Access already blocks strangers at the edge; this check also blocks
// anyone who reaches the site another way (e.g. the *.pages.dev address).
// Fails closed: if ACCESS_TEAM_DOMAIN / ACCESS_AUD are not set, nobody gets in.

let certCache = { at: 0, keys: null };

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(team) {
  if (certCache.keys && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs ' + r.status);
  const j = await r.json();
  certCache = { at: Date.now(), keys: j.keys || [] };
  return certCache.keys;
}

async function verify(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256') return null;
  const team = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
  let keys = await getKeys(team);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { certCache.at = 0; keys = await getKeys(team); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (env.ACCESS_AUD && !aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (payload.iss && payload.iss !== team) return null;
  const allowed = String(env.ALLOWED_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  // Without an AUD pin, the email allow-list is mandatory.
  if (!env.ACCESS_AUD && !allowed.length) return null;
  if (allowed.length && !allowed.includes(String(payload.email || '').toLowerCase())) return null;
  return payload;
}

const deny = (msg, status = 403) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (!env.ACCESS_TEAM_DOMAIN || (!env.ACCESS_AUD && !env.ALLOWED_EMAILS)) return deny('Aplicația nu este încă protejată (lipsește configurarea Cloudflare Access). Acces blocat.', 503);
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get('cf-access-jwt-assertion') || (m && m[1]);
  if (!token) return deny('Autentificare necesară.', 401);
  let user = null;
  try { user = await verify(token, env); } catch (e) { return deny('Nu am putut verifica autentificarea.', 503); }
  if (!user) return deny('Acces refuzat.');
  ctx.data.user = { email: user.email, aud: Array.isArray(user.aud) ? user.aud[0] : user.aud };
  const res = await ctx.next();
  const h = new Headers(res.headers);
  h.set('x-frame-options', 'DENY');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'no-referrer');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (new URL(request.url).pathname.startsWith('/api/')) h.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
