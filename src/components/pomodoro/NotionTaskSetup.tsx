import { useState } from "react";
import notionIcon from "../../assets/images/notion.png";

interface NotionTaskSetupProps {
  serviceId: string;
  // True when a previous connect found a non-empty database and we're still
  // waiting for the user to decide what to do with it
  initialNeedsReset: boolean;
  // True when that non-empty database already follows this app's conventions —
  // it holds tasks from a previous connection that the user can keep
  initialAdoptable: boolean;
  onReady: () => void;
  // Back to the list without connecting anything — Notion is optional here,
  // unlike the note taker this service replaced
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  padding: "10px 16px",
  backgroundColor: "var(--panel)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 14,
};

export default function NotionTaskSetup({
  serviceId,
  initialNeedsReset,
  initialAdoptable,
  onReady,
  onCancel,
}: NotionTaskSetupProps) {
  const [mode, setMode] = useState<"form" | "reset">(initialNeedsReset ? "reset" : "form");
  const [adoptable, setAdoptable] = useState(initialAdoptable);
  const [apiKey, setApiKey] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConnect = apiKey.trim().length > 0 && databaseId.trim().length > 0 && !busy;

  const handleConnect = async () => {
    if (!canConnect) return;
    setBusy(true);
    setError(null);
    const res = await window.electronAPI.pomodoro.connect(
      serviceId,
      apiKey.trim(),
      databaseId.trim(),
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not connect to Notion.");
      return;
    }
    if (res.needsReset) {
      setAdoptable(res.adoptable === true);
      setMode("reset");
    } else {
      onReady();
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setError(null);
    const res = await window.electronAPI.pomodoro.resetDatabase(serviceId);
    setBusy(false);
    if (res.ok) onReady();
    else setError(res.error || "Could not empty the database.");
  };

  const handleAdopt = async () => {
    setBusy(true);
    setError(null);
    const res = await window.electronAPI.pomodoro.adoptDatabase(serviceId);
    setBusy(false);
    if (res.ok) onReady();
    else setError(res.error || "Could not reconnect to the existing tasks.");
  };

  const handleUseDifferent = async () => {
    await window.electronAPI.pomodoro.disconnect(serviceId);
    setError(null);
    setMode("form");
  };

  const secondaryButtonStyle: React.CSSProperties = {
    padding: "12px 24px",
    borderRadius: 12,
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  };

  return (
    <div
      className="h-full overflow-y-auto flex items-center justify-center"
      style={{ background: "var(--surface)", padding: 24 }}
    >
      <div
        className="rounded-3xl w-full"
        style={{
          maxWidth: 540,
          background: "var(--sidebar)",
          border: "1px solid var(--border)",
          padding: "36px 40px",
        }}
      >
        {mode === "form" ? (
          <>
            <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
              <img
                src={notionIcon}
                alt="Notion"
                style={{ width: 32, height: 32, objectFit: "contain" }}
              />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                Sync your tasks with Notion
              </h2>
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              Optional — your tasks already work offline on this device. Connect a{" "}
              <strong>freshly created, empty database</strong> you own and every task also lives in
              Notion, editable from anywhere.
            </p>
            <ol
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                paddingLeft: 20,
                marginBottom: 20,
              }}
            >
              <li>
                Create an integration at{" "}
                <button
                  onClick={() =>
                    window.electronAPI.openLinkExternal("https://www.notion.so/my-integrations")
                  }
                  className="cursor-pointer"
                  style={{
                    color: "var(--accent)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    fontSize: 13,
                    textDecoration: "underline",
                  }}
                >
                  notion.so/my-integrations
                </button>{" "}
                and copy its Internal Integration Secret.
              </li>
              <li>In Notion, create a new empty database (Table — full page).</li>
              <li>
                On the database page, open the <strong>•••</strong> menu → Connections → add your
                integration.
              </li>
              <li>Paste the secret and the database link (or ID) below.</li>
            </ol>

            <div className="flex flex-col" style={{ gap: 6, marginBottom: 14 }}>
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                NOTION_API_KEY
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ntn_… or secret_…"
                className="outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col" style={{ gap: 6, marginBottom: 18 }}>
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                NOTION_DATABASE_ID
              </label>
              <input
                type="text"
                value={databaseId}
                onChange={(e) => setDatabaseId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConnect();
                }}
                placeholder="Database URL or ID"
                className="outline-none"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 14, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div className="flex flex-col" style={{ gap: 10 }}>
              <button
                onClick={handleConnect}
                disabled={!canConnect}
                className="w-full text-sm font-semibold cursor-pointer transition-all"
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  background: canConnect
                    ? "var(--accent)"
                    : "color-mix(in srgb, var(--accent) 30%, transparent)",
                  border: "none",
                  color: canConnect ? "var(--surface)" : "var(--text-secondary)",
                  opacity: canConnect ? 1 : 0.5,
                }}
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
              <button
                onClick={onCancel}
                disabled={busy}
                className="w-full text-sm cursor-pointer transition-colors"
                style={secondaryButtonStyle}
              >
                Keep tasks on this device only
              </button>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 12,
                textAlign: "center",
              }}
            >
              Your API key is stored encrypted on this device and only used to talk to the Notion
              API.
            </p>
          </>
        ) : (
          <>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 12,
              }}
            >
              {adoptable ? "This database already contains tasks" : "This database isn't empty"}
            </h2>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                marginBottom: 20,
              }}
            >
              {adoptable ? (
                <>
                  This looks like a Largs Hub task database — perhaps from a previous connection or
                  install. You can <strong>keep the existing tasks and pick up where you left
                  off</strong>, or empty the database and start fresh.
                </>
              ) : (
                <>
                  Pomodoro needs full control of the database you connect. To keep using this one,
                  Largs Hub will{" "}
                  <strong>move all of its existing pages to Notion's trash</strong> and repurpose
                  its fields for tasks. If that data matters to you, connect a different, freshly
                  created database instead.
                </>
              )}
            </p>

            {error && (
              <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 14, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div className="flex flex-col" style={{ gap: 10 }}>
              {adoptable && (
                <button
                  onClick={handleAdopt}
                  disabled={busy}
                  className="w-full text-sm font-semibold cursor-pointer transition-all"
                  style={{
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "var(--accent)",
                    border: "none",
                    color: "var(--surface)",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? "Reconnecting…" : "Keep the existing tasks"}
                </button>
              )}
              <button
                onClick={handleReset}
                disabled={busy}
                className="w-full text-sm font-semibold cursor-pointer transition-all"
                style={{
                  padding: "12px 24px",
                  borderRadius: 12,
                  background: adoptable ? "transparent" : "var(--danger)",
                  border: adoptable
                    ? "1px solid color-mix(in srgb, var(--danger) 50%, transparent)"
                    : "none",
                  color: adoptable ? "var(--danger)" : "var(--panel)",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy
                  ? "Working…"
                  : adoptable
                    ? "Empty the database and start fresh"
                    : "Empty the database and continue"}
              </button>
              <button
                onClick={handleUseDifferent}
                disabled={busy}
                className="w-full text-sm cursor-pointer transition-colors"
                style={secondaryButtonStyle}
              >
                Use a different database
              </button>
              <button
                onClick={onCancel}
                disabled={busy}
                className="w-full text-sm cursor-pointer transition-colors"
                style={secondaryButtonStyle}
              >
                Cancel and keep tasks on this device
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
