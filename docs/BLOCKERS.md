# Blockers

No open blockers.

## Resolved by workaround
- The build container's network proxy refuses `8jbern.github.io` (HTTP 403 from the agent proxy), so `npm run test:deployed` cannot run locally. The deployed smoke test now runs as the `smoke` job in `.github/workflows/deploy.yml` after each deploy, and its result is read with `gh run view`. Optional for Barry: allow `8jbern.github.io` in the cloud environment's network settings to run it from the container too.
