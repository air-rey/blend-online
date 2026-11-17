# ApexDream confined space brief page: build notes for blendxr.online

These notes cover only this resource. The site-wide rules (gate, tokens, watermark, headers, storage) come from the deal room spec and are not repeated here.

## Resource

| Field | Value |
| --- | --- |
| Type | `brief` |
| Slug (admin only, never in the URL) | `apexdream-confined-space` |
| Access URL | `blendxr.online/r/<token>`, one token per invited contact at ApexDream |
| Agreement | Shared contractor-agreement template at `private-content/_shared/agreement.txt.template`. ApexDream requires `agreementVersion` `2026-11-17` (see `netlify/functions/_lib/resources.js`); the signer fills in their org details on the form and `agreement.js` substitutes the per-resource brief title and delivery phrase at render time. |
| Content | `brief.md` (this folder), rendered in the BlendXR design system |
| Expires | Day 0 + 14 calendar days (grant `expires_at`). Pre-tick default is 2026-12-03 (the 2026-11-19 IST Day 0 deadline + 14 days). `upload-notify.js` bumps this to `tick_date + 14` the moment Day 0 is actually ticked. |

## Page flow

1. **Token check.** Valid token for this resource and email, or back to the gate.
2. **Agreement step.** Show the full agreement text. The signer types their full name, title and company legal name, and ticks "I am authorized to sign for ApexDream". Store name, title, email, timestamp (UTC), IP, user agent, and a SHA-256 hash of the agreement file version shown. No content renders before this succeeds.
3. **Brief.** Render `brief.md` top to bottom. Two HTML comments in it mark where panels go:
   - `<!-- DOWNLOADS PANEL -->` after the Assets section
   - `<!-- UPLOADS PANEL -->` at the end of Communication, before Sources
4. **Downloads panel.** Short-lived signed URLs only.
5. **Uploads panel.** Interactive checklist (below).

## Media in the brief

| Path in brief.md | File | Notes |
| --- | --- | --- |
| `media/highlight-pulse-ref.mp4`      | `highlight-pulse-ref.mp4`      | Inline video, muted, loop, no download control, overlay watermark. Shared pulse-reference clip. |
| `media/confined-space-start.jpg`     | `confined-space-start.jpg`     | AI-generated chamber reference, inline + watermarked. |
| `media/confined-space-ladder.jpg`    | `confined-space-ladder.jpg`    | AI-generated ladder reference, inline + watermarked. |

## Downloads panel

| Label | File |
| --- | --- |
| S1 Room hum  | `hum-electric.mp3` |
| S2 Air duct  | `fan-off.m4a` |
| S3 App start | `EnterApp.mp3` |
| S4 Gas alarm | `carbon-monoxide-detector.m4a` |

`hum-electric.mp3` and `EnterApp.mp3` are shared sound files; `fan-off.m4a` and `carbon-monoxide-detector.m4a` are specific to this brief.

Log every download (who, file, time).

The Fab-sourced packs listed in the brief (Hospital Generator, Gloves, Flexible Duct Tubes, Detector Beep, Metal Ladder, Warehouse) are NOT downloaded through the deal room: ApexDream pulls them from BlendXR's Fab account. See brief.md.

## Uploads panel: interactive checklist

Two rows. Per-resource checkpoint config lives in `netlify/functions/_lib/resources.js`; the Demo APK row carries `dueBusinessDays: 7` and a `dueText` placeholder because its due date is "Day 0 + 7 business days (Mon–Fri)", not a simple calendar offset.

| Day | Checkpoint | Accepts | Required files |
| --- | --- | --- | --- |
| 0 | Start confirmation | No upload. Checkbox only: "We can access every asset and the setup works." Ticking it emails airem@blendxr.online and vedika@blendxr.online, and stamps the time as day 0. | None |
| 7 | Demo APK          | `.apk` | Full flow from fade-in to app quit with all three gaze targets, pulses, timings and both exits. Due Day 0 + 7 business days (Mon–Fri). |

- Uploads are versioned, never overwritten. Show the partner only filename, size, time and a status of Received, then Reviewed or Changes requested (set by BlendXR in admin).
- The Demo APK can be several hundred MB: use resumable uploads, per the deal room spec.
- Pre-tick, the Demo APK row shows the `dueText` placeholder. Once Day 0 is ticked, `brief.js` renders the exact calendar date computed as `addBusinessDays(tick_date, 7)` (skipping Sat/Sun).

## Day 0 reminder

The scheduled Netlify Function `netlify/functions/day0-reminder.js` iterates over its REMINDERS array; the ApexDream entry has due date 2026-11-19 IST. If Aashish has not ticked Day 0 by end of that day, the cron sends a one-shot email to airem@blendxr.online and inserts an `events` row (`kind: "day0_missed_reminder_sent"`) keyed by the deadline so it does not fire twice.

## Do not render

- The Fab login. It goes by email from airem only, and its password is changed once ApexDream confirms the download.
- Any reference to scoring, metrics or the portal beyond what the brief already says.
