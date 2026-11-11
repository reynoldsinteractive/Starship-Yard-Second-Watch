// Second Watch sign-in gate (Netlify Edge Function).
// Every request is checked here before Netlify serves any file. Visitors without a session get the
// public Generic edition (app and documents) with no password. A sign-in code unlocks more:
// the Star Trek build, or the admin view.
//
// Sign-in is by password only. Accounts: set the environment variable SW_USERS in Netlify
// (Project configuration > Environment variables) as comma-separated  name:password:area  entries, e.g.
//   secondwatch:engage-2063:all
// The name is only a label for you; visitors type just the password, so every account needs a different
// password. "area" decides which build of the app the visitor gets:
//   trek     the Star Trek (Starfleet) build only
//   generic  the Generic build only (no Star Trek classes or skin)
//   admin    everything: both skins, plus the visitor stats page at /stats
// If SW_USERS is not set, the default accounts below are used.
const DEFAULT_USERS = 'trek:engage-2063:trek,generic:clear-for-launch:generic,admiral:make-it-so:admin';
// Which app file each area is served at "/" (admin gets the full build, index.html).
const APP = { trek: '/app-starfleet.html', generic: '/app-generic.html' };
// The Generic code gets the Generic edition of every document at the usual addresses, and never the Star Trek ones.
const GENERIC_DOCS = { '/book.html': '/book-generic.html', '/rules.html': '/rules-generic.html', '/quick-start.html': '/quick-start-generic.html', '/library.html': '/library-generic.html',
  '/print/rules.pdf': '/print/rules-generic.pdf', '/print/quick-start.pdf': '/print/quick-start-generic.pdf', '/print/second-watch-core-book.pdf': '/print/second-watch-core-book-generic.pdf' };
