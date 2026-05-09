# `frontend/src` directory

This is the Telegram Mini App client. It is a Vite + React 18 + TypeScript project (`"type": "module"`) using Tailwind CSS, the Telegram Apps SDK, TanStack Query, Zustand, Pixi.js (for future canvas scenes), and Sentry. The current code is the minimum bootstrap; new pages, components, and state belong in the conventional subfolders described below.

## Layout

- `lib/` — shared infrastructure (API client, store, Sentry init, helpers). Today contains `sentry.ts`; future API clients (`api.ts`), stores (`store.ts`), and React Query helpers go here.
- `hooks/` — custom React hooks.
  - **`useAuth.ts`** — manages JWT session state in memory via Zustand.
  - **`useMe.ts`** — React Query hook for fetching current player data from `GET /me`.
- `pages/` — page-level components routed by `react-router-dom`.
  - **`Home.tsx`** — main game screen with resource bar, planet view, build queue, and bottom tab bar.
  - **`PlanetDetail.tsx`** — detailed planet view with building slots and upgrade options.
  - **`SystemMap.tsx`** — page component for the interactive home system map.
  - **`Ships.tsx`** — fleet management and ship list.
  - **`Research.tsx`** — tech-tree screen (Cosmic Atlas); uses `TECH_TREE_DATA` from `lib/tech-tree.ts`, resolves lab level via `resolveBuildingType`, starts research through `useStartResearch`.
- `components/` — reusable presentational components.
  - `pixi/` — canvas-based rendering components using PixiJS.
    - **`SystemRenderer.tsx`** — top-down system map renderer. Handles orbits, planets, star, and ship markers with pan/zoom logic.
  - **`ResourceBar.tsx`** — displays planet resources with real-time regeneration animation via `requestAnimationFrame`.
  - **`cosmic/resources.ts`** — resource id -> symbol/label dictionary used in cosmic UI; aligned with seeded resource ids (`iron`, `silicon`, `tritium`, etc.) for tech-tree cost rendering.
  - **`PlanetView.tsx`** — shows the current focus planet with its buildings schema.
  - **`cosmic/buildings.tsx`** — Cosmic Atlas building icons keyed by backend catalog ids; exports `resolveBuildingType(typeId)` (canonical ids plus legacy synonyms such as `laboratory` and alternate lab spellings matched via `/^research[_-]?lab$/i`).
  - **`cosmic/buildings.test.ts`** — Vitest coverage for `resolveBuildingType` (known id resolution plus unknown-id fallback to the safe default icon).
  - **`BuildQueue.tsx`** — displays the current build queue with countdown timers.
  - **`ExpeditionDialog.tsx`** — mission launch configuration with coordinate selection and ETA.
- `assets/` — static assets imported by Vite (currently empty).

The folders above are reserved by `AGENTS.md` (`Engineering Rules` → "Keep frontend state and API calls in clear `lib/`, `pages/`, and `components/` boundaries"). Create them as soon as a feature needs them and document new files here.

## Top-level files

- **`main.tsx`** — Vite entry point. Order of operations:
  1. Imports `./lib/sentry` first so Sentry can capture errors thrown by later imports.
  2. Imports React and `react-dom/client`.
  3. Calls `init()` from `@telegram-apps/sdk-react` to initialize the SDK.
  4. Mounts the SDK pieces conditionally (`miniApp.mount`, `themeParams.mount`, `viewport.mount`). Each `*.mount.isAvailable()` guard skips mounting on platforms that do not support that piece. The `viewport.mount()` call is async; its rejection is caught and logged to keep the rest of the boot sequence alive.
  5. Imports `mockEnv.ts` so the dev environment is patched before `App` renders.
  6. Calls `miniApp.ready()` to tell the Telegram client that the Mini App finished loading.
  7. Renders `<App />` into `#root` inside `React.StrictMode`.
- **`App.tsx`** — current placeholder UI. Reads launch params with `useLaunchParams`, theme params with `useSignal(themeParams.state)`, and dark-mode flag with `useSignal(themeParams.isDark)`. Renders a Tailwind welcome card with the player's Telegram username (or `firstName`, falling back to `'DevUser'`), platform string, and theme label, plus a placeholder "Enter the Game" button. Replace this component when implementing real navigation.
- **`mockEnv.ts`** — only runs when `import.meta.env.DEV` is true. Calls `retrieveLaunchParams()`; if it throws (i.e. we are running in a plain browser without Telegram), it constructs a deterministic fake `initDataRaw` and theme via `mockTelegramEnv` so the SDK behaves as if it were inside Telegram. The mocked user (`Andrew Rogue`, `id: 99281932`) is a stable fixture; do not commit additional users without coordinating with the auth-test fixtures.
- **`index.css`** — Tailwind base/components/utilities entry imported by `main.tsx`.
- **`dummy.test.ts`** — a Vitest sanity test that asserts a trivial expression. Replace with real tests as features land.

## `lib/`

- **`tech-tree.ts`** — static `TECH_TREE_DATA` / `BRANCHES` mirror of backend research definitions (building prerequisites use `lab`; costs use seeded resource ids such as `iron`, `silicon`, `tritium`).
- **`api.ts`** — Unified fetch client. Automatically injects `X-Telegram-Init-Data` from the SDK and `Authorization: Bearer <token>` when a session is active.
- **`sentry.ts`** — initializes `@sentry/react` only when `import.meta.env.VITE_SENTRY_DSN` is present.
 Uses `browserTracingIntegration` and `replayIntegration` with `replaysSessionSampleRate: 0.1` and `replaysOnErrorSampleRate: 1.0`, sets `tracesSampleRate: 1.0`, and reports `import.meta.env.MODE` as the environment. The module exports the `Sentry` namespace so error-boundary or `Sentry.captureException` calls can import directly from here.

## Adding a feature to the frontend

1. Place fetch and persistence helpers in `frontend/src/lib/` (TanStack Query hooks, Zustand stores, fetcher functions).
2. Place page-level components in `frontend/src/pages/` and presentational components in `frontend/src/components/`.
3. Add the route to `App.tsx` (or `pages/App.tsx` once it is moved out) using `react-router-dom`.
4. If the feature talks to the backend, define the request/response types in [`shared/types/`](../../shared/README.md) and import them on both ends.
5. Add a Vitest test for any non-trivial logic and update this README to describe the new file.

## Verification commands

`frontend/package.json` defines:

- `npm run dev` — Vite dev server on port `5173` (Compose passes `--host 0.0.0.0`).
- `npm run build` — `tsc && vite build`.
- `npm run preview` — Vite preview of the production build.
- `npm run lint` — ESLint over `*.ts,*.tsx`.
- `npm test` — Vitest run.
