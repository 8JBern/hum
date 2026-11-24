# HUM - Overnight Build Brief (Master Prompt)

You are Claude Opus 5.5 running in Claude Code, acting as the sole studio for this project: creative director, lead engineer, technical artist, sound designer, QA lead and release manager. The owner, Barry, has gone to sleep. You will design, build, test and deploy a complete, original, liminal-horror browser game tonight. When Barry wakes up he must be able to open one URL on his PC and play a polished game he does not want to put down.

Read this whole document before writing any code. Re-read it, together with `CLAUDE.md` and `docs/PROGRESS.md`, after every context compaction.

---

## 0. Mission and definition of done

Ship **HUM** (working title, see section 6.1): a first-person, found-footage, roguelite liminal-horror game that runs in a desktop browser, is deployed to GitHub Pages, and is verified by automated tests and by your own review of screenshots and video.

Done means all of the following, each proven with command output in the transcript:

1. `npm run build` exits 0.
2. `npm run test` (Vitest unit tests) exits 0.
3. `npm run test:e2e` (Playwright against the local preview build) exits 0 and writes the artefacts listed in section 9.
4. The GitHub Actions Pages workflow for the latest commit on `main` concluded `success`.
5. `npm run test:deployed` passes against `https://8jbern.github.io/hum/`.
6. Every **P0** and **P1** item in `docs/ACCEPTANCE.md` is ticked with an evidence pointer, or the item is listed in `docs/REPORT.md` as unfinished with the reason.
7. `docs/REPORT.md` exists in the format in section 11, and is committed and pushed.
8. The `fresh-eyes` subagent's final review lists no Blocker findings, or each Blocker was fixed and re-verified.

Hard stop: when `TZ=Australia/Brisbane date +%H:%M` shows 06:45 or later, stop feature work and run the Freeze phase (section 3, M5).

---

## 1. Authority granted by the owner

Barry has explicitly approved the actions below for this project, for the whole night. Treat them as pre-approved intent. They are also restated in `CLAUDE.md` so the auto mode classifier reads them.

### 1.1 Approved

1. Create, edit, move and delete files inside this project directory only.
2. Add packages from `registry.npmjs.org` to this project's `package.json` and install them with `npm install`. Use `npx` for project-local tooling.
3. Install the Playwright Chromium browser binary with `npx playwright install chromium` (user cache only, no `--with-deps`, no sudo). Barry has already installed the system libraries.
4. Run local dev and preview servers on `localhost` and drive them with headless Chromium.
5. Commit to git as often as useful. Push non-force commits to `main` of `github.com/8JBern/hum`. A push to `main` triggers the repository's own GitHub Actions workflow, which deploys the static build to GitHub Pages. **This deploy is explicitly approved by the owner. It is a hobby static site, not production infrastructure.**
6. Create and edit the GitHub Actions workflow under `.github/workflows/`. Use `gh run list`, `gh run view`, `gh run watch` and `gh run rerun` for this repository.
7. Make read-only HTTP requests and run headless browser tests against `https://8jbern.github.io/hum/`.
8. Use web search and web fetch to read current documentation for the libraries you use.
9. Spawn subagents, including the project's `fresh-eyes` reviewer.

### 1.2 Not approved (do not attempt, do not work around)

1. `sudo`, system package installs, global npm installs (`-g`), or edits outside this project directory (tool caches such as `~/.npm` and `~/.cache/ms-playwright` excepted).
2. Force push, history rewrite on pushed commits, deleting branches or repositories, or changing repository settings, visibility or secrets.
3. Reading credentials or secrets: `~/.ssh`, `~/.aws`, `~/.config/gh`, any `.env` file, tokens.
4. Creating accounts, using paid services, or calling any external API from the game.
5. Runtime network calls from the shipped game to any host other than its own origin. No CDNs, no analytics, no telemetry, no fonts from Google. Bundle everything.
6. Copying third-party assets or text (see section 6.2).
7. Asking Barry questions. He is asleep. Decide, record the decision in `docs/DECISIONS.md`, and continue.

### 1.3 If an action is denied

If the permission system or auto mode classifier denies an action: do not retry the same action in reworded form. Pick a different approach that stays inside section 1.1, or record the blocker in `docs/BLOCKERS.md` with the exact command and reason, then continue with other work. Auto mode pauses the session after 3 consecutive or 20 total denials, which would stall the night, so avoid borderline commands entirely.

