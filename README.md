<div align="center">

# Largs Hub

**An open-source workspace browser — all your web apps in one window.**

A free, privacy-friendly alternative to [Rambox](https://rambox.app/) and [Station](https://en.wikipedia.org/wiki/Station_(software)). Run Gmail, Slack, Discord, WhatsApp, Messenger, and any other web app side by side, each in its own isolated session.

[![Latest release](https://img.shields.io/github/v/release/devlargs/largs-hub?label=download&logo=github)](https://github.com/devlargs/largs-hub/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/devlargs/largs-hub/total?logo=github)](https://github.com/devlargs/largs-hub/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/download-Windows-0078D6?logo=windows&logoColor=white)](#installation)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

</div>

<img width="1919" alt="Largs Hub main window" src="https://github.com/user-attachments/assets/8d1ebad9-72c3-41ff-838a-b05d49f6fd82" />

<details>
<summary><b>More screenshots</b></summary>

<img width="1874" alt="Multiple services" src="https://github.com/user-attachments/assets/15848abc-a1db-4bbe-a63e-4aa60ae8f3ce" />
<img width="1910" alt="Settings" src="https://github.com/user-attachments/assets/57d944e6-a2d0-4c86-8458-e95f4d2f3d17" />
<img width="767" alt="Add service" src="https://github.com/user-attachments/assets/6f1f53de-8fbe-45c7-a1f3-cf23ebebb38c" />

</details>

---

## Why Largs Hub?

Juggling a dozen browser tabs for the apps you use all day is noisy and easy to lose. Largs Hub gives each web app a dedicated home in a single, distraction-free window — with real unread badges, isolated logins, and a native desktop feel. It's fully open source, stores everything locally, and has no account, telemetry, or subscription.

## Features

| | |
|---|---|
| 🗂️ **Unified workspace** | Add any web app by URL and switch between them from a clean sidebar. Reorder services by drag-and-drop. |
| 🔒 **Isolated sessions** | Every service runs in its own Chromium session partition, so logins and cookies never mix — sign in to two accounts of the same app without conflict. |
| 🔔 **Real unread badges** | Per-service notification detection (Gmail's feed, Messenger/WhatsApp DOM, and window-title counts) surfaces accurate unread counts on the sidebar and taskbar. |
| 💤 **Service hibernation** | Optionally unload idle services to reclaim RAM; they reload on next click and stay logged in. Great for lower-memory machines. |
| 🔎 **In-app link preview** | Open links in a lightweight in-app popup via the "View Link" context action instead of losing your place or leaving the app. |
| 🖥️ **Native desktop feel** | Frameless custom titlebar with back/forward/reload, persistent window size & position, native context menus, and light/dark themes. |
| ⌨️ **Keyboard shortcuts** | Jump between services with `Ctrl`+`1`–`9`, even while a web app has focus. |
| 📥 **Download handling** | Configurable download location and completion notifications. |
| 🔕 **Focus options** | Per-service mute and optional blur-when-inactive for privacy. |
| 📝 **Notion Note Taker** | Built-in note taker backed by your own Notion database. |
| 🤖 **Messenger automation** | Optional automation panel for Messenger: scheduled and interval messages, emoji bursts, and automated in-app call cycles. |
| ⬆️ **Auto-updates** *(Windows)* | Checks GitHub Releases and installs the latest version in-app. |
| 🕵️ **Private by design** | No account, no tracking, no cloud. All data lives in a local `electron-store` file on your machine. |

## Installation

### Download (Windows)

A prebuilt Windows installer is published on the [**Releases**](https://github.com/devlargs/largs-hub/releases/latest) page:

- **`Largs Hub Setup.exe`** — Windows installer (NSIS), with in-app auto-updates.

> **macOS & Linux:** There are no prebuilt macOS or Linux downloads yet. The packaging config includes `.dmg` and `.AppImage` targets, so you can [build them from source](#development) on those platforms — but they're currently unofficial, untested, and don't receive auto-updates. Contributions to harden cross-platform support are very welcome.

## Getting Started

1. Launch Largs Hub.
2. Click **＋ Add Service** in the sidebar.
3. Give it a name and the web app's URL (e.g. `https://mail.google.com`), then save.
4. Sign in once — your session is remembered and isolated from every other service.

Repeat for each app you want in your workspace.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm

### Setup

```bash
git clone https://github.com/devlargs/largs-hub.git
cd largs-hub
npm install
```

### Run in development

```bash
npm run dev
```

Starts the Vite dev server, the Electron TypeScript watcher, and Electron itself (with hot reload) concurrently.

### Common scripts

| Script | Description |
|---|---|
| `npm run dev` | Run the app in development with hot reload |
| `npm run build` | Type-check and build the renderer + Electron bundles |
| `npm run electron:build` | Build and package a platform installer into `release/` |
| `npm run typecheck` | Type-check the renderer, Electron, and test projects |
| `npm run lint` / `npm run lint:fix` | Lint with ESLint |
| `npm run format` / `npm run format:check` | Format with Prettier |
| `npm test` | Run the Vitest unit suite |

> **Windows packaging note:** If you hit symlink errors during `electron:build`, enable **Developer Mode** in *Settings → System → For developers*.

## Tech Stack

- **[Electron](https://www.electronjs.org/)** — desktop shell with a layered `WebContentsView` architecture
- **[React 19](https://react.dev/)** + **[TypeScript](https://www.typescriptlang.org/)** — renderer UI, fully typed across main/preload/renderer
- **[Vite](https://vite.dev/)** — dev server and bundler
- **[Tailwind CSS 4](https://tailwindcss.com/)** — styling with Catppuccin-style theme variables
- **[Zustand](https://github.com/pmndrs/zustand)** — lightweight renderer state (notification counts)
- **[electron-store](https://github.com/sindresorhus/electron-store)** — local persistence for services and preferences
- **[electron-builder](https://www.electron.build/)** — packaging and auto-updates
- **[Vitest](https://vitest.dev/)** + **ESLint** + **Prettier** — testing and code quality, run in CI on every PR

## Architecture

Largs Hub is built on a three-layer `WebContentsView` stack hosted in a single frameless window:

- **UI view** — the React app (sidebar, titlebar, modals, settings), rendered transparently over the full window.
- **Service views** — one `WebContentsView` per enabled service, each with its own `persist:service-<id>` session partition for isolated logins. Only the active one is visible.
- **Overlay views** — the link-preview and call popups, layered on top.

The main process owns all persistence, native menus, notification detection (via pluggable per-service **badge adapters**), download handling, and the auto-updater. The renderer holds only runtime UI state and communicates through a typed IPC bridge (`main.ts` handler ⇄ `preload.ts` API ⇄ `types.ts` interface).

```
largs-hub/
├── electron/               # Main process & preload
│   ├── main.ts             # Window + layered view orchestration
│   ├── preload.ts          # Typed contextBridge API
│   ├── serviceViews.ts     # Service-view lifecycle, calls, hibernation
│   ├── store.ts            # electron-store schema & helpers
│   ├── downloads.ts        # Download session handling
│   ├── updater.ts          # GitHub Releases auto-updater
│   ├── notificationCounts.ts
│   ├── messengerAutomation.ts
│   ├── notionNotes.ts
│   ├── badge-adapters/     # Per-service unread-count detection
│   └── ipc/                # services & settings IPC handlers
├── src/                    # React renderer
│   ├── components/         # UI components
│   ├── store/              # Zustand stores
│   ├── types.ts            # Shared IPC/types
│   ├── App.tsx
│   └── index.css
├── test/                   # Vitest unit tests
└── assets/                 # App & service icons
```

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes
4. Verify locally: `npm run typecheck`, `npm run lint`, and `npm test`
5. Commit with a descriptive message (`git commit -m "feat: add your feature"`)
6. Push and open a Pull Request

### Guidelines

- Follow the existing style — TypeScript throughout, functional React components, Tailwind + CSS-variable theming.
- Keep the main / preload / renderer layers cleanly separated; add IPC in all three places (`main.ts`, `preload.ts`, `types.ts`).
- Keep PRs focused — one feature or fix each.
- Update `CHANGELOG.md` with a short, user-facing note for your change.

## License

[MIT](LICENSE) © Ralph Largo
