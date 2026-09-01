# Changelog

## [Unreleased]

- The **Pomodoro** service is now simply **Todo** — a plain daily task list. The focus timer is gone: no ring, no clock, no start/pause/skip, no per-task session tally, and the Focus/Break length settings have been removed from Settings. Everything else the list did stays: add, edit, check off, delete, drag to reorder, step through days, and carry unfinished work over to the next day. Existing Pomodoro services, their tasks and their Notion connection carry across on first launch under the new name and icon; nothing needs re-adding.
- **Checking a task now dissolves it.** Its letters blur and fade away one after another, left to right, and the row closes the gap behind them. Long tasks dissolve at the same pace as short ones rather than dragging on, and the whole thing is skipped if your system asks for reduced motion.
- **Finished tasks are filed away instead of struck through.** A **Done tasks** button sits at the foot of the list with the day's count beside it; open it to see them, uncheck one to send it back to the list. The strikethrough is gone — a crossed-out task was still a full line of text to read past.
- **Adding a task no longer means scrolling.** The add-a-task box has moved to the top of the page, directly under the day, and stays pinned there while the list scrolls beneath it — on a long list the composer used to sit at the very bottom, out of reach. It takes the caret the moment you open the service, so a new task is one keystroke away.

## [0.1.48] (2026-08-29)

- Removed the **Close when idle** setting and the auto-quit behaviour behind it. The app never closes itself now — it stays open until you close it.

## [0.1.47] (2026-08-24)

- New **tray icon**, so the app can keep running with the window out of the way instead of the choice being "window on screen" or "not running". Two settings (both off by default, so nothing changes unless you turn them on): **Close to tray** and **Minimize to tray**. The tray icon carries the unread total, left-clicking restores the window, and its menu jumps straight to any service — with its own unread count beside it — or quits properly.

- Accessibility: every icon-only button now has a name a screen reader can read — window controls, the settings gear, back/forward/reload, the sidebar services (which also announce their unread count) and the settings switches, none of which announced anything before. **Escape** closes the add-service, link-preview and automation panels, Tab stays inside a dialog while it's open and returns to where it came from on close, keyboard focus is now visible everywhere, and services can be reordered from the keyboard with **Alt+Up/Down** instead of only by long-press-and-drag.

- Services no longer scrape their pages every three seconds around the clock. The service you're looking at still updates that fast; ones in the background drop to every 20 seconds, and polling stops altogether while the window is minimized, the machine is asleep, or you're on battery — with a catch-up check the moment you come back. Unread counts that arrive via the page title are unaffected, so most services still update instantly.

- The app no longer closes itself after an hour without asking. That behaviour was hardcoded, undocumented and had no exemptions — it would quit during a call, mid-focus-session, or while a message was scheduled to send later, taking the unfinished work with it. It is now a setting (Settings → General → Close when idle), **off by default**, and even when switched on it stays open while audio is playing, a focus timer is running, or automation is pending.

- Hibernation no longer silently kills work you left running in a background service. A service with running Messenger automation, playing audio, or a download in progress is now skipped by the idle sweep — it used to be torn down, taking every automation task with it and leaving the panel showing an empty list with no explanation. Once the work finishes the service becomes eligible again straight away.

- Messenger automation now survives closing the app. Tasks and an armed auto-stop are saved and picked back up on launch: repeating ones restart, a scheduled send still in the future is re-armed, one missed by under an hour is sent on opening, and one missed by longer is skipped with a note in the panel rather than firing hours late. Long waits are also re-checked against the clock, so a scheduled send no longer drifts when the machine sleeps.

- A running Pomodoro session survives closing the app. It used to be thrown away entirely — including the focus sessions it had banked toward a task — which made the focus count untrustworthy. On reopening, any phases that finished while you were away are counted and the timer comes back paused where it got to, rather than silently resuming. Focus and break lengths are now settings (Settings → Pomodoro) instead of a fixed 25/5.

- You can now add any web app by address, not just the eleven presets. A **Custom** tile at the end of the add grid opens a name/address/icon form, the name is filled in from the address as you type (`app.slack.com` becomes "Slack"), and a bare address like `mail.proton.me` is accepted. Searching for something with no matching preset now points you at it instead of showing an empty grid.

- Uploaded service icons are no longer left on disk forever. Replacing an icon, cancelling out of the icon picker, or removing a service now deletes the file it was using, and icons abandoned by earlier versions are cleaned up at startup. An icon shared by two services is only deleted once nothing points at it.

- Downloading a file whose name already exists in your download folder no longer overwrites the old one without asking. It saves alongside it as `report (1).pdf`, the way a browser does. This only affected people with a custom download folder set.

- Internal: added tests for the checks that decide whether a service is valid enough to save and when an unread badge is allowed to drop. Both were untested and both are places where a regression shows up days later as odd behaviour — an edit that silently doesn't save, or a badge that blinks.

- Fixed the **Sound** item in a service's right-click menu toggling from stale state: if the service was muted or unmuted elsewhere while the menu sat open, clicking Sound could set it back to what the menu showed instead of flipping the current value. All five per-service toggles now share one implementation, so the menu and the rest of the app can't disagree again.

