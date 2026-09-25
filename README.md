<div align="center">

# Largs Hub

**An open-source workspace browser — all your web apps in one window.**

A free, privacy-friendly alternative to [Rambox](https://rambox.app/). Keep Gmail, Slack, Discord, WhatsApp, Messenger, and any other web app together in one window — one click apart, each in its own isolated session.

[![Latest release](https://img.shields.io/github/v/release/devlargs/largs-hub?label=download&logo=github)](https://github.com/devlargs/largs-hub/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/devlargs/largs-hub/total?logo=github)](https://github.com/devlargs/largs-hub/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/download-Windows-0078D6?logo=windows&logoColor=white)](#download-windows)
[![Platform](https://img.shields.io/badge/download-macOS-000000?logo=apple&logoColor=white)](#download-macos)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

### 👉 Download: [Windows](https://github.com/devlargs/largs-hub/releases/latest/download/Largs%20Hub%20Setup.exe) · [macOS (Apple Silicon)](https://github.com/devlargs/largs-hub/releases/latest/download/Largs-Hub-arm64.dmg) · [macOS (Intel)](https://github.com/devlargs/largs-hub/releases/latest/download/Largs-Hub-x64.dmg)

_Windows: run the installer. macOS: open the `.dmg` and drag Largs Hub into Applications. See [Installation](#installation) if your system warns you on first launch._

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

|                             |                                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🗂️ **Unified workspace**    | Add any web app by URL, or pick from presets like Gmail, Slack, Discord, WhatsApp and Messenger. Reorder by drag-and-drop or `Alt`+`↑`/`↓`, and give any service a custom icon.                                                                                                    |
| 🔒 **Isolated sessions**    | Every service runs in its own Chromium session partition, so logins and cookies never mix. Sign in to two accounts of the same app without conflict.                                                                                                                               |
| 🔔 **Real unread badges**   | Per-service detection (Gmail's feed, Messenger and WhatsApp page counts, and window-title counts) shows unread counts in the sidebar, on the Windows taskbar, and on the tray icon.                                                                                                |
| 💤 **Service hibernation**  | Optionally unload idle services to reclaim RAM. They reload on the next click and stay signed in.                                                                                                                                                                                  |
| 🔎 **Link preview & find**  | Open a link in an in-app popup with **View Link** from the right-click menu, or grab it with **Copy Link**, and search a page with `Ctrl`+`F`.                                                                                                                                     |
| 🖥️ **Native desktop feel**  | Back/forward/reload in the title bar, per-service zoom, remembered window size and position, native menus, and light/dark themes. Custom window buttons on Windows, native traffic lights on macOS.                                                                                |
| ⌨️ **Keyboard shortcuts**   | `Ctrl`+`1`–`9` jumps between services (hold `Ctrl` to see the numbers), even while a web app has focus. `Ctrl` is the Control key on macOS too.                                                                                                                                    |
| 📥 **Download handling**    | Choose a download folder, and optionally open the file or folder and get an alert when a download finishes. Only documents, images, audio and video open automatically; programs, scripts, installers and archives are shown in their folder instead.                              |
| 🕶️ **Privacy & focus**      | Per-service sound and notification switches, blur when inactive, and a privacy cover that hides part of a service's page.                                                                                                                                                          |
| 🔐 **Workspace lock**       | Optional master password (at least 6 characters) that locks the workspace on launch, when you lock your computer, and after it has been minimized for a while. Turning it off asks for the password, and repeated wrong guesses make you wait. It's a screen lock, not encryption. |
| 🧺 **Tray & startup**       | Close or minimize to the system tray (the menu bar on macOS), with a menu that jumps to any service, and launch at login.                                                                                                                                                          |
| ✅ **Todo**                 | A daily task list that carries unfinished work forward. The Todo service is the [Tasks](https://tasks.ralphlargo.com) web app, which keeps tasks on the device or in a Notion database you connect.                                                                                |
| 🤖 **Messenger automation** | Optional automation panel for Messenger: scheduled and interval messages, emoji bursts, and automated in-app call cycles. It remembers each account's last settings.                                                                                                               |
| 🐞 **Report an issue**      | File a GitHub issue on largs-hub from the Changelog page, assigned to devlargs. The description is markdown, and a pasted screenshot is attached as an image. Needs a GitHub token in Settings.                                                                                    |
| ⬆️ **Auto-updates**         | Checks GitHub Releases, then downloads and installs the latest version and reopens the app, on Windows and macOS.                                                                                                                                                                  |
| 🕵️ **Private by design**    | No account and no telemetry. Your services and settings live in a local `electron-store` file, and each service's login stays in its own session on your machine.                                                                                                                  |

## Installation

### Download (Windows)

**Easiest way — one click:**

### ⬇️ [Download the latest Largs Hub installer](https://github.com/devlargs/largs-hub/releases/latest/download/Largs%20Hub%20Setup.exe)

That link always gives you the newest version. It needs 64-bit Windows 10 or later. Once it downloads:

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

It needs macOS 13 (Ventura) or later. Pick the build for your Mac:

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

When an update is available, the app downloads it, closes, replaces the old version in Applications and reopens, the same as on Windows. If it can't replace itself (for example, it's still running from the `.dmg`, or you don't have permission to change the Applications folder), it opens the new `.dmg` instead so you can drag Largs Hub into Applications.

> **Linux:** There is no prebuilt Linux download yet. The packaging config includes an `.AppImage` target, so you can [build it from source](#development), but it's unofficial and untested.

## Getting Started

1. Launch Largs Hub.
2. Click **Add Your First Service** (later, the **Home** button at the top of the sidebar brings you back to **Add Service**).
3. Pick a preset, or choose **Custom** and enter a name and the web app's address (e.g. `https://mail.google.com`), then save.
4. Sign in once. Your session is remembered and isolated from every other service.

Right-click a service in the sidebar for its options: enable, blur when inactive and privacy mode; a **Permissions** section with **Notifications**, **Sound**, **Microphone** and **Camera**; then edit, reload, clear data and remove. **Microphone** and **Camera** are separate switches. Both start on for services with calls (Messenger, WhatsApp, Slack, Discord, Telegram, Gmail and Google Chat) and off for everything else, so you can, for example, allow a service your microphone but not your camera. Either way, only the service's own pages can use them, never a sign-in page or embedded content from another site. App-wide settings are behind the gear icon in the title bar.

**Report an issue** (Changelog page) needs a GitHub personal access token, saved once in **Settings → GitHub → GitHub token**. It works the same on Windows and macOS. To create one:

1. On github.com, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Set **Resource owner** to `devlargs` and **Repository access** to **Only select repositories → largs-hub**.
3. Under **Permissions**, set **Issues** and **Contents** to **Read and write**. Contents is where pasted images go: GitHub's API can't attach files to an issue, so each image is committed to an `issue-images` branch and linked from the issue.
4. Paste the token into Largs Hub and click **Save**. It's checked with GitHub, then stored encrypted by the system (Windows DPAPI or the macOS Keychain) and only ever used by the app's main process.

Repeat for each app you want in your workspace.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22 (the version CI uses; the test runner needs 20 or newer)
- npm
- To package the macOS app: a Mac (the build ad-hoc signs the bundle with `codesign`)

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

| Script                                    | Description                                                |
| ----------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                             | Run the app in development with hot reload                 |
| `npm run build`                           | Type-check and build the renderer + Electron bundles       |
| `npm run clean:electron`                  | Delete `dist-electron/` (`build` and `dev` do this first)  |
| `npm run electron:build`                  | Build and package an installer for this OS into `release/` |
| `npm run typecheck`                       | Type-check the renderer, Electron, and test projects       |
| `npm run lint` / `npm run lint:fix`       | Lint with ESLint                                           |
| `npm run format` / `npm run format:check` | Format with Prettier                                       |
| `npm test`                                | Run the Vitest unit suite                                  |

> **Windows packaging note:** If you hit symlink errors during `electron:build`, enable **Developer Mode** in _Settings → System → For developers_.
>
> **macOS packaging note:** `electron:build` on a Mac produces both DMGs (Apple Silicon and Intel). Releases build the Windows installer and both DMGs in GitHub Actions (`release.yml`).

## Tech Stack

- **[Electron](https://www.electronjs.org/) 44** — desktop shell with a layered `WebContentsView` architecture. A weekly workflow (`electron-support.yml`) fails once the Electron major drops out of Electron's supported window
- **[React 19](https://react.dev/)** + **[TypeScript](https://www.typescriptlang.org/)** — renderer UI, fully typed across main/preload/renderer
- **[Vite](https://vite.dev/)** — dev server and bundler
- **[Tailwind CSS 4](https://tailwindcss.com/)** — styling with Catppuccin-style theme variables
- **[Zustand](https://github.com/pmndrs/zustand)** — lightweight renderer state (notification counts)
- **[electron-store](https://github.com/sindresorhus/electron-store)** — local persistence for services and preferences
- **[electron-builder](https://www.electron.build/)** — packaging (NSIS installer on Windows, DMG on macOS)
- **[Vitest](https://vitest.dev/)** + **ESLint** + **Prettier** — testing and code quality, run in CI on every push and PR

Updates don't use electron-updater: `electron/updater/` checks GitHub Releases itself and runs the installer (Windows) or swaps the app bundle in place (macOS, `electron/macUpdate.ts`), since neither build is code-signed.

## Architecture

Largs Hub is built on a three-layer `WebContentsView` stack hosted in a single frameless window:

- **UI view** — the React app (sidebar, titlebar, modals, settings), rendered transparently over the full window.
- **Service views** — one `WebContentsView` per enabled service, each with its own `persist:service-<id>` session partition for isolated logins. Only the active one is visible.
- **Overlay views** — the link preview, layered on top. (Messenger calls open in their own window.)

The main process owns all persistence, native menus, notification detection (via pluggable per-service **badge adapters**), download handling, and the auto-updater. The renderer holds only runtime UI state and communicates through a typed IPC bridge (a handler in `electron/ipc/` or `electron/window/` ⇄ the `preload.ts` API ⇄ the `src/types.ts` interface). Payload types are declared once, in `electron/shared/types.ts`.

```
largs-hub/
├── electron/                 # Main process & preload
│   ├── main.ts               # Entry point: module wiring and app lifecycle
│   ├── window/               # The window, UI layer, link-preview overlay and window IPC
│   ├── preload.ts            # Typed contextBridge API
│   ├── serviceViews/         # Service-view creation, switching, hibernation, calls, overlays
│   ├── store.ts              # electron-store schema & migrations
│   ├── downloads.ts          # Download session handling
│   ├── updater/              # GitHub Releases auto-updater
│   ├── github/               # Report an issue: token storage, issue and image upload
│   ├── macUpdate.ts          # In-place app replacement on macOS
│   ├── notificationCounts.ts # Badge state, Windows taskbar badge
│   ├── tray.ts               # Tray / menu bar icon and menu
│   ├── messengerAutomation/  # Messenger automation scheduler, IPC & injected scripts
│   ├── badge-adapters/       # Per-service unread-count detection
│   ├── ipc/                  # services, settings, security & list-group IPC handlers
│   └── shared/               # Types and layout constants shared with the renderer
├── src/                      # React renderer
│   ├── components/           # UI components, with per-feature folders (settings/, sidebar/, …)
│   ├── hooks/                # React hooks, incl. the ones that mirror main-process state
│   ├── lib/                  # Pure renderer helpers
│   ├── store/                # Zustand stores
│   ├── types.ts              # The window.electronAPI interface
│   ├── App.tsx
│   └── index.css
├── scripts/                  # Build helpers (macOS ad-hoc signing, changelog stamping, Electron support check)
├── test/                     # Vitest unit tests
└── assets/                   # App & service icons
```

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes
4. Verify locally: `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` (CI runs all four)
5. Commit with a descriptive message (`git commit -m "feat: add your feature"`)
6. Push and open a Pull Request

### Guidelines

- Follow the existing style — TypeScript throughout, functional React components, Tailwind + CSS-variable theming.
- Keep the main / preload / renderer layers cleanly separated; add IPC in all three places (a main-process handler, `preload.ts`, `src/types.ts`).
- Make changes work on both Windows and macOS, or say why only one is affected.
- Keep PRs focused — one feature or fix each.
- Update `CHANGELOG.md` with a short, user-facing note for your change, and this README when the change affects what it describes.

## License

[MIT](LICENSE) © Ralph Largo
