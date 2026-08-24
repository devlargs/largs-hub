import { ipcMain, Notification, WebContentsView } from "electron";

// The 25/5 Pomodoro timer, bound to one task at a time. It lives in the main
// process so it keeps running while you're in another service (the React page
// unmounts on every service switch) and only pushes on phase changes — the
// renderer ticks the countdown itself from `endsAt`.

export const FOCUS_MINUTES = 25;
export const BREAK_MINUTES = 5;

export type TimerPhase = "focus" | "break";

export interface TimerState {
  serviceId: string;
  taskId: string | null;
  phase: TimerPhase;
  running: boolean;
  // Epoch ms this phase ends; meaningful while running
  endsAt: number;
  // Milliseconds left, kept while paused
  remainingMs: number;
  // Focus sessions finished since this timer was started
  completedFocus: number;
}

interface TimerDeps {
  getUiView: () => WebContentsView | null;
  // Bank a finished focus session against the task it was spent on
  onFocusSessionComplete: (serviceId: string, taskId: string) => void;
}

const phaseMs = (phase: TimerPhase) =>
  (phase === "focus" ? FOCUS_MINUTES : BREAK_MINUTES) * 60_000;

let state: TimerState | null = null;
let timer: NodeJS.Timeout | null = null;
// Set by registerPomodoroTimer so the stop helpers below can push too
let pushState: () => void = () => {};

function clearPhaseTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function registerPomodoroTimer(deps: TimerDeps): void {
  const push = () => {
    const ui = deps.getUiView();
    if (ui && !ui.webContents.isDestroyed()) {
      ui.webContents.send("pomodoro-timer-updated", state);
    }
  };
  pushState = push;

  function notify(title: string, body: string) {
    if (!Notification.isSupported()) return;
    new Notification({ title, body, silent: false }).show();
  }

  // Arms the countdown for the current phase from its remaining time.
  function arm() {
    clearPhaseTimer();
    if (!state?.running) return;
    timer = setTimeout(advance, Math.max(0, state.endsAt - Date.now()));
  }

  // A phase ran out: bank the focus session, flip phase, keep going. The cycle
  // continues on its own — that's the point of a pomodoro — until Stop.
  function advance() {
    if (!state) return;
    const finished = state.phase;
    if (finished === "focus" && state.taskId) {
      deps.onFocusSessionComplete(state.serviceId, state.taskId);
      state.completedFocus++;
    }
    const phase: TimerPhase = finished === "focus" ? "break" : "focus";
    state = {
      ...state,
      phase,
      running: true,
      endsAt: Date.now() + phaseMs(phase),
      remainingMs: phaseMs(phase),
    };
    notify(
      finished === "focus" ? "Focus session complete" : "Break's over",
      finished === "focus"
        ? `Take a ${BREAK_MINUTES} minute break.`
        : `Back to it — ${FOCUS_MINUTES} minutes of focus.`,
    );
    arm();
    push();
  }

  ipcMain.handle("pomodoro-timer-get", (): TimerState | null => state);

  ipcMain.handle(
    "pomodoro-timer-start",
    (_event, serviceIdRaw: unknown, taskIdRaw: unknown): TimerState | null => {
      if (typeof serviceIdRaw !== "string") return state;
      const taskId = typeof taskIdRaw === "string" ? taskIdRaw : null;
      state = {
        serviceId: serviceIdRaw,
        taskId,
        phase: "focus",
        running: true,
        endsAt: Date.now() + phaseMs("focus"),
        remainingMs: phaseMs("focus"),
        completedFocus: 0,
      };
      arm();
      push();
      return state;
    },
  );

  ipcMain.handle("pomodoro-timer-pause", (): TimerState | null => {
    if (!state?.running) return state;
    clearPhaseTimer();
    state = { ...state, running: false, remainingMs: Math.max(0, state.endsAt - Date.now()) };
    push();
    return state;
  });

  ipcMain.handle("pomodoro-timer-resume", (): TimerState | null => {
    if (!state || state.running) return state;
    state = { ...state, running: true, endsAt: Date.now() + state.remainingMs };
    arm();
    push();
    return state;
  });

  // Jump straight to the next phase without banking a partial focus session.
  ipcMain.handle("pomodoro-timer-skip", (): TimerState | null => {
    if (!state) return null;
    const phase: TimerPhase = state.phase === "focus" ? "break" : "focus";
    state = {
      ...state,
      phase,
      running: true,
      endsAt: Date.now() + phaseMs(phase),
      remainingMs: phaseMs(phase),
    };
    arm();
    push();
    return state;
  });

  ipcMain.handle("pomodoro-timer-stop", (): null => {
    clearPhaseTimer();
    state = null;
    push();
    return null;
  });
}

// Stop a timer bound to a service that's going away.
export function stopTimerForService(serviceId: string): void {
  if (state?.serviceId === serviceId) {
    clearPhaseTimer();
    state = null;
    pushState();
  }
}

// Stop a timer bound to a task that's been deleted.
export function stopTimerForTask(serviceId: string, taskId: string): void {
  if (state?.serviceId === serviceId && state.taskId === taskId) {
    clearPhaseTimer();
    state = null;
    pushState();
  }
}
