// Resend wrapper. We POST directly to the REST API so the function stays
// small and dep-free beyond fetch. One function per transactional email.
async function send ({ to, subject, html, text, attachments, replyTo }) {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'BlendXR <noreply@blendxr.online>';
  if (!key) {
    console.warn('RESEND_API_KEY missing. Skipping email to:', to);
    return { skipped: true };
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
  return await res.json();
}

module.exports = { send };
