---
title: "BlendXR x ApexDream: Confined Space Test Brief"
version: "2026-11-13"
resource_type: brief
partner: ApexDream
contact: airem@blendxr.online
---

# BlendXR x ApexDream: Confined Space Test Brief

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
| Input | Head gaze only. Hand tracking for visible hands. No controllers. |
| Version control | Git with Git LFS from day 1, delivered as a zip with full history (see Deliverables) |

We install the APK on our own Quest 3 from macOS with SideQuest or Meta Quest Developer Hub, so it must sideload and run with no extra setup. Set a clear app name, app icon and package name so it shows cleanly in the headset library.

## Purpose and test terms

One short Unreal scene, about 20 to 40 seconds, delivered as an optimized Quest 3 APK and a clean project within 14 days. BlendXR owns scenario, design and interaction logic. ApexDream owns technical art, implementation and an optimized build.

This is professional safety training content: realistic, restrained, no game effects.

We will evaluate five things:

1. **On time.** Both check-ins and the final delivery hit.
2. **Runs clean in headset.** Sideloads, holds frame rate, no hitches on load, cue changes or exit.
3. **Gaze feels right.** Targets register when looked at: never by accident while scanning, and never needing an overly long look to count as *observed*.
4. **Project quality.** Someone outside your team can open, understand, modify and rebuild it quickly.
5. **Communication.** Questions asked early, blockers flagged the day they appear.

If time runs short, cut visual detail, not frame rate, project hygiene, timing or logging.

**Terms**

- This test is unpaid. Budgets are discussed only if we move to full experiences.
- The scenario, interaction logic and this brief are confidential. Do not share, reuse or show them, including in your portfolio, without written permission. The agreement you signed to open this page covers everything in it.
- All work produced for this test belongs to BlendXR.

## Scene concept: Valve Chamber, Air Turning Bad

The trainee stands at a gate valve inside an underground concrete valve chamber, reached by a fixed ladder from a manhole above. The ventilation fan is running. Then it cuts out and winds down to silence. Soon after, the fixed gas detector beside the ladder alarms. The trainee recognizes both warning signs and turns to the ladder, their way out. The scene ends there.

No text, no arrows, no menus, no score shown. The trainee is never told where to look. Cues exist to build awareness and raise alerts, not anxiety. Every look is recorded so awareness can be measured afterwards.

**Chamber layout**

| Element | Spec |
| --- | --- |
| Chamber | Cast concrete box, about 3.0 m x 3.0 m floor, about 3.0 m from floor to the underside of the roof slab. Dry concrete with dust and old water stains. A small sump grate in one corner. |
| Player start | About 1.4 m from the front wall, centered side to side, facing the valve. About 1.5 m clear to the side and back walls, so outstretched arms never reach a wall. |
| Valve (task) | One pipe, about 300 mm diameter, runs wall to wall about 0.8 m from the front wall, its center about 0.5 m above the floor on two concrete plinths. Gate valve in the middle of the run, directly in front of the player, with its handwheel on top: about 0.45 m across, about 1.0 m above the floor (waist height), about 0.6 m from the player. |
| Ladder | Galvanized steel fixed ladder bolted to the left wall, rising to the manhole. About 90 degrees to the player's left. |
| Manhole | Round opening about 750 mm wide in the roof slab above the ladder. Pale early-morning daylight above. |
| Tripod | Metal rescue tripod standing over the manhole, a winch line running down beside the ladder. Seen from below against the sky. |
| Ventilation fan | Fixed wall fan on the right wall, opposite the ladder, about 2.4 m up, angled toward the player. Blades visibly spinning until the fan stops. |
| Gas detector | Fixed on the left wall beside the ladder at head height, about 1.6 m up. Red lens unlit until the alarm. A conduit runs from it up to the roof slab. |
| Light | One caged bulkhead light, cool white, on the front wall above the valve, about 2.2 m up. |
| Dressing | None beyond the above. Fewer props, better made. |

Build everything at real-world scale and check it in headset: the handwheel should sit at your own waist height, and the walls should feel close but out of reach.

The daylight through the manhole is the only warm, bright point in the scene, so the way out always reads clearly.

**Reference images:** to be added.

## Flow

Times are from the moment the chamber is fully faded in.