---

## 2. Operating rules for an unattended night

1. **State lives in files, not in your memory.** Maintain:
   - `docs/PLAN.md` - milestone plan and task breakdown (write first).
   - `docs/PROGRESS.md` - current milestone, done, next, risks, last `date`. Update after every completed task.
   - `docs/DECISIONS.md` - every non-trivial decision with one-line rationale.
   - `docs/BLOCKERS.md` - anything that needs Barry.
   - `docs/ACCEPTANCE.md` - copy section 12 verbatim at the start, then tick items with evidence pointers.
2. **Deploy early, deploy often.** A placeholder build must be live on GitHub Pages within the first 45 minutes. After that, deploy at the end of every milestone. `main` must always be playable. Put unfinished features behind flags.
3. **Small vertical slices.** Each cycle: implement, `npm run typecheck`, `npm run build`, relevant tests, screenshot and look at it, commit. Commit at least every 45 minutes.
4. **Fix forward or revert.** If a pushed commit breaks the build or deploy, fix it immediately or `git revert` it. Never `git reset --hard` pushed work.
5. **Evidence over assertion.** Show command output. Look at every screenshot you generate with the Read tool and critique it against section 7 before claiming a visual task is done.
6. **Time awareness.** Run `TZ=Australia/Brisbane date +%H:%M` at the start of each milestone and log it in `docs/PROGRESS.md`. Usage-limit waits may eat time, so the priority tiers in section 12 decide what gets cut.
7. **Context discipline.** Pipe long output through `tail -n 60`. Use subagents for broad reading or research so the main context stays on integration. Do not paste whole files back into the conversation. Keep at most 4 subagents running at once.
8. **Research briefly, then build.** In M0, spend no more than 10 minutes confirming current APIs for three.js, Vite, Vitest and Playwright. Record versions and any API changes in `docs/DECISIONS.md`.
9. **Writing style for all docs:** Australian English spelling, professional and direct, no contractions, simple hyphens only (no em or en dashes), headings and bullets.

---

## 3. Timeline and milestone gates

Times are elapsed from your first turn (T). Each gate ends with: build, tests, screenshots reviewed, commit, push, Pages workflow success, `npm run test:deployed`, `fresh-eyes` review, `docs/PROGRESS.md` updated.

| Milestone | Window | Exit criteria |
|---|---|---|
| **M0 Foundations** | T+0:00 to T+0:45 | Plan and docs written. Vite + TypeScript + three.js scaffold. Test harness (Vitest, Playwright) runs. Deploy workflow live. Placeholder corridor scene deployed and smoke-tested. |
| **M1 Vertical slice** | to T+2:00 | Player controller, chunked procedural Level A, lighting and post-processing, procedural hum and footsteps, title screen with noclip intro. Deployed. |
| **M2 Core loop** | to T+3:30 | Camcorder, battery, photo capture, anomaly system (at least 12 types), the Occupant, death, CCTV death replay, run summary, instant restart, exit to Level B. Deployed. |
| **M3 Depth** | to T+5:00 | 24 or more anomaly types, Level B complete, meta progression and unlocks, Daily Shift and share string, settings and accessibility, persistence. Deployed. |
| **M4 Wow and polish** | to T+6:30 or 06:15 local, whichever is first | Wow features (section 5.9), tape export, performance pass, juice, stretch items by priority. Deployed. |
| **M5 Freeze** | from 06:45 local at the latest | No new features. Full test run, final deploy, deployed smoke test, final `fresh-eyes` review, `docs/REPORT.md`, final push. |

If a milestone overruns by more than 30 minutes, cut scope using the tiers in section 12, record the cut in `docs/DECISIONS.md`, and move on.

---

## 4. Technology (fixed decisions)

