// HTTP-only sibling of day0-reminder.js for delivery tests.
//
// Netlify treats scheduled functions as internal-only and returns 403
// to public HTTP, so the ?test=1 branch inside day0-reminder.js is only
// callable from inside Netlify's cron, not with curl. This function is
// NOT scheduled, so it responds to plain HTTP requests, calls send()
// with the same from/to/subject shape as the live Day 0 missed reminder,
// and returns Resend's response verbatim so we can read the delivery id
// or the error cause.
//
//   curl -i -X POST https://blendxr.online/.netlify/functions/day0-reminder-test
//
// No database state is touched here. This function exists only to let a
// person confirm end-to-end delivery (and inbox vs. spam placement)
// without waiting for a real missed Day 0.

const { send } = require('./_lib/email');

exports.handler = async function () {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  try {
    const resend = await send({
      to: 'airem@blendxr.online',
      subject: `BlendXR — Day 0 reminder delivery test (${today})`,
      text: `Delivery test from day0-reminder-test at ${now.toISOString()}.\n\nThis uses the same from/to/subject shape as the live Day 0 missed-tick reminder, so inbox vs. spam placement here matches what the real reminder would see. No sentinel event was recorded.`
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ test: true, sent: true, resend })
    };
  } catch (err) {
    console.error('day0-reminder-test failed', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ test: true, sent: false, error: String(err && err.message || err) })
    };
  }
};
