# Volga brief page: build notes for blendxr.online

These notes cover only this resource. The site-wide rules (gate, tokens, watermark, headers, storage) come from the deal room spec and are not repeated here.

## Resource

| Field | Value |
| --- | --- |
| Type | `brief` |
| Slug (admin only, never in the URL) | `volga-test-scene` |
| Access URL | `blendxr.online/r/<token>`, one token for Volga's contact email |
| Agreement | `BlendXR_Volga_Contractor_Agreement_v2.docx` (contractor agreement, not the mutual NDA) |
| Content | `brief.md` (this folder), rendered in the BlendXR design system |
| Expires | Project end date + 7 days. Day 0 is not fixed yet, so set `expires_at` to 2026-11-24 for now and extend from admin once day 0 is confirmed. |

## Page flow

1. **Token check.** Valid token for this resource and email, or back to the gate.
2. **Agreement step.** Show the full agreement text. The signer types their full name, title and company legal name, and ticks "I am authorized to sign for Volga Infosys". Store name, title, email, timestamp (UTC), IP, user agent, and a SHA-256 hash of the agreement file version shown. No content renders before this succeeds.
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

| Label | File |
| --- | --- |
| S1 Room hum | `hum-electric.mp3` |
| S2 Spark crackle | `crackle.mp3` |
| S3 App start | `EnterApp.mp3` |
| S4 Door unlock and app quit | `unlocking-metal-door.mp3` |

The gloves/hands material is NOT downloaded through the deal room any more: Volga pulls the Realistic Gloves Pack from BlendXR's Fab account, same flow as the Hospital Generator & Utility Room pack. See brief.md.

Log every download (who, file, time).

## Uploads panel: interactive checklist

One row per checkpoint. Each row has a checkbox the partner ticks when uploaded, an upload control, and a status. Rows lock in order: a row opens once the previous row has at least one upload or is marked done by BlendXR in admin.

| Day | Checkpoint | Accepts | Required files |
| --- | --- | --- | --- |
| 0 | Start confirmation | No upload. Checkbox only: "We can access every asset and the setup works." Ticking it emails airem@blendxr.online and records the time as day 0. | None |
| 4 | Gray box | `.mp4`, `.mov` | 1 headset capture video |
| 9 | First APK | `.apk` | 1 APK |
| 14 | Final delivery | `.apk`, `.zip`, `.md`, `.json` | Final APK, project zip (with .git and LFS), README, sample session file |

- Uploads are versioned, never overwritten. Show the partner only filename, size, time and a status of Received, then Reviewed or Changes requested (set by BlendXR in admin).
- Record uploader, checkpoint, filename, size, SHA-256 and timestamp. Email airem@blendxr.online on every upload.
- Day 14 zips can be several GB: use resumable uploads, per the deal room spec.
- Show the day 4, 9 and 14 due dates once day 0 is recorded (day 0 + 4, + 9, + 14).

## Do not render

- The Fab login. It goes by email from airem only, and its password is changed once Volga confirms the download.
- Any reference to scoring, metrics or the portal beyond what the brief already says.
