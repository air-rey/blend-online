#!/usr/bin/env node
// Local preview for the client portal. Dev only, never deployed.
//
//   node scripts/portal-dev-server.js          -> http://localhost:8766/portal
//
// Serves ./public with the same /portal and /portal/session rewrites and the
// portal headers from netlify.toml. Login goes to the real portal-login
// Edge Function. The deal-room gate and its functions are not involved.
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

  let p = decodeURIComponent(url.pathname);
  if (p === '/portal' || p === '/portal/') p = '/portal/index.html';
  if (p === '/portal/session') p = '/portal/session.html';
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
    res.end(buf);
  });
}).listen(PORT, () => console.log(`portal dev server: http://localhost:${PORT}/portal`));
