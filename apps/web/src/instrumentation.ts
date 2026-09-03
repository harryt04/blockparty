/**
 * Node lifecycle wiring for the single web image. MongoDB is never imported
 * into browser code. See ENG-004.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installMongoShutdownHandlers } = await import("./server/db/client");
  installMongoShutdownHandlers();
}
