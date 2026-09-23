import { useEffect, useState } from "react";
import type { AutoStopState } from "../../types";
import { NOTICE_LABELS, missedMessage } from "../../lib/automationForm";

// The panel takes the right share of a split with the service view. Main owns
// that calculation (electron/automationLayout.ts) and pushes the width here, so
// the panel always covers exactly the strip main reserved for it — no formula
// duplicated across the two layers.
// Used only for the first paint, before main's width arrives.
const FALLBACK_PANEL_WIDTH = 340;

// Follow the width main reserved for us: read it on mount, then track the
// pushes it sends on every window resize. A width of 0 means the split isn't
// open yet, so keep the fallback rather than collapsing to nothing.
export function useSplitWidth(): number {
  const [panelWidth, setPanelWidth] = useState(FALLBACK_PANEL_WIDTH);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.messengerAutomation.getSplitWidth().then((width) => {
      if (!cancelled && width > 0) setPanelWidth(width);
    });
    const unsubscribe = window.electronAPI?.messengerAutomation.onSplitWidthChanged((width) => {
      if (width > 0) setPanelWidth(width);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return panelWidth;
}

// Things main tells the panel about on its own, reported as success text.
// `report` must be stable (a state setter or a memoised callback).
export function useAutomationNotices(serviceId: string, report: (text: string) => void): void {
  // The call cycle cancels itself once she reacts; the task is gone from the
  // list by then, so surface the reason here.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.messengerAutomation.onNotice(
      ({ serviceId: id, reason }) => {
        if (id !== serviceId) return;
        report(`Call cycle stopped — ${NOTICE_LABELS[reason]}`);
      },
    );
    return unsubscribe;
  }, [serviceId, report]);

  // A scheduled send whose moment passed while the app was closed is not
  // restored — say so instead of showing an unexplained empty list (issue #75).
  useEffect(() => {
    const unsubscribe = window.electronAPI?.messengerAutomation.onMissed((missedTasks) => {
      const mine = missedTasks.filter((t) => t.serviceId === serviceId);
      if (mine.length === 0) return;
      report(missedMessage(mine.length));
    });
    return unsubscribe;
  }, [serviceId, report]);
}

// The auto-stop lives in the main process (it must survive this panel being
// closed), so read the armed state on mount and follow it from there.
export function useAutoStop(
  serviceId: string,
  report: (text: string) => void,
): [AutoStopState | null, (state: AutoStopState | null) => void] {
  const [autoStop, setAutoStop] = useState<AutoStopState | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.messengerAutomation.getAutoStop(serviceId).then((state) => {
      if (!cancelled) setAutoStop(state);
    });
    const unsubscribe = window.electronAPI?.messengerAutomation.onAutoStopUpdated(
      ({ serviceId: id, autoStop: state, fired }) => {
        if (id !== serviceId) return;
        setAutoStop(state);
        if (fired) report("Auto-stop reached — all automations cleared");
      },
    );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [serviceId, report]);
  return [autoStop, setAutoStop];
}

// Recent emojis live in the main process so they survive the panel closing
// and are shared across services. Newest first.
export function useRecentEmojis(): string[] {
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.messengerAutomation.getRecentEmojis().then((emojis) => {
      if (!cancelled) setRecentEmojis(emojis);
    });
    const unsubscribe =
      window.electronAPI?.messengerAutomation.onRecentEmojisUpdated(setRecentEmojis);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return recentEmojis;
}

// The current time, ticking every second while something counts down. Main
// only pushes on task-state changes, so countdowns tick locally.
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  return now;
}
