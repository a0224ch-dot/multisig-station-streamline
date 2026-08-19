import { readUpdateStatus, writeUpdateStatus, appendLog, isBusyPhase } from "./status.js";
import { readLocalVersion } from "./paths.js";

/**
 * 服务启动时收口卡住的更新状态：
 * - 文件已是目标版本 → 记成功（含手动拉起 API）
 * - 仍在进行中但版本没变 → 记中断，允许重新点更新
 */
export function finalizeUpdateOnBoot(): void {
  try {
    const s = readUpdateStatus();
    if (!isBusyPhase(s.phase)) return;
    const ver = readLocalVersion();
    const reachedTarget = Boolean(s.targetVersion && ver === s.targetVersion);
    const finishing = s.phase === "restarting" || s.phase === "healthcheck";
    if (finishing || reachedTarget) {
      writeUpdateStatus({
        phase: "success",
        message: `已更新到 ${s.targetVersion || ver}`,
        currentVersion: ver,
        finishedAt: new Date().toISOString(),
      });
      appendLog("服务已恢复，更新标记为成功");
      return;
    }
    writeUpdateStatus({
      phase: "failed",
      message: "上次更新中断。请再点「检查更新」后「立即更新」。",
      finishedAt: new Date().toISOString(),
    });
    appendLog("检测到更新中断，已解除占用");
  } catch {
    /* ignore */
  }
}
