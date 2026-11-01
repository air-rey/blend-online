// GET /my-nda : the user-facing NDA download was removed. BlendXR emails
// each counterparty their countersigned copy once Vedika (as the BlendXR
// signatory) has added her signature manually. This endpoint stays so
// bookmarked links don't 404; it renders a short notice instead of serving
// a PDF.
//
// The server-side PDF generation in nda.js still runs and stores a copy
// to the `agreements` bucket (used by Vedika/Airem to compose the
// countersigned PDF). Only the public download path is gone.

const { readSession } = require('./_lib/cookie');
const { page, htmlResponse, redirectResponse } = require('./_lib/html');

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return redirectResponse('/');

  const html = page({
    title: 'Signed NDA',
    bodyHtml: `
<main style="max-width:640px; margin:72px auto; padding:0 20px; text-align:center;">
  <h1 style="margin:0 0 16px;">Signed NDA</h1>
  <p style="color:var(--body);">A countersigned PDF will be sent to your email shortly. If you don't see it within a day, email <a href="mailto:airem@blendxr.online">airem@blendxr.online</a>.</p>
  <p style="margin-top:28px;"><a class="btn btn--ghost" href="/r">Back to the brief</a></p>
</main>`
  });
  return htmlResponse(html);
};
