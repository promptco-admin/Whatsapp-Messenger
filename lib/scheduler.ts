import { db } from "./db";
import { runBroadcast } from "./broadcast-runner";
import { runSequenceTick } from "./sequence-runner";
import { runFlowTick } from "./flow-runner";
import { runFollowupTick } from "./followup-runner";
import { pruneLogs, LOG_RETENTION_DAYS } from "./audit";

let started = false;
const TICK_MS = 60_000; // 60s
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1h
let lastPruneAt = 0;

export function startScheduler() {
  if (started) return;
  started = true;

  // Run once at boot, then on interval.
  // Wrap in setTimeout so we don't block module init.
  setTimeout(() => {
    tick().catch((e) => console.error("[scheduler] boot tick error", e));
  }, 2000);

  setInterval(() => {
    tick().catch((e) => console.error("[scheduler] tick error", e));
  }, TICK_MS);

  console.log("[scheduler] started (60s tick)");
}

async function tick() {
  await runDueBroadcasts();
  await runSequenceTick();
  await runFlowTick();
  await runFollowupTick();
  // Prune logs at most once per hour. Cheap when nothing's expired.
  if (Date.now() - lastPruneAt > PRUNE_INTERVAL_MS) {
    lastPruneAt = Date.now();
    const r = pruneLogs(LOG_RETENTION_DAYS);
    if (r.activity > 0 || r.errors > 0) {
      console.log(
        `[scheduler] pruned logs: ${r.activity} activity, ${r.errors} error rows older than ${LOG_RETENTION_DAYS}d`,
      );
    }
  }
}

async function runDueBroadcasts() {
  const database = db();
  const nowIso = new Date().toISOString();
  const due = database
    .prepare(
      `SELECT id FROM broadcasts
        WHERE status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= ?`,
    )
    .all(nowIso) as Array<{ id: number }>;

  for (const row of due) {
    // Flip to pending so runBroadcast will pick it up.
    database.prepare("UPDATE broadcasts SET status = 'pending' WHERE id = ?").run(row.id);
    console.log(`[scheduler] starting broadcast #${row.id}`);
    runBroadcast(row.id).catch((e) =>
      console.error(`[scheduler] broadcast #${row.id} error`, e),
    );
  }
}
