import "server-only";

/**
 * Process lifecycle admission for authoritative commands. The deployment
 * sends shutdown signals to the Node process; new commands must stop at the
 * boundary while already admitted transactions are allowed to finish. See
 * ENG-004 and OPS-005.
 */
import { closeSseConnections } from "./sse/registry";

interface LifecycleRuntime {
  draining: boolean;
  activeCommands: number;
  drainPromise?: Promise<void>;
  resolveDrain?: () => void;
}

const globalForLifecycle = globalThis as unknown as {
  __blockpartyLifecycle?: LifecycleRuntime;
};

function runtime(): LifecycleRuntime {
  globalForLifecycle.__blockpartyLifecycle ??= {
    draining: false,
    activeCommands: 0,
  };
  return globalForLifecycle.__blockpartyLifecycle;
}

/** Returns whether this process is draining and cannot accept new work. */
export function isServerDraining(): boolean {
  return runtime().draining;
}

/**
 * Admits one authoritative command, returning its release callback. The
 * callback is idempotent so route/error cleanup cannot underflow the count.
 */
export function admitCommand(): (() => void) | undefined {
  const state = runtime();
  if (state.draining) return undefined;
  state.activeCommands += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.activeCommands -= 1;
    if (state.activeCommands === 0) state.resolveDrain?.();
  };
}

/**
 * Starts an orderly shutdown: close SSE delivery first, then await commands
 * already admitted. MongoDB closes after this promise resolves. Repeated
 * signals share the same drain promise.
 */
export function beginServerShutdown(): Promise<void> {
  const state = runtime();
  if (state.drainPromise !== undefined) return state.drainPromise;

  state.draining = true;
  closeSseConnections("SERVER_SHUTDOWN");
  if (state.activeCommands === 0) {
    state.drainPromise = Promise.resolve();
    return state.drainPromise;
  }

  state.drainPromise = new Promise<void>((resolve) => {
    state.resolveDrain = resolve;
  });
  return state.drainPromise;
}
