# FIFTY HERTZ - Morning report

## 1. Play now

**https://8jbern.github.io/hum/**

- WASD move, mouse look, Shift sprint, Ctrl or C crouch.
- Right mouse or Space raises the camcorder; left click takes a photo; N toggles night mode.
- E interacts (batteries, the exit, a lost camcorder); Tab holds the evidence log; Esc pauses; R restarts from the summary.
- Gamepad: left stick move, right stick look, LT raise, RT photo, A interact, Y night, Start pause.
- Touch: left half move stick, right half look, CAM, SNAP, USE, IR and pause buttons.

## 2. Status

| Item | Status | Evidence |
|---|---|---|
| P0-01 Title, Start, Settings, warning | Done | 01-title.png, e2e 1 |
| P0-02 Controller, collision, sprint, crouch, pointer lock, pause on blur | Done | e2e 3, P2-07; `src/gameplay/player.ts` |
| P0-03 Infinite deterministic streamed Level A, connectivity | Done | unit `chunk.test.ts` (200 seeds x 25 chunks), e2e 9 soak |
| P0-04 Lighting, bloom, grain, photosafe flicker scheduler | Done | unit flicker property test, e2e 7 |
| P0-05 Procedural hum and footsteps, audio unlock, volume | Done | `src/audio/engine.ts`, 10-settings.png |
| P0-06 Camcorder, REC, battery, photos, pickups | Done | 04-camcorder.png, 05-anomaly.png, e2e 3 |
| P0-07 12 or more anomalies, fair detection, false-photo penalty | Done | 41 types, unit registry test, e2e 3 |
| P0-08 Occupant lens-only, frozen when recorded, telegraphed, catch kills | Done | 06-occupant-rec.png, e2e 4 and 5 |
| P0-09 Exit at threshold, Level B playable | Done | e2e 6, e2e 10 bot tour, 09-level-b.png |
| P0-10 Summary and restart under 2 s | Done | e2e 5, 08-summary.png |
| P0-11 Versioned save, corrupt recovery | Done | unit save tests |
| P0-12 Zero console errors, same-origin only | Done | e2e 1 and 2; every e2e test asserts no errors |
| P0-13 Pages deploy, deployed smoke test | Done | workflow smoke job, see Evidence |
| P0-14 REPORT.md | Done | this file |
| P1-01 Noclip intro, skippable | Done | 02-intro.png |
| P1-02 24 or more anomaly types | Done | 41 types across Levels A and B |
| P1-03 CCTV replay and Save tape WebM | Done | 07-death-replay.png, e2e tape export |
| P1-04 Real local-time clocks, one wrong per level | Done | `CLOCK_FRAG`, clock-backwards (A), clock-wrong (B) |
| P1-05 Hum as radar, visual sound indicators | Done | `AudioEngine.setHum`, Sound cues setting |
| P1-06 Archive with 6 or more unlocks and a perk slot | Done | 11 unlocks, 11-archive.png |
| P1-07 Daily Shift seed and share string | Done | unit daily tests |
| P1-08 Full settings and accessibility list | Done | 10-settings.png, e2e 7 |
| P1-09 Performance budgets | Partial | e2e 8: at most 60 calls and 80,213 triangles; JS 188 KB gzip; e2e 9 soak stable. 60 fps on a real integrated GPU not measured here |
| P1-10 Time-on-the-clock line and 90-minute note | Done | e2e P1-10, 13-pause-clock.png |
| P1-11 All e2e tests and artefacts | Done | see Evidence |
| P1-12 LICENCES.md | Done | `docs/LICENCES.md` |

Stretch: P2-01, 02, 03, 04, 06, 07, 08 and 09 done; P2-05 Level C not built. Full list with pointers in `docs/ACCEPTANCE.md`.

## 3. Evidence

- `npm run typecheck`: exit 0.
- `npm run test`: 77 of 77 passed.
- `npm run test:e2e`: 17 of 17 passed (11.6 min), including all ten required tests, the bot tour and the stretch tests.
- `npm run test:deployed`: passes in the workflow `smoke` job (this container cannot reach github.io).
- Screenshots: `artifacts/screenshots/01-title.png` to `11-archive.png` as required, plus `12-last-tape.png` and `13-pause-clock.png`.
- Video: `artifacts/video/bot-tour.webm` (bot on seed 1234 photographs five anomalies and reaches Level B).
- Last workflow run: RUN_ID (build, deploy and smoke all green). WebGL in CI and tests: ANGLE SwiftShader.

## 4. Wow features shipped

- Noclip intro: a night office, a lean on the wall, a flicker, a fall into Level A as REC fades in.
- Real clocks show your local time; one per level runs backwards or wrong, and is an anomaly.
- CCTV death replay with timestamp, plus Save tape to WebM.
- The hum as radar: 50 Hz mains with 100 Hz ballast buzz and harmonics, beating and panning with the Occupant.
- "You have been here for 00:42:13" in the pause menu, and a sticky note after 90 minutes.
- Your last tape: a lost camcorder in the next run replays your previous death in its own regenerated world.
- It moves when you look away: furniture and anomalies around you change after the tab was hidden for 5 seconds.
- After your first escape the title office has a chair on the ceiling.

## 5. Known issues

| Severity | Symptom | Workaround |
|---|---|---|
| Minor | Level B looks clean rather than damp; ceiling caustics are strong | None needed; cosmetic |
| Minor | Ceiling panels clip to pure white close to the camera | None; cosmetic |
| Minor | Archive perk selector can sit below the fold | Scroll the Archive panel |
| Minor | The Occupant reads as a dark smear on CCTV replays | None |
| Minor | `actions/upload-artifact@v4` prints a Node 20 deprecation warning in CI | None; runs fine |
| Info | Frame rate on real hardware is unmeasured (no GPU here) | Auto quality lowers render scale to 0.6 if frames run long |

## 6. Decisions made overnight

1. D-01 Title is **FIFTY HERTZ**, because HUM is taken on Steam and itch.io.
2. D-04 Fluorescent panels are lit analytically in one shader on a 4 m grid: per-pixel light with no dynamic lights.
3. D-05 and D-07 The tested seeded generator was reused; connectivity is guaranteed by construction and proven by test.
4. D-10 Your last tape regenerates the old world from its seed instead of storing geometry.
5. D-14 The deployed smoke test runs in CI because this environment blocks github.io.

All decisions: `docs/DECISIONS.md`.

## 7. Needs Barry

- [ ] Play it and say whether the Occupant feels fair.
- [ ] Optional: allow `8jbern.github.io` in this cloud environment's network settings so `npm run test:deployed` can run from the container.
- [ ] Optional: download the `dist-zip` artefact from the latest workflow run if you want an itch.io upload.

## 8. Next five improvements

1. Make Level B damp: puddle-dark grout, mildew, condensation drips, quieter caustics.
2. A clearer Occupant silhouette on CCTV, so the replay reads instantly.
3. Panel glare control near the camera and more broken-up spawn halls.
4. Level C "P4", a parking structure, as the next depth.
5. Measure frame time on a real integrated GPU and tune the auto quality thresholds.

## 9. Run log

- Start: 06:21 Brisbane, 25 November 2026.
- M0: placeholder live by 06:30 (run 45481393184).
- M1, M2 and M3: 07:03 (run 45487246682); CI smoke job 07:05 (run 45487542760).
- M4: 07:19 (run 45489978037, smoke green).
- M5 freeze: 07:27. End: 07:45.
- Usage-limit waits: none.
