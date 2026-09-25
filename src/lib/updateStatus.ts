// What the Settings page's "Software update" row says at each step of an
// update, kept pure so it can be unit-tested.

// "manual": a newer version exists but GitHub gave no checksum for it, so it
// can't be verified and is only offered as a download from the release page.
export type UpdateStatus =
  "idle" | "checking" | "available" | "manual" | "downloading" | "latest" | "error";

export interface UpdateProgress {
  status: UpdateStatus;
  currentVersion: string;
  newVersion: string;
  percent: number;
}

export function updateDescription({
  status,
  currentVersion,
  newVersion,
  percent,
}: UpdateProgress): string {
  switch (status) {
    case "idle":
      return `v${currentVersion}`;
    case "checking":
      return "Checking...";
    case "latest":
      return `v${currentVersion} — Up to date`;
    case "available":
      return `v${currentVersion} → v${newVersion} available`;
    case "manual":
      return `v${newVersion} available — download it from GitHub`;
    case "downloading":
      return `Downloading v${newVersion}... ${percent}%`;
    case "error":
      return "Unable to check for updates";
  }
}

// The description's colour, or undefined for the row's usual muted text.
export function updateStatusColor(status: UpdateStatus): string | undefined {
  switch (status) {
    case "latest":
      return "#a6e3a1";
    case "error":
      return "#f38ba8";
    case "available":
    case "manual":
      return "var(--accent)";
    default:
      return undefined;
  }
}
