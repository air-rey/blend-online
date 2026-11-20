#!/usr/bin/env node
// Local preview for the gate + client portal. Dev only, never deployed.
//
//   node scripts/portal-dev-server.js          -> http://localhost:8766
//
// Serves ./public with the same /portal rewrite and portal headers as
// netlify.toml. The deal-room function (enter.js) needs the service role key,
// which is not available locally, so POST /.netlify/functions/enter is
// stubbed: it answers 403 "Not quite." exactly as enter.js does for a code
// that is not a deal-room code, and 202 for an email (request received).
// Portal login then goes to the real portal-login Edge Function.
//
// PORTAL_PUBLISHABLE_KEY, if set, is served in place of an empty
// publishableKey in /portal/config.js (nothing is written to disk).
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8766);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png'
};

function portalHeaders () {
  const toml = fs.readFileSync(path.resolve(__dirname, '..', 'netlify.toml'), 'utf8');
  const m = toml.match(/for = "\/portal\/\*"[\s\S]*?Content-Security-Policy = "([^"]+)"/);
  return { 'Cache-Control': 'private, no-store', 'Content-Security-Policy': m ? m[1] : "default-src 'self'" };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/.netlify/functions/enter') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const f = new URLSearchParams(body);
      const code = (f.get('code') || '').trim();
      const email = (f.get('email') || '').trim();
      res.setHeader('Content-Type', 'application/json');
      if (code)  { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Not quite.' })); }
      if (email) { res.statusCode = 202; return res.end(JSON.stringify({ ok: true })); }
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Type a code, or your email to request access.' }));
    });
    return;
  }

  let p = decodeURIComponent(url.pathname);
  if (p === '/portal' || p === '/portal/') p = '/portal/index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end(); }

  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (p.startsWith('/portal/')) {
      for (const [k, v] of Object.entries(portalHeaders())) res.setHeader(k, v);
    }
    if (p === '/portal/config.js' && process.env.PORTAL_PUBLISHABLE_KEY) {
      buf = Buffer.from(buf.toString('utf8').replace(
        /publishableKey:\s*''/, `publishableKey: ${JSON.stringify(process.env.PORTAL_PUBLISHABLE_KEY)}`));
    }
    res.end(buf);
  });
}).listen(PORT, () => console.log(`portal dev server: http://localhost:${PORT}`));
