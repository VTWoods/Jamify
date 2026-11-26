import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  applyCommuteDayToSpotify,
  ensureCommuteConfigs,
  startCommuteWeekGeneration,
} from "@/lib/commute-playlists";
import {
  getLocalClockParts,
  shouldRunDailyRotation,
  shouldRunWeeklyDiscoverySync,
  shouldRunWeeklyGeneration,
} from "@/lib/commute-schedule-clock";

const SCHEDULER_TICK_MS = 60_000; // Check every minute

const globalForScheduler = globalThis as typeof globalThis & {
  __jamifyCommuteSchedulerStarted?: boolean;
};

export async function runCommuteSchedulerTick(now: Date = new Date()) {
  const clock = getLocalClockParts(now);
  const db = getDb();
  const allUsers = await db.select({ id: users.id }).from(users);

  for (const user of allUsers) {
    try {
      const configs = await ensureCommuteConfigs(user.id);
      const enabledConfigs = configs.filter((c) => c.enabled);
      if (enabledConfigs.length === 0) continue;

      // 1. Sunday 1:00 AM: generate 5 weekday editions for both morning & evening playlists
      const needsWeeklyGen = enabledConfigs.some((c) =>
        shouldRunWeeklyGeneration(clock, c.lastGeneratedWeekKey),
      );
      if (needsWeeklyGen) {
        console.log(
          `[Commute Scheduler] Triggering Sunday 1 AM weekly generation for user ${user.id} (week ${clock.sundayWeekKey})`,
        );
        await startCommuteWeekGeneration(user.id, {
          trigger: "scheduled",
          weekKey: clock.sundayWeekKey,
        });
      }

      // 2. Sunday 1:00 AM (after generation completes): sync Weekly Discovery playlist to Spotify
      const discoveryConfig = enabledConfigs.find(
        (c) => c.kind === "discovery",
      );
      if (
        discoveryConfig &&
        shouldRunWeeklyDiscoverySync(
          clock,
          discoveryConfig.lastGeneratedWeekKey,
          discoveryConfig.lastAppliedDateKey,
        )
      ) {
        console.log(
          `[Commute Scheduler] Updating Weekly Discovery playlist for user ${user.id} (week ${clock.sundayWeekKey})`,
        );
        try {
          await applyCommuteDayToSpotify(user.id, {
            kind: "discovery",
            weekday: 0,
            dateKey: clock.sundayWeekKey,
          });
        } catch (err) {
          console.warn(
            `[Commute Scheduler] Could not update discovery for ${user.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      // 3. Mon–Fri 1:00 AM: update each enabled commute playlist in Spotify from SQLite
      //    (only if at least one week has been generated for this playlist)
      for (const config of enabledConfigs) {
        if (config.kind === "discovery") continue;
        if (
          config.lastGeneratedWeekKey &&
          shouldRunDailyRotation(clock, config.lastAppliedDateKey)
        ) {
          console.log(
            `[Commute Scheduler] Rotating ${config.kind} commute playlist for user ${user.id} (${clock.dateKey})`,
          );
          try {
            await applyCommuteDayToSpotify(user.id, {
              kind: config.kind as "morning" | "evening",
              weekday: clock.weekday,
              dateKey: clock.dateKey,
            });
          } catch (err) {
            console.warn(
              `[Commute Scheduler] Could not rotate ${config.kind} for ${user.id}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    } catch (err) {
      console.error(
        `[Commute Scheduler] Error processing user ${user.id}:`,
        err,
      );
    }
  }
}

export function startCommuteScheduler() {
  if (globalForScheduler.__jamifyCommuteSchedulerStarted) {
    return;
  }
  globalForScheduler.__jamifyCommuteSchedulerStarted = true;

  // Run an initial catch-up check 15s after server boot, then every minute
  const initialTimer = setTimeout(() => {
    void runCommuteSchedulerTick().catch((err) =>
      console.error("[Commute Scheduler] Initial tick failed:", err),
    );
  }, 15_000);
  initialTimer.unref?.();

  const interval = setInterval(() => {
    void runCommuteSchedulerTick().catch((err) =>
      console.error("[Commute Scheduler] Tick failed:", err),
    );
  }, SCHEDULER_TICK_MS);
  interval.unref?.();
}
