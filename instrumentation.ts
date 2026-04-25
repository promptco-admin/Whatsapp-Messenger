// Runs once when the Next.js server starts. Used to boot background workers
// like the scheduler for scheduled broadcasts and drip sequences.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
