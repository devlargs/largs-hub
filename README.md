<div align="center">

# Largs Hub

**An open-source workspace browser — all your web apps in one window.**

A free, privacy-friendly alternative to [Rambox](https://rambox.app/). Keep Gmail, Slack, Discord, WhatsApp, Messenger, and any other web app together in one window — one click apart, each in its own isolated session.

[![Latest release](https://img.shields.io/github/v/release/devlargs/largs-hub?label=download&logo=github)](https://github.com/devlargs/largs-hub/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/devlargs/largs-hub/total?logo=github)](https://github.com/devlargs/largs-hub/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/download-Windows-0078D6?logo=windows&logoColor=white)](#installation)
[![Platform](https://img.shields.io/badge/download-macOS-000000?logo=apple&logoColor=white)](#download-macos)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

### 👉 [Download Largs Hub for Windows](https://github.com/devlargs/largs-hub/releases/latest/download/Largs%20Hub%20Setup.exe)

_Click the link above to download the installer, run it, and you're done — no setup required._

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

|                             |                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🗂️ **Unified workspace**    | Add any web app by URL and switch between them from a clean sidebar. Reorder services by drag-and-drop.                                                        |
| 🔒 **Isolated sessions**    | Every service runs in its own Chromium session partition, so logins and cookies never mix — sign in to two accounts of the same app without conflict.          |
| 🔔 **Real unread badges**   | Per-service notification detection (Gmail's feed, Messenger/WhatsApp DOM, and window-title counts) surfaces accurate unread counts on the sidebar and taskbar. |
| 💤 **Service hibernation**  | Optionally unload idle services to reclaim RAM; they reload on next click and stay logged in. Great for lower-memory machines.                                 |
| 🔎 **In-app link preview**  | Open links in a lightweight in-app popup via the "View Link" context action instead of losing your place or leaving the app.                                   |
| 🖥️ **Native desktop feel**  | Frameless custom titlebar with back/forward/reload, persistent window size & position, native context menus, and light/dark themes.                            |
| ⌨️ **Keyboard shortcuts**   | Jump between services with `Ctrl`+`1`–`9`, even while a web app has focus.                                                                                     |
| 📥 **Download handling**    | Configurable download location and completion notifications.                                                                                                   |
| 🔕 **Focus options**        | Per-service mute and optional blur-when-inactive for privacy.                                                                                                  |
| ✅ **Todo**                 | Built-in daily task list. Add and check off tasks, carry unfinished work forward. Works offline, and can optionally sync to a Notion database you own.         |
| 🤖 **Messenger automation** | Optional automation panel for Messenger: scheduled and interval messages, emoji bursts, and automated in-app call cycles.                                      |
| ⬆️ **Auto-updates**         | Checks GitHub Releases and installs the latest version in-app (on macOS it downloads the new `.dmg` for you to drag in).                                       |
| 🕵️ **Private by design**    | No account, no tracking, no cloud. All data lives in a local `electron-store` file on your machine.                                                            |

## Installation

### Download (Windows)

**Easiest way — one click:**

### ⬇️ [Download the latest Largs Hub installer](https://github.com/devlargs/largs-hub/releases/latest/download/Largs%20Hub%20Setup.exe)

That link always gives you the newest version. Once it downloads:

1. Open the downloaded **`Largs Hub Setup.exe`**.
2. If Windows shows a "Windows protected your PC" prompt, click **More info → Run anyway** (this appears because the app isn't code-signed yet).
3. Follow the installer — that's it.

**If the installer won't run:** Windows marks files downloaded from the internet, and SmartScreen or your antivirus may block the installer, sometimes without showing **Run anyway**. Remove the mark instead, either way:

- Right-click **`Largs Hub Setup.exe`** → **Properties**, tick **Unblock** at the bottom of the **General** tab, and click **OK**.
- Or run this in PowerShell, from the folder you downloaded it to:

  ```powershell
  Unblock-File -Path ".\Largs Hub Setup.exe"
  ```

Then open the installer again. You only need to do this once: in-app updates are downloaded by the app itself and install without the prompt.

> [!IMPORTANT]
> These warnings appear because the installer isn't code-signed, not because anything is wrong with it. They go away for everyone only once the app is signed with a code-signing certificate.

Prefer to see all versions and release notes? Browse the [**Releases**](https://github.com/devlargs/largs-hub/releases/latest) page. The installer is `Largs Hub Setup.exe` (NSIS), and it keeps itself up to date in-app.

### Download (macOS)

Pick the build for your Mac:

- **Apple Silicon (M1 and later):** [⬇️ `Largs-Hub-arm64.dmg`](https://github.com/devlargs/largs-hub/releases/latest/download/Largs-Hub-arm64.dmg)
- **Intel:** [⬇️ `Largs-Hub-x64.dmg`](https://github.com/devlargs/largs-hub/releases/latest/download/Largs-Hub-x64.dmg)

Once it downloads:

1. Open the `.dmg` and drag **Largs Hub** into **Applications**.
2. Open Largs Hub from Applications. The app isn't notarized by Apple yet, so macOS blocks it the first time. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to the Largs Hub message. (On macOS 14 and earlier you can right-click the app and choose **Open** instead.)

**If macOS says "Largs Hub" Not Opened** ("Apple could not verify 'Largs Hub' is free of malware…"), click **Done**, not **Move to Trash**. Then either use **Open Anyway** as in step 2, or run this once in Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/Largs Hub.app"
```

This removes the "downloaded from the internet" flag, so the app opens normally. You only need to do this once. In-app updates download without that flag, so they won't hit this dialog again.

> [!IMPORTANT]
> This dialog appears because the app isn't signed and notarized by Apple, not because anything is wrong with it. It goes away for everyone only once the app is signed with an Apple Developer ID and notarized, which needs a paid Apple Developer account. Until then, use one of the steps above.

When an update is available, the app downloads the new `.dmg` and opens it. Drag Largs Hub into Applications again to replace the old version.

> **Linux:** There is no prebuilt Linux download yet. The packaging config includes an `.AppImage` target, so you can [build it from source](#development), but it's unofficial and untested.

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

| Script                                    | Description                                            |
| ----------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                             | Run the app in development with hot reload             |
| `npm run build`                           | Type-check and build the renderer + Electron bundles   |
| `npm run electron:build`                  | Build and package a platform installer into `release/` |
| `npm run typecheck`                       | Type-check the renderer, Electron, and test projects   |
| `npm run lint` / `npm run lint:fix`       | Lint with ESLint                                       |
| `npm run format` / `npm run format:check` | Format with Prettier                                   |
| `npm test`                                | Run the Vitest unit suite                              |

> **Windows packaging note:** If you hit symlink errors during `electron:build`, enable **Developer Mode** in _Settings → System → For developers_.

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