| Phase | Time | What happens |
| --- | --- | --- |
| Enter | Before 0:00 | App opens to black and S3 plays. Recenter so the player faces the valve. 2 s fade into the chamber. S1 hum and S2 fan already playing, fan blades spinning. |
| Settle | 0 to 9.8 s | Routine. Fan running, nothing changes and nothing pulses. |
| Recognize | 9.8 s | The fan cuts out: S2 plays its clunk and wind-down, and the blades slow with the sound. |
|  | 13.3 s | S2 ends and the blades stop. The fan target unlocks. |
|  | 16.1 s | Fan notice pulse starts, only if the fan has not been observed yet. |
|  | 19.8 s | The gas detector alarms: S4 plays, then 5 s of silence, repeating until the app quits. The red lens flashes with each beep. The detector target unlocks. |
|  | 22.6 s | Detector notice pulse starts, only if the detector has not been observed yet. |
| Respond | Detector observed | The ladder target unlocks. |
|  | Detector observed + 2.8 s | Ladder notice pulse starts, only if the ladder has not been observed yet. |
| Exit | Ladder observed | 2 s fade to black while S4 continues, then the app quits. |

Pacing: about 25 s for a fast trainee, longer is fine. Nothing times out.

## Gaze targets and cues

**Input is head gaze.** Quest 3 has no eye-tracking hardware, so the ray comes from the center of the headset view. Build it so true eye tracking can replace the ray source later without touching the targets.

- Use Meta XR Interaction SDK gaze: enable gaze in project settings and add the gaze rig component to the pawn.
- If that blocks you, a sphere trace from the HMD camera each tick is acceptable (radius 5 cm, range 6 m, dedicated `Gaze` trace channel). Email us which you used.
- No visible reticle in the shipping build. A debug reticle behind a console toggle is welcome.

**Targets**

| ID | Target | Role | Pulses | Gaze volume |
| --- | --- | --- | --- | --- |
| FAN | Wall fan | Recognize | Notice only | Fan housing and blades |
| DETECTOR | Gas detector by the ladder | Recognize | Yes | Detector mesh plus a small margin |
| LADDER | Fixed ladder and manhole | Respond | Yes | Full ladder up to and including the manhole ring |
| VALVE | Gate valve and handwheel | Logged only | Never | Valve body and handwheel |

One reusable component, `BP_GazeTarget`, drives all four. Each carries a `Role` field (Recognize, Respond, Logged only). Every target is tracked and logged for the whole session, from fade-in to exit, whether or not it is unlocked.

**Rules for pulsed targets**

1. **Unlock.** FAN unlocks when S2 ends (13.3 s). DETECTOR unlocks at the first alarm (19.8 s). LADDER unlocks the moment DETECTOR is observed.
2. **Hold.** No pulse until 2.8 s after the target unlocks. If the target is observed before then, it never pulses.
3. **Notice.** At the pulse time, play exactly 2 notice pulses at 0.8x speed (1.5 s per pulse, 3 s total). If observed during them, fade out over 0.3 s.
4. **Alert.** DETECTOR and LADDER only: if still not observed after both notice pulses, fade in the alert pulse at 2.8x speed (about 0.43 s per pulse), looping until observed. Then fade out over 0.3 s. FAN has no alert pulse: after its notice pulses it stays still.
5. **Observed.** Continuous dwell reaches the target's threshold while it is unlocked. Gaps under 0.25 s do not reset dwell. Looks before a target unlocks are logged but do not count as observed.

**Dwell thresholds**

- Tunable from 1.2 to 1.8 s per target. Defaults: FAN 1.5 s, DETECTOR 1.5 s, LADDER 1.5 s.
- Every timing and threshold on this page is a variable on the component or a data asset, never hardcoded.

**Pulse look**

Reference from our police sim (the pulsing toolbox), shown on this page. Ignore its text panel: there is no UI here.

<video src="media/highlight-pulse-ref.mp4" controls muted playsinline></video>

- Overlay material: unlit, additive, fresnel edge glow on the target's mesh (fan housing, detector, ladder rails). No post-process outline.
- Color #ebfcf7. Base cycle 1.2 s at 1.0x speed. Subtle peak: it should read as the object catching light, not a game pickup.

## Session data

The scene does no scoring. It records raw events so BlendXR can calculate awareness and observation later. Build the logger as one component (`BP_SessionLogger`) that writes one JSON file per session to the app's storage on the headset. No network calls.

All times are in milliseconds from fade-in complete.

