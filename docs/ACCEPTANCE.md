# Acceptance checklist

Copied verbatim from the build brief section 12. Ticks carry evidence pointers.

Priority tiers: **P0** must ship for the game to count as working. **P1** completes the intended experience. **P2** is stretch, built in listed order only after P0 and P1 pass. When cutting scope, cut P2 first, then the lowest P1 items, never P0.

### P0 - working game

- [ ] P0-01 Title screen with Start, Settings and content warning.
- [ ] P0-02 First-person controller with collision, sprint and crouch; pointer lock handling; pause on blur.
- [ ] P0-03 Infinite, deterministic, streamed Level A; connectivity tests pass.
- [ ] P0-04 Fluorescent lighting, bloom and grain; photosafe flicker scheduler with unit test.
- [ ] P0-05 Procedural hum and footsteps; audio unlocks on first gesture; volume setting.
- [ ] P0-06 Camcorder raise, REC overlay, battery drain, photo capture, battery pickups.
- [ ] P0-07 At least 12 anomaly types with fair detection and false-photo penalty.
- [ ] P0-08 The Occupant: visible only through the lens, frozen while recorded, telegraphed approach, catch leads to death.
- [ ] P0-09 Exit manifests at the evidence threshold and leads to Level B; Level B playable.
- [ ] P0-10 Run summary and restart in under 2 seconds.
- [ ] P0-11 Persistence with versioned schema and corrupt-save recovery.
- [ ] P0-12 Zero console errors; same-origin requests only.
- [ ] P0-13 Deployed to GitHub Pages; deployed smoke test passes.
- [ ] P0-14 `docs/REPORT.md` complete and pushed.

### P1 - intended experience

- [ ] P1-01 Noclip intro (skippable).
- [ ] P1-02 At least 24 anomaly types across Levels A and B.
- [ ] P1-03 CCTV death replay and Save tape WebM export with graceful fallback.
- [ ] P1-04 Real local-time wall clocks, including one wrong clock anomaly per level.
- [ ] P1-05 Hum-as-radar audio driven by Occupant distance, with visual sound indicators option.
- [ ] P1-06 Archive meta progression with at least 6 unlocks and one perk slot.
- [ ] P1-07 Daily Shift seed and plain-text share string.
- [ ] P1-08 Full settings and accessibility list in section 5.7, including Calm mode and Reduce flicker.
- [ ] P1-09 Performance budgets in section 8 met, with e2e evidence.
- [ ] P1-10 Time-on-the-clock line and the 90-minute sticky note.
- [ ] P1-11 All e2e tests and artefacts in section 9.2, including the bot tour video.
- [ ] P1-12 `docs/LICENCES.md`.

### P2 - stretch (in order)

- [ ] P2-01 Your last tape (lost camcorder replay).
- [ ] P2-02 Room changes after tab hidden for more than 5 seconds.
- [ ] P2-03 Changed title screen after first escape.
- [ ] P2-04 Anomaly types expanded to 40 or more.
- [ ] P2-05 Level C "P4".
- [ ] P2-06 Gamepad support.
- [ ] P2-07 Touch controls.
- [ ] P2-08 Photo mode.
- [ ] P2-09 `dist.zip` for itch.io upload.

