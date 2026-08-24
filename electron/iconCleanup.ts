// Which uploaded icon files are still referenced by a service, and which are
// orphans safe to delete.
//
// Uploaded icons live in userData/custom-icons/<uuid>.<ext> and a service points
// at one with an `icon` of "custom:<file>". Nothing used to delete them except
// the explicit Remove button in the edit modal, so replacing an icon or removing
// a service left the file behind forever (issue #70).
//
// Pure so it can be unit-tested; the fs calls live in the callers.

const CUSTOM_PREFIX = "custom:";

/** The stored filename behind a `custom:` icon, or null for a built-in one. */
export function customIconFileName(icon: unknown): string | null {
  if (typeof icon !== "string" || !icon.startsWith(CUSTOM_PREFIX)) return null;
  const fileName = icon.slice(CUSTOM_PREFIX.length);
  return fileName.length > 0 ? fileName : null;
}

/**
 * Files in the icon directory that no service references any more.
 *
 * Deliberately conservative: an icon this build doesn't understand still counts
 * as a reference, so a file is only ever deleted when nothing at all points at
 * it. `services` is the full stored list.
 */
export function orphanedIconFiles(
  fileNames: string[],
  services: Array<{ icon?: unknown }>,
): string[] {
  const referenced = new Set<string>();
  for (const service of services) {
    const fileName = customIconFileName(service.icon);
    if (fileName) referenced.add(fileName);
  }
  return fileNames.filter((name) => !referenced.has(name));
}

/**
 * The file to delete when a service's icon changes from `previous` to `next`:
 * the old custom file, unless it's the very same file or still in use elsewhere.
 */
export function supersededIconFile(
  previous: unknown,
  next: unknown,
  otherServices: Array<{ icon?: unknown }> = [],
): string | null {
  const old = customIconFileName(previous);
  if (!old) return null;
  if (old === customIconFileName(next)) return null;
  // Two services can point at the same upload (a duplicated service); only the
  // last reference may delete it.
  if (otherServices.some((s) => customIconFileName(s.icon) === old)) return null;
  return old;
}