**Session header**

- Session ID, build version, device model, Horizon OS build, start time (UTC)
- Total session duration, from fade-in complete to app quit
- Phase times: fade-in complete, fan stop, fan still, fan observed, alarm start, detector observed, ladder observed, fade-out start

**Cue events**

| Event | When |
| --- | --- |
| `cue_fan_stop` | Fan cuts out, S2 clunk (9.8 s) |
| `cue_fan_still` | S2 ends and the blades stop (13.3 s) |
| `cue_gas_alarm` | Every alarm cycle, with its lens flash (first at 19.8 s) |
| `cue_fade_out` | Fade to black starts |

**Target events** (one row per event, with target ID)

| Event | When |
| --- | --- |
| `gaze_enter` | The gaze ray starts hitting a target |
| `gaze_exit` | The ray stops hitting it, after the 0.25 s gap tolerance. Include the duration of that look. |
| `unlocked` | A pulsed target becomes active |
| `pulse_notice_start` | First notice pulse begins |
| `pulse_alert_start` | Alert pulse fades in |
| `observed` | Dwell threshold reached while unlocked |

Every `gaze_enter` and `gaze_exit` pair is one look. Log every look on every target for the whole session, including before unlock and on VALVE, which never pulses. For example: VALVE looked at from 2.0 s for 6.0 s, and again from 21.0 s for 1.5 s.

**Head direction**

- Sample head position and rotation 10 times per second for the whole session, as a compact array in the same file.

**Data quality events**

| Event | When |
| --- | --- |
| `recenter` | The view is recentered |
| `headset_removed` / `headset_worn` | Proximity sensor changes |
| `app_paused` / `app_resumed` | App loses or regains focus |

**Summary block** (written at the end of the file)

- Per target: first look time, number of looks, total look time, observed time (if any)

Rules:

- Keep event names and fields exactly as above so files from different builds stay comparable.
- Write the file even if the session ends early, with whatever was recorded.
- Also print each event to the output log for debugging.
- Document the file location and format in the README with one sample file.

## Interaction, hands and movement

- **Interaction is gaze only.** Looking at the ladder ends the scene. Nothing is grabbed, pressed or pinched.
- **Hands.** Tracked hands (Quest hand tracking) with the gloves material we supply, for presence only. No controllers.
- **Standing, real height.** The trainee stands. Set the tracking origin to floor level so the trainee's real height sets their eye height and the chamber floor sits on their real floor. Recenter resets position and facing only, never height. No seated mode and no height offset.
- **Movement.** Restricted. No locomotion, teleport or snap turn. The player can turn and lean physically. Clamp the player to about a 0.4 m radius around the start point so they cannot walk into the valve or toward the walls; fade to black briefly if they push past it. The clamp replaces collision setup, so no collisions are needed.

## Visual and audio direction

**Look.** A working utility valve chamber, not a dungeon. Dry cast concrete with real wear, dust and old water stains. Fewer props, better made.

**Light.** ApexDream sets this up. One cool white bulkhead light above the valve, slightly underexposed. Pale daylight through the manhole as the only warm contrast. Baked lighting. The detector's red lens is an emissive material that flashes with each beep.

**Fan.** Blades spin from the fade-in, slow down in sync with the S2 wind-down, and come to a full stop the moment S2 ends.

**No fog, smoke or visible gas.** The hazard is invisible. The trainee only knows from the fan and the alarm.

**Audio (4 sounds, supplied)**

| ID | Sound | Behavior |
| --- | --- | --- |
| S1 | `hum-electric.mp3` | Low room tone. Loop from the fade-in. Non-spatial or very wide. |
| S2 | `fan-off.m4a` | Spatialized at the fan. Loop the steady running section (start to about 11 s) from the fade-in. At 9.8 s, play from the clunk (about 11 s) to the end of the file: the wind-down to silence. |
| S3 | `EnterApp.mp3` | Plays once over the black screen at app start, leading into the fade-in. Non-spatial. |
| S4 | `carbon-monoxide-detector.m4a` | Spatialized at the detector. From 19.8 s, play the file, then 5 s of silence, and repeat until the app quits, including through the 2 s fade to black. |

No other sounds. The trainee should be able to turn toward the fan and the detector by ear alone.

## Assets