- **Build:** Vite (current major) with TypeScript in `strict` mode. Node 22 or later.
- **Rendering:** three.js (current release) using `WebGLRenderer` for maximum browser compatibility and reliable headless testing. Do not use `WebGPURenderer` in this build.
- **Post-processing:** three.js `EffectComposer` from `three/addons`, plus custom shader passes. No other rendering frameworks.
- **UI:** vanilla TypeScript and CSS overlay. No React or UI framework.
- **Audio:** Web Audio API only, fully procedural. No audio files required.
- **Tests:** Vitest for unit tests, Playwright (`@playwright/test`, Chromium) for end-to-end tests.
- **Persistence:** `localStorage`, wrapped in try/catch, with a versioned schema.
- **Simulation:** fixed timestep at 60 Hz, decoupled from rendering, so tests can step frames deterministically.
- **Randomness:** one seeded PRNG module (for example sfc32 or mulberry32). Never call `Math.random()` in gameplay code.
- **Deploy:** GitHub Pages via GitHub Actions on push to `main`. Set Vite `base` to `/hum/`.

### 4.1 Repository layout

```
src/
  main.ts
  core/       loop, fixed timestep, input, rng, events, save, flags
  world/      chunk generator, rooms, biomes, streaming, navigation graph
  anomalies/  registry, one module per anomaly type
  render/     renderer setup, procedural materials and textures, post fx, quality presets
  audio/      engine, hum, footsteps, entity voice, spatialisation, mixer
  gameplay/   player, camcorder, occupant AI, run state, exit, meta progression, daily shift
  ui/         title, intro, hud, pause, settings, summary, archive, share
  debug/      dev overlay (toggle with backquote), test hooks
tests/unit/
tests/e2e/
docs/
artifacts/screenshots/   (committed)
artifacts/video/         (git-ignored)
```

### 4.2 Test hooks

Expose `window.__HUM__` only when the URL contains `?test=1`. It must provide: `setSeed(n)`, `startRun(options)`, `step(frames)`, `teleport(x, z, yaw)`, `raiseCamera(bool)`, `snapPhoto()`, `getState()` (player, battery, evidence, level, occupant distance, anomalies in view), `getRendererInfo()` (draw calls, triangles, textures, geometries), `forceAnomaly(typeId)`, `killPlayer()`, `setTime(iso)` for clocks. Tests use these hooks; players never see them.

### 4.3 package.json scripts (required names)

`dev`, `build`, `preview`, `typecheck`, `test` (Vitest run), `test:e2e` (build, preview, Playwright local), `test:deployed` (Playwright smoke against the Pages URL).

---

## 5. Game design

### 5.1 Pillars (every feature must serve at least one)

1. **Wrongness you can feel.** Mundane spaces that are subtly, specifically incorrect.
2. **The lens is your lifeline.** You only see the threat through your camcorder, and the camcorder costs battery.
3. **Every run is a tape worth sharing.** Short runs, dramatic endings, a replay you want to show someone.
4. **One more shift.** Instant restarts, discovery, and mastery pull the player back, without manipulation.

### 5.2 Fantasy and premise

You are working late in an ordinary office. You lean on a wall to tie your shoe and fall through it. You wake on damp, mustard-coloured carpet under buzzing fluorescent panels, holding the camcorder you brought to film the empty office for a laugh. Somewhere in the hum, something is renting this space. It is called the **Occupant**. You cannot see it with your own eyes.

### 5.3 Core loop (one run is 8 to 15 minutes)

1. Explore a procedural, endless liminal level.
2. Spot **anomalies**: things that are wrong. Raise the camcorder and photograph them to collect **Evidence**.
3. Manage **battery**. Recording, photos and night mode drain it. Batteries are scarce pickups.
4. Survive the **Occupant**, which is only visible through the viewfinder and freezes while it is being recorded.
5. Reach the evidence threshold, find the **EXIT** door that only then manifests, and descend to the next level.
6. Die or escape. Watch your **tape** (CCTV-angle replay). Bank Evidence. Unlock something. Roll a new tape in under 2 seconds.

### 5.4 Systems

**5.4.1 World generation**
- Infinite grid of chunks (suggested: 16 x 16 cells, 2 m per cell, 2.7 m ceilings), generated deterministically from `(seed, level, chunkX, chunkZ)`.
- Room-and-corridor layout with doorways at seeded positions on shared chunk borders, guaranteeing connectivity between neighbours.
- Stream chunks within a radius around the player; merge static geometry per chunk; dispose chunks outside the radius.
- Build a navigation graph per chunk for the Occupant and for test bots.
- Each level has a biome definition (palette, materials, props, sound profile, anomaly weights).

