// Tiny markdown-to-HTML renderer. Supports: headings, paragraphs, ordered
// and bulleted lists, bold, italic, inline code, links, images, pipe-tables,
// HTML comments (preserved for panel markers), and raw <video> blocks that
// the brief uses for inline video. Enough for brief.md as it is today.
//
// NOT a full CommonMark parser: nested blocks (list in a quote, list in a
// list beyond one level) are not supported. The brief does not use them.

const { esc } = require('./html');

function escAttr (s) {
  return String(s).replace(/"/g, '&quot;');
}

function inline (text, opts) {
  // Preserve <video> tags that may be in the body already.
  let s = text;
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;');

  // Images: ![alt](src)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    return opts.onImage ? opts.onImage(alt, src) : `<img alt="${escAttr(alt)}" src="${escAttr(src)}">`;
  });
  // Links: [text](url). Keep internal/external, add target _blank for
  // absolute http(s) URLs.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => {
    const abs = /^https?:\/\//i.test(url);
    const attrs = abs ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escAttr(url)}"${attrs}>${txt}</a>`;
  });
  // Bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *x*
  s = s.replace(/(^|[^\*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Inline code `x`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function renderTable (rows, opts) {
  // Expect: ['| h1 | h2 |', '| --- | --- |', '| v1 | v2 |', ...]
  if (rows.length < 2) return '';
  const header = splitPipe(rows[0]);
  const sep    = rows[1];
  if (!/^\s*\|?\s*:?-{2,}:?/.test(sep)) return ''; // not a real table
  const bodyRows = rows.slice(2).map(splitPipe);
  const thead = `<thead><tr>${header.map(h => `<th>${inline(h.trim(), opts)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows.map(r =>
    `<tr>${r.map(c => `<td>${inline(c.trim(), opts)}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

function splitPipe (line) {
  const t = line.trim();
  const noEdges = t.replace(/^\|/, '').replace(/\|$/, '');
  return noEdges.split('|');
}

function render (md, opts = {}) {
  const onImage = opts.onImage || null;
  const onVideo = opts.onVideo || null;
  const onPanel = opts.onPanel || null;
  const ioInline = { onImage };

  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  // Skip YAML frontmatter.
  if (lines[0] && /^---\s*$/.test(lines[0])) {
    i = 1;
    while (i < lines.length && !/^---\s*$/.test(lines[i])) i++;
    i++; // past the closing ---
  }

  while (i < lines.length) {
    const line = lines[i];

    // Panel markers like <!-- DOWNLOADS PANEL --> or <!-- UPLOADS PANEL -->.
    const mPanel = line.match(/^<!--\s*(DOWNLOADS|UPLOADS)\s*PANEL/i);
    if (mPanel) {
      out.push(onPanel ? onPanel(mPanel[1].toUpperCase()) : `<!-- ${mPanel[1]} PANEL -->`);
      i++;
      continue;
    }

    // Raw video block.
    const mVid = line.match(/^<video\s+src="([^"]+)"[^>]*>/i);
    if (mVid) {
      out.push(onVideo ? onVideo(mVid[1]) : line);
      // skip until </video> on its own line
      while (i < lines.length && !/<\/video>/i.test(lines[i])) i++;
      i++; // past </video>
      continue;
    }

    // Headings
    const mH = line.match(/^(#{1,6})\s+(.*)$/);
    if (mH) {
      const level = mH[1].length;
      out.push(`<h${level}>${inline(mH[2].trim(), ioInline)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\s*[-_*]\s*){3,}$/.test(line)) { out.push('<hr>'); i++; continue; }

    // Blank line
    if (/^\s*$/.test(line)) { i++; continue; }

    // Pipe table
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?/.test(lines[i+1])) {
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { buf.push(lines[i]); i++; }
      out.push(renderTable(buf, ioInline));
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        let item = m[1];
        i++;
        // continuation lines (indented at least 2 spaces) merge into the item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) { item += ' ' + lines[i].trim(); i++; }
        items.push(`<li>${inline(item, ioInline)}</li>`);
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Bullet list (-, *, +)
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        let item = m[1];
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) { item += ' ' + lines[i].trim(); i++; }
        items.push(`<li>${inline(item, ioInline)}</li>`);
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote><p>${inline(buf.join(' '), ioInline)}</p></blockquote>`);
      continue;
    }

    // Paragraph (merge until blank)
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*\|/.test(lines[i]) && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(' '), ioInline)}</p>`);
  }

  return out.join('\n');
}

// Extract YAML frontmatter as a dict (shallow strings only).
function frontmatter (md) {
  const out = {};
  const lines = md.split(/\r?\n/);
  if (!lines[0] || !/^---\s*$/.test(lines[0])) return out;
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) break;
    const m = lines[i].match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (m) {
      let v = m[2].trim();
      v = v.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      out[m[1]] = v;
    }
  }
  return out;
}

module.exports = { render, frontmatter };
