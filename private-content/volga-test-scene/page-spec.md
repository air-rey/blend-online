# Volga brief page: build notes for blendxr.online

These notes cover only this resource. The site-wide rules (gate, tokens, watermark, headers, storage) come from the deal room spec and are not repeated here.

## Resource

| Field | Value |
| --- | --- |
| Type | `brief` |
| Slug (admin only, never in the URL) | `volga-test-scene` |
| Access URL | `blendxr.online/r`, gated by the session cookie minted after the agreement |
| Agreement | `BlendXR_Volga_Test_Agreement_v3.docx` (test agreement, not the mutual NDA). Current text in `private-content/volga-test-scene/agreement.txt`, version `2026-11-03`. |
| Content | `brief.md` (this folder), rendered in the BlendXR design system |
| Day 0 window | Opens Wed 2026-11-11 (IST). Due end of day 2026-11-11 UTC. If not ticked by then, send a one-shot reminder to `airem@blendxr.online`. Pushed from 2026-11-06 for the Diwali weekend. |
| Expires | 2026-12-02 (grant `expires_at`). Day 0 2026-11-11, Day 14 2026-11-25, plus a 7-day admin buffer. Extend from admin if Day 0 slips. |

## Page flow

1. **Token check.** Valid session for this resource and email, or back to the gate.
2. **Agreement step.** Show the full agreement text. The signer provides company name, signer name, title and email, then ticks "I am authorised to sign for this company." Store name, title, email, timestamp (UTC), IP, user agent, and a SHA-256 hash of the agreement file version shown. No content renders before this succeeds. "I'm not the signatory" opens the handoff flow (`not-signatory.js`). A countersigned PDF is emailed to the signer + airem + vedika; the user-facing download has been removed.
3. **Brief.** Render `brief.md` top to bottom. Two HTML comments in it mark where panels go:
   - `<!-- DOWNLOADS PANEL -->` after the Assets section
   - `<!-- UPLOADS PANEL -->` at the end, before Sources
4. **Downloads panel.** Short-lived signed URLs only.
5. **Uploads panel.** Interactive checklist (below).

## Media in the brief

| Path in brief.md | File | Notes |
| --- | --- | --- |
| `media/switchgear-panel-failing.png` | `switchgear-panel-failing.png` | Inline image, watermarked |
| `media/switchgear-panel-failing-vrhands.png` | `switchgear-panel-failing-vrhands.png` | Inline image, watermarked |
| `media/highlight-pulse-ref.mp4` | `highlight-pulse-ref.mp4` (this folder) | Inline video, muted, loop, no download control, overlay watermark |

## Downloads panel

Exactly four files, all audio:

| Label | File |
| --- | --- |
| S1 Room hum | `hum-electric.mp3` |
| S2 Spark crackle | `crackle.mp3` |
| S3 App start | `EnterApp.mp3` |
| S4 Fire alarm (app exit) | `fire-alarm.mp3` |

The gloves pack is NOT downloaded through the deal room: Volga pulls the Gloves material listing from Fab directly, per the Assets table in `brief.md`.

Log every download (who, file, time).

## Uploads panel: interactive checklist

One row per checkpoint. Each row has a checkbox the partner ticks when uploaded, an upload control, and a status. Rows lock in order: a row opens once the previous row has at least one upload or is marked done by BlendXR in admin.

| Day | Checkpoint | Accepts | Required files |
| --- | --- | --- | --- |
| 0 | Start confirmation | No upload. Checkbox only: "We can access every asset and the setup works." Ticking it records `checkpoint_status.ticked_at`, emails airem + vedika, and locks the checkbox so it cannot be un-ticked. | None |
| 4 | Gray box | `.mp4`, `.mov` | 1 headset capture video |
| 9 | First APK | `.apk` | 1 APK |
| 14 | Final delivery | `.apk`, `.zip`, `.md`, `.json` | Final APK, project zip (with .git and LFS), README, two sample session files (one `"completed"`, one `"quit"`) |

- Uploads are versioned, never overwritten. Show the partner only filename, size, time and a status of Received, then Reviewed or Changes requested (set by BlendXR in admin).
- Record uploader, checkpoint, filename, size, SHA-256 and timestamp. Email airem@blendxr.online on every upload.
- Day 14 zips can be several GB: use resumable uploads, per the deal room spec.
- Day 4, 9 and 14 due dates render immediately from the fixed anchor (Day 0 = 2026-11-11), so Shivam sees the full timeline on open. Upload controls on Day 4/9/14 are still locked until Day 0 is ticked. Once Day 0 is ticked, due dates recompute from the real tick timestamp.

## Day 0 reminder

A scheduled Netlify Function (`netlify/functions/day0-reminder.js`, cron-driven) runs daily and, if the Volga grant has no Day 0 checkpoint_status row by the end of 2026-11-11 UTC, sends a one-shot email to airem@blendxr.online and inserts an `events` row (`kind: "day0_missed_reminder_sent"`) so it does not fire twice.

## Do not render

- The Fab login. It goes by email from airem only, and its password is changed once Volga confirms the download.
- Any reference to scoring, metrics or the portal beyond what the brief already says.