**Supplied by BlendXR** (from BlendXR's Fab account, see below)

| Asset | Use for |
| --- | --- |
| [Hospital Generator & Utility Room](https://www.fab.com/listings/738ef059-522b-4909-b9c5-52a280b9eadc) by Red Blue Pixel Studio | Concrete and wall materials, conduit, sump grate, bulkhead light if it fits |
| [Gloves material](https://www.fab.com/listings/58794730-2855-4361-8f89-6af80d947f13) | VR hands |
| [Fans For Metro](https://www.fab.com/listings/3003be80-442b-4454-82bb-37c65d4bae66) | Wall fan (FAN). Use fan 1. |
| [Detector Beep](https://www.fab.com/listings/71564afb-8af3-4c75-bffa-b0f726662b4d) | Gas detector (DETECTOR). Use the mesh only: ignore its detection Blueprint and sounds. Mount it on a simple wall bracket and make the red lens emissive. |
| [Industrial items](https://www.fab.com/listings/060bde6d-33f7-46b8-9c8a-b209d6036d5e) | Pipe and industrial dressing |
| [Safety factory pack](https://www.fab.com/listings/bf7f4251-d518-42b9-a2f9-7094016e7ecc) | Safety equipment, only where it fits |
| S1, S2, S3, S4 sound files (download below) | Audio |
| Highlight pulse reference | Video above |

Download the Fab items above from BlendXR's Fab account. airem@blendxr.online will send the login separately and handle sign-in codes during reply windows. Sign in, add them to your project, sign out, and email us when it's done. The password will be changed after that. Use the account only for these items: no other downloads, purchases or setting changes. Use them only for this project, do not share them further, and delete them when the test ends.

**Build in Unreal**

- Chamber shell: walls, floor and roof slab with the manhole opening.
- Fixed ladder and manhole ring.
- Rescue tripod and winch line, from simple cube bars.
- Gate valve with handwheel, pipe and plinths. Simple hard-surface modelling is fine: it reads at arm's length, so keep the handwheel clean.
- Lighting, using the packs above where they fit.

For anything else, use free Fab or Quixel Megascans assets and list each one (name, source link, license) in the README. This build stays private, so free and non-commercial assets are fine.

Day 0 is [date]. Tick the day 0 confirmation at the bottom of this page that day. The 14-day clock runs from it, with final delivery on [date].

<!-- DOWNLOADS PANEL: rendered here by the page (see page-spec.md) -->

## Deliverables and timeline

The project matters as much as the APK. We are testing how you build, solve problems and leave a project others can join.

| Day | Date | Checkpoint | What we receive |
| --- | --- | --- | --- |
| 0 | [date] | Start | Day 0 confirmation: you can access every asset and the setup above works |
| 4 | [date] | Gray box | Headset capture video: chamber blocked out at real scale, gaze working on all 4 targets with debug reticle on |
| 9 | [date] | First APK | Full flow from fade-in to app quit, fan and alarm timing, pulses and session file working, placeholder art acceptable |
| 14 | [date] | Final | Final APK, zipped project with full Git history, README, one sample session file |

**Performance**

- 72 fps locked minimum on Quest 3, 90 fps if achievable. No drops on fade-in, fan stop or alarm start, door or exit.
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

Your key contact for the test is **airem@blendxr.online**. All test communication goes there, from day 0 to final delivery. No other channels during the test.

**Reply windows** (daily). Questions sent outside a window are answered in the next one.

| India (IST) | Pacific (PST) |
| --- | --- |
| 9:30 to 11:30 am | 8:00 to 10:00 pm, previous day |
| 9:30 to 11:30 pm | 8:00 to 10:00 am |

- Ask as many questions as you need. A short question on day 2 beats a wrong assumption on day 12.
- Flag blockers the day they appear.
- Any scope change, including dropping an interaction, is agreed by email before you build it.

<!-- UPLOADS PANEL: rendered here by the page (see page-spec.md) -->

## Sources

- [Installing Unreal Engine for Meta Quest (Meta)](https://developers.meta.com/vr/documentation/unreal/unreal-quick-start-install-unreal-engine)
- [Meta XR Interaction SDK for Unreal v203.0 (Meta)](https://developers.meta.com/horizon/downloads/package/meta-xr-interaction-sdk-unreal/203.0/)
- [Unreal Project Setup Tool (Meta)](https://developers.meta.com/horizon/documentation/unreal/unreal-project-setup-tool)
