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
  shutdownHandlers: Set<() => void | Promise<void>>;
}

const globalForLifecycle = globalThis as unknown as {
  __blockpartyLifecycle?: LifecycleRuntime;
};

function runtime(): LifecycleRuntime {
  globalForLifecycle.__blockpartyLifecycle ??= {
    draining: false,
    activeCommands: 0,
    shutdownHandlers: new Set(),
  };
  return globalForLifecycle.__blockpartyLifecycle;
}

/** Registers a process resource to close after admitted commands drain. */
export function registerShutdownHandler(handler: () => void | Promise<void>): () => void {
  const handlers = runtime().shutdownHandlers;
  handlers.add(handler);
  return () => handlers.delete(handler);
}

async function closeRegisteredResources(): Promise<void> {
  for (const handler of [...runtime().shutdownHandlers].reverse()) {
    await handler();
  }
}

/** Installs the Node process hooks without importing any resource implementation. */
export function installServerShutdownHandlers(): () => void {
  const onSignal = () => {
    void beginServerShutdown()
      .then(() => closeRegisteredResources())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  return () => {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
  };
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
