---
title: "BlendXR x Volga: Test Scene Brief"
version: "2026-11-01"
resource_type: brief
partner: Volga Infosys
contact: airem@blendxr.online
---

# BlendXR x Volga: Test Scene Brief

## Required setup

Confirm you have all of this before day 0. If anything is missing or conflicts, email us before you start, not during the build.

| Item | Requirement |
| --- | --- |
| Engine | Unreal Engine 5.7.1, built from Meta's Oculus-VR fork, latest 5.7 tag ([install guide](https://developers.meta.com/vr/documentation/unreal/unreal-quick-start-install-unreal-engine)). Requires a verified Meta developer account, with Epic and GitHub accounts linked. |
| Meta XR plugin | The version bundled with that fork tag. Do not install a second copy. |
| Meta XR Interaction SDK | v203.0, built for UE 5.7.1 ([download](https://developers.meta.com/horizon/downloads/package/meta-xr-interaction-sdk-unreal/203.0/)). If its version check warns about the Meta XR plugin version, stop and email us. |
| Android toolchain | Android SDK, NDK and JDK exactly as Epic specifies for UE 5.7. |
| Headset | Meta Quest 3, developer mode on, hand tracking on |
| Headset OS | Latest public Meta Horizon OS release. Note the exact build number you tested on. |
| Input | Hand tracking only. No controllers needed. |
| Version control | Git with Git LFS from day 1, delivered as a zip with full history (see Deliverables) |

We install the APK on our own Quest 3 from macOS with SideQuest or Meta Quest Developer Hub, so it must sideload and run with no extra setup. Set a clear app name, app icon and package name so it shows cleanly in the headset library.

## Purpose and test terms

One short Unreal scene, 25 to 45 seconds, delivered as an optimized Quest 3 APK and a clean project within 14 days. This is shorter than the 1 to 2 minutes first discussed; the scope below replaces it. BlendXR owns scenario, design and interaction logic. Volga owns technical art, implementation and an optimized build.

We will evaluate five things:

1. **On time.** Both check-ins and the final delivery hit.
2. **Runs clean in headset.** Sideloads, holds frame rate, no hitches on load, door or exit.
3. **Gaze feels right.** Target assets register when looked at: never by accident while scanning, and never needing an overly long look to count as *observed*.
4. **Project quality.** Someone outside your team can open, understand, modify and rebuild it quickly.
5. **Communication.** Questions asked early, blockers flagged the day they appear.

If time runs short, cut visual detail, not frame rate, project hygiene or sequence.

**Terms**

- This test is unpaid. Budgets are discussed only if we move to full experiences.
- The scenario, interaction logic and this brief are confidential. Do not share, reuse or show them, including in your portfolio, without written permission. The contractor agreement you signed to open this page covers everything in it.
- All work produced for this test belongs to BlendXR.

## Scene concept: Electrical Room, Before the Fire

The trainee stands in a switchgear room at dawn. Nothing happens at first. Then a panel starts to fail: smoke at a vent, a spark, and boxes stacked against the panel. The scene directs what the trainee should notice next, one cue at a time, and logs where they look. Then they move to the door, which opens onto a corridor with an extinguisher: in a longer scenario, the next step would be to bring it back to the panel.

No text, no arrows, no menus, no score shown. Cues exist to build awareness and raise alerts, not anxiety.

**Room layout**

| Element | Spec |
| --- | --- |
| Room | About 10 m long x 5 m wide x 4 m high |
| Player start | About 1.5 m from the near wall, slightly left of center, facing down the room toward the door |
| Panel run | About 10 floor-standing switchgear panels along the left wall, P1 nearest the player. Meters, indicator lights, rotary handles. Label plates stay blank. |
| Faulty panel | P3, the panel with the large louvered vent. Smoke rises from the top of the vent and drifts toward the ceiling. Sparks at the right edge of the vent, beside the handle. |
| Boxes | 3 cardboard boxes on a low wooden crate, stacked against P3 and P4, inside a yellow hatched keep-clear floor zone (paint only, no lettering) |
| Far wall | Steel door with panic bar and closer, centered. Wall-mounted electrical box to its left, a tall grey cabinet in the left corner, fire alarm pull stations near the door, exposed conduit. |
| Right wall | Large steel-framed window, about 4 m wide x 3 m high, sill at about 1.2 m. Low dawn sun over an industrial yard. Floor vent grille below it, yellow bollard near the door, a rolling tool cart and shelving near the player. |
| Ceiling | 2 to 3 suspended fluorescent fixtures, exposed conduit and pipes |
| Corridor | Behind the exit door: short, plain, about 2 m wide. Wall-mounted fire extinguisher visible as soon as the door opens. |

The window is on the right and in view from the start, so the room never feels sealed. Dawn light across the floor is the only warm tone.

**Reference images** (AI-generated, for mood and layout only)

![Room reference, start view](media/switchgear-panel-failing.png)

![Room reference with VR hands](media/switchgear-panel-failing-vrhands.png)

## Flow

One level, three phases. Times are from the moment the room is fully faded in.

| Phase | Time | What happens | Pulses |
| --- | --- | --- | --- |
| Enter | Before 0:00 | App opens to black and S3 plays. Recenter so the player faces down the room. 2 s fade into the room. Room hum (S1) already playing. | None |
| 1. Settle | 0:00 to 12.8 s | Still room. Nothing changes, nothing to find. Dawn light from the window on the right. Dwell is still logged on every target. | None |
| 2. Observe | From 12.8 s | Smoke starts at P3's vent and is clearly evident by 14.8 s. Sparks and crackle (S2) begin at P3. Observation unlocks for O1, O2, O3 in order (see Observation logic). | Notice, then alert if needed |
| 3. Act | After O3 is observed | The exit door (I1) unlocks with the same pulse logic. Dwell on the door unlocks it (S4) and opens it, revealing the corridor and extinguisher. | Notice, then alert if needed |
| Exit | Door open + 4 s | 2 s fade to black with S4, then the app quits. | None |

Pacing: under 25 s for a fast trainee, about 45 s well paced, longer is fine. Nothing times out.

## Observation logic

**Input is head gaze.** Quest 3 has no eye-tracking hardware, so the ray comes from the center of the headset view. Build it so true eye tracking can replace the ray source later without touching the targets.

- Use Meta XR Interaction SDK gaze: enable gaze in project settings and add the gaze rig component to the pawn.
- If that blocks you, a sphere trace from the HMD camera each tick is acceptable (radius 5 cm, range 6 m, dedicated `Gaze` trace channel). Email us which you used.
- No visible reticle in the shipping build. A debug reticle behind a console toggle is welcome.

**Targets, in order**

| Order | ID | Target | Role | Gaze volume |
| --- | --- | --- | --- | --- |
| 1 | O1 | Smoke at P3's vent | Observation | Box around the upper vent and lower plume |
| 2 | O2 | Spark at P3 | Observation | Small box around the spark point at the vent's right edge, separate from O1 |
| 3 | O3 | Boxes **in** the keep-clear zone | Observation | Box stack meshes |
| 4 | I1 | Exit door | Interaction | Door mesh |

One reusable component, `BP_GazeTarget`, drives all four. Each carries a `Role` field (Observation or Interaction). Both roles look and behave the same in this test; the field exists so later scenarios can treat them differently.

**Rules per target**

1. **Unlock.** O1 unlocks at 12.8 s. Each later target unlocks the moment the previous one is observed.
2. **Grace.** For 2 s after unlock, no pulse. If the target is observed in that window, skip its pulses and unlock the next.
3. **Notice.** If not yet observed after 2 s, play exactly 2 notice pulses at 0.8x speed (1.5 s per pulse, 3 s total). If observed during them, fade out over 0.3 s and unlock the next.
4. **Alert.** If still not observed after both notice pulses finish, fade in the alert pulse: 2.8x speed (about 0.43 s per pulse), looping until observed. Then fade out over 0.3 s and unlock the next.
5. **Observed.** Continuous dwell reaches the target's threshold while it is unlocked. Gaps under 0.25 s do not reset dwell.

**Dwell**

- Threshold per target, tunable from 1.2 to 1.8 s. Defaults: O1 1.5 s, O2 1.2 s, O3 1.5 s, I1 1.8 s.
- Dwell is tracked on every target the whole session, including Settle and before a target unlocks. Only dwell inside its unlocked turn counts as observed.
- Every number on this page is a variable on the component or a data asset, never hardcoded.

**Pulse look**

Reference from our police sim (the pulsing toolbox). Ignore its text panel: there is no UI here.

<video src="media/highlight-pulse-ref.mp4" controls muted playsinline></video>

- Overlay material: unlit, additive, fresnel edge glow on the target's mesh (vent grille, the panel face around the spark, boxes, exit door). No post-process outline.
- Color #ebfcf7. Base cycle 1.2 s at 1.0x speed. Subtle peak: it should read as the object catching light, not a game pickup.

## Session data

The scene does no scoring. It records raw events so a future BlendXR backend can score them. Build the logger as one component (`BP_SessionLogger`) that writes a JSON file per session to the app's storage on the headset. No network calls in this test.

**Session header:** session ID, build version, device model, start time (UTC), phase timestamps (fade-in complete, Observe start, Act start, door open, exit).

**Events to log** (time in ms from fade-in complete, target ID, phase):

| Event | When |
| --- | --- |
| `gaze_enter` | Ray starts hitting a target |
| `gaze_exit` | Ray stops hitting a target (after the 0.25 s gap tolerance) |
| `unlocked` | Target's turn begins |
| `pulse_notice_start` | First notice pulse begins |
| `pulse_alert_start` | Alert pulse fades in |
| `observed` | Dwell threshold reached during its turn |
| `door_opened` | I1 confirmed |

From these, the backend can rebuild everything it needs: what was seen, in what order, for how long, before or after a pulse.

- Keep event names and fields exactly as above so files from different builds stay comparable.
- Also print each event to the output log for debugging.
- Document the file location and format in the README with one sample file.

## Interaction, hands and movement

- **Door.** When I1 is observed, S4 plays and the door swings open on its own over about 1.5 s. No grab, no button.
- **Corridor.** Short corridor behind the door with a wall-mounted extinguisher in clear view. It only needs to seem like the scene continues beyond the door. Build it so a later scene could load from it on a new level.
- **Hands.** Tracked hands (Quest hand tracking) with the hands material we supply. No controllers. Hands are for presence only; nothing is grabbed or pressed.
- **Movement.** Restricted. No locomotion, teleport or snap turn. The player can turn and lean physically. Clamp the player to about a 1 m radius around the start point so they cannot walk into panels or through walls; fade to black briefly if they push past it. The clamp replaces collision setup, so no collisions are needed.

## Visual and audio direction

**Look.** A real plant room at 6 am, not a showroom. Sealed concrete floor, painted block walls, grey panels with real wear. Fewer props, better made.

**Light.** Volga sets this up. Cool white fluorescent overhead, slightly underexposed. Warm, low dawn light through the window as the only contrast. Baked lighting. One fluorescent above P3 flickers faintly from the start.

**Window.** A simple HDRI or skybox plane with an early-dawn sky and a soft industrial silhouette. It only needs to read as outside and morning.

**Smoke.** One Niagara system at P3's vent: a few soft translucent sprite cards rising slowly. Starts at 12.8 s, reaches full density by 14.8 s, then holds. Thin and grey. Keep particle count and overdraw low. No volumetric fog.

**Spark.** One small Niagara burst at the right edge of P3's vent, every 3 to 5 s from 12.8 s, synced with S2. Brief and small: a real arc, not fireworks.

**Audio (4 sounds, supplied)**

| ID | File | Behavior |
| --- | --- | --- |
| S1 | `hum-electric.mp3` | Room hum. Loop from the fade-in. Non-spatial or very wide. |
| S2 | `crackle.mp3` | Spatialized at P3. Plays with each spark, randomized pitch (plus or minus 10%). |
| S3 | `EnterApp.mp3` | Plays once over the black screen at app start, leading into the fade-in. Non-spatial. |
| S4 | `unlocking-metal-door.mp3` | Spatialized at the door. Plays when I1 is observed, before the door swings open, and again during the final fade to black at app quit. |

No other sounds. The trainee should be able to turn toward P3 by ear alone.

## Assets

Three sources: paid packs and our own files, which BlendXR supplies; free Fab listings you download directly; and simple pieces you build in Unreal. For anything else, use free Fab or Quixel Megascans assets and list each one (name, source link, license) in the README.

**Supplied by BlendXR**

| Asset | Use for |
| --- | --- |
| [Hospital Generator & Utility Room](https://www.fab.com/listings/738ef059-522b-4909-b9c5-52a280b9eadc) by Red Blue Pixel Studio (download from BlendXR's Fab account, see below) | Floor and wall materials, cardboard boxes, crates, cables, vents, signs, utility props |
| [Realistic Gloves Pack](https://www.fab.com/listings/58794730-2855-4361-8f89-6af80d947f13) (download from BlendXR's Fab account, see below) | VR hands material |
| `hum-electric.mp3` (S1, download below) | Room hum |
| `crackle.mp3` (S2, download below) | Spark crackle |
| `EnterApp.mp3` (S3, download below) | App start |
| `unlocking-metal-door.mp3` (S4, download below) | Door unlock and app quit |
| Highlight pulse reference | Video above |

Download the Hospital Generator & Utility Room pack and the Realistic Gloves Pack from BlendXR's Fab account (airem). airem@blendxr.online will send the login separately and handle sign-in codes during reply windows. Sign in, add both packs to your project, sign out, and email us when it's done. The password will be changed after that. Use the account only for these two packs: no other downloads, purchases or setting changes. Use the packs only for this project, do not share them further, and delete them when the test ends.

**Free on Fab** (download directly)

| Listing | Use for |
| --- | --- |
| [Industrial items](https://www.fab.com/listings/060bde6d-33f7-46b8-9c8a-b209d6036d5e) | Panels and industrial dressing |
| [Safety factory pack](https://www.fab.com/listings/bf7f4251-d518-42b9-a2f9-7094016e7ecc) | Safety equipment and signage |
| [Fire extinguisher](https://www.fab.com/listings/28f9f3a5-6ab9-4de3-8aec-a492b1cce4e4) | Corridor extinguisher |
| [Fluorescent ceiling lamp (Megascans)](https://www.fab.com/listings/ed5b0308-d5e5-44ba-b271-af87bedcb547) | Ceiling fixtures |
| [Dawn sky](https://www.fab.com/listings/6d7cdbd3-4d9e-48ba-982a-f4aa07d078e4) | Window exterior |

**Build in Unreal**

- Keep-clear floor markings: simple planes with a flat yellow material. No asset needed.
- Corridor, lighting and the window frame, using the packs above where they fit.

This build stays private, so free and non-commercial assets are fine. The 14-day clock starts when you confirm by email that you can access every asset linked here. Please confirm by Tuesday, November 3.

<!-- DOWNLOADS PANEL: rendered here by the page (see page-spec.md) -->

## Deliverables and timeline

The project matters as much as the APK. We are testing how you build, solve problems and leave a project others can join.

| Day | Checkpoint | What we receive |
| --- | --- | --- |
| 0 | Start | Email confirming you can open all assets and the setup above works |
| 4 | Gray box | Headset capture video: room blocked out, gaze working on all 4 targets with debug reticle on. |
| 9 | First APK | Full flow from fade-in to app exit, pulses and session file working, placeholder art acceptable |
| 14 | Final | Final APK, zipped project with full Git history, README, one sample session file |

**Performance**

- 72 fps locked minimum on Quest 3, 90 fps if achievable. No drops on fade-in, smoke start, door or exit.
- Run the Meta XR Project Setup Tool for Quest 3 ([docs](https://developers.meta.com/horizon/documentation/unreal/unreal-project-setup-tool)) and apply all Required and Recommended rules. List any rule you ignored and why.
- Baked lighting, no dynamic shadows, no volumetrics.

**Project standards**

- Git with Git LFS from day 1. Commit as you go: we read the history.
- One root content folder (e.g. `/Content/BlendXR/`), consistent asset naming (`BP_`, `M_`, `MI_`, `T_`, `SM_`, `NS_`).
- Scene logic in reusable Blueprints or C++, not level script. Every timing and threshold exposed.
- No unused or duplicate assets in the final project.
- README: how to open and build, engine and SDK versions, gaze method, Project Setup Tool exceptions, measured frame rate, session file location and format, assets used with sources, known issues.

**Final delivery**

- Upload every checkpoint through the upload panel at the bottom of this page. No Drive links or email attachments. Uploads are versioned, so re-upload rather than replace.
- Final project as one zip of the full repo, including the .git folder and pulled LFS files, that we can open, modify and rebuild with only the README.

## Communication

Your key contact for the test is **airem@blendxr.online**. All test communication goes there, from day 0 to final delivery. No other channels during the test. Longer-term tools get decided after the test.

**Reply windows** (daily). Questions sent outside a window are answered in the next one.

| Window | Pacific (PST) | India (IST) |
| --- | --- | --- |
| Morning | 8:00 to 10:00 am | 9:30 to 11:30 pm |
| Evening | 8:00 to 10:00 pm | 9:30 to 11:30 am, next day |

- Ask as many questions as you need. A short question on day 2 beats a wrong assumption on day 12.
- Flag blockers the day they appear.
- Any scope change, including dropping an interaction, is agreed by email before you build it.

<!-- UPLOADS PANEL: rendered here by the page (see page-spec.md) -->

## Sources

- [Installing Unreal Engine for Meta Quest (Meta)](https://developers.meta.com/vr/documentation/unreal/unreal-quick-start-install-unreal-engine)
- [Meta XR Interaction SDK for Unreal v203.0 (Meta)](https://developers.meta.com/horizon/downloads/package/meta-xr-interaction-sdk-unreal/203.0/)
- [Unreal Project Setup Tool (Meta)](https://developers.meta.com/horizon/documentation/unreal/unreal-project-setup-tool)
