import path from "path";

// In-place updates on macOS. The app is unsigned, so Squirrel.Mac (which
// insists on a Developer ID signature) is out. Instead, once the DMG has been
// downloaded and checked, a detached shell script waits for the app to quit,
// copies the new bundle over the old one, deletes the DMG and reopens the app:
// the same close → replace → relaunch the NSIS installer does on Windows.
//
// Pure and Electron-free, so it can be unit-tested (test/macUpdate.test.ts).

/**
 * The `.app` bundle the running executable lives in, when the app can replace
 * it in place. `exePath` is `app.getPath("exe")`, e.g.
 * `/Applications/Largs Hub.app/Contents/MacOS/Largs Hub`.
 *
 * Null when there's no bundle to replace, or it can't be replaced: a dev run
 * (plain Electron binary), the app still running from the mounted DMG
 * (`/Volumes/…`, read-only), or App Translocation — macOS runs a quarantined
 * app from a randomised read-only copy until it has been moved at least once.
 * The caller falls back to opening the DMG in Finder.
 */
export function macAppBundlePath(exePath: string): string | null {
  const macosDir = path.posix.dirname(exePath);
  const contentsDir = path.posix.dirname(macosDir);
  const bundle = path.posix.dirname(contentsDir);
  if (path.posix.basename(macosDir) !== "MacOS") return null;
  if (path.posix.basename(contentsDir) !== "Contents") return null;
  if (!bundle.endsWith(".app") || !path.posix.isAbsolute(bundle)) return null;
  if (bundle.startsWith("/Volumes/")) return null;
  if (bundle.includes("/AppTranslocation/")) return null;
  return bundle;
}

export const MAC_UPDATE_SCRIPT_NAME = "largs-hub-update.sh";

/**
 * The script the old app hands the update to. Arguments: the old app's pid,
 * the verified DMG, and the bundle to replace.
 *
 * The new bundle is copied next to the old one first and swapped in with two
 * renames, so the old app is only moved aside once a complete copy is ready,
 * and is put back if the swap fails. Whatever happens, the DMG is deleted and
 * the app is reopened — the new version, or the old one if anything failed.
 */
export const MAC_UPDATE_SCRIPT = `#!/bin/bash
PID="$1"
DMG="$2"
APP="$3"

# Wait for the old app to quit (it force-exits within a few seconds)
for _ in $(seq 1 120); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.5
done

MNT="$(mktemp -d "\${TMPDIR:-/tmp}/largs-hub-update.XXXXXX")"
# The download was already checked against GitHub's sha256, so -noverify
if hdiutil attach "$DMG" -nobrowse -noautoopen -noverify -quiet -mountpoint "$MNT"; then
  SRC="$(find "$MNT" -maxdepth 1 -name '*.app' -type d -print -quit)"
  if [ -n "$SRC" ]; then
    NEW="$APP.new"
    OLD="$APP.old"
    rm -rf "$NEW" "$OLD"
    if ditto "$SRC" "$NEW"; then
      if mv "$APP" "$OLD"; then
        if mv "$NEW" "$APP"; then
          rm -rf "$OLD"
          echo "Updated $APP"
        else
          mv "$OLD" "$APP"
          echo "Could not move the new version into place; kept the old one"
        fi
      fi
    else
      echo "Could not copy the new version out of the DMG"
    fi
    rm -rf "$NEW"
  else
    echo "No app found in the DMG"
  fi
  hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
else
  echo "Could not mount the DMG"
fi
rmdir "$MNT" 2>/dev/null

# Copied out of a DMG the app downloaded itself, so it shouldn't carry a
# quarantine flag, but make sure Gatekeeper doesn't ask about it again
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
rm -f "$DMG"
open "$APP"
rm -f "$0"
`;
