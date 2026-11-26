export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCommuteScheduler } = await import("@/lib/commute-scheduler");
    startCommuteScheduler();
  }
}
