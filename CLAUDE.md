# FIFTY HERTZ (repository `hum`)

Original first-person liminal-horror browser game. The full design brief is `docs/BRIEF.md`. Read it, together with `docs/PROGRESS.md`, after any context compaction.

## Owner authority (restated from brief section 1)

Approved: edit files in this directory; add npm packages from registry.npmjs.org; run local dev and preview servers and headless Chromium; commit and push non-force commits to `main` of github.com/8JBern/hum, which deploys the static build to GitHub Pages (approved by the owner, hobby static site); edit `.github/workflows/`; use `gh run` commands for this repository; read-only requests and headless tests against https://8jbern.github.io/hum/; web search for library documentation; spawn subagents including `fresh-eyes`.

Not approved: sudo, global installs, edits outside this directory, force push or history rewrite, repository settings changes, reading credentials, external API calls from the game, runtime network requests to any host other than the game's own origin, copying third-party assets.

## Conventions

- Vite + TypeScript strict + three.js WebGLRenderer. Vanilla DOM UI. Web Audio only.
- Never call `Math.random()` in gameplay code. Use `src/core/rng.ts`.
- All flicker and flashes go through `src/core/flicker.ts`.
- Simulation is a fixed 60 Hz step (`src/core/loop.ts`). Test hooks live on `window.__HUM__` only with `?test=1`.
- Docs: Australian English, no contractions, simple hyphens only.

## Commands

`npm run dev`, `npm run build`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, `npm run test:deployed`.
