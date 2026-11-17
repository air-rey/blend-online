// Scheduled: Day 0 missed-tick reminder.
//
// Runs every day via the schedule in netlify.toml. Each run iterates
// over REMINDERS (one entry per brief) and for each one:
//
//   1. Checks whether today (UTC) is after the entry's due date. On or
//      before, no-op for that entry.
//   2. Looks up the invited person's live grant on the resource.
//   3. Checks checkpoint_status for the Day 0 checkpoint on that grant.
//      If the ticked_at row exists, no-op.
//   4. Checks events for a prior `day0_missed_reminder_sent` on that
//      grant WHOSE meta.due_date MATCHES THE ENTRY'S due_date. If one
//      exists, no-op. The sentinel is keyed by (grant_id, due_date) so
//      a historical row for an earlier deadline does not block a
//      current reminder.
//   5. Otherwise: emails airem@blendxr.online once, inserts the sentinel
//      event.
//
// This function is scheduled in netlify.toml, which makes Netlify treat
// it as internal-only: public HTTP requests get a 403 at the edge. To
// confirm end-to-end delivery without waiting for a real missed Day 0,
// use netlify/functions/day0-reminder-test.js. The ?test=1 branch below
// is kept so an internal invocation (future Netlify CLI, or an internal
// trigger) can still exercise send() here without touching DB state.

const { supa } = require('./_lib/supa');
const { send } = require('./_lib/email');

const REMINDERS = [
  {
    slug:        'volga-test-scene',
    personEmail: 'shivam@volgainfosys.com',
    contactName: 'Shivam',
    // end-of-day IST (= 2026-11-14 18:30 UTC). Daily cron at 09:00 UTC
    // fires the first eligible reminder on 2026-11-15. Volga finished
    // Fab setup on 14 Nov IST, pushing from 11-11.
    dueDate:     '2026-11-14'
  },
  {
    slug:        'apexdream-confined-space',
    personEmail: 'aashish@apexdreamstudio.com',
    // The signer on the agreement is Aashish Sharma (CEO), so address
    // the reminder to Aashish by name.
    contactName: 'Aashish',
    // ApexDream reduced-scope revision (2026-11-17): Day 0 checkbox is
    // due end of 2026-11-19 IST. Daily cron at 09:00 UTC fires the
    // first eligible reminder on 2026-11-20.
    dueDate:     '2026-11-19'
  }
];

function todayUtcDate () {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isTestMode (event) {
  const q = event && event.queryStringParameters;
  if (!q) return false;
  const v = q.test;
  return v === '1' || v === 'true';
}

async function sendDeliveryTest (today) {
  const r = await send({
    to: 'airem@blendxr.online',
    subject: `BlendXR — Day 0 reminder delivery test (${today})`,
    text: `This is a delivery test from the day0-reminder function run at ${new Date().toISOString()}.\n\nIf you see this in your inbox, the Resend path works. If you only see it in Spam, the live reminders would land there too.\n\nNo sentinel event was recorded for this message.`
  });
  return r;
}

// One reminder check for one REMINDERS entry. Returns a result object;
// the scheduled run collects them and returns one combined response.
async function processEntry (db, entry, today) {
  if (today <= entry.dueDate) {
    return { slug: entry.slug, skipped: 'before_due', today, dueDate: entry.dueDate };
  }

  const { data: person } = await db.from('people')
    .select('id').eq('email', entry.personEmail).maybeSingle();
  if (!person) {
    console.warn(`day0-reminder[${entry.slug}]: person row missing (${entry.personEmail})`);
    return { slug: entry.slug, skipped: 'no_person' };
  }

  const { data: resource } = await db.from('resources')
    .select('id').eq('slug', entry.slug).maybeSingle();
  if (!resource) {
    console.warn(`day0-reminder[${entry.slug}]: resource missing`);
    return { slug: entry.slug, skipped: 'no_resource' };
  }

  const { data: grant } = await db.from('grants')
    .select('id').eq('resource_id', resource.id).eq('person_id', person.id)
    .is('revoked_at', null).order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (!grant) {
    console.warn(`day0-reminder[${entry.slug}]: no live grant for ${entry.personEmail}`);
    return { slug: entry.slug, skipped: 'no_grant' };
  }

  // Already ticked?
  const { data: day0cp } = await db.from('checkpoints')
    .select('id').eq('resource_id', resource.id).eq('day', 0).maybeSingle();
  if (day0cp) {
    const { data: cs } = await db.from('checkpoint_status')
      .select('ticked_at').eq('grant_id', grant.id).eq('checkpoint_id', day0cp.id).maybeSingle();
    if (cs && cs.ticked_at) {
      return { slug: entry.slug, skipped: 'day0_already_ticked' };
    }
  }

  // Sentinel keyed by (grant_id, meta.due_date).
  const { data: prior } = await db.from('events')
    .select('id').eq('grant_id', grant.id).eq('kind', 'day0_missed_reminder_sent')
    .eq('meta->>due_date', entry.dueDate).limit(1).maybeSingle();
  if (prior) {
    return { slug: entry.slug, skipped: 'already_reminded', due_date: entry.dueDate };
  }

  try {
    await send({
      to: 'airem@blendxr.online',
      subject: `BlendXR x ${entry.slug} — Day 0 missed by ${entry.contactName} (${today})`,
      text: `${entry.contactName} has not ticked the Day 0 confirmation on the ${entry.slug} brief by the end of ${entry.dueDate} IST.\n\nReach out to ${entry.contactName} at ${entry.personEmail}. The brief and the checkbox remain available at https://blendxr.online/r.\n\nThis email is sent once per grant per deadline; this scheduled job will not email again for deadline ${entry.dueDate}.`
    });
  } catch (err) {
    console.error(`day0-reminder[${entry.slug}]: email failed, not recording sentinel so we retry tomorrow`, err);
    return { slug: entry.slug, error: 'email_failed', message: String(err && err.message || err) };
  }

  await db.from('events').insert({
    grant_id: grant.id, kind: 'day0_missed_reminder_sent',
    meta: { at: new Date().toISOString(), to: 'airem@blendxr.online', slug: entry.slug, due_date: entry.dueDate }
  }).then(() => {}, () => {});

  return { slug: entry.slug, reminded: true, grant: grant.id, due_date: entry.dueDate };
}

exports.handler = async function (event) {
  const today = todayUtcDate();

  // Test mode: send one delivery-test email, no DB writes.
  if (isTestMode(event)) {
    try {
      const resend = await sendDeliveryTest(today);
      return {
        statusCode: 200,
        body: JSON.stringify({ test: true, sent: true, resend })
      };
    } catch (err) {
      console.error('day0-reminder test send failed', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ test: true, sent: false, error: String(err && err.message || err) })
      };
    }
  }

  const db = supa();
  const results = [];
  let anyErr = false;
  for (const entry of REMINDERS) {
    const r = await processEntry(db, entry, today);
    if (r && r.error) anyErr = true;
    results.push(r);
  }
  return {
    statusCode: anyErr ? 500 : 200,
    body: JSON.stringify({ today, results })
  };
};
