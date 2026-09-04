import { installServerShutdownHandlers } from "./server/lifecycle";

/** Register Node-only lifecycle hooks without exposing MongoDB to other runtimes. */
installServerShutdownHandlers();
