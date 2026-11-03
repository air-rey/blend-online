// Scheduled: Day 0 missed-tick reminder for Shivam at Volga Infosys.
//
// Runs every day via the schedule in netlify.toml. Each run:
//
//   1. Checks whether today (UTC) is on or after the day AFTER the Day 0
//      due date (DAY0_DUE_DATE). Before then, no-op.
//   2. Looks up Shivam's live grant on volga-test-scene.
//   3. Checks checkpoint_status for the Day 0 checkpoint on that grant.
//      If the ticked_at row exists, no-op.
//   4. Checks events for a prior `day0_missed_reminder_sent` on that
//      grant. If one exists, no-op (one-shot guard).
//   5. Otherwise: emails airem@blendxr.online once, inserts the sentinel
//      event, returns `{ reminded: true }`.
//
// Netlify also exposes it as a plain HTTP function so we can trigger it
// by hand during QA with
//   curl -X POST https://blendxr.online/.netlify/functions/day0-reminder

const { supa } = require('./_lib/supa');
const { send } = require('./_lib/email');

const VOLGA_SLUG     = 'volga-test-scene';
const SHIVAM_EMAIL   = 'shivam@volgainfosys.com';
const DAY0_DUE_DATE  = '2026-11-06'; // end-of-day UTC

function todayUtcDate () {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

exports.handler = async function () {
  const today = todayUtcDate();
  if (today <= DAY0_DUE_DATE) {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'before_due', today, DAY0_DUE_DATE }) };
  }

  const db = supa();

  // Resolve Shivam -> grant on volga-test-scene.
  const { data: person } = await db.from('people')
    .select('id').eq('email', SHIVAM_EMAIL).maybeSingle();
  if (!person) {
    console.warn('day0-reminder: Shivam person row missing');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'no_person' }) };
  }

  const { data: resource } = await db.from('resources')
    .select('id').eq('slug', VOLGA_SLUG).maybeSingle();
  if (!resource) {
    console.warn('day0-reminder: Volga resource missing');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'no_resource' }) };
  }

  const { data: grant } = await db.from('grants')
    .select('id').eq('resource_id', resource.id).eq('person_id', person.id)
    .is('revoked_at', null).order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (!grant) {
    console.warn('day0-reminder: no live grant for Shivam');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'no_grant' }) };
  }

  // Already ticked? no-op.
  const { data: day0cp } = await db.from('checkpoints')
    .select('id').eq('resource_id', resource.id).eq('day', 0).maybeSingle();
  if (day0cp) {
    const { data: cs } = await db.from('checkpoint_status')
      .select('ticked_at').eq('grant_id', grant.id).eq('checkpoint_id', day0cp.id).maybeSingle();
    if (cs && cs.ticked_at) {
      return { statusCode: 200, body: JSON.stringify({ skipped: 'day0_already_ticked' }) };
    }
  }

  // One-shot guard: have we already emailed on this grant?
  const { data: prior } = await db.from('events')
    .select('id').eq('grant_id', grant.id).eq('kind', 'day0_missed_reminder_sent')
    .limit(1).maybeSingle();
  if (prior) {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'already_reminded' }) };
  }

  // Send the one reminder, then record the sentinel so we never double-fire.
  try {
    await send({
      to: 'airem@blendxr.online',
      subject: `BlendXR x Volga — Day 0 missed by Shivam (${today})`,
      text: `Shivam has not ticked the Day 0 confirmation on the Volga brief by the end of ${DAY0_DUE_DATE} UTC.\n\nReach out to Shivam at ${SHIVAM_EMAIL}. The brief and the checkbox remain available at https://blendxr.online/r.\n\nThis email is sent once per grant; this scheduled job will not email again for this grant.`
    });
  } catch (err) {
    console.error('day0-reminder: email failed, not recording sentinel so we retry tomorrow', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'email_failed' }) };
  }

  await db.from('events').insert({
    grant_id: grant.id, kind: 'day0_missed_reminder_sent',
    meta: { at: new Date().toISOString(), to: 'airem@blendxr.online', due_date: DAY0_DUE_DATE }
  }).then(() => {}, () => {});

  return { statusCode: 200, body: JSON.stringify({ reminded: true, grant: grant.id }) };
};