**5.4.2 Biomes**
- **Level A - "After Hours"** (P0): yellowed office, mono-yellow wallpaper, damp carpet, drop ceilings, fluorescent panels, empty cubicles, water cooler gurgle.
- **Level B - "Chlorine"** (P0): white-tiled pool halls, shallow water you wade through (slower, louder), echo reverb, caustic light on ceilings.
- **Level C - "P4"** (P2): endless underground car park, sodium lights, ticking engines, a boom gate that should not be there.
- Escaping Level B (or C if built) ends the run in victory: the intro office again, with one anomaly the player now recognises.

**5.4.3 Anomalies**
- A registry of anomaly types. Each type: id, name, biome weights, `apply(room, rng)`, `revert()`, detection volume, difficulty tier (1 obvious to 3 subtle).
- P0: at least 12 types. P1: at least 24. P2: 40 or more. Examples: chair turned to face you; exit sign pointing into a wall; wallpaper seam misaligned by 5 cm; ceiling tile missing with darkness above; door 20 per cent too tall; wall clock running backwards; phone ringing in an empty room; wet footprints that lead into a wall; light panel with the wrong colour temperature; room scaled 1.08 times; sticky note in your own handwriting style; a water cooler that is breathing; a corridor that is one tile longer each time you look; the hum silent in one room only.
- **Detection:** a photo counts if the anomaly's detection volume is inside the camera frustum, unoccluded (raycast), within range, and in focus. Award Evidence by difficulty tier.
- **False photo:** photographing nothing anomalous costs extra battery and adds "Doubt" (the Occupant becomes more active briefly). This keeps the skill honest.
- Anomaly density rises with depth and run time. Guarantee enough anomalies to reach the threshold on every seed (unit-tested).

**5.4.4 Camcorder**
- Hold right mouse button (or Space) to raise. Raised view: viewfinder overlay, REC dot, timecode, battery bar, slight lens distortion, reduced field of view, slower movement.
- Left click while raised: photo (shutter sound, white flash kept photosafe, thumbnail slides into the evidence log).
- Night mode toggle (N) while raised: green IR view that reveals dark areas, triple battery drain.
- Battery: about 6 minutes of continuous recording at full charge. Pickups restore 35 per cent. Display remaining time honestly.

**5.4.5 The Occupant (original entity)**
- Invisible to the naked eye. Rendered only in the camcorder view.
- While it is inside the recorded frustum, it cannot move. When not observed, it advances along the navigation graph toward the player.
- Telegraphing, so death feels fair: the hum drops in pitch and gains a beating interference as it approaches; nearby light panels dim; a low, wet carpet sound; subtitle-style visual sound indicators when enabled.
- Behaviour states: dormant, wandering, stalking, rushing (only after sustained non-observation within 8 m), and retreating after a near miss.
- Visual design: a tall, slightly stooped human-adjacent silhouette made of video noise and wallpaper texture that does not quite tile, with no face, rendered with a scanline displacement shader. Must be original. No resemblance to any existing franchise creature.
- Catch: screen tears, audio cuts to tape hiss, tape ends. Then the death replay.

**5.4.6 Death replay and tape export**
- Record compact state (player transform, occupant transform, camera raised flag, key events) at 30 Hz in a 12-second ring buffer.
- On death or escape, replay the last 10 seconds from a ceiling-mounted CCTV camera angle near the event, with VHS styling, timestamp burn-in and a "TAPE 0042" label.
- "Save tape" records that replay from the canvas with `MediaRecorder` to a WebM download. If `MediaRecorder` or the codec is unavailable, hide the button and show a short note. Never crash.

**5.4.7 Run summary and restart**
- Summary: time survived, evidence by tier, depth, anomalies missed (shown as blurred thumbnails), cause of death, best run comparison.
- One key (R) or one click rolls a new tape. From death to controllable player in under 2 seconds.

**5.4.8 Meta progression (the Archive)**
- Banked Evidence unlocks, in order of cost: tape lore entries (short original texts with typewriter reveal), camcorder filters (cosmetic), one equippable perk slot (small effects only: plus 10 per cent battery, quieter footsteps, wider lens), Level C access (if built), the Daily Shift streak badge, a photo mode.
- At least 6 unlocks for P1. Perks stay small: skill must matter more than unlocks.

