// What the service editor does with icon files when the user removes an icon.
//
// Removing a custom icon used to delete the service's saved file straight away
// and then save the edit as `editIcon || editingService.icon`. The empty icon
// fell back to the old reference, so the service kept pointing at a file that
// was already gone, and cancelling the edit broke the icon outright.
//
// Now an edit saves the empty icon as-is, so the service falls back to its
// built-in icon (matched by name) or its initial. The editor deletes only
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
