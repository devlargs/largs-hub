import { useEffect, useRef, useState } from "react";
import type { Passcode, PasscodesResult, Service } from "../../types";
import { passcodeServiceName, sortPasscodes } from "../../lib/passcodes";
import ConfirmDialog from "../ui/ConfirmDialog";
import InfoPopover from "./InfoPopover";
import PasscodeDialog from "./PasscodeDialog";
import PasscodesUnlock from "./PasscodesUnlock";
import { SecondaryButton, Section } from "./controls";

const USE =
  "Save PINs, passwords and other codes. They're offered when you click into a sign-in field of the service they're saved for, or right-click any text field and choose Fill passcode. Copy puts one on the clipboard and clears it after 30 seconds.";
const LOCAL_INFO = `${USE} Each passcode is encrypted by your computer's own keychain (Windows: your account's data protection; macOS: the Keychain), so it can only be read on this computer, under your account. Turn on Add Security Controls to keep them behind your master password.`;
const ACCOUNT_INFO = `${USE} Signed in, they're saved in your account and nowhere on this computer, encrypted end to end with a key only your account password unlocks, so not even the sync server can read them. They follow you to every computer you sign in on.`;

// Settings → Passcodes. The list holds names and usernames only; the passcodes
// themselves stay in the main process (ipc/passcodes.ts).
export default function PasscodesSection() {
  const [state, setState] = useState<PasscodesResult>({
    ok: true,
    available: true,
    passcodes: [],
  });
  const [services, setServices] = useState<Service[]>([]);
  // undefined: closed; null: adding; a passcode: editing it
  const [editing, setEditing] = useState<Passcode | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Passcode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.passcodes.list().then(setState);
    api.getServices().then(setServices);
    const unsubscribe = api.onServicesUpdated(setServices);
    const offChanged = api.passcodes.onChanged(() => void api.passcodes.list().then(setState));
    return () => {
      unsubscribe();
      offChanged();
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const apply = (result: PasscodesResult) => {
    setState(result);
    setError(result.ok ? "" : (result.error ?? "That didn't work."));
  };

  const copy = async (passcode: Passcode) => {
    const result = await window.electronAPI.passcodes.copy(passcode.id);
    apply(result);
    if (!result.ok) return;
    setCopiedId(passcode.id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
  };

  const passcodes = sortPasscodes(state.passcodes);
  const reload = () => void window.electronAPI.passcodes.list().then(apply);

  return (
    <>
      <Section title="Passcodes">
        <div className="py-2 @lg:px-3.5 @lg:py-3">
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Saved passcodes
              </span>
              <InfoPopover
                label="Saved passcodes"
                text={state.account ? ACCOUNT_INFO : LOCAL_INFO}
              />
            </div>
            {state.available && (
              <SecondaryButton onClick={() => setEditing(null)}>Add passcode</SecondaryButton>
            )}
          </div>

          {state.account === "needs-password" ? (
            <PasscodesUnlock onUnlocked={reload} />
          ) : state.account === "waiting" ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Your passcodes will appear once this computer has synced with your account.
            </p>
          ) : !state.available ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              This computer can&apos;t encrypt passcodes right now, so none can be saved.
            </p>
          ) : passcodes.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No saved passcodes yet. Add one, and it&apos;s offered when you click into a sign-in
              field of its service.
            </p>
          ) : (
            <div
              className="overflow-hidden rounded-lg"
              style={{ border: "1px solid var(--border)" }}
            >
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr
                    className="text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)", backgroundColor: "var(--sidebar-hover)" }}
                  >
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="hidden px-3 py-2 font-semibold @lg:table-cell">Offered in</th>
                    <th className="w-[220px] px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {passcodes.map((p) => (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2">
                        <div className="truncate" style={{ color: "var(--text-primary)" }}>
                          {p.label}
                        </div>
                        {p.username && (
                          <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                            {p.username}
                          </div>
                        )}
                      </td>
                      <td
                        className="hidden truncate px-3 py-2 @lg:table-cell"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {passcodeServiceName(p, services)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <SecondaryButton onClick={() => copy(p)}>
                            {copiedId === p.id ? "Copied" : "Copy"}
                          </SecondaryButton>
                          <SecondaryButton onClick={() => setEditing(p)}>Edit</SecondaryButton>
                          <SecondaryButton onClick={() => setRemoving(p)}>Delete</SecondaryButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs" style={{ color: "var(--danger)", marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      </Section>

      {editing !== undefined && (
        <PasscodeDialog
          passcode={editing}
          services={services}
          onSaved={(result) => {
            apply(result);
            setEditing(undefined);
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete passcode?"
          body={`"${removing.label}" will be removed from ${
            state.account ? "your account, on every computer" : "this computer"
          }. This can't be undone.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => apply(await window.electronAPI.passcodes.remove(removing.id))}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}
