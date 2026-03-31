import { useEffect, useState } from "react";

type UpdateState = "idle" | "available" | "downloading" | "ready";

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>("idle");
  const [version, setVersion] = useState("");
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsub1 = window.electronAPI.onUpdateAvailable((info) => {
      setVersion(info.version);
      setState("available");
      setDismissed(false);
    });

    const unsub2 = window.electronAPI.onUpdateDownloadProgress((info) => {
      setPercent(Math.round(info.percent));
    });

    const unsub3 = window.electronAPI.onUpdateDownloaded(() => {
      setState("ready");
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  if (state === "idle" || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-sidebar border border-sidebar-active rounded-lg shadow-lg p-4 max-w-xs">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-gray-400 hover:text-white text-sm leading-none"
      >
        &times;
      </button>

      {state === "available" && (
        <div>
          <p className="text-white text-sm mb-2">
            Update <span className="text-accent font-semibold">v{version}</span> is available
          </p>
          <button
            onClick={() => {
              setState("downloading");
              window.electronAPI.startUpdateDownload();
            }}
            className="bg-accent text-surface text-sm font-medium px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
          >
            Download
          </button>
        </div>
      )}

      {state === "downloading" && (
        <div>
          <p className="text-white text-sm mb-2">Downloading update... {percent}%</p>
          <div className="w-full bg-sidebar-active rounded-full h-1.5">
            <div
              className="bg-accent h-1.5 rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {state === "ready" && (
        <div>
          <p className="text-white text-sm mb-2">Update ready to install</p>
          <button
            onClick={() => window.electronAPI.installUpdate()}
            className="bg-accent text-surface text-sm font-medium px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
          >
            Restart now
          </button>
        </div>
      )}
    </div>
  );
}
