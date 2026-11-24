# Progress

- Current milestone: M2 Core loop (M1 vertical slice complete)
- Started: 06:21 Brisbane, 25 November 2026
- Last update: 07:03 25 Nov

## Milestone log

| Milestone | Brisbane time | Notes |
|---|---|---|
| M0 start | 06:21 | Docs, scaffold, workflow; placeholder deployed (run 45481393184 success) |
| M1/M2 integration | 07:03 | Full game loop playable locally |

## Done
- Seeded world (reused generator), furnishing, partitions, 41 anomaly types, completability and registry tests.
- Analytic panel lighting shader, procedural textures, bloom, tape pass (grain, scanlines, chroma bleed, lens distortion, night mode, CCTV).
- Player controller with collision, sprint, crouch, head bob; camcorder with battery, focus, photo detection, false-photo Doubt.
- The Occupant (dormant, wandering, stalking, rushing, retreating), lens-only rendering, freeze while recorded, hum radar, light dimming, wet footsteps.
- Death tear and static, CCTV replay, summary, R restart, exit to Level B, victory in the office.
- Title, content warning, noclip intro, settings, archive, pause with session clock, Daily Shift share string.

## Next
- Commit, push, deploy; deployed smoke test.
- Bot tour test and video; tape export verification; fresh-eyes review.

## Self-review (section 7.3)
- Real place: Level A corridors read as a damp, yellowed office (artifacts/screenshots/03-level-a.png). The spawn hall is large and plain; furniture now added there.
- Placeholder grey: none in Level A. Level B is bright and clean; caustics may be strong.
- Camcorder distinct: yes, scanlines, chroma bleed, distortion and REC overlay (04, 06).
- Stop-scrolling frame: 06-occupant-rec.png.
