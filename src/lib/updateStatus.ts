// What the Settings page's "Software update" row says at each step of an
// update, kept pure so it can be unit-tested.

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "latest" | "error";

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
      return "var(--accent)";
    default:
      return undefined;
  }
}
