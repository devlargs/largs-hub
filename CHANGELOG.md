# Changelog

## [Unreleased]

- Messenger voice/video calls now open in an in-app popup window (still signed in, with working audio/video) instead of your default browser — fixes calls blanking the Messenger view and lets the automation "start call cycle" run inside the app. The popup also auto-clicks "Start call" so the call connects automatically instead of stopping on the "Ready to call?" screen

## [0.1.30] (2026-07-12)

- Fixed Messenger unread counts not showing: detection now reads Messenger's current UI (Chats badge and unread markers) instead of relying only on the old favicon-badge trick

## [0.1.29] (2026-07-12)

- Gmail badges now count only the Primary inbox tab instead of the whole inbox, so unread Promotions/Social mail no longer inflates the count to 99+

## [0.1.28] (2026-07-12)

- Notion Note Taker no longer reloads the whole board every time you open it — notes now show instantly from the previous visit while refreshing in the background
- Gmail unread badges are now sourced from Gmail's own feed (using your existing login) instead of scraping the tab title, fixing incorrect Gmail notification counts; if the feed is unavailable it falls back to the old behavior
- Notification counting was restructured into per-service badge adapters separated from badge rendering, so a service changing its UI can no longer break other services' badges
- Reconnecting the Notion Note Taker to a database that already holds your notes (e.g. after deleting and re-adding the service, or reinstalling) now offers to keep the existing notes instead of only allowing the database to be emptied
- Dev: added ESLint (typescript-eslint) + Prettier, a Vitest unit test suite covering the pure logic in the Notion notes, Messenger automation, and badge adapter modules, and a GitHub Actions CI workflow running typecheck, lint, and tests on every pull request
- Dev: split the 1400-line electron/main.ts into focused modules (store, service views, downloads, updater, and IPC handlers for services/settings) with no behavior changes, making future changes easier to review

## [0.1.27] (2026-07-12)

- Added optional service hibernation (Settings → General) — services left idle past a chosen interval (15 min / 30 min / 1 hour) are unloaded to free memory and reload automatically on next click; logins are preserved
- Fixed duplicate download notifications (repeated "open folder"/toasts) that could occur after a service was edited, disabled and re-enabled
- Fixed duplicate download alerts (and download settings being applied multiple times) after editing a service's URL
- Fixed the download-complete alert rendering incorrectly for file names containing characters like # or %
- Services can no longer silently access the camera, microphone, location, or clipboard — permission requests are now denied by default (Messenger/WhatsApp keep camera and mic access for calls)
- Notion Note Taker API keys are now stored encrypted on disk instead of in plaintext (existing keys migrate automatically)
- Service data is now validated before being saved, and service URLs must be http or https
- App updates are now verified before installing: downloads are restricted to trusted GitHub hosts over https and checked against the release's official checksum

## [0.1.26] (2026-07-12)

- Fixed a security issue where custom icon file names could be used to write or delete files outside the app's icon folder

## [0.1.25] (2026-07-11)

- Added a Notion Note Taker service — a built-in Google Keep-style notes app backed by your own Notion database: connect with a Notion API key + database ID (with a guided setup and a safety prompt to empty non-fresh databases), write text or checklist notes with image uploads, pin notes, toggle checklist items from the board, and edit notes in a Keep-like masonry layout

## [0.1.24] (2026-07-11)

- Added a Messenger automation panel — a titlebar button opens a right-hand side panel (70/30 split, keeping the conversation visible) to send or schedule messages, run interval message/emoji loops and voice-call cycles on the active Messenger service, with a live task list and stop controls

## [0.1.23] (2026-07-10)

- Update Committer Name

## [0.1.22] (2026-07-10)

- Add confirmation dialog for service removal
- Added "View Link" to the service context menu — opens links in an in-app modal instead of navigating the service

## [0.1.21] (2026-04-08)

- Added minimum minimize width

## [0.1.20] (2026-04-03)

- Add "Save Image" to the context menu

## [0.1.19] (2026-04-03)

- Updated images in README

## [0.1.18] (2026-04-03)

- Added blur effect on services when the app is not in focus ("Blur when inactive")
- Added startup and download settings options
- Fixed download settings logic
- Fixed build issue

## [0.1.17] (2026-04-02)

- Fixed Ctrl + number shortcut not working when focus is inside a service
- Added initial settings page
- Added "Copy Image" when viewing an image inside a service

## [0.1.16] (2026-04-01)

- Version bump only (no changes)

## [0.1.15] (2026-04-02)

- Use the default Electron icon in dev mode
- Added UI for disabling/enabling a service
- Fixed gear icon hiding services when clicked
- Fixed Messenger focus on Alt + Tab
- Notification enhancements

## [0.1.14] (2026-04-01)

- Added edit service functionality
- Allow users to upload a custom icon for their services

## [0.1.13] (2026-04-01)

- Improved context menus
- Update app manually once user clicks update
- Removed stats data

## [0.1.12] (2026-04-01)

- Added Ctrl + number shortcut for switching services
- Changed Add icon to Home icon
- Added zustand to handle notifications
- Services can be dragged to change their order
- Changed "Add Your First Service" to "Add Service" when services exist
- Added new context menu items (Disable Sound, Enable/Disable)

## [0.1.11] (2026-03-31)

- Open the app in full screen view by default

## [0.1.10] (2026-03-31)

- Automatically reopen the app after downloading the latest update

## [0.1.9] (2026-03-31)

- Load services automatically on startup
- Fixed notification badges for several services

## [0.1.8] (2026-03-31)

- Updated task manager name

## [0.1.7] (2026-03-31)

- Silent download and install of updates

## [0.1.6] (2026-03-31)

- Navigate Gmail in the actual view instead of a popup window

## [0.1.5] (2026-03-31)

- Added manual update for the app

## [0.1.4] (2026-03-31)

- Prevent Windows from treating the app as unsecure

## [0.1.3] (2026-03-31)

- Added settings page
- Centered content on the update page

## [0.1.2] (2026-03-31)

- Added light/dark mode toggle
- Converted webp images to png files
- Updated build meta descriptions, icons, and title
- Changed screenshot in README

## [0.1.1] (2026-03-31)

- Initial release
- Add and manage multiple web services in a single window
- Spoof user agent so sites like WhatsApp Web don't reject Electron
- Welcome screen UI and responsive layout
- Improved add service modal layout with open animation
- Context menu always available for services
- Title bar and header layout improvements
- OS stats display in the sidebar
- GitHub release actions for automatic updates
