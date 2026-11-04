import { useEffect } from "react";
import { usePhoneStatusStore } from "../store/phoneStatus";

// Keeps the phone-status store in step with main, seeded first so a UI reload
// doesn't lose statuses that only get pushed when they change.
export function usePhoneStatusSync(): void {
  const update = usePhoneStatusStore((s) => s.update);
  const setAll = usePhoneStatusStore((s) => s.setAll);
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getPhoneStatuses().then(setAll);
    return window.electronAPI.onPhoneStatusUpdate(({ serviceId, status }) =>
      update(serviceId, status),
    );
  }, [update, setAll]);
}