const TREK_ONLY = /^\/(ads\/|print\/(record-sheet-explorer-|opponents-starfleet|sheet-page-\d|opponents-page-\d))/;
// Area "admin" can see everything plus the visitor stats page at /stats.
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
// ---------- Visitor stats (Netlify Blobs). Never stores raw IP addresses: each is replaced by a keyed hash. ----------
async function statsStore() {
  if (globalThis.__swTestStore) return globalThis.__swTestStore;
  try { const { getStore } = await import('@netlify/blobs'); return getStore('sw-stats'); } catch (e) { return null; }
}
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
async function visitorId(ip) {
  const k = await crypto.subtle.importKey('raw', enc.encode('sw-visitor:' + (globalThis.Netlify?.env?.get('SW_SECRET') || users().map(x => x.p).join(','))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', k, enc.encode(ip || 'unknown'))).slice(0, 16);
}
async function record(context, kind, extra = {}) {
  const work = (async () => {
    try {
      const st = await statsStore(); if (!st) return;
      const id = await visitorId(context.ip), d = day(), country = context.geo?.country?.code || '??';
      if (kind === 'view') {
        const key = `v/${d}/${id}`, cur = (await st.get(key, { type: 'json' })) || { views: 0, visits: 0, country };
        // a new visit starts with the first page of the day, or after 30 minutes away
        if (!cur.last || Date.now() - cur.last > 30 * 60 * 1000) cur.visits = (cur.visits || 0) + 1;
        cur.views++; cur.last = Date.now(); await st.setJSON(key, cur);
      } else {
        await st.setJSON(`${kind}/${d}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, { id, country, ...extra });
      }
    } catch (e) { /* stats must never block the site */ }
  })();
  if (context.waitUntil) context.waitUntil(work); else await work;
}
// One day's numbers. Finished days are saved as a summary so the history stays fast to load.
async function daySummary(st, d, today) {
  if (d < today) { const sum = await st.get(`sum/${d}`, { type: 'json' }); if (sum) return sum; }
  const v = (await st.list({ prefix: `v/${d}/` })).blobs, s = (await st.list({ prefix: `s/${d}/` })).blobs, f = (await st.list({ prefix: `f/${d}/` })).blobs;
  const out = { d, visitors: v.length, visits: 0, views: 0, signins: s.length, fails: f.length, ids: [], cmap: {} };
  for (const b of v) { const id = b.key.split('/')[2], x = await st.get(b.key, { type: 'json' }); out.ids.push(id);
    if (x) { out.views += x.views || 0; out.visits += x.visits || 1; out.cmap[id] = x.country || '??'; } }
  if (d < today && (out.visitors || out.signins || out.fails)) await st.setJSON(`sum/${d}`, out);
  return out;
}
function trendSvg(days, key, label) {
  const W = 720, H = 200, pl = 34, pr = 10, pt = 14, pb = 26, n = days.length, max = Math.max(1, ...days.map(x => x[key]));
  const nice = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 5) * 5, bw = (W - pl - pr) / n;
  const y = v => pt + (H - pt - pb) * (1 - v / nice), grid = [0, nice / 2, nice].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#1e2633"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const bars = days.map((x, i) => `<rect x="${pl + i * bw + bw * 0.15}" y="${y(x[key])}" width="${Math.max(1, bw * 0.7)}" height="${H - pb - y(x[key])}" rx="2" fill="#ff9c3a"><title>${x.d}: ${x[key]} ${label}</title></rect>`).join('');
  const step = Math.ceil(n / 6), ticks = days.map((x, i) => i % step === 0 || i === n - 1 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${x.d.slice(5)}</text>` : '').join('');
  const avg = days.length >= 7 ? days.map((x, i) => { const w = days.slice(Math.max(0, i - 6), i + 1); return [pl + i * bw + bw / 2, y(w.reduce((a, z) => a + z[key], 0) / w.length)]; }) : null;
  const line = avg ? `<polyline points="${avg.map(p => p.join(',')).join(' ')}" fill="none" stroke="#6fb7ff" stroke-width="2.5"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} per day" style="width:100%;height:auto;font:11px 'IBM Plex Mono',monospace;fill:#8a95a6">${grid}${bars}${line}${ticks}</svg>`;
}
async function statsPage(url) {
  const st = await statsStore(), today = day();
  const pick = url.searchParams.get('days') || '30', span = pick === 'all' ? 3650 : Math.min(3650, Math.max(7, parseInt(pick) || 30));
  let days = [];
  if (st) {
    var first = today;
    if (pick === 'all') { const ks = [];
      for (const pre of ['v/', 's/', 'f/', 'sum/']) (await st.list({ prefix: pre })).blobs.forEach(b => ks.push(b.key.split('/')[1]));
      if (ks.length) first = ks.sort()[0]; }
    // always load at least 14 days so the week-over-week trend works on every range
    const start = Math.min(pick === 'all' ? Date.parse(first) : Date.now() - (span - 1) * 864e5, Date.now() - 13 * 864e5);
    for (let t = start; day(t) <= today; t += 864e5) days.push(await daySummary(st, day(t), today));
  }
  const recent = days.slice(-14);
  days = pick === 'all' ? days.slice(days.findIndex(x => x.d >= first)) : days.slice(-span);
  const all = new Set(), byC = {};
  const idC = {}; days.forEach(x => { x.ids.forEach(i => all.add(i)); Object.assign(idC, x.cmap || {}); });
  Object.values(idC).forEach(c => byC[c] = (byC[c] || 0) + 1);
  const sum = k => days.reduce((a, x) => a + x[k], 0), lastN = (k, n) => days.slice(-n).reduce((a, x) => a + x[k], 0);
  const wk = recent.slice(-7).reduce((a, x) => a + x.visits, 0), prevDays = recent.slice(0, 7), prev = prevDays.some(x => x.visits) ? prevDays.reduce((a, x) => a + x.visits, 0) : null;
  const change = prev === null ? 'needs two weeks of data' : prev === 0 ? (wk ? 'up from none' : 'no change') : `${wk >= prev ? '+' : ''}${Math.round((wk - prev) / prev * 100)}% vs the week before`;
  const top = Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${c} ${n}`).join(' · ') || 'none yet';
  const tr = [...days].reverse().map(r => `<tr><td>${r.d}</td><td>${r.visits}</td><td>${r.visitors}</td><td>${r.views}</td><td>${r.signins}</td><td>${r.fails}</td></tr>`).join('');
  const tab = (v, t) => `<a href="/stats?days=${v}" class="${pick === v ? 'on' : ''}">${t}</a>`;
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Second Watch · Visitor stats</title><link href="/fonts/fonts.css" rel="stylesheet">
<style>body{margin:0;background:#04060a;color:#e6eaf1;font:15px/1.5 'IBM Plex Sans',sans-serif;padding:28px}main{max-width:780px;margin:0 auto}h1{font:700 44px/1 Antonio,sans-serif;text-transform:uppercase;margin:0 0 6px}h1 span{color:#ff9c3a}h2{font:700 22px Antonio,sans-serif;text-transform:uppercase;margin:26px 0 6px}
.k{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.k div{background:#0d1118;border:1px solid #1e2633;border-radius:12px;padding:14px}.k b{display:block;font:700 34px Antonio,sans-serif;color:#ff9c3a}.k small{color:#8a95a6}
.tabs{display:flex;gap:6px;margin:14px 0}.tabs a{border:1px solid #1e2633;border-radius:999px;padding:6px 14px;color:#e6eaf1;text-decoration:none;font-size:14px}.tabs a.on{background:#ff9c3a;color:#120c05;border-color:#ff9c3a}
.chart{background:#0d1118;border:1px solid #1e2633;border-radius:12px;padding:12px}.legend{font-size:13px;color:#8a95a6;margin:6px 0 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 5px 0 12px;vertical-align:-1px}
table{width:100%;border-collapse:collapse;font:13.5px 'IBM Plex Mono',monospace}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #1e2633}th{color:#8a95a6;font-size:11.5px;text-transform:uppercase}p{color:#b6bfcc}a{color:#ff9c3a}
@media(max-width:640px){.k{grid-template-columns:repeat(2,minmax(0,1fr))}body{padding:16px}}</style></head><body><main>
<h1>Visitor <span>stats</span></h1>
<div class="tabs">${tab('7', '7 days')}${tab('30', '30 days')}${tab('90', '90 days')}${tab('all', 'All time')}</div>
<div class="k"><div><b>${sum('visits')}</b><small>total visits</small></div><div><b>${all.size}</b><small>unique visitors</small></div><div><b>${wk}</b><small>visits, last 7 days · ${change}</small></div><div><b>${sum('views')}</b><small>page views</small></div></div>
<h2>Visits per day</h2><div class="chart">${trendSvg(days, 'visits', 'visits')}<p class="legend"><i style="background:#ff9c3a"></i>visits that day<i style="background:#6fb7ff;height:3px"></i>7-day average (the trend)</p></div>
<h2>Sign-ins</h2><p>${sum('signins')} successful · ${sum('fails')} wrong access codes${sum('fails') > sum('signins') ? ' (more wrong than right: someone may be guessing; consider changing the code)' : ''}</p>
<p><b>Visitors by country:</b> ${top}</p>
<h2>Day by day</h2><table><tr><th>Day (UTC)</th><th>Visits</th><th>Visitors</th><th>Page views</th><th>Sign-ins</th><th>Wrong codes</th></tr>${tr}</table>
<p>A visit is one browsing session; coming back after 30 minutes away counts as a new visit. A visitor is one network address: people on the same Wi-Fi count once, and a phone that changes networks can count twice. Raw addresses are never stored. Counting started the day the stats were deployed.</p>
<p><a href="/">Back to the site</a> · <a href="/logout">Sign out</a></p></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
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
    const p = String(form.get('password') || '').trim();
    const next = safeNext(String(form.get('next') || '/'));
    const hit = p ? users().find(x => safeEqual(x.p, p)) : null;
    if (!hit) { await record(context, 'f'); await new Promise(r => setTimeout(r, 600)); return loginPage(next, true, 401); }
    await record(context, 's', { area: hit.area });
    const exp = String(Date.now() + DAYS * 864e5), payload = [hit.u, hit.area, exp].join('.');
    const cookie = `${COOKIE}=${encodeURIComponent(payload + '.' + await sign(payload))}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
    // The admin code opens the stats page, unless it was signing in to reach a specific page.
    const dest = hit.area === 'admin' && next === '/' ? '/stats' : next;
    return new Response(null, { status: 303, headers: { 'Location': dest, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  }
  const signed = await session(request);
  if (path === '/login') return loginPage(safeNext(url.searchParams.get('next')), false, 200, signed);
  // No session: the public Generic edition. Only /stats still needs a sign-in.
  if (!signed && path === '/stats') return Response.redirect(new URL('/login?next=/stats', url), 303);
  const s = signed || { u: 'public', area: 'generic' };
  if (s && path === '/stats') return s.area === 'admin' ? statsPage(url) : new Response('Not available for this access code.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (s) {
    // Each access code only reaches its own build of the app.
    const own = APP[s.area];
    if (/^\/app-(starfleet|generic)\.html$/.test(path) && s.area !== 'admin' && path !== own) return Response.redirect(new URL('/', url), 303);
    if ((request.headers.get('accept') || '').includes('text/html')) await record(context, 'view');
    if (own && (path === '/' || path === '/index.html')) return new URL(own + url.search, url);
    if (s.area === 'generic') {
      if (GENERIC_DOCS[path]) return new URL(GENERIC_DOCS[path] + url.search, url);
      if (TREK_ONLY.test(path)) return Response.redirect(new URL('/library.html', url), 303);
    }
    return context.next();
  }
};

export const config = { path: '/*', excludedPath: ['/fonts/*', '/robots.txt'] };

const AREA_NAME = { trek: 'the Star Trek build', generic: 'the Generic build', admin: 'the admin view (both builds and stats)' };
function loginPage(next, failed, status, signed) {
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
.foot{font:12px 'IBM Plex Mono',monospace;color:#8a95a6;letter-spacing:.04em} .foot a,.ok a{color:#ff9c3a}
.ok{background:#10221a;border:1px solid #3fbf8a;color:#c9f2de;border-radius:10px;padding:10px 12px;font-size:14px}
</style></head><body><main class="card"><div class="bar" aria-hidden="true"></div><form class="in" method="post" action="/login">
<small>Second Watch: Drydock · crew sign-in</small><h1>Second <span>Watch</span></h1>
<p>The Generic yard is open to everyone, no code needed. Crew with an access code can sign in here for more.</p>
${signed ? `<div class="ok" role="status">You're signed in to ${AREA_NAME[signed.area] || 'Drydock'}. <a href="/logout">Sign out</a> to go back to the public Generic yard, or enter another code below.</div>` : ''}
${failed ? '<div class="err" role="alert">That access code was not recognized. Check it and try again.</div>' : ''}
<label for="p">Access code<input id="p" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required autofocus></label>
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Sign in</button>
<span class="foot">You stay signed in on this device for ${DAYS} days. · <a href="/">Back to the yard</a></span>
</form></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
