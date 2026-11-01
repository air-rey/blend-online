// GET /.netlify/functions/not-signatory
// Called from the agreement page when the person opening the link is not
// authorised to sign. Emails airem@blendxr.online, keeps content locked,
// then shows a short confirmation page.

const { readSession } = require('./_lib/cookie');
const { page, htmlResponse } = require('./_lib/html');
const { supa } = require('./_lib/supa');
const { send } = require('./_lib/email');

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return { statusCode: 303, headers: { Location: '/' }, body: '' };

  try {
    await send({
      to: 'airem@blendxr.online',
      subject: `BlendXR deal room: ${session.email} is not the signatory`,
      text: `${session.name || session.email} opened the agreement for resource ${session.resource_slug} but says they are not authorised to sign. Please follow up.`
    });
  } catch (err) { console.warn('not-signatory email failed', err); }

  if (session.grant_id) {
    await supa().from('events').insert({
      grant_id: session.grant_id, kind: 'not_signatory',
      meta: { email: session.email }
    }).catch(() => {});
  }

  return htmlResponse(page({
    title: 'Noted.',
    bodyHtml: `
<div class="layout" style="text-align:center;">
  <h1>Noted.</h1>
  <p>Thanks. We will contact the authorised signatory for your organisation.</p>
  <p><a class="btn btn--ghost" href="/">Back to gate</a></p>
</div>`
  }));
};
