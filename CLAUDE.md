# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Largs Hub is an open-source Rambox alternative: an Electron workspace browser that hosts multiple web apps (Gmail, Slack, Messenger, …) as isolated services in one window. Windows is the primary target platform.

## Commands

```bash
npm run dev              # Vite dev server + tsc watch (electron) + Electron with --dev, concurrently
npm run build            # tsc (renderer typecheck) + vite build → dist/ + tsc electron → dist-electron/
npm run electron:build   # full build + electron-builder installer → release/
```

Typecheck only (no emit): `npx tsc --noEmit && npx tsc -p tsconfig.electron.json --noEmit`

There are no tests and no linter configured.

**Do not run or smoke test the app after making changes** — the user tests manually. Don't launch Electron, don't start the Vite dev server, and don't spin up any dev servers/ports for verification. Verify changes with the typecheck command above only.

**Update `CHANGELOG.md` with every change you make.** Add a short, user-facing bullet under the `## [Unreleased]` section (create it at the top if missing), matching the existing style. When a version is released, the `[Unreleased]` bullets move under a `## [x.y.z] (date)` heading.

Two separate TypeScript projects: `tsconfig.json` covers `src/` (renderer), `tsconfig.electron.json` covers `electron/` (main + preload, CommonJS, emits to `dist-electron/`).

## Architecture

### Three-layer WebContentsView stack (electron/main.ts)

Everything hangs off one frameless `BrowserWindow`:

1. **uiView** — a `WebContentsView` running the React app, sized to the full window, transparent background. Loads `http://localhost:5173` in dev (when `NODE_ENV=development` or `--dev` flag), `dist/index.html` in prod.
2. **Service views** — one `WebContentsView` per enabled service, each with its own session partition (`persist:service-<id>`) so logins are isolated. Positioned to the right of the sidebar and below the titlebar via the `SIDEBAR_WIDTH` / `TITLEBAR_HEIGHT` constants; only the active one is visible.
3. **Overlay views** (e.g. the link preview) — added last so they render on top.

**Z-order rule:** child-view reordering is unreliable on Windows, so overlays don't get stacked above service views — instead the active service view is *hidden*. React modals do this by calling `bringUiToFront()` in a mount effect and `sendUiToBack()` on cleanup; main ref-counts these (`uiLayerRefCount`) so nested overlays work. Any new React modal that must appear over a service view needs this effect.

**Native menus:** HTML menus/tooltips can't render above WebContentsViews, so all context menus are native `Menu.buildFromTemplate` in the main process. Results flow back to React via the `"context-menu-action"` IPC event, handled in `App.tsx`.

**Hybrid modals:** the link preview modal shows arbitrary pages (iframes would be blocked by X-Frame-Options), so the page renders in a native `WebContentsView` while React draws the chrome (backdrop/header) around it. The geometry constants in `getLinkPreviewBounds()` (main.ts) and `LinkPreviewModal.tsx` must stay in sync.

### IPC bridge — three files per change

Adding any main↔renderer capability touches three places, which must be kept consistent:

1. `electron/main.ts` — `ipcMain.handle` / `ipcMain.on` handler
2. `electron/preload.ts` — method on the `api` object exposed as `window.electronAPI`
3. `src/types.ts` — matching signature on the `ElectronAPI` interface

The `Service` interface is duplicated in all three files as well.

### Service view behaviors (createServiceView in main.ts)

Each service view gets: a spoofed Chrome user agent (sites like Google/WhatsApp reject the Electron UA), notification-count detection (title-pattern `(N)` plus per-service DOM polling via `executeJavaScript`, with decreases debounced by `DECREASE_THRESHOLD` to avoid badge flicker), Ctrl+1-9 service switching intercepted in `before-input-event`, and a `setWindowOpenHandler` that navigates in-view for the service's own domain / an allowlist of auth domains and opens everything else in the system browser.

### State

All persistence is `electron-store` in the main process (`StoreSchema` in main.ts): services, window bounds, theme, download settings. React holds runtime state only and syncs via IPC; there is a small zustand store for notification counts (`src/store/notifications.ts`).

### Styling

Tailwind 4 + Catppuccin-style CSS variables defined in `src/index.css` (`--text-primary`, `--panel`, `--border`, …) with a `.light` root class for theming. Components mix Tailwind utility classes (e.g. `bg-sidebar`) with inline styles referencing the CSS variables — follow that pattern rather than hardcoding colors.

## Development Guidelines

Act as an expert in TypeScript, Electron, and desktop app development.

### Code Style and Structure

- Write concise, type-safe TypeScript throughout the application.
- Keep the three layers distinct: main process (`electron/main.ts`), preload (`electron/preload.ts`), and renderer (`src/`).
- Organize files by feature, grouping related components, modules, utilities, and styles.
- Clearly separate core application logic from UI components to enhance maintainability and testability.

### Naming Conventions

- camelCase for variables and functions (e.g., `isWindowOpen`, `handleUserEvent`).
- PascalCase for classes and React components (e.g., `MainWindow`, `SettingsPanel`).
- Lowercase, hyphenated directory names (e.g., `main-process`, `renderer-components`).

### TypeScript Usage

- TypeScript everywhere: main process, preload, and renderer.
- Strict mode is enabled in both tsconfigs — keep it that way and fix errors rather than suppressing them.
- Avoid `any`; use precise interfaces and type aliases for props, state, and IPC message payloads.
- Leverage modern TypeScript features to improve robustness and readability.

### Performance

- Offload heavy computation from the main process (background processes or workers); never block the main thread.
- Minimize renderer re-renders and lazy-load modules/components that are not immediately required.
- Use Electron's asynchronous APIs and keep IPC payloads small, fast, and secure.
- Optimize resource handling (images, icons, assets) for fast load times and a responsive experience.

### UI and Styling

- The renderer is React 19 with functional components — keep it that way.
- Follow the existing styling convention (Tailwind 4 utilities + CSS variables, see Styling above) so the UI stays consistent; don't introduce a second styling system.
- Ensure the UI scales across different desktop resolutions and window sizes.

### Best Practices

- Follow Electron's security guidelines rigorously: context isolation on, Node integration off in renderers, sandboxed service views, and secure IPC patterns (validate inputs in `ipcMain` handlers).
- Use electron-builder (already configured) for packaging and updates; extend it rather than hand-rolling deployment.
- Implement comprehensive error handling: try-catch around fallible main-process work, proper logging, and error boundaries in React where applicable.
- Document non-obvious code and architectural decisions to facilitate future development and debugging.
- There is currently no test infrastructure; don't introduce a test framework unless asked. (And per Commands above: no smoke-testing the app — verify via typecheck.)

### Key Conventions

1. Convention over configuration — minimize boilerplate.
2. Prioritize security, performance, and maintainability in every layer.
3. Keep main, preload, and renderer responsibilities clearly separated.
4. Maintain clear documentation for long-term maintenance.
5. Leverage Electron's built-in features and established patterns instead of working around the framework.

## Releases

Version bumps are `chore: bump version to v0.1.x` commits updating `package.json`. The in-app updater compares `app.getVersion()` against the latest GitHub release tag on `devlargs/largs-hub` and downloads the `.exe` asset, so release tags must be `v<version>` with an NSIS installer attached.
