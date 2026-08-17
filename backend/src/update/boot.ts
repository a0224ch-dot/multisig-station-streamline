import { readUpdateStatus, writeUpdateStatus, appendLog } from "./status.js";
import { readLocalVersion } from "./paths.js";

/**
 * 服务启动时：若上次更新卡在「重启/健康检查」，说明新进程已起来，记为成功。
 */
export function finalizeUpdateOnBoot(): void {
  try {
    const s = readUpdateStatus();
    if (s.phase !== "restarting" && s.phase !== "healthcheck") return;
    const ver = readLocalVersion();
    writeUpdateStatus({
      phase: "success",
      message: `已更新到 ${s.targetVersion || ver}`,
      currentVersion: ver,
      finishedAt: new Date().toISOString(),
    });
    appendLog("服务已恢复，更新标记为成功");
  } catch {
    /* ignore */
  }
}
