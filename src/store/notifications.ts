import { create } from "zustand";

interface NotificationState {
  counts: Record<string, number>;
  updateCount: (serviceId: string, count: number) => void;
  /** Replace every count at once — used to seed from main on mount (#79). */
  setCounts: (counts: Record<string, number>) => void;
  removeService: (serviceId: string) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  counts: {},
  updateCount: (serviceId, count) => {
    const current = get().counts[serviceId] || 0;
    if (count === current) return;
    // Always allow increases immediately; only allow decreases
    // if the new count is genuinely lower (the debounce happens on the electron side)
    set((state) => ({
      counts: { ...state.counts, [serviceId]: count },
    }));
  },
  setCounts: (counts) => set({ counts }),
  removeService: (serviceId) => {
    set((state) => {
      const { [serviceId]: _, ...rest } = state.counts;
      return { counts: rest };
    });
  },
}));