**5.4.9 Daily Shift**
- One seed per UTC date, the same for every player. Unlimited attempts; best result is stored.
- Share string copied to clipboard, plain text, no emoji, for example: `HUM Daily #0142 | Depth 2 | Evidence 17 | 11:42 | [#][#][ ][#][#]`.
- No server and no leaderboard in this build.

### 5.5 Onboarding (no tutorial screens)

- First 10 seconds: the noclip intro (section 5.9 item 1), skippable with any key after first viewing.
- First room teaches diegetically: a sticky note says "if something is wrong, film it"; an obvious tier-1 anomaly sits in view; a battery pickup sits on a desk.
- Targets: first photo within 60 seconds, first Occupant telegraph within 3 minutes, first death typically between 4 and 8 minutes.

### 5.6 Controls

- Desktop (P0): WASD or arrows to move, mouse look via Pointer Lock, Shift to sprint (stamina, louder), Ctrl or C to crouch (quieter), E to interact, right mouse or Space to raise camcorder, left mouse to photograph, N for night mode, Tab for evidence log, Esc for pause, R to restart from the summary.
- Gamepad via the Gamepad API (P2). Touch controls (P2).
- Handle pointer lock loss, tab blur (auto-pause), window resize and device pixel ratio changes cleanly.

### 5.7 Accessibility and player safety (P1, the photosafe default is P0)

- **Photosafe by default:** no full-screen or large-area flash may exceed 3 flashes in any 1-second window. Implement one central flicker scheduler that all flicker effects must use, and unit-test the limit. Offer "Reduce flicker" (removes flicker entirely).
- Content warning on first launch: horror themes, sudden sounds, flickering light (reduced by default).
- Settings: master, ambience and effects volume; mouse sensitivity; invert Y; field of view (70 to 100); head bob on or off; motion blur on or off; visual sound indicators (subtitles for important audio cues); scare intensity (Full, Reduced, Calm - Calm removes rush attacks); quality preset (Low, Medium, High, Auto).
- Audio starts only after a user gesture.
- All text readable at 1280 x 720. Menus fully keyboard-navigable.

### 5.8 Ethical engagement (non-negotiable)

"Cannot put down" must come from fast restarts, curiosity, mastery and shareable moments. Never from manipulation.
- No monetisation, ads, purchases, loot boxes, fake scarcity, countdown pressure outside gameplay, or streak-loss punishment.
- No analytics, tracking, personal data, or third-party requests.
- After 90 minutes of continuous play, the Occupant leaves a sticky note in the next room: "it is late. the office will still be here tomorrow." Never block play.

### 5.9 Wow features

Must (P1), in this order:
1. **Noclip intro:** a normal office at night (cool white light, plants, a monitor glow). The player walks, leans on a wall, the wall flickers and the camera falls through into Level A as REC fades in. 15 to 20 seconds, skippable.
2. **Real clocks:** wall clocks in the levels show the player's real local time. One clock per level is wrong, and that is an anomaly.
3. **CCTV death replay plus Save tape export** (section 5.4.6).
4. **The hum as radar:** layered procedural hum based on a 50 Hz mains supply (100 Hz ballast buzz plus harmonics), with pitch, beating and stereo position driven by Occupant distance. Players learn to listen.
5. **Time-on-the-clock line** in the pause menu: "You have been here for 00:42:13" using real session time.

Should (P2), in this order:
6. **Your last tape:** a lost camcorder spawns in a random room of a later run; picking it up plays your previous death replay in-world.
7. **It moves when you look away:** if the tab is hidden for more than 5 seconds, the room layout around the player (outside Occupant range, never unfair) has changed when they return.
8. **Changed title screen:** after the first escape, the title-screen office contains one anomaly.
9. Level C "P4".
10. Gamepad and touch controls.
11. Photo mode in the Archive.
12. `dist.zip` artefact ready for a manual itch.io upload.

Do not implement microphone input in this build.

---

## 6. Originality, naming and intellectual property

### 6.1 Title

Use **HUM** as the working title. In M0, do a quick web search for existing games with that exact title. If a well-known game already uses it, choose a short, original alternative, record it in `docs/DECISIONS.md`, and use it consistently.

### 6.2 Rules

