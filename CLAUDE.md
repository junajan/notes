# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A minimalist note-taking app: Vue 3 frontend + Express/better-sqlite3 backend, sharing Zod schemas via an npm workspace package. Notes are organized as draggable tabs with a monospaced, line-numbered editor and debounced auto-save.

## Commands

This is an npm-workspaces monorepo with three workspaces: `backend`, `frontend`, `packages/shared`.

```bash
npm install                                   # install everything from repo root
npm run dev                                   # runs backend + frontend concurrently (root script)
npm run dev --workspace=@notes/backend        # backend only, http://localhost:3000 (tsx --watch)
npm run dev --workspace=@notes/frontend       # frontend only, http://localhost:5173 (vite, proxies /api -> :3000)
```

Building (order matters — shared must build before backend/frontend consume its compiled output in Docker/CI):
```bash
npm run build --workspace=@notes/shared
npm run build --workspace=@notes/backend      # tsc -> backend/dist
npm run build --workspace=@notes/frontend     # vue-tsc -b && vite build -> frontend/dist
```
In dev mode both `tsx` (backend) and Vite (frontend) resolve `@notes/shared` straight to its `.ts` source via path aliases, so the shared package does not need to be built for local dev.

Testing (backend only — frontend has no test setup):
```bash
cd backend && npm test                        # jest via --experimental-vm-modules (ESM), uses supertest
cd backend && npm test -- -t "should login"    # run a single test by name
cd backend && npm test -- server.test.ts       # run a single test file
```
Backend tests import `app`/`db` directly from `server.ts` (no network listener in `NODE_ENV=test`) and wipe the `notes` table in `beforeEach`. Root `npm test` is a stub and does nothing useful.

There is no lint script configured in any workspace.

## Architecture

**Monorepo layout:** `backend/` (Express API + SQLite), `frontend/` (Vue 3 SPA), `packages/shared/` (Zod schemas + inferred TS types, the single source of truth for the `Note` shape, imported by both other workspaces as `@notes/shared`).

**Auth model:** Single shared-password auth (`APP_PASSWORD` env var, default `'123'`), no user accounts. `/api/login` issues a JWT stored in an httpOnly cookie (`auth_token`); every authenticated request rolls the session forward by re-signing and re-setting the cookie (1-year sliding expiry). `JWT_SECRET` has a dev default but the server hard-exits at boot if it's left at the default while `NODE_ENV=production`. A custom-header CSRF check (`X-Notes-Requested-With`) is required on every non-GET/HEAD/OPTIONS request — the axios client in `frontend/src/stores/noteStore.ts` sets this globally, so any new API call from the frontend must go through axios with defaults intact (or manually add the header).

**Public sharing is a parallel, unauthenticated read/write path**, not just a read-only view: notes can be flagged `isPublic` (viewable via `/api/public/notes/:id` or a human-friendly `/api/public/notes/slug/:slug`) and additionally `isPublicEditable` (lets anonymous visitors edit content through `/api/public/notes/:id` PATCH with no auth). These routes live outside the `authenticate` middleware, which is mounted only on `/api/notes`. Slugs are validated (`^[a-z0-9-]+$`) and unique at the DB level.

**Database:** a single `better-sqlite3` file at `backend/data/notes.db` (gitignored, persisted via Docker volume in prod). There is no migration framework — schema evolution is done inline in `server.ts` at boot by attempting a `SELECT` of a column and `ALTER TABLE ADD COLUMN` in the `catch` if it's missing. Any new `Note` field needs the same treatment in both `server.ts` (table + migration) and `packages/shared/src/index.ts` (Zod schema).

**Frontend state:** all app state lives in one Pinia store (`frontend/src/stores/noteStore.ts`) — auth status, the notes list, the active note, the public-view note, saving/error state, and theme. There is no router; navigation is manual via `URLSearchParams` (`?note=<id>`) and pathname-based slugs, updated with `window.history.replaceState`. `activeNote` is a computed that falls back from the authenticated `notes` array to the unauthenticated `publicNote`, which is how the same `NoteEditor` component serves both authenticated and public/anonymous views (gating writability on `isAuthenticated` / `isPublicEditable`). Edits (title/slug/content) are optimistically applied locally, then saved via a single shared 500ms debounce timer per store — rapid edits across different notes will race against that one timer.

**Editor shortcuts:** `NoteEditor.vue` implements line-duplicate/cut/move (Cmd/Ctrl+Shift+D, Cmd/Ctrl+X on empty selection, Alt+Shift+Up/Down) itself at the DOM level via a capturing global `keydown` listener gated on `document.activeElement` being the textarea — there's no editor library underneath, just a plain `<textarea>` with a synced line-number gutter.

**Theming:** a hardcoded array of ~23 theme names cycled by `toggleTheme()`, applied as a `<theme>-theme` class on `document.body` and persisted to `localStorage`. Adding a theme means updating the array in `noteStore.ts`, the CSS, and the icon `<svg v-else-if>` chains duplicated in both `NoteTabs.vue` and `NoteEditor.vue`.

**Deployment has two independent paths that can drift:** `docker-compose.yml` + per-workspace `Dockerfile`s (backend built with Python/make/g++ for native `better-sqlite3`, frontend built and served via nginx which proxies `/api` to the backend container) — versus the actual CI/CD path in `.github/workflows/deploy.yml`, which rsyncs the repo directly to a remote host over SSH and runs the backend with `forever` (no Docker involved). The `test` job (backend Jest tests) gates the `deploy` job, which only runs on push to `main`.
