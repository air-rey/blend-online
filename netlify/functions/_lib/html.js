// Common page shell + helpers for HTML responses from functions.
// Keeps type system, nav, and dark canvas consistent across agreement and
// brief pages, both of which inherit the gate's visual language.

function esc (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page ({ title, bodyHtml, extraHead = '', extraCss = '', extraJs = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<link rel="icon" type="image/svg+xml" href="/strata-mark.svg">
<style>
  @font-face { font-family: 'Sarpanch'; src: url('/fonts/Sarpanch-SemiBold.ttf') format('truetype'); font-weight: 600; font-display: swap; }
  @font-face { font-family: 'Sarpanch'; src: url('/fonts/Sarpanch-Bold.ttf')     format('truetype'); font-weight: 700; font-display: swap; }
  @font-face { font-family: 'Rajdhani'; src: url('/fonts/Rajdhani-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Rajdhani'; src: url('/fonts/Rajdhani-Medium.ttf')  format('truetype'); font-weight: 500; font-display: swap; }
  @font-face { font-family: 'Rajdhani'; src: url('/fonts/Rajdhani-SemiBold.ttf') format('truetype'); font-weight: 600; font-display: swap; }
  @font-face { font-family: 'Teko';     src: url('/fonts/Teko-Medium.ttf')     format('truetype'); font-weight: 500; font-display: swap; }
  @font-face { font-family: 'Teko';     src: url('/fonts/Teko-SemiBold.ttf')   format('truetype'); font-weight: 600; font-display: swap; }
  :root {
    --canvas: #0C0C0C;
    --surface: #141414;
    --surface-2: #1b1b1b;
    --ink: #C3C3C3;
    --body: #878787;
    --muted: #7A7A7A;
    --muted-soft: #5B5B5B;
    --text-strong: #FFFFFF;
    --hairline: rgba(255,255,255,0.10);
    --hairline-strong: rgba(255,255,255,0.18);
    --success: #4CAF50;
    --error: #D9534F;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--canvas); color: var(--ink); min-height: 100vh;
    font-family: 'Rajdhani', 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative;
  }
  ::selection { background: #ffffff; color: #0c0c0c; }
  a { color: var(--text-strong); text-decoration: underline; text-underline-offset: 3px; }
  a:hover { color: #ffffff; }
  h1, h2, h3, h4 { font-family: 'Sarpanch', sans-serif; color: var(--text-strong); letter-spacing: -0.015em; margin: 0 0 0.6em; }
  h1 { font: 700 clamp(28px, 3.4vw, 36px)/1.1 'Sarpanch', sans-serif; }
  h2 { font: 600 clamp(22px, 2.6vw, 28px)/1.2 'Sarpanch', sans-serif; margin-top: 2em; }
  h3 { font: 600 clamp(18px, 2vw, 22px)/1.3 'Sarpanch', sans-serif; margin-top: 1.6em; }
  p { font: 400 15px/1.6 'Rajdhani', sans-serif; color: var(--ink); margin: 0 0 1em; }
  ul, ol { padding-left: 1.4em; margin: 0 0 1em; }
  li { font: 400 15px/1.6 'Rajdhani', sans-serif; color: var(--ink); margin-bottom: 0.3em; }
  strong { color: var(--text-strong); font-weight: 600; }
  em { color: var(--text-strong); font-style: italic; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 0.92em; background: rgba(255,255,255,0.06); padding: 0 4px; border-radius: 3px; }
  pre { background: #0a0a0a; border: 1px solid var(--hairline); border-radius: 8px; padding: 14px; overflow-x: auto; }
  pre, pre code { font-size: 12px; line-height: 1.5; }
  pre code { background: none; padding: 0; }
  details { background: rgba(255,255,255,0.025); border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 16px; margin: 0 0 1.4em; }
  details[open] { padding-bottom: 16px; }
  details > *:not(summary):not(:last-child) { margin-bottom: 1em; }
  details > *:first-child + * { margin-top: 12px; }
  summary { cursor: pointer; font: 500 12px/1.4 'Teko', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); padding: 4px 0; list-style: none; user-select: none; }
  summary::-webkit-details-marker, summary::marker { display: none; content: ''; }
  summary::before { content: '▸'; display: inline-block; width: 14px; color: var(--text-strong); }
  details[open] > summary::before { content: '▾'; }
  summary:hover { color: var(--text-strong); }
  hr { border: 0; border-top: 1px solid var(--hairline); margin: 2em 0; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 1.4em; font: 400 14px/1.55 'Rajdhani', sans-serif; }
  table th, table td { border-top: 1px solid var(--hairline); padding: 10px 12px; text-align: left; vertical-align: top; }
  table th { color: var(--text-strong); font-weight: 600; letter-spacing: 0.3px; }
  blockquote { border-left: 2px solid var(--hairline-strong); padding: 0 14px; margin: 0 0 1em; color: var(--body); }
  .layout {
    max-width: 820px; margin: 0 auto; padding: 56px 24px 120px;
    position: relative;
  }
  .layout--wide { max-width: 1080px; }
  .mono { font-family: ui-monospace, Menlo, monospace; }
  .caps { font-family: 'Teko', sans-serif; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; font-size: 12px; color: var(--muted); }
  .mast {
    display: flex; align-items: center; gap: 10px; margin-bottom: 36px;
    font: 500 12px/1 'Teko', sans-serif; letter-spacing: 2.5px; text-transform: uppercase; color: var(--muted);
  }
  .mast svg { width: 22px; height: 22px; color: var(--ink); }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    background: #FFFFFF; color: #0C0C0C; border: none; border-radius: 8px;
    min-height: 48px; padding: 0 22px; font: 600 14px/1 'Rajdhani', sans-serif;
    letter-spacing: 0.3px; cursor: pointer; text-decoration: none;
    transition: background 200ms ease, transform 250ms ease;
  }
  .btn:hover    { background: #CFCFCF; }
  .btn:active   { transform: translateY(1px); }
  .btn[disabled], .btn.is-disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
  .btn--ghost { background: transparent; color: var(--ink); border: 1px solid var(--hairline-strong); }
  .btn--ghost:hover { background: rgba(255,255,255,0.06); color: var(--text-strong); }
  .panel {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px;
    padding: 22px; margin: 1.6em 0;
  }
  .input, .select, textarea.input {
    width: 100%; background: #0a0a0a;
    border: 1px solid var(--hairline); border-radius: 8px;
    padding: 12px 14px; min-height: 44px;
    font: 500 14px/1.3 'Rajdhani', sans-serif; color: var(--ink);
    outline: none; transition: border-color 150ms ease;
  }
  .input:focus, .select:focus, textarea.input:focus { border-color: var(--text-strong); box-shadow: 0 0 0 3px rgba(255,255,255,0.05); }
  textarea.input { min-height: 90px; resize: vertical; font-family: 'Rajdhani', sans-serif; }
  label.field { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; }
  label.field > span { font: 500 11px/1 'Teko', sans-serif; letter-spacing: 1.6px; text-transform: uppercase; color: var(--muted); }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
  .check { display: flex; align-items: flex-start; gap: 10px; margin: 10px 0; font: 400 14px/1.5 'Rajdhani', sans-serif; color: var(--ink); }
  .check input { width: 18px; height: 18px; margin-top: 2px; accent-color: #ffffff; }
  .msg { font: 400 12px/1.5 'Rajdhani', sans-serif; color: var(--muted); min-height: 18px; margin: 10px 0 0; }
  .msg.is-ok  { color: var(--success); }
  .msg.is-err { color: var(--error); }
  .footer-note {
    margin-top: 60px; padding-top: 20px; border-top: 1px solid var(--hairline);
    font: 400 11px/1.5 'Rajdhani', sans-serif; color: var(--muted-soft); letter-spacing: 0.3px;
  }
  ${extraCss}
</style>
${extraHead}
</head>
<body>
${bodyHtml}
${extraJs ? `<script>${extraJs}</script>` : ''}
</body>
</html>`;
}

// Server-rendered watermark overlay. Tiled SVG, diagonal, per-viewer text.
function watermarkCss () {
  return `
  .wm {
    position: fixed; inset: 0; pointer-events: none; z-index: 50;
    background-image: var(--wm-url);
    background-repeat: repeat;
    background-size: 440px 240px;
    opacity: 0.22;
    mix-blend-mode: screen;
  }
  .wm--img {
    position: absolute; inset: 0; pointer-events: none;
    background-image: var(--wm-url); background-repeat: repeat; background-size: 300px 170px;
    opacity: 0.35; mix-blend-mode: screen;
  }
  .wm-shell { position: relative; display: inline-block; max-width: 100%; }
  .wm-shell > img, .wm-shell > video { display: block; max-width: 100%; height: auto; border-radius: 8px; }
  `;
}

function watermarkDataUrl (name, org, email, when) {
  const lineA = `${name} / ${org}`;
  const lineB = `${email} / ${when}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='440' height='240' viewBox='0 0 440 240'>
  <g transform='rotate(-24 220 120)' fill='rgba(255,255,255,0.9)' font-family='Teko, sans-serif' font-size='14' letter-spacing='3' text-anchor='middle'>
    <text x='220' y='110'>${esc(lineA)}</text>
    <text x='220' y='140'>${esc(lineB)}</text>
  </g>
</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function htmlResponse (html, extra = {}) {
  return {
    statusCode: extra.statusCode || 200,
    headers: Object.assign({
      'Content-Type':    'text/html; charset=utf-8',
      'Cache-Control':   'private, no-store, no-cache, must-revalidate',
      'X-Robots-Tag':    'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self' data: blob:; img-src 'self' data: https:; media-src 'self' blob: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'"
    }, extra.headers || {}),
    body: html
  };
}

function jsonResponse (status, obj, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: Object.assign({
      'Content-Type':  'application/json',
      'Cache-Control': 'private, no-store'
    }, extraHeaders),
    body: JSON.stringify(obj)
  };
}

function redirectResponse (location, extraHeaders = {}) {
  return {
    statusCode: 303,
    headers: Object.assign({
      Location: location,
      'Cache-Control': 'private, no-store'
    }, extraHeaders),
    body: ''
  };
}

module.exports = { page, htmlResponse, jsonResponse, redirectResponse, esc, watermarkCss, watermarkDataUrl };
