# Largs Hub

An open-source workspace browser — manage all your web apps in one place. A free alternative to [Rambox](https://rambox.app/).

<img width="1919" height="1028" alt="image" src="https://github.com/user-attachments/assets/8d1ebad9-72c3-41ff-838a-b05d49f6fd82" />
<img width="1874" height="1026" alt="image" src="https://github.com/user-attachments/assets/15848abc-a1db-4bbe-a63e-4aa60ae8f3ce" />
<img width="1910" height="1030" alt="image" src="https://github.com/user-attachments/assets/57d944e6-a2d0-4c86-8458-e95f4d2f3d17" />
<img width="767" height="603" alt="image" src="https://github.com/user-attachments/assets/6f1f53de-8fbe-45c7-a1f3-cf23ebebb38c" />


## Features

- Add and manage multiple web services (Gmail, Slack, Discord, WhatsApp, etc.) in a single window
- Each service runs in its own isolated session (separate cookies/logins)
- Badge notifications for unread counts
- Custom titlebar with navigation controls (back, forward, reload)
- Persistent window size and position
- Drag-and-drop sidebar reordering
- Optional service hibernation (Settings → General) that unloads idle services to reclaim memory — each runs as its own Chromium process, so on lower-RAM machines you can have them reload on next click instead of staying warm; logins are preserved by the isolated session

## Tech Stack

- **Electron** — Desktop shell with multi-view architecture (`WebContentsView`)
- **React 19** — UI framework
- **TypeScript** — Type safety across the entire codebase
- **Vite** — Dev server and bundler
- **Tailwind CSS 4** — Styling
- **electron-store** — Persistent local storage for services and preferences
- **electron-builder** — Packaging and distribution

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm

### Installation

```bash
git clone https://github.com/devlargs/largs-hub.git
cd largs-hub
npm install
```

### Development

```bash
npm run dev
```

This starts the Vite dev server and Electron concurrently with hot reload.

### Build

```bash
npm run build
```

Compiles TypeScript and builds the Vite production bundle.

### Package Executable

```bash
npm run electron:build
```

Builds the app and creates a platform-specific installer in the `release/` folder.

> **Note (Windows):** If you encounter symlink errors during packaging, enable **Developer Mode** in Settings > System > For developers.

## Project Structure

```
largs-hub/
├── electron/          # Electron main process & preload
│   ├── main.ts
│   └── preload.ts
├── src/               # React renderer
│   ├── components/    # UI components
│   ├── assets/        # Service icons
│   ├── App.tsx
│   └── main.tsx
├── assets/            # App icons
└── package.json
```

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes
4. Commit with a descriptive message (`git commit -m "feat: add your feature"`)
5. Push to your fork (`git push origin feat/your-feature`)
6. Open a Pull Request

### Guidelines

- Follow the existing code style (TypeScript, functional React components)
- Keep PRs focused — one feature or fix per PR
- Test your changes locally with `npm run dev` before submitting

## License

[MIT](LICENSE)
