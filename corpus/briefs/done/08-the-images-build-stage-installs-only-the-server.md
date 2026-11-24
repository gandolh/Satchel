# Brief 08: The image's build stage installs only the server, on a pinned base

**Depends on:** nothing.
**Builder:** Sonnet.
**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Filed 2026-11-24 from the estate's infra review. Every app image is built on the box by vps-deploy's `server`
phase, and on 2026-11-23 the box's build cache (9.3 GB) took its disk to 90%. The cache was pruned to zero on
2026-11-24, so the next rollout builds every image cold. The same tidy is filed in ten repos; sports-app's
Dockerfile already scopes its build install.

## Context

Two things in `infrastructure/Dockerfile`, both build-side or base-side. The image that runs doesn't change.

- **The `deps` stage installs every workspace** (`RUN npm ci`, line 42) to run `npx tsc -b server` (line
  51). The web app's tree (React, Base UI, Vite, Tailwind, Playwright's test runner) is installed for nothing.
  Measured on the laptop on 2026-11-24: the full
  install is 372 MB of `node_modules`; the server's closure plus the root's dev dependencies (which hold
  `typescript`) is about 260 MB, so about 112 MB less per cold build. `proddeps` is already scoped the
  same way.
- **The base floats.** `FROM node:24-alpine` (lines 28, 56, 85) follows whatever the tag is on the day of the
  build: on the laptop it is Node 24.21.0 on alpine 3.24.2, while imbatranimOS pins `node:24.22.1-alpine`. On the
  box that is two separate 171 MB bases and two copies of the `apk add python3 make g++` layer, which is otherwise
  one cached layer shared by every alpine Dockerfile. vps-deploy's weekly housekeeping removes a base tag no image
  uses after two weeks; the next deploy pulls the tag's current image, every cache entry keyed on the old one is
  dead, and each app lands on a different Node patch depending on when it was last built.

## Decisions

- `deps` runs `npm ci -w @satchel/server --include-workspace-root`: sports-app's build stage scopes
  the same way, and the flag adds the root's dev dependencies, where `typescript` is. Every manifest is still
  copied: `npm ci` checks the lockfile against all of them.
- Every stage's base is `node:24.22.1-alpine`. The estate moves to a new patch in one sweep, not per repo.

## Files you OWN

- `infrastructure/Dockerfile`
- The image paragraph in `corpus/wiki/architecture.md` (it names `node:24-alpine`)
- The closeout: the outcome note, `corpus/log.md`, `corpus/wiki/status.md`

## Files you must NOT touch

- Any `package.json` or `package-lock.json`; `infrastructure/docker-compose.yml`.
- vps-deploy: read only.

## What to do

1. **Check the scoped install without Docker.** Export the tree to a scratch folder outside the repo
   (`git archive HEAD | tar -x -C <scratch>`). There, run the full `npm ci` and `du -sm node_modules`; delete
   `node_modules`, run the scoped command, `du -sm` again, then `npx tsc -b server`. It must compile. If it fails
   on a missing package, add the workspace that brings it (`-w` again) and say so in the outcome.
2. Edit the Dockerfile: the scoped `deps` install with a comment saying why, and the three `FROM node` lines.
3. On the laptop, build today's image and the new one (`docker compose -f infrastructure/docker-compose.yml build
   satchel-api`) and save `docker history` of each and the `deps` stage's size (`docker build --target deps`).
4. Start the new image on a scratch data folder: the container turns healthy and `/api/health` answers.

If your session can't build Docker images, do steps 1 and 2, run the checks, and hand back with steps 3 and 4 for
the controller.

## Acceptance

- [ ] Step 1's two `du` readings and the compile result are in the outcome.
- [ ] The image builds on the laptop; `docker history` before and after, from one machine, in the outcome. The
      `deps` stage is smaller; the final image is within a few MB of today's.
- [ ] Step 4 passes.
- [ ] `npm run check` exits 0; `bash corpus/lint.sh` passes.
- [ ] End move `ready_for_deploy`.

## Owner steps

- `node cli.ts satchel server` from vps-deploy. The deploy builds the image on the box.

## Outcome

Built 2026-11-24 by the controller (8971a85). Ready for deploy: `node cli.ts satchel server`.

- **Step 1**, in a `git archive` export: the full `npm ci` leaves 371 MB of `node_modules`; `npm ci -w
  @satchel/server --include-workspace-root` leaves 261 MB (110 MB less), and `npx tsc -b server` compiles. No
  extra workspace was needed: `shared` comes with the server.
- **Step 2**: `deps` runs the scoped install with a comment saying why; the three `FROM` lines are
  `node:24.22.1-alpine`. `wiki/architecture.md` names the pinned base.
- **Step 3**, both built on the laptop the same hour: the `deps` stage image 953 MB before, 866 MB after; the
  final image 202 MB before, 203 MB after. `docker history` differs only in three layer sizes by about 10 kB to
  1 MB (the pinned Node patch).
- **Step 4**: the new image on a scratch data folder, with `PUBLIC_ORIGIN` set (it refuses to start without
  one), turned healthy; `/api/health` answered `{"ok":true}`; Node is v24.22.1. Test images and the container
  were removed.
- `npm run check` exits 0; `bash corpus/lint.sh` passes.
