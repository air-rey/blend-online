// Resend wrapper. We POST directly to the REST API so the function stays
// small and dep-free beyond fetch. One function per transactional email.
//
// A missing RESEND_API_KEY now throws rather than silently returning
// { skipped: true }. Callers already wrap send() in try/catch, so loud
// failure is safe: the rest of their flow continues, console shows the
// cause, and scheduled senders (day0-reminder) don't record a "sent"
// sentinel for a mail that never left the box.
async function send ({ to, subject, html, text, attachments, replyTo }) {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'BlendXR <noreply@blendxr.online>';
  if (!key) {
    throw new Error('RESEND_API_KEY missing');
  }
  const body = { from, to: Array.isArray(to) ? to : [to], subject };
  if (html) body.html = html;
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;
  if (attachments && attachments.length) body.attachments = attachments;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  const data = await res.json();
  // Log the Resend id so we have a lookup handle in Resend's dashboard
  // without logging the recipient list beyond what the subject already
  // reveals.
  console.log('resend ok', { id: data && data.id, from, subject });
  return data;
}

module.exports = { send };
