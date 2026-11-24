# Acceptance checklist

Copied verbatim from the build brief section 12. Ticks carry evidence pointers. [x] done, [~] partial, [ ] not done.

Priority tiers: **P0** must ship for the game to count as working. **P1** completes the intended experience. **P2** is stretch, built in listed order only after P0 and P1 pass. When cutting scope, cut P2 first, then the lowest P1 items, never P0.

### P0 - working game

- [x] P0-01 Title screen with Start, Settings and content warning. Evidence: 01-title.png; e2e 1 boot; src/ui/ui.ts title and warning.
- [x] P0-02 First-person controller with collision, sprint and crouch; pointer lock handling; pause on blur. Evidence: src/gameplay/player.ts, World.collide; e2e 3 and P2-07; pause on blur and pointer unlock in src/game.ts constructor.
- [x] P0-03 Infinite, deterministic, streamed Level A; connectivity tests pass. Evidence: unit tests/unit/chunk.test.ts (200 seeds x 25 chunks connectivity, pinned hashes) and content.test.ts; e2e 9 soak streams 10,000 frames.
- [x] P0-04 Fluorescent lighting, bloom and grain; photosafe flicker scheduler with unit test. Evidence: src/render/shaders.ts, post.ts; unit systems.test.ts flicker property test; e2e 7 reduce flicker.
- [x] P0-05 Procedural hum and footsteps; audio unlocks on first gesture; volume setting. Evidence: src/audio/engine.ts (unlock on first gesture, master volume in Settings); 10-settings.png.
- [x] P0-06 Camcorder raise, REC overlay, battery drain, photo capture, battery pickups. Evidence: 04-camcorder.png; e2e 3 (photo, evidence); battery pickups in content.ts and Game.takePickup.
- [x] P0-07 At least 12 anomaly types with fair detection and false-photo penalty. Evidence: 41 types in src/anomalies/registry.ts; unit content.test.ts registry; e2e 3 false photo costs battery and raises Doubt.
- [x] P0-08 The Occupant: visible only through the lens, frozen while recorded, telegraphed approach, catch leads to death. Evidence: 06-occupant-rec.png; e2e 4 approach and freeze; e2e 5 catch to death.
- [x] P0-09 Exit manifests at the evidence threshold and leads to Level B; Level B playable. Evidence: e2e 6 exit to Level B; 09-level-b.png; e2e 10 bot tour reaches Level B.
- [x] P0-10 Run summary and restart in under 2 seconds. Evidence: e2e 5 restart with zero simulated frames and under 2 s real time; 08-summary.png.
- [x] P0-11 Persistence with versioned schema and corrupt-save recovery. Evidence: src/core/save.ts schema v2 with migration; unit systems.test.ts round trip, migration, corrupt recovery.
- [x] P0-12 Zero console errors; same-origin requests only. Evidence: e2e 1 boot and 2 network; every e2e test asserts no page errors.
- [x] P0-13 Deployed to GitHub Pages; deployed smoke test passes. Evidence: Pages workflow smoke job (deployed.spec.ts) green, see REPORT.md Evidence.
- [x] P0-14 `docs/REPORT.md` complete and pushed. Evidence: docs/REPORT.md.

### P1 - intended experience

- [x] P1-01 Noclip intro (skippable). Evidence: 02-intro.png; src/game.ts intro script (about 17 s), any key skips it (after 1.5 s on the first view, to avoid skipping by accident).
- [x] P1-02 At least 24 anomaly types across Levels A and B. Evidence: 41 types across Levels A and B (registry.ts).
- [x] P1-03 CCTV death replay and Save tape WebM export with graceful fallback. Evidence: 07-death-replay.png; e2e tape export downloads a WebM; Save tape hidden when MediaRecorder is missing.
- [x] P1-04 Real local-time wall clocks, including one wrong clock anomaly per level. Evidence: CLOCK_FRAG in src/render/shaders.ts uses real local time; clock-backwards (Level A spawn) and clock-wrong (Level B spawn chunk).
- [x] P1-05 Hum-as-radar audio driven by Occupant distance, with visual sound indicators option. Evidence: AudioEngine.setHum driven by Occupant distance and bearing; Sound cues setting shows subtitles with direction.
- [x] P1-06 Archive meta progression with at least 6 unlocks and one perk slot. Evidence: 11 unlocks in src/gameplay/meta.ts including perk slot; 11-archive.png.
- [x] P1-07 Daily Shift seed and plain-text share string. Evidence: src/core/daily.ts; unit systems.test.ts daily seed and share format; summary Share button.
- [x] P1-08 Full settings and accessibility list in section 5.7, including Calm mode and Reduce flicker. Evidence: 10-settings.png; e2e 7 settings persist and reduce flicker.
- [~] P1-09 Performance budgets in section 8 met, with e2e evidence. Evidence: e2e 8 budgets (at most 60 calls, 80,213 triangles), e2e 9 soak; JS 188 KB gzip. Partial: 60 fps on an integrated GPU not measured (no GPU in this environment); auto render scale 0.6 to 1.0 is implemented.
- [x] P1-10 Time-on-the-clock line and the 90-minute sticky note. Evidence: e2e P1-10 pause clock and 90-minute note; 13-pause-clock.png.
- [x] P1-11 All e2e tests and artefacts in section 9.2, including the bot tour video. Evidence: 14 required and extra e2e tests pass; artifacts/screenshots 01 to 13; artifacts/video/bot-tour.webm.
- [x] P1-12 `docs/LICENCES.md`. Evidence: docs/LICENCES.md.

### P2 - stretch (in order)

- [x] P2-01 Your last tape (lost camcorder replay). Evidence: e2e P2-01; 12-last-tape.png.
- [x] P2-02 Room changes after tab hidden for more than 5 seconds. Evidence: e2e rearrange.
- [x] P2-03 Changed title screen after first escape. Evidence: src/render/office.ts chair on the ceiling after the first escape (Game.goTitle uses save.escapes).
- [x] P2-04 Anomaly types expanded to 40 or more. Evidence: 41 types.
- [ ] P2-05 Level C "P4". Not built (D-13).
- [x] P2-06 Gamepad support. Evidence: readPad in src/gameplay/player.ts, buttons in Game.update.
- [x] P2-07 Touch controls. Evidence: e2e P2-07; src/core/touch.ts.
- [x] P2-08 Photo mode. Evidence: Archive unlock at 100 Evidence, entered from pause (D-11).
- [x] P2-09 `dist.zip` for itch.io upload. Evidence: Pages workflow uploads the `dist-zip` artefact.

