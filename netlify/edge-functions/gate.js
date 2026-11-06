// Second Watch sign-in gate (Netlify Edge Function).
// Every request is checked here before Netlify serves any file. Without a valid session cookie,
// visitors get the Second Watch sign-in page instead of the site.
//
// Accounts: set the environment variable SW_USERS in Netlify (Project configuration > Environment variables)
// as comma-separated  username:password:area  entries, for example
//   secondwatch:engage-2367:all
// "area" is "all" today. It is stored in the session so a later version can send a Generic-only
// account (area "generic") to a separate Generic section without changing how sign-in works.
// If SW_USERS is not set, the default account below is used.
const DEFAULT_USERS = 'secondwatch:engage-2367:all';
const COOKIE = 'sw_session';
const DAYS = 30;

const enc = new TextEncoder();
function users() {
  const raw = (globalThis.Netlify?.env?.get('SW_USERS')) || DEFAULT_USERS;
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const [u, p, area] = s.split(':'); return { u: (u || '').toLowerCase(), p: p || '', area: area || 'all' };
  });
}
async function key() {
  // The signing key comes from SW_SECRET if set, otherwise from the account list itself,
  // so changing any password signs everyone out.
  const secret = (globalThis.Netlify?.env?.get('SW_SECRET')) || ('sw-gate:' + users().map(x => x.u + ':' + x.p).join(','));
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(payload) { return b64(await crypto.subtle.sign('HMAC', await key(), enc.encode(payload))); }
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function getCookie(req, name) {
  const m = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
async function session(req) {
  const c = getCookie(req, COOKIE); if (!c) return null;
  const [u, area, exp, sig] = c.split('.'); if (!sig || Date.now() > +exp) return null;
  if (!safeEqual(sig, await sign([u, area, exp].join('.')))) return null;
  if (!users().some(x => x.u === u)) return null;
  return { u, area };
}
function safeNext(n) { return (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login')) ? n : '/'; }

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/logout') {
    return new Response(null, { status: 303, headers: { 'Location': '/login', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store' } });
  }
  if (path === '/login' && request.method === 'POST') {
    const form = await request.formData();
    const u = String(form.get('username') || '').trim().toLowerCase(), p = String(form.get('password') || '');
    const next = safeNext(String(form.get('next') || '/'));
    const hit = users().find(x => x.u === u && safeEqual(x.p, p));
    if (!hit) { await new Promise(r => setTimeout(r, 600)); return loginPage(next, true, 401); }
    const exp = String(Date.now() + DAYS * 864e5), payload = [hit.u, hit.area, exp].join('.');
    const cookie = `${COOKIE}=${encodeURIComponent(payload + '.' + await sign(payload))}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
    return new Response(null, { status: 303, headers: { 'Location': next, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  }
  const s = await session(request);
  if (path === '/login') return s ? Response.redirect(new URL(safeNext(url.searchParams.get('next')), url), 303) : loginPage(safeNext(url.searchParams.get('next')), false, 200);
  if (s) return context.next();
  // Not signed in: pages go to the sign-in screen; anything else (files, images) is refused.
  const wantsPage = (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage) return Response.redirect(new URL('/login?next=' + encodeURIComponent(path + url.search), url), 303);
  return new Response('Sign in required', { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
};

export const config = { path: '/*', excludedPath: ['/fonts/*', '/robots.txt'] };

function loginPage(next, failed, status) {
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Second Watch · Sign in</title>
<link href="/fonts/fonts.css" rel="stylesheet"><style>
*{box-sizing:border-box} html,body{margin:0;height:100%}
body{background:#04060a;color:#e6eaf1;font:16px/1.5 'IBM Plex Sans',system-ui,sans-serif;display:grid;place-items:center;padding:20px;
background-image:radial-gradient(1.3px 1.3px at 12% 18%,#fff8,transparent),radial-gradient(1px 1px at 70% 30%,#cdd8ff,transparent),radial-gradient(1.6px 1.6px at 85% 80%,#fff6,transparent),radial-gradient(1px 1px at 30% 75%,#fff7,transparent),radial-gradient(1.2px 1.2px at 52% 52%,#9fb4e6,transparent)}
.card{width:min(460px,100%);display:grid;grid-template-columns:22px 1fr;gap:0;border-radius:18px;overflow:hidden;background:#0d1118;border:1px solid #1e2633}
.bar{background:linear-gradient(#ff9c3a 0 38%,#0d1118 38% 40%,#c3a6ff 40% 62%,#0d1118 62% 64%,#6fb7ff 64%)}
.in{padding:30px 28px 28px;display:flex;flex-direction:column;gap:16px}
small{font:500 12px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:#6fb7ff}
h1{margin:0;font:700 54px/.9 Antonio,'Arial Narrow',sans-serif;text-transform:uppercase} h1 span{color:#ff9c3a}
p{margin:0;color:#b6bfcc;font-size:15px}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8a95a6}
input{background:#121823;border:1px solid #2a3546;border-radius:10px;padding:12px 14px;color:#e6eaf1;font:16px 'IBM Plex Mono',monospace;min-height:46px}
input:focus{outline:2px solid #6fb7ff;outline-offset:1px}
button{margin-top:4px;background:#ff9c3a;color:#120c05;border:0;border-radius:999px;padding:13px 18px;font:700 16px 'IBM Plex Sans',sans-serif;min-height:48px;cursor:pointer}
.err{background:#2a1214;border:1px solid #ff5d5d;color:#ffc9c9;border-radius:10px;padding:10px 12px;font-size:14px}
.foot{font:12px 'IBM Plex Mono',monospace;color:#8a95a6;letter-spacing:.04em}
</style></head><body><main class="card"><div class="bar" aria-hidden="true"></div><form class="in" method="post" action="/login">
<small>Starship Yard · access control</small><h1>Second <span>Watch</span></h1>
<p>Playtest access only. Enter the crew credentials your Admiral gave you.</p>
${failed ? '<div class="err" role="alert">Those credentials were not recognized. Check with your Admiral and try again.</div>' : ''}
<label for="u">Username<input id="u" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></label>
<label for="p">Password<input id="p" name="password" type="password" autocomplete="current-password" required></label>
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Sign in</button>
<span class="foot">You stay signed in on this device for ${DAYS} days.</span>
</form></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
