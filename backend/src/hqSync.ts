import { buildHqProfilePayload, heartbeatToHq, registerToHq } from "./hqClient.js";

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(kind: "register" | "heartbeat") {
  try {
    const profile = await buildHqProfilePayload();
    if (kind === "register") {
      const res = await registerToHq(profile);
      console.log(
        `[hq-sync] register ok branchId=${res.branchId} created=${res.created} allowHighSigners=${res.allowHighSigners}`
      );
    } else {
      const res = await heartbeatToHq(profile);
      console.log(
        `[hq-sync] heartbeat ok branchId=${res.branchId} allowHighSigners=${res.allowHighSigners}`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[hq-sync] ${kind} failed: ${msg}`);
  }
}

/** 启动时注册并定时心跳 */
export function startHqSync() {
  const key = process.env.BRANCH_API_KEY || "";
  const hq = process.env.HQ_BASE_URL || "";
  if (!key || !hq) {
    console.warn("[hq-sync] skipped: missing BRANCH_API_KEY or HQ_BASE_URL");
    return;
  }

  void tick("register");
  if (timer) clearInterval(timer);
  const ms = Number(process.env.HQ_HEARTBEAT_MS || 60_000);
  timer = setInterval(() => void tick("heartbeat"), ms);
}
