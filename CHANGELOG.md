# Changelog

## [Unreleased]

- Marking a Messenger conversation as unread now raises the badge count. Only genuinely new messages were being noticed before, because Messenger doesn't change the tab title when you mark a thread unread by hand. Facebook's notification count is still kept out of the Messenger badge.

- The unread count on the Windows taskbar icon now actually appears. It was being drawn in a format Windows can't read, so nothing was ever shown; the badge is now a real image, stays legible on high-DPI screens, shows "99+" past 99, and comes back after the window is minimised and restored.

- The Pomodoro page now fits a small window. At the minimum window size the focus ring took up almost the whole page and left no room for the task list; it now shrinks as the window gets shorter, and the padding and day heading tighten up when the window is narrow.
- Settings rows no longer run together in a narrow window — stacked rows get real spacing between them and use the full width instead of being indented.

## [0.1.41] (2026-08-24)

- Links inside a Pomodoro task are now detected automatically. They appear underlined in the accent colour, and clicking one opens it in your default browser instead of dropping the task into edit mode — clicking the text around a link still edits it as before. Both `https://…` links and bare `www.` addresses are picked up, and trailing punctuation stays out of the link.

## [0.1.40] (2026-08-24)

- The Pomodoro view has been redesigned around the timer. The focus session is now the largest thing on the page — a full-size ring with the clock inside it — and it stays on screen even when nothing is running, with a Start focus button that picks up your next unfinished task in one click. The day is a proper header with the date beneath it, progress reads as a real count, and the day's completed sessions are tallied under the timer.
- Task rows lost their individual boxes: the list is now separated by hairlines, with the row you're focusing on marked by an accent edge. The tomato emoji next to a task has been replaced by small drawn bars, and the delete and timer buttons on each row are now reachable by keyboard instead of appearing on hover only.
- Muted labels across the Pomodoro view were failing readability contrast against the page background and have been darkened; red, green, and amber now follow the light theme properly instead of staying dark-theme pastels.

## [0.1.39] (2026-08-24)

- New **Pomodoro** service: a daily task list with a 25/5 focus timer. Add tasks with Enter, check them off, edit inline, delete, drag to reorder, and step through days with the arrows (or jump back with "Today"). Unfinished work moves forward with a one-click "Carry over" button, the header tracks your progress for the day, and starting a focus session on a task keeps the timer running even while you're in another service. Everything is animated — ticking a task draws its checkbox, strikes the label through, and sinks it to the bottom — and all of it turns off if your system asks for reduced motion.
- Pomodoro works with no setup and no account: tasks are stored on your device. Connecting a Notion database is optional — do it and your tasks sync both ways in the background, with a sync indicator in the header, offline edits queued until you're back online, and your API key stored encrypted.
- The **Notion Note Taker service has been removed** and is replaced by Pomodoro. Existing Note Taker services now show a notice explaining the change with a button to remove them; the notes in your own Notion database are left untouched, and the app's stored copy of that integration key is deleted.

- Messenger automation has a new "Auto-stop" setting: pick a number of minutes and every automation running for that Messenger service is cleared when the timer runs out. The countdown keeps going while the panel is closed, shows how long is left, and can be cancelled at any time.

## [0.1.38] (2026-08-12)

- The Settings page now adapts to narrow windows: each setting's control drops below its label instead of being squashed, sliders stretch to the available width, long paths wrap instead of being cut off, and the page padding tightens up.

## [0.1.37] (2026-08-12)

## [0.1.36] (2026-08-12)

- New "Privacy" section in Settings: sliders for how much of the page the privacy cover hides and how opaque it is. Changes apply immediately to every service with privacy mode on.

- Privacy mode now has a second, horizontal cover that hides part of the page from the left edge, with its own size and opacity sliders alongside the existing (vertical) ones. Any cover size can be set to 0 to turn that cover off.

- The "Download complete" alert no longer disappears on its own after a few seconds — it stays until you close it with its new ✕ button. Multiple alerts stack above one another, follow the window when you move it, and hide while the app is minimized.

## [0.1.35] (2026-08-12)

- New "Privacy mode" option in a service's right-click menu: hides the top half of the service, leaving only the bottom 50% visible. The setting is remembered per service and stays applied across reloads and navigation.

## [0.1.34] (2026-08-08)

- Fixed the in-app updater not reopening the app after installing an update — the silent installer now relaunches Largs Hub when it finishes.

- Call cycle: attempts now use a random min/max delay like the other automations ("call every 30-120s") instead of one fixed wait.

- Call cycle: the cycle now cancels itself as soon as the conversation shows you were noticed — a new reply, a "Seen" receipt, or a typing indicator — hanging up the ringing call. The panel shows why it stopped. Answering the call still stops the cycle and keeps the call open.

## [0.1.33] (2026-08-06)

- The app now closes itself automatically after 1 hour with no interaction (no clicks, typing, scrolling or window focus/move/resize anywhere in the app). Background activity like notification checks and Messenger automations does not count as interaction, so an unattended app will still close.

- Call cycle: call popups opened by the cycle now start minimized and never steal focus, so ringing doesn't interrupt what you're doing; the popup pops back up automatically once the call is answered. Calls you place manually in Messenger still open normally.

## [0.1.31] (2026-07-17)

- Call cycle: the "Ring seconds" field is now labelled "Wait to ring (s)" with clearer help text — it sets how long the app waits before closing the call popup and restarting the cycle
- Call cycle: the call popup now shows a live "Ending call in Ns" countdown so you can see when the ring will stop and the cycle restarts (it disappears if the call is answered)
- Call cycle: fixed the call popup not closing on its own — Messenger's "Leave site?" prompt no longer blocks it; the app now hangs up the call cleanly and force-closes the popup when the ring time is up (or when you stop the cycle)
- Call cycle: call popups opened by the cycle now open muted (no ringback/call audio), since you're not actively on them; calls you place manually in Messenger are unaffected and stay audible

- Clicking an external link in a service no longer redirects the service away or opens your default browser — external links are ignored on click, so the service never gets blanked out. Open a link by right-clicking it and choosing "View Link" (in-app preview popup)

- Messenger voice/video calls now open in an in-app popup window (still signed in, with working audio/video) instead of your default browser — fixes calls blanking the Messenger view and lets the automation "start call cycle" run inside the app. The popup also auto-clicks "Start call" so the call connects automatically instead of stopping on the "Ready to call?" screen
- Messenger "Call cycle" automation now rings and hangs up on its own: it calls in the in-app popup, waits a configurable "ring seconds" for an answer, hangs up and retries after "wait seconds" if unanswered, and stops (keeping the call open) once the call is answered

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
