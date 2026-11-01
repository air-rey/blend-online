// PDF generation for the executed contractor agreement.
//
// Produces a multi-page PDF: cover + full agreement text + contractor fields
// + Exhibit B + both signature blocks + audit page. Rendered with pdf-lib
// (no headless browser needed; runs happily in a Netlify Function).
//
// Font: PDF built-in Helvetica (and bold) for maximum portability and
// smallest bundle. The agreement is legal text in English, no Teko/Sarpanch
// needed inside the PDF.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_W = 595.28;  // A4 width in points
const PAGE_H = 841.89;  // A4 height
const MARGIN = 56;      // ~20mm
const BODY_WIDTH = PAGE_W - MARGIN * 2;
const LINE_HEIGHT = 13.6;
const BODY_SIZE = 10;
const H1_SIZE = 16;
const H2_SIZE = 12;

function wrap (text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildExecutedPdf ({ agreementText, agreementVersion, agreementSha256,
                                   contractor, exhibitB, signer, blendxr, auditRecord }) {
  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const bold     = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic   = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage () {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace (n) {
    if (y - n < MARGIN) newPage();
  }

  function drawLine (text, { font: f = font, size = BODY_SIZE, color = rgb(0.1, 0.1, 0.1), gap = LINE_HEIGHT } = {}) {
    ensureSpace(gap);
    page.drawText(text, { x: MARGIN, y, size, font: f, color });
    y -= gap;
  }

  function drawParagraph (text, opts = {}) {
    const f = opts.font || font;
    const size = opts.size || BODY_SIZE;
    const gap = opts.gap || LINE_HEIGHT;
    const lines = wrap(text, f, size, BODY_WIDTH);
    for (const l of lines) drawLine(l, { font: f, size, gap });
  }

  function hr (gapBefore = 10, gapAfter = 10) {
    ensureSpace(gapBefore + 1 + gapAfter);
    y -= gapBefore;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5, color: rgb(0.65, 0.65, 0.65) });
    y -= gapAfter;
  }

  // Cover block
  drawLine('EXECUTED COPY', { font: bold, size: 9, gap: 18 });
  drawLine('Independent Contractor, Confidentiality and', { font: bold, size: H1_SIZE, gap: 20 });
  drawLine('Intellectual Property Assignment Agreement',   { font: bold, size: H1_SIZE, gap: 24 });

  drawLine(`Between:  BlendXR  ("Company")`, { gap: LINE_HEIGHT });
  drawLine(`And:      ${contractor.legalName || '[Contractor]'}  ("Contractor")`, { gap: LINE_HEIGHT });
  drawLine(`Dated:    ${new Date(auditRecord.signedAt).toUTCString()}`, { gap: LINE_HEIGHT });
  drawLine(`Version:  ${agreementVersion}`, { gap: LINE_HEIGHT });
  drawLine(`SHA-256:  ${agreementSha256}`, { font: italic, size: 8, gap: 12 });
  hr();

  // Agreement body
  const paras = agreementText.split(/\n\s*\n/);
  for (const p of paras) {
    const clean = p.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    // Numbered section headings (e.g. "1.  Confidential Information. ...")
    const mSec = clean.match(/^(\d{1,2})\.\s+([^\.]{1,60}\.)\s*(.*)$/);
    if (mSec && mSec[2].length < 60) {
      ensureSpace(LINE_HEIGHT + 4);
      drawLine(`${mSec[1]}. ${mSec[2]}`, { font: bold, size: H2_SIZE, gap: LINE_HEIGHT + 2 });
      if (mSec[3]) drawParagraph(mSec[3]);
      drawLine('', { gap: 4 });
      continue;
    }
    // All-caps PART headers. PART A flows inline below the cover block;
    // any later PART (e.g. PART B: SIGNATURES) renders on a fresh page so
    // its attestation text stays together with the signature data block
    // rendered after this loop — no orphaned half pages.
    if (/^PART [A-Z]:/.test(clean)) {
      if (/^PART A:/.test(clean)) ensureSpace(LINE_HEIGHT + 8);
      else newPage();
      drawLine(clean, { font: bold, size: H2_SIZE + 1, gap: LINE_HEIGHT + 6 });
      continue;
    }
    drawParagraph(clean);
    drawLine('', { gap: 4 });
  }

  // Signature data block. Flows directly after the Part B attestation
  // text above (which starts on a fresh page via the PART handler), so
  // the whole signature section stays together.
  drawLine('', { gap: 12 });
  drawLine('SIGNATURES', { font: bold, size: H2_SIZE, gap: 20 });
  drawLine('On behalf of Blendtobases OÜ, represented as BlendXR:', { gap: LINE_HEIGHT });
  drawLine(`Name:  ${blendxr.name}`, { gap: LINE_HEIGHT });
  drawLine(`Title: ${blendxr.title}`, { gap: LINE_HEIGHT });
  drawLine(`Date:  ${blendxr.date}`, { gap: LINE_HEIGHT });
  drawLine('Signed electronically.', { font: italic, size: 9, gap: 18 });

  drawLine(`On behalf of ${contractor.legalName}:`, { gap: LINE_HEIGHT });
  drawLine(`Name:  ${signer.name}`, { gap: LINE_HEIGHT });
  drawLine(`Title: ${signer.title}`, { gap: LINE_HEIGHT });
  drawLine(`Date:  ${new Date(auditRecord.signedAt).toUTCString()}`, { gap: LINE_HEIGHT });
  drawLine('Signed electronically.', { font: italic, size: 9, gap: 18 });

  // Contractor fields
  hr();
  drawLine('CONTRACTOR DETAILS', { font: bold, size: H2_SIZE, gap: 16 });
  const kv = [
    ['Legal name',          contractor.legalName],
    ['Entity type',         contractor.entityType],
    ['Registration number', contractor.registrationNumber],
    ['PAN',                 contractor.pan],
    ['Principal place of business', contractor.address],
    ['Country',             contractor.country || 'India']
  ];
  for (const [k, v] of kv) {
    drawParagraph(`${k}: ${v || '(not provided)'}`);
  }

  // Exhibit B
  hr();
  drawLine('EXHIBIT B: Background IP and prior inventions', { font: bold, size: H2_SIZE, gap: 16 });
  if (exhibitB.none) {
    drawParagraph('The Contractor confirms there is NO Background IP or prior inventions to list for this engagement.');
  } else if (exhibitB.items && exhibitB.items.length) {
    exhibitB.items.forEach((it, idx) => drawParagraph(`${idx + 1}. ${it}`));
  } else if (exhibitB.text) {
    drawParagraph(exhibitB.text);
  } else {
    drawParagraph('(none)');
  }

  // Audit page
  newPage();
  drawLine('AUDIT RECORD', { font: bold, size: H2_SIZE, gap: 20 });
  drawParagraph(`This copy was executed electronically on blendxr.online, in accordance with Section 21 (Miscellaneous) of the Agreement, which permits electronic execution and counterparts.`);
  drawLine('', { gap: 10 });
  const audit = [
    ['Signer legal name', contractor.legalName],
    ['Signer name',       signer.name],
    ['Signer title',      signer.title],
    ['Signer email',      auditRecord.email],
    ['Timestamp (UTC)',   new Date(auditRecord.signedAt).toISOString()],
    ['IP address',        auditRecord.ip],
    ['User agent',        auditRecord.userAgent],
    ['Agreement version', agreementVersion],
    ['Agreement SHA-256', agreementSha256]
  ];
  for (const [k, v] of audit) {
    drawParagraph(`${k}: ${v || '(unknown)'}`, { size: 9 });
  }
  drawLine('', { gap: 8 });
  drawParagraph(`Record ID: ${auditRecord.id}`, { font: italic, size: 9 });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function buildMutualNdaPdf ({ ndaText, ndaVersion, ndaSha256,
                                   counterparty, signer, blendxr, auditRecord }) {
  const pdf = await PDFDocument.create();
  const font   = await pdf.embedFont(StandardFonts.Helvetica);
  const bold   = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage () { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  function ensureSpace (n) { if (y - n < MARGIN) newPage(); }
  function drawLine (text, { font: f = font, size = BODY_SIZE, color = rgb(0.1, 0.1, 0.1), gap = LINE_HEIGHT } = {}) {
    ensureSpace(gap);
    page.drawText(text, { x: MARGIN, y, size, font: f, color });
    y -= gap;
  }
  function drawParagraph (text, opts = {}) {
    const f = opts.font || font;
    const size = opts.size || BODY_SIZE;
    const gap = opts.gap || LINE_HEIGHT;
    const lines = wrap(text, f, size, BODY_WIDTH);
    for (const l of lines) drawLine(l, { font: f, size, gap });
  }
  function hr (gapBefore = 10, gapAfter = 10) {
    ensureSpace(gapBefore + 1 + gapAfter);
    y -= gapBefore;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5, color: rgb(0.65, 0.65, 0.65) });
    y -= gapAfter;
  }

  // Cover block
  drawLine('EXECUTED COPY', { font: bold, size: 9, gap: 18 });
  drawLine('Mutual Non-Disclosure Agreement', { font: bold, size: H1_SIZE, gap: 24 });

  drawLine(`Between:  BlendXR  ("BlendXR")`, { gap: LINE_HEIGHT });
  drawLine(`And:      ${counterparty.legalName || '[Counterparty]'}  ("Counterparty")`, { gap: LINE_HEIGHT });
  drawLine(`Dated:    ${new Date(auditRecord.signedAt).toUTCString()}`, { gap: LINE_HEIGHT });
  drawLine(`Version:  ${ndaVersion}`, { gap: LINE_HEIGHT });
  drawLine(`SHA-256:  ${ndaSha256}`, { font: italic, size: 8, gap: 12 });
  hr();

  // NDA body
  const paras = ndaText.split(/\n\s*\n/);
  for (const p of paras) {
    const clean = p.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const mSec = clean.match(/^(\d{1,2})\.\s+([^\.]{1,60}\.)\s*(.*)$/);
    if (mSec && mSec[2].length < 60) {
      ensureSpace(LINE_HEIGHT + 4);
      drawLine(`${mSec[1]}. ${mSec[2]}`, { font: bold, size: H2_SIZE, gap: LINE_HEIGHT + 2 });
      if (mSec[3]) drawParagraph(mSec[3]);
      drawLine('', { gap: 4 });
      continue;
    }
    // PART A flows inline below the cover block; any later PART (e.g.
    // PART B: SIGNATURES) renders on a fresh page so its attestation text
    // stays together with the signature data block below.
    if (/^PART [A-Z]:/.test(clean)) {
      if (/^PART A:/.test(clean)) ensureSpace(LINE_HEIGHT + 8);
      else newPage();
      drawLine(clean, { font: bold, size: H2_SIZE + 1, gap: LINE_HEIGHT + 6 });
      continue;
    }
    drawParagraph(clean);
    drawLine('', { gap: 4 });
  }

  // Signature data block. Flows directly after the Part B attestation
  // text above (which starts on a fresh page via the PART handler), so
  // the whole signature section stays together.
  drawLine('', { gap: 12 });
  drawLine('SIGNATURES', { font: bold, size: H2_SIZE, gap: 20 });
  drawLine('On behalf of Blendtobases OÜ, represented as BlendXR:', { gap: LINE_HEIGHT });
  drawLine(`Name:  ${blendxr.name}`, { gap: LINE_HEIGHT });
  drawLine(`Title: ${blendxr.title}`, { gap: LINE_HEIGHT });
  drawLine(`Date:  ${blendxr.date}`, { gap: LINE_HEIGHT });
  drawLine('Signed electronically.', { font: italic, size: 9, gap: 18 });

  drawLine(`On behalf of ${counterparty.legalName}:`, { gap: LINE_HEIGHT });
  drawLine(`Name:  ${signer.name}`, { gap: LINE_HEIGHT });
  drawLine(`Title: ${signer.title}`, { gap: LINE_HEIGHT });
  drawLine(`Date:  ${new Date(auditRecord.signedAt).toUTCString()}`, { gap: LINE_HEIGHT });
  drawLine('Signed electronically.', { font: italic, size: 9, gap: 18 });

  hr();
  drawLine('COUNTERPARTY DETAILS', { font: bold, size: H2_SIZE, gap: 16 });
  const kv = [
    ['Organisation',  counterparty.legalName],
    ['Signer email',  auditRecord.email],
    ['Country',       counterparty.country || '(not provided)']
  ];
  for (const [k, v] of kv) drawParagraph(`${k}: ${v || '(not provided)'}`);

  // Audit page
  newPage();
  drawLine('AUDIT RECORD', { font: bold, size: H2_SIZE, gap: 20 });
  drawParagraph('This copy was executed electronically on blendxr.online, in accordance with Section 14 (Electronic execution), which permits electronic execution and counterparts.');
  drawLine('', { gap: 10 });
  const audit = [
    ['Signer legal name', counterparty.legalName],
    ['Signer name',    signer.name],
    ['Signer title',   signer.title],
    ['Signer email',   auditRecord.email],
    ['Timestamp (UTC)', new Date(auditRecord.signedAt).toISOString()],
    ['IP address',     auditRecord.ip],
    ['User agent',     auditRecord.userAgent],
    ['NDA version',    ndaVersion],
    ['NDA SHA-256',    ndaSha256]
  ];
  for (const [k, v] of audit) drawParagraph(`${k}: ${v || '(unknown)'}`, { size: 9 });
  drawLine('', { gap: 8 });
  drawParagraph(`Record ID: ${auditRecord.id}`, { font: italic, size: 9 });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

module.exports = { buildExecutedPdf, buildMutualNdaPdf };