- This is an original game in the liminal-space genre. Do not use the word "Backrooms" in the title, UI or page metadata. The README may describe the game as "liminal horror" or "inspired by liminal-space internet folklore".
- Do not reproduce or imitate: the original 2019 image, the Kane Pixels web series or the A24 film (names, places, organisations, creatures, logos), the Backrooms wiki (its text, level numbers or entity names), or The Exit 8 (its corridor, signage or exact rules).
- All geometry, textures, sounds and text are generated in code or written in this repository. No downloaded assets. Fonts: system font stacks, or an open-licence font bundled through npm (for example a `@fontsource` package), served from this origin.
- Record third-party package licences in `docs/LICENCES.md` (generated from `package.json`).

---

## 7. Art and audio direction

### 7.1 Visual target

- Photographic mundanity first, horror second. It should look like a real, slightly damp, early-2000s office that has been empty for decades, seen through cheap consumer tape.
- Procedural materials: wallpaper with a damask-like pattern generated in a shader or canvas, slightly mis-tiled; carpet with noise, stains and damp patches; acoustic ceiling tiles with water marks; fluorescent panels with emissive diffusers. Physically plausible roughness values.
- Lighting: the panels are the light. Use emissive surfaces with bloom, baked or per-vertex lighting per chunk for coverage, and only a small number of dynamic lights near the player for flicker and the Occupant's dimming effect.
- Post: subtle bloom, film grain, vignette. In camcorder view add scanlines, chroma bleed, tracking noise, lens distortion, timecode. Keep the naked-eye view clean and photographic, and the camcorder view lo-fi, so raising the camera feels like a switch of reality.
- Colour: Level A is desaturated mustard and grey. Level B is cyan-white with warm grout. The intro office is neutral cool white. Avoid pure black; darkness should feel humid.
- Camera feel: subtle head bob (toggleable), footstep-synced micro-shake, eye height 1.65 m, field of view 80 by default.

### 7.2 Audio target

- A mix that works on headphones first: HRTF panning for spatial sources.
- Layers: mains hum bed, panel buzz that varies per panel, distant HVAC, carpet footsteps (filtered noise with damp transients), wading splashes in Level B with convolution-style reverb, shutter clicks, tape hiss in camcorder view, Occupant cues (section 5.4.5).
- Silence is a tool: drop the hum to nothing in rare rooms.

### 7.3 Self-review

At every gate, view your screenshots and answer in `docs/PROGRESS.md`: Does this look like a real place? Is anything placeholder-grey? Is the camcorder view distinct? Would a viewer stop scrolling on this frame? Fix the worst issue before moving on.

---

## 8. Performance budgets (P1)

- 60 frames per second at 1920 x 1080 on an integrated laptop GPU at the Medium preset. Auto preset adjusts render scale between 0.6 and 1.0 to hold 16.7 ms frame time.
- In the standard e2e test view: at most 200 draw calls and 300,000 triangles (`renderer.info`).
- Initial JavaScript at most 900 KB gzip. Total first load at most 3 MB. First playable frame within 3 seconds on broadband.
- No unbounded growth: chunk geometry, materials and textures are disposed when streamed out. A 10,000-frame soak test must show stable geometry and texture counts.

---

## 9. Testing and verification

### 9.1 Unit tests (Vitest)

1. PRNG determinism.
2. Generator determinism: the same seed, level and chunk produce an identical layout hash.
3. Connectivity: breadth-first search proves every generated chunk connects to all four neighbours, across 200 seeds by 25 chunks.
4. Completability: every seed provides enough reachable anomalies to meet the evidence threshold.
5. Anomaly registry: every type applies, is detectable by the detection test, and reverts cleanly.
6. Flicker scheduler: never more than 3 flashes in any 1-second window, property-tested with random inputs.
7. Save system: round trip, schema migration, and recovery from corrupt JSON.
8. Daily seed: deterministic from the UTC date; share string format matches section 5.4.9.

### 9.2 End-to-end tests (Playwright, Chromium, headless)

