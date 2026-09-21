// What the service editor does with icon files when the user removes an icon.
//
// Removing a custom icon used to delete the service's saved file straight away
// and then save the edit as `editIcon || editingService.icon`. The empty icon
// fell back to the old reference, so the service kept pointing at a file that
// was already gone, and cancelling the edit broke the icon outright.
//
// Now removing switches to the built-in icon for the service's name (a
// "Messenger" gets messenger.png back), or to no icon, which shows the initial.
// The editor deletes only
// uploads it made itself in this session. The service's saved icon is left for
// the main process, which deletes the file once the edit is saved
// (supersededIconFile in electron/iconCleanup.ts).

const CUSTOM_PREFIX = "custom:";

/**
 * The file to delete right away when the user removes `editIcon`: only an
 * upload made in this editing session. The service's saved icon is null here
 * because Cancel must still be able to bring it back.
 */
export function uploadToDiscard(editIcon: string, sessionUploads: string[]): string | null {
  if (!editIcon.startsWith(CUSTOM_PREFIX)) return null;
  const fileName = editIcon.slice(CUSTOM_PREFIX.length);
  return sessionUploads.includes(fileName) ? fileName : null;
}

// Built-in icon files by service name (lowercase), for services whose stored
// icon doesn't resolve: older emoji icons, or a custom icon that was removed.
const BUILT_IN_ICON_BY_NAME: Record<string, string> = {
  gmail: "gmail.png",
  slack: "slack.png",
  discord: "discord.png",
  whatsapp: "whatsapp.png",
  telegram: "telegram.png",
  notion: "notion.png",
  "twitter / x": "x.png",
  reddit: "reddit.png",
  linkedin: "linkedin.png",
  messenger: "messenger.png",
  "google chat": "googlechat.svg",
  todo: "todo.svg",
  pomodoro: "todo.svg",
};

/** The built-in icon file for a service called `name`, or "" if there isn't one. */
export function builtInIconForName(name: string): string {
  return BUILT_IN_ICON_BY_NAME[name.trim().toLowerCase()] ?? "";
}
