// Which computer runs scheduled automation. Without an account it's simply
// this one. Signed in, the tasks sync with the account, so only the computer
// that has the session runs them, or a message would go out once per computer:
//   - at launch, a signed-in computer waits until it has synced with the
//     account, so a task another computer already sent isn't sent again from
//     this one's out-of-date copy
//   - another computer taking the session pauses them here (they stay stored)
//   - taking the session back, or signing out, starts them from what's stored
//   - a changed task list from the account restarts them from the new list
// Pure (the scheduler is injected), so it's unit-tested.

export interface AutomationGateDeps {
  /** Start every stored task and auto-stop. */
  restore(): void;
  /** Stop running them here, leaving them stored. */
  suspend(): void;
}

export interface AutomationGate {
  /** The window's first load: start now, unless signed in. */
  launched(signedIn: boolean): void;
  /** The workspace has synced with the account (this computer has the session). */
  synced(): void;
  /** Another computer has the session. */
  remoteLocked(): void;
  /** Signed out here (or accounts are off in this build). */
  signedOut(): void;
  /** The account's copy replaced the stored tasks or auto-stops. */
  replaced(): void;
  isRunning(): boolean;
}

export function createAutomationGate(deps: AutomationGateDeps): AutomationGate {
  let running = false;
  // Nothing may start before the window has loaded the services
  let launched = false;
  // Whether this computer should be running them, once it can
  let wanted = false;

  const settle = () => {
    if (wanted && launched && !running) {
      running = true;
      deps.restore();
    } else if (!wanted && running) {
      running = false;
      deps.suspend();
    }
  };
  const want = (value: boolean) => {
    wanted = value;
    settle();
  };

  return {
    launched(signedIn) {
      launched = true;
      if (!signedIn) wanted = true;
      settle();
    },
    synced: () => want(true),
    remoteLocked: () => want(false),
    signedOut: () => want(true),
    replaced() {
      if (!running) return;
      running = false;
      deps.suspend();
      settle();
    },
    isRunning: () => running,
  };
}
