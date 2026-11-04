import { create } from "zustand";
import type { PhoneStatus } from "@shared/phoneStatus";

// The paired phone's status per Google Messages service, pushed from main
// (electron/serviceViews/phoneStatus.ts). A service with no entry shows nothing.

interface PhoneStatusState {
  statuses: Record<string, PhoneStatus>;
  update: (serviceId: string, status: PhoneStatus | null) => void;
  setAll: (statuses: Record<string, PhoneStatus>) => void;
}

export const usePhoneStatusStore = create<PhoneStatusState>((set) => ({
  statuses: {},
  update: (serviceId, status) =>
    set((state) => {
      const { [serviceId]: _, ...rest } = state.statuses;
      return { statuses: status ? { ...rest, [serviceId]: status } : rest };
    }),
  setAll: (statuses) => set({ statuses }),
}));
