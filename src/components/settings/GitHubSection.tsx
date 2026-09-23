import { useEffect, useState } from "react";
import type { GitHubStatus } from "../../types";
import { SecondaryButton, Section, SettingRow } from "./controls";

const TOKEN_INFO =
  "Lets Changelog → Report an issue file issues on devlargs/largs-hub, assigned to devlargs. " +
  "Create a fine-grained personal access token on GitHub (Settings → Developer settings → " +
  "Personal access tokens → Fine-grained tokens) with access to only the largs-hub repository, " +
  "and Issues and Contents set to Read and write (Contents holds the images you paste). " +
  "It's stored encrypted on this computer and only used to talk to GitHub.";

// Settings → GitHub: save, check and remove the token behind Report an issue.
// The token goes to main once and never comes back; this only sees whether one
// is saved and whose it is.
export default function GitHubSection() {
  const [status, setStatus] = useState<GitHubStatus>({ connected: false });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.electronAPI?.github
      .getStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.github.setToken(draft);
      if (!result.ok) {
        setError(result.error ?? "The token couldn't be saved.");
        return;
      }
      setDraft("");
      setStatus({ connected: true, login: result.login });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    await window.electronAPI.github.clearToken();
    setStatus({ connected: false });
  };

  return (
    <Section title="GitHub">
      <SettingRow
        label="GitHub token"
        info={TOKEN_INFO}
        status={
          status.connected
            ? `Connected${status.login ? ` as @${status.login}` : ""}`
            : (error ?? "Not connected")
        }
        statusColor={error && !status.connected ? "#f38ba8" : undefined}
      >
        {status.connected ? (
          <SecondaryButton onClick={handleRemove}>Remove</SecondaryButton>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && !busy) void handleSave();
              }}
              placeholder="github_pat_…"
              aria-label="GitHub token"
              autoComplete="off"
              spellCheck={false}
              className="text-sm rounded-lg outline-none w-[140px] @lg:w-[200px]"
              style={{
                padding: "6px 10px",
                backgroundColor: "var(--sidebar-hover)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <SecondaryButton onClick={() => void (draft.trim() && !busy && handleSave())}>
              {busy ? "Checking…" : "Save"}
            </SecondaryButton>
          </div>
        )}
      </SettingRow>
    </Section>
  );
}
