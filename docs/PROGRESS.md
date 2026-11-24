# Progress

- Current milestone: M5 Freeze
- Started: 06:21 Brisbane, 25 November 2026
- Last update: 07:27 Brisbane, 25 November 2026

## Milestone log

| Milestone | Brisbane time | Notes |
|---|---|---|
| M0 start | 06:21 | Docs, scaffold, workflow; placeholder deployed (run 45481393184 success) |
| M1/M2 integration | 07:03 | Full game loop playable; deployed (run 45487246682), CI smoke job added (run 45487542760) |
| M3 depth | 07:03 | 41 anomaly types, Level B, Archive, Daily Shift, settings, persistence shipped with M1/M2 |
| M4 wow and polish | 07:19 | Last tape, rearrange, touch, dist.zip, bot tour; deployed with smoke green (run 45489978037) |
| M5 freeze | 07:27 | Fresh-eyes findings fixed, full test run, final deploy, REPORT.md |

All features were in by T+1:00, well inside the windows, so the freeze started early rather than adding scope that could not be tested properly.

## Done
- Seeded world (reused generator), furnishing, partitions, 41 anomaly types, completability and registry tests.
- Analytic panel lighting shader, procedural textures, bloom, tape pass (grain, scanlines, chroma bleed, lens distortion, night mode, CCTV).
- Player controller with collision, sprint, crouch, head bob; camcorder with battery, focus, photo detection, false-photo Doubt.
- The Occupant (dormant, wandering, stalking, rushing, retreating), lens-only rendering, freeze while recorded, hum radar, light dimming, wet footsteps.
- Death tear and static, CCTV replay, Save tape WebM, summary, R restart, exit to Level B, victory in the office.
- Title, content warning, noclip intro, settings, Archive, pause with session clock, 90-minute note, Daily Shift share string.
- Stretch: your last tape, rearrange after the tab is hidden, changed title office, gamepad, touch, photo mode, dist.zip.
- Bot tour test with video; deployed smoke test in CI.

## Fresh-eyes review (M4 gate)
- No Blockers.
- Major, fixed: touch camcorder toggle survived into the next run (now reset on run start, title, blur and tape playback).
- Major, fixed: PROGRESS, ACCEPTANCE and REPORT were stale or missing.
- Major, fixed: 04 and 05 screenshots were near duplicates with a flash-washed thumbnail. 05 now photographs the chair on the ceiling, and thumbnails are captured without the flash.
- Minor, fixed: pointer lock released for last-tape playback and restored after; rearrange skipped during tape playback; touch look ignored outside play; HUD text shadow stronger; Level B caustics and water reflections toned down.
- Minor, open: Archive perk selector can scroll out of view; Occupant reads as a dark smear on CCTV; Level B still reads clean rather than damp; panels clip to white near the camera.

## Next
- See REPORT.md, Next five improvements.

## Self-review (section 7.3, M4)
- Real place: Level A reads as a damp, yellowed office (03, 06). The spawn hall is large and plain.
- Placeholder grey: none.
- Camcorder distinct: yes, scanlines, chroma bleed, distortion, REC and battery overlay (04, 05, 06).
- Stop-scrolling frame: 06-occupant-rec.png, and 12-last-tape.png.
- Worst remaining issue: Level B looks too clean. Caustics and reflections were reduced this gate.
