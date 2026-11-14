# ApexDream confined space brief page: build notes for blendxr.online

These notes cover only this resource. The site-wide rules (gate, tokens, watermark, headers, storage) come from the deal room spec and are not repeated here.

## Resource

| Field | Value |
| --- | --- |
| Type | `brief` |
| Slug (admin only, never in the URL) | `apexdream-confined-space` |
| Access URL | `blendxr.online/r/<token>`, one token per invited contact at ApexDream |
| Agreement | `BlendXR_Volga_Contractor_Agreement_v2.docx` in `agreements/` (contractor agreement, not the mutual NDA). Same template as Volga: the signer fills in their org details (legal name, entity type, registration, PAN, address) on the form, so one template serves both briefs. |
| Content | `brief.md` (this folder), rendered in the BlendXR design system |
| Expires | Project end date + 7 days. Day 0 is not fixed yet, so set `expires_at` to 2026-12-04 for now and extend from admin once day 0 is confirmed. |

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
| `media/highlight-pulse-ref.mp4` | `highlight-pulse-ref.mp4` (this folder) | Inline video, muted, loop, no download control, overlay watermark. Carried unchanged from the Volga brief. |

The brief currently says "Reference images: to be added" for the chamber. Those will be dropped into `media/` and referenced as `media/<name>.png` in `brief.md` when ready.

## Downloads panel

| Label | File |
| --- | --- |
| S1 Room hum | `hum-electric.mp3` |
| S2 Fan off (clunk and wind-down) | `fan-off.m4a` |
| S3 App start | `EnterApp.mp3` |
| S4 Carbon monoxide detector alarm | `carbon-monoxide-detector.m4a` |

`hum-electric.mp3` and `EnterApp.mp3` are the same files Volga uses; `fan-off.m4a` and `carbon-monoxide-detector.m4a` are specific to this brief.

Log every download (who, file, time).

The Fab-sourced packs listed in the brief (Hospital Generator, Gloves, Fans For Metro, Detector Beep, Industrial items, Safety factory pack) are NOT downloaded through the deal room: ApexDream pulls them from BlendXR's Fab account, same flow as Volga. See brief.md.

## Uploads panel: interactive checklist

Same checklist shape as Volga. Build the checkpoint list as per-resource config, not hardcoded.

| Day | Checkpoint | Accepts | Required files |
| --- | --- | --- | --- |
| 0 | Start confirmation | No upload. Checkbox only: "We can access every asset and the setup works." Ticking it emails airem@blendxr.online and records the time as day 0. | None |
| 4 | Gray box | `.mp4`, `.mov` | 1 headset capture video: chamber blocked out at real scale, gaze working on all 4 targets, debug reticle on |
| 9 | First APK | `.apk` | Full flow from fade-in to app quit, fan and alarm timing, pulses and session file working, placeholder art acceptable |
| 14 | Final delivery | `.apk`, `.zip`, `.md`, `.json` | Final APK, project zip (with .git and LFS), README, sample session file |

- Uploads are versioned, never overwritten. Show the partner only filename, size, time and a status of Received, then Reviewed or Changes requested (set by BlendXR in admin).
- Record uploader, checkpoint, filename, size, SHA-256 and timestamp. Email airem@blendxr.online on every upload.
- Day 14 zips can be several GB: use resumable uploads, per the deal room spec.
- Show the day 4, 9 and 14 due dates once day 0 is recorded (day 0 + 4, + 9, + 14).

## Do not render

- The Fab login. It goes by email from airem only, and its password is changed once ApexDream confirms the download.
- Any reference to scoring, metrics or the portal beyond what the brief already says.
