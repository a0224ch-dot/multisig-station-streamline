import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 安装根目录：…/multisig-station-streamline */
export function installRoot(): string {
  const fromEnv = process.env.INSTALL_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // backend/src/update → ../../../
  return path.resolve(__dirname, "../../..");
}

export function versionFile(): string {
  return path.join(installRoot(), "VERSION");
}

export function updateWorkDir(): string {
  return path.join(installRoot(), ".update-work");
}

export function updateBackupsDir(): string {
  return path.join(installRoot(), ".update-backups");
}

export function updateStatusFile(): string {
  return path.join(updateWorkDir(), "status.json");
}

/** nginx 可直接读，API 停掉时更新页仍能轮询 */
export function publicUpdateStatusFile(): string {
  return path.join(installRoot(), "frontend", "dist", "update-status.json");
}

export function readLocalVersion(): string {
  try {
    const raw = fs.readFileSync(versionFile(), "utf8").trim();
    if (raw) return raw.split(/\r?\n/)[0].trim();
  } catch {
    /* ignore */
  }
  return "0";
}

export function writeLocalVersion(version: string): void {
  fs.writeFileSync(versionFile(), `${version.trim()}\n`, "utf8");
}

export function releasesLatestUrl(): string {
  return (
    process.env.UPDATE_RELEASES_URL?.trim() ||
    "https://raw.githubusercontent.com/a0224ch-dot/multisig-station-streamline-releases/main/latest.json"
  );
}

export function pm2AppName(): string {
  return process.env.PM2_NAME?.trim() || "multisig-streamline-api";
}

export function healthCheckUrl(): string {
  const port = process.env.PORT || "8791";
  return (
    process.env.UPDATE_HEALTH_URL?.trim() ||
    `http://127.0.0.1:${port}/api/health`
  );
}
