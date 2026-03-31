# Largs Hub

An open-source workspace browser — manage all your web apps in one place. A free alternative to [Rambox](https://rambox.app/).

<img width="1912" height="1031" alt="image" src="https://github.com/user-attachments/assets/329e701e-6bce-47ed-82bf-8397a87fb0b5" />

## Features

- Add and manage multiple web services (Gmail, Slack, Discord, WhatsApp, etc.) in a single window
- Each service runs in its own isolated session (separate cookies/logins)
- Badge notifications for unread counts
- Custom titlebar with navigation controls (back, forward, reload)
- Persistent window size and position
- Drag-and-drop sidebar reordering

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
git clone https://github.com/AceLargo/largs-hub.git
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
