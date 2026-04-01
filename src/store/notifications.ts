import { create } from "zustand";

interface NotificationState {
  counts: Record<string, number>;
  updateCount: (serviceId: string, count: number) => void;
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
  removeService: (serviceId) => {
    set((state) => {
      const { [serviceId]: _, ...rest } = state.counts;
      return { counts: rest };
    });
  },
}));
