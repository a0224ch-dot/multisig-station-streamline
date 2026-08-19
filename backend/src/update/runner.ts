/**
 * 独立进程入口：执行下载→备份→覆盖→安装→重启→健康检查→失败回滚
 * 用法: npx tsx src/update/runner.ts
 */
import { runUpdateJob, deleteUpdaterProcess } from "./apply.js";
import { writeUpdateStatus, appendLog } from "./status.js";

async function main() {
  appendLog("更新进程已启动（独立于 API）");
  writeUpdateStatus({ phase: "queued", message: "更新任务开始" });
  try {
    await runUpdateJob();
  } finally {
    deleteUpdaterProcess();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  writeUpdateStatus({
    phase: "failed",
    message: e instanceof Error ? e.message : String(e),
    finishedAt: new Date().toISOString(),
  });
  deleteUpdaterProcess();
  process.exit(1);
});