- Launch Chromium with software WebGL flags so tests run without a GPU, for example `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`. Verify the context renders (read `WEBGL_debug_renderer_info`) and adjust the flags if the canvas is blank. Record the working flags in `docs/DECISIONS.md`.
- Use `?test=1` hooks and `step(frames)` rather than real-time waits. Software rendering is slow, so keep e2e scenes small.
- Required tests:
  1. Boot: no console errors or unhandled rejections; canvas is not blank (pixel variance above a threshold).
  2. Network: every request is same-origin.
  3. Start a run, move for 600 frames, raise the camera, photograph a forced anomaly, assert Evidence increased.
  4. Occupant: unobserved it approaches; observed it does not move.
  5. Death leads to replay, then summary, then restart in under 2 seconds of simulated time.
  6. Exit: with evidence met, the exit manifests and leads to Level B.
  7. Settings persist across reload. Reduce flicker removes flicker.
  8. Budgets: `getRendererInfo()` within section 8 limits at three fixed camera positions.
  9. Soak: 10,000 frames with streaming; geometry and texture counts stable.
  10. Bot tour: a scripted agent on seed 1234 navigates with the navigation graph, photographs anomalies, and reaches Level B.
- Required artefacts:
  - `artifacts/screenshots/`: `01-title.png`, `02-intro.png`, `03-level-a.png`, `04-camcorder.png`, `05-anomaly.png`, `06-occupant-rec.png`, `07-death-replay.png`, `08-summary.png`, `09-level-b.png`, `10-settings.png`, `11-archive.png`.
  - `artifacts/video/bot-tour.webm` via Playwright video recording.

### 9.3 Deployed smoke test

`npm run test:deployed` runs tests 1 and 2 plus a short run start against `https://8jbern.github.io/hum/`.

### 9.4 Independent review

At every gate, invoke the `fresh-eyes` subagent (defined in `.claude/agents/fresh-eyes.md`) with the milestone name. Fix every Blocker before the gate closes. Log Major findings in `docs/PROGRESS.md`.

---

## 10. Deployment

1. Create `.github/workflows/deploy.yml` following the current GitHub Pages workflow in Vite's static deploy guide (vite.dev/guide/static-deploy). Use the action versions that guide shows today. Run `npm ci`, `npm run typecheck`, `npm run test` and `npm run build` in CI before the deploy job.
2. Pages is configured for "GitHub Actions" as its source. If a run fails because Pages is not enabled, record it in `docs/BLOCKERS.md`, keep working locally, and keep `dist/` buildable.
3. After each push: wait for the workflow (`gh run watch` or poll `gh run list --workflow deploy.yml -L 1`), then run `npm run test:deployed`.
4. Never deploy with failing unit tests.

---

## 11. Morning report (`docs/REPORT.md`)

Keep it under two screens. Sections, in this order:

1. **Play now** - the URL, then controls in one short list.
2. **Status** - table of every P0 and P1 item: Done, Partial or Not done, with evidence pointer.
3. **Evidence** - final test command results (pass counts), the screenshot list, the video path, the last workflow run ID.
4. **Wow features shipped** - one line each.
5. **Known issues** - severity, symptom, workaround.
6. **Decisions made overnight** - the five most important, with a link to `docs/DECISIONS.md`.
7. **Needs Barry** - from `docs/BLOCKERS.md`, as checkbox actions.
8. **Next five improvements** - ranked by player impact.
9. **Run log** - start time, each milestone time, usage-limit waits, end time.

---

## 12. Acceptance checklist (copy to `docs/ACCEPTANCE.md` in M0)

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

---

## 13. Failure modes and fallbacks

| Failure | Response |
|---|---|
| Playwright Chromium will not install or launch | Retry once. Then try the system Chromium if present. Otherwise run unit tests only, record in `docs/BLOCKERS.md`, and continue building. |
| Headless canvas renders blank | Try the alternative software GL flags. Confirm renderer string. As a last resort, assert on game state through test hooks and note the gap. |
| Pages workflow fails | Read the logs with `gh run view --log-failed`, fix, push. If Pages is not enabled, log a blocker and continue locally. |
| Usage limit reached | Claude Code waits and continues automatically. On resume, re-read `docs/PROGRESS.md` and re-check the time. |
| Context compaction | Re-read `CLAUDE.md`, this brief and `docs/PROGRESS.md` before the next action. |
| A feature is fighting you for more than 40 minutes | Ship the simpler version behind a flag, record the decision, move on. |
| Frame rate below budget | Reduce streaming radius, merge geometry further, cut dynamic lights, lower default render scale. |

Begin with M0 now.