- Internal: the data types passed between the app's window and its background process are now declared once and shared, instead of being written out three times with nothing checking they matched. No visible change — a mismatch that used to surface as a runtime bug is now a compile error.

- Internal: the layout numbers that keep native views lined up with the interface around them (sidebar width, titlebar height, link-preview geometry) now come from one shared module instead of being typed out separately in each layer. No visible change — it removes a class of misalignment bug.

- Documentation and CI-only commits no longer publish a new version, so you stop getting update prompts for changes that don't affect the app. Behind the scenes CI now builds and packages the app on Windows, checks formatting, and pins the same Node version the release uses, so a packaging break is caught before it ships.

- The Messenger automation panel now sizes itself to the window. It no longer shrinks to an unusable sliver on a small window or stretch into a half-empty wall of form on a large display, its side-by-side fields stack when space is tight, and on a very narrow window it takes the whole pane instead of leaving a useless strip of Messenger beside it.

- New issues opened on GitHub are assigned to the maintainer automatically. Repository housekeeping only — no change to the app.

## [0.1.46] (2026-08-24)

- The Emoji tab in the Messenger automation panel now has a **Recent** pane: every emoji you burst is remembered, newest first, so starting the same one again is a single click. The pane only ever shows emojis you have used yourself — nothing is pre-filled. The list is shared across services and survives a restart.

- New **Random list** tab in the Messenger automation panel. Save named lists of messages once and reuse them: each time the automation fires it sends one entry picked at random, never the same one twice in a row, at a random delay between your min and max seconds. Lists are created, renamed, edited and deleted from the panel, survive a restart, and are shared across every Messenger service. The picker has a search box and pages once you have more than ten. Editing or deleting a list never disturbs a task already running from it.

- Service tabs now behave like browser tabs. **Ctrl+F** opens a find bar above the page with a match counter and next/previous (Enter and Shift+Enter step through, Esc closes). **Ctrl+`+`**, **Ctrl+`-`** and **Ctrl+0** zoom a service, each service remembers its own zoom across reloads and restarts, and the titlebar shows the current percentage with one click back to 100%. Right-clicking a misspelled word now offers corrections and "Add to dictionary", and the right-click menu has Cut, Copy, Paste, Paste as plain text and Select all in text boxes.

- Releases are now built from the newest commit on `main`. If you push again while a release is still building, that run is cancelled and restarted on the newer commit, so the version bump, tag and changelog can no longer describe an older state of the code. The typecheck, lint and test checks work the same way on every branch and pull request.

- Settings no longer sits flush against the edges of the window. A global CSS reset was quietly cancelling every spacing class in the app, so the page lost its top, bottom and right gutters and the rows lost their breathing room. The reset is now scoped properly, Settings has its margins back at every window size, and the column is a little wider on large screens.

- Privacy: removing a service now really forgets the account. Its cookies, site data and cache are deleted instead of being left on disk forever, leftovers from services removed by earlier versions are cleaned up at startup, and a new "Clear data and sign out" item in the service right-click menu resets a stuck login without removing the service.

## [0.1.45] (2026-08-24)

- Sidebar unread badges no longer sit blank until a count changes — they now load the current counts as soon as the interface starts.

- The updater no longer offers a "update" that would actually downgrade you. It now compares version numbers properly, so an older or unusual release tag is ignored instead of being installed on every check.

- Security: a link to a lookalike domain (`evilnotion.so` for a Notion service) could open inside the logged-in service tab, with that tab's cookies and permissions. Domain matching now requires a real boundary, so only the service's own domain and known sign-in providers load in place.

- Removed an unused update screen, a duplicate copy of the service icons, and a stored setting nothing read. No visible change — the duplicates were dead weight that made edits look like they did nothing.

- The app reopens on the service you were last using instead of always starting on the Welcome screen. If that service has since been removed or disabled, you get the Welcome screen as before.

- The window no longer maximizes every time the app starts. It reopens at the size and position you left it at, which matters most after an auto-update, since that closes and reopens the app for you. If you had it maximized, it still comes back maximized.

- Editing a service's URL to something invalid no longer looks like it saved and then quietly keeps the old address. The form now shows an error, and a bare address like `mail.proton.me` is accepted and completed to `https://`.

- Security: the internal `custom-icon://` address used to load uploaded service icons could be pointed at any file on your machine, and any page loaded in a service tab could ask for it. It now refuses anything outside the icon folder and is only available to the app's own interface.

## [0.1.44] (2026-08-24)

- Tasks containing a link render properly again. A long link used to break onto its own centred lines instead of flowing with the words around it, and the strikethrough on a completed task drew a single stripe across the middle of a multi-line task rather than through each line. The checkbox now lines up with the first line of a long task instead of floating in the middle.
- The Settings page has a proper gutter again — rows were sitting flush against the left and right edges in a narrow window.

## [0.1.43] (2026-08-24)

- The installer downloaded by an in-app update is now deleted on the next launch instead of being left in your temp folder for good.

## [0.1.42] (2026-08-24)

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
