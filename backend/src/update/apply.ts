import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn, execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import {
  healthCheckUrl,
  installRoot,
  pm2AppName,
  updateBackupsDir,
  updateWorkDir,
  writeLocalVersion,
} from "./paths.js";
import {
  appendLog,
  readUpdateStatus,
  writeUpdateStatus,
  type ReleaseManifest,
} from "./status.js";

const execFileAsync = promisify(execFile);

const PROTECTED_NAME = new Set([
  ".env",
  ".env.local",
  "prod.db",
  "dev.db",
  "prod.db-journal",
  "dev.db-journal",
]);

function isProtectedRel(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  const base = path.posix.basename(norm);
  if (PROTECTED_NAME.has(base)) return true;
  // 宝塔防跨站：.user.ini 常带 chattr +i，绝不能删
  if (base === ".user.ini") return true;
  if (norm.includes("/data/") || norm.startsWith("data/") || norm.includes("data/uploads")) {
    return true;
  }
  if (/\.db(-journal)?$/i.test(base)) return true;
  if (norm.includes(".update-")) return true;
  if (norm.includes("node_modules/")) return true;
  if (norm.startsWith(".git/") || norm.includes("/.git/")) return true;
  return false;
}

/** 尝试去掉宝塔对 .user.ini 的不可变属性 */
function unlockUserIni(filePath: string): void {
  try {
    execFileSync("chattr", ["-i", filePath], {
      timeout: 5000,
      stdio: "ignore",
    });
  } catch {
    /* ignore：非 Linux / 无 chattr 时跳过 */
  }
}

/** 清空目录内容，但保留 .user.ini 等受保护文件 */
function emptyDirKeepProtected(dir: string, baseRel = ""): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const rel = baseRel ? `${baseRel}/${name}` : name;
    const full = path.join(dir, name);
    if (isProtectedRel(rel) || name === ".user.ini") {
      if (name === ".user.ini") unlockUserIni(full);
      continue;
    }
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      emptyDirKeepProtected(full, rel);
      try {
        fs.rmdirSync(full);
      } catch {
        /* 可能仍有受保护文件 */
      }
    } else {
      try {
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  }
}

async function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 600_000
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
      shell: process.platform === "win32",
    });
    const out = `${stdout || ""}${stderr || ""}`.trim();
    return out;
  } catch (e) {
    const err = e as { message?: string; stdout?: string; stderr?: string };
    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n");
    throw new Error(`${cmd} ${args.join(" ")} 失败: ${detail.slice(0, 800)}`);
  }
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (c) => hash.update(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { "User-Agent": "multisig-station-branch-updater" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function findPackageRoot(extractDir: string): string {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  if (fs.existsSync(path.join(extractDir, "VERSION"))) return extractDir;
  if (fs.existsSync(path.join(extractDir, "backend"))) return extractDir;
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) {
    const only = path.join(extractDir, dirs[0].name);
    if (
      fs.existsSync(path.join(only, "VERSION")) ||
      fs.existsSync(path.join(only, "backend"))
    ) {
      return only;
    }
  }
  throw new Error("更新包结构不正确：未找到 VERSION 或 backend 目录");
}

function copyFileSafe(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirFiltered(srcDir: string, destDir: string, baseRel = ""): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const rel = baseRel ? `${baseRel}/${name}` : name;
    if (isProtectedRel(rel)) continue;
    const from = path.join(srcDir, name);
    const to = path.join(destDir, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git" || name.startsWith(".update-")) {
        continue;
      }
      copyDirFiltered(from, to, rel);
    } else {
      copyFileSafe(from, to);
    }
  }
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

/** 备份将被覆盖的关键目录（不含 .env / 数据库 / node_modules） */
function createBackup(label: string): string {
  const root = installRoot();
  const backupRoot = path.join(updateBackupsDir(), label);
  rmrf(backupRoot);
  fs.mkdirSync(backupRoot, { recursive: true });

  const pairs: [string, string][] = [
    ["VERSION", "VERSION"],
    ["frontend/dist", "frontend/dist"],
    ["backend/src", "backend/src"],
    ["backend/package.json", "backend/package.json"],
    ["backend/package-lock.json", "backend/package-lock.json"],
    ["backend/tsconfig.json", "backend/tsconfig.json"],
    ["backend/prisma/schema.prisma", "backend/prisma/schema.prisma"],
    ["backend/prisma/migrations", "backend/prisma/migrations"],
    ["deploy", "deploy"],
  ];

  for (const [rel, destRel] of pairs) {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(backupRoot, destRel);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDirFiltered(from, to, destRel);
    else copyFileSafe(from, to);
  }

  fs.writeFileSync(
    path.join(backupRoot, "backup-meta.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), label }, null, 2)
  );
  return backupRoot;
}

function restoreBackup(backupRoot: string): void {
  const root = installRoot();
  if (!fs.existsSync(backupRoot)) throw new Error("备份目录不存在，无法回滚");
  copyDirFiltered(backupRoot, root);
}

function pruneBackups(keep = 2): void {
  const dir = updateBackupsDir();
  if (!fs.existsSync(dir)) return;
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = path.join(dir, e.name);
      return { full, name: e.name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of entries.slice(keep)) {
    rmrf(old.full);
  }
}

async function waitHealthy(timeoutMs = 60_000): Promise<boolean> {
  const url = healthCheckUrl();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (data.ok) return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function restartPm2(): Promise<void> {
  const name = pm2AppName();
  appendLog(`重启服务 ${name}…`);
  try {
    await runCmd("pm2", ["restart", name, "--update-env"], installRoot(), 60_000);
  } catch {
    // 若未用 pm2，尝试提示；开发环境可能没有 pm2
    appendLog("pm2 restart 失败，尝试直接结束进程由守护拉起…");
    throw new Error(`无法重启 PM2 进程「${name}」，请确认服务器已用 pm2 启动`);
  }
}

const OLD_RELEASES_LATEST =
  "https://raw.githubusercontent.com/e12games/multisig-station-streamline-releases/main/latest.json";
const NEW_RELEASES_LATEST =
  "https://raw.githubusercontent.com/a0224ch-dot/multisig-station-streamline-releases/main/latest.json";

/** 旧仓 OTA 跳转后，把 .env 里的清单地址改到新发布仓（不改其它配置） */
function migrateUpdateReleasesUrl(): void {
  const envFile = path.join(installRoot(), "backend", ".env");
  if (!fs.existsSync(envFile)) return;
  const raw = fs.readFileSync(envFile, "utf8");
  if (!raw.includes("e12games/multisig-station-streamline-releases")) return;
  const next = raw.split(OLD_RELEASES_LATEST).join(NEW_RELEASES_LATEST);
  if (next === raw) return;
  fs.writeFileSync(envFile, next, "utf8");
  appendLog("已将 UPDATE_RELEASES_URL 迁至新发布仓");
}

function overlayFromPackage(pkgRoot: string): void {
  const root = installRoot();
  const map: [string, string][] = [
    ["VERSION", "VERSION"],
    ["frontend/dist", "frontend/dist"],
    ["backend/src", "backend/src"],
    ["backend/package.json", "backend/package.json"],
    ["backend/package-lock.json", "backend/package-lock.json"],
    ["backend/tsconfig.json", "backend/tsconfig.json"],
    ["backend/prisma/schema.prisma", "backend/prisma/schema.prisma"],
    ["backend/prisma/migrations", "backend/prisma/migrations"],
    ["deploy", "deploy"],
  ];
  for (const [fromRel, toRel] of map) {
    const from = path.join(pkgRoot, fromRel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(root, toRel);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      // 清空后再拷；frontend/dist 必须保留宝塔 .user.ini
      if (fs.existsSync(to)) {
        if (toRel === "frontend/dist") emptyDirKeepProtected(to, toRel);
        else rmrf(to);
      }
      copyDirFiltered(from, to, toRel);
    } else {
      copyFileSafe(from, to);
    }
  }
}

export async function runUpdateJob(): Promise<void> {
  const status = readUpdateStatus();
  const manifest = status.latest;
  if (!manifest?.zipUrl || !manifest.sha256 || !manifest.version) {
    writeUpdateStatus({
      phase: "failed",
      message: "缺少版本清单，请先检查更新",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  const work = updateWorkDir();
  fs.mkdirSync(work, { recursive: true });
  const zipPath = path.join(work, "package.zip");
  const extractDir = path.join(work, "extract");
  let backupPath: string | null = null;

  try {
    writeUpdateStatus({
      phase: "downloading",
      targetVersion: manifest.version,
      message: "正在下载更新包…",
      startedAt: status.startedAt || new Date().toISOString(),
      finishedAt: null,
    });
    appendLog(`下载 ${manifest.zipUrl}`);
    await downloadTo(manifest.zipUrl, zipPath);

    writeUpdateStatus({ phase: "verifying", message: "校验文件完整性…" });
    const hash = await sha256File(zipPath);
    if (hash !== manifest.sha256.toLowerCase()) {
      throw new Error(`SHA256 不匹配\n期望 ${manifest.sha256}\n实际 ${hash}`);
    }
    appendLog("校验通过");

    writeUpdateStatus({ phase: "backing_up", message: "备份当前版本…" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = createBackup(`pre-${manifest.version}-${stamp}`);
    appendLog(`备份完成: ${backupPath}`);

    writeUpdateStatus({ phase: "extracting", message: "解压并覆盖程序文件…" });
    rmrf(extractDir);
    fs.mkdirSync(extractDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    const pkgRoot = findPackageRoot(extractDir);
    overlayFromPackage(pkgRoot);
    writeLocalVersion(manifest.version);
    migrateUpdateReleasesUrl();
    appendLog("文件已覆盖（已跳过 .env 与数据库）");

    const backendDir = path.join(installRoot(), "backend");
    writeUpdateStatus({ phase: "installing", message: "安装后端依赖…" });
    appendLog("npm install…");
    // 现网用 npx tsx 启动，不可 omit=dev（会去掉 tsx）
    await runCmd("npm", ["install"], backendDir);

    writeUpdateStatus({ phase: "migrating", message: "数据库迁移…" });
    appendLog("prisma migrate deploy…");
    await runCmd("npx", ["prisma", "generate"], backendDir);
    await runCmd("npx", ["prisma", "migrate", "deploy"], backendDir);

    writeUpdateStatus({ phase: "restarting", message: "正在重启服务…" });
    await restartPm2();

    writeUpdateStatus({ phase: "healthcheck", message: "等待服务恢复…" });
    appendLog("健康检查中…");
    // 当前进程即将被 pm2 杀掉；健康检查仍尽量在本进程完成，
    // 若本进程被杀，由 status 文件保留 restarting，下次读取时用户可再点检查。
    await new Promise((r) => setTimeout(r, 2500));
    const ok = await waitHealthy(55_000);
    if (!ok) throw new Error("重启后健康检查失败");

    pruneBackups(2);
    writeUpdateStatus({
      phase: "success",
      message: `已更新到 ${manifest.version}`,
      currentVersion: manifest.version,
      finishedAt: new Date().toISOString(),
      targetVersion: manifest.version,
    });
    appendLog("更新成功");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendLog(`失败: ${msg}`);
    if (backupPath && fs.existsSync(backupPath)) {
      try {
        writeUpdateStatus({
          phase: "rolling_back",
          message: "更新失败，正在自动回滚…",
        });
        appendLog(`回滚备份 ${backupPath}`);
        restoreBackup(backupPath);
        try {
          const backendDir = path.join(installRoot(), "backend");
          await runCmd("npm", ["install"], backendDir);
          await runCmd("npx", ["prisma", "generate"], backendDir);
        } catch (re) {
          appendLog(
            `回滚后依赖修复警告: ${re instanceof Error ? re.message : String(re)}`
          );
        }
        try {
          await restartPm2();
          await new Promise((r) => setTimeout(r, 2500));
          await waitHealthy(45_000);
        } catch (re) {
          appendLog(
            `回滚后重启警告: ${re instanceof Error ? re.message : String(re)}`
          );
        }
        writeUpdateStatus({
          phase: "rolled_back",
          message: `已回滚。原因: ${msg}`,
          finishedAt: new Date().toISOString(),
        });
        appendLog("已自动回滚到更新前版本");
        return;
      } catch (re) {
        const rmsg = re instanceof Error ? re.message : String(re);
        writeUpdateStatus({
          phase: "failed",
          message: `更新失败且回滚失败: ${msg} / ${rmsg}`,
          finishedAt: new Date().toISOString(),
        });
        return;
      }
    }
    writeUpdateStatus({
      phase: "failed",
      message: msg,
      finishedAt: new Date().toISOString(),
    });
  }
}

/** 由 API 拉起：独立进程执行更新，避免请求线程卡死 */
export function spawnUpdateRunner(): void {
  const runnerPath = fileURLToPath(new URL("./runner.ts", import.meta.url));
  const backendDir = path.join(installRoot(), "backend");
  const tsxCli = path.join(backendDir, "node_modules", "tsx", "dist", "cli.mjs");
  const args = fs.existsSync(tsxCli)
    ? [tsxCli, runnerPath]
    : []; // fallback below

  const child = args.length
    ? spawn(process.execPath, args, {
        cwd: backendDir,
        detached: true,
        stdio: "ignore",
        env: { ...process.env, UPDATE_RUNNER: "1" },
        windowsHide: true,
      })
    : spawn(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["tsx", runnerPath],
        {
          cwd: backendDir,
          detached: true,
          stdio: "ignore",
          env: { ...process.env, UPDATE_RUNNER: "1" },
          windowsHide: true,
        }
      );
  child.unref();
}

export async function checkForUpdate(): Promise<{
  currentVersion: string;
  latest: ReleaseManifest;
  updateAvailable: boolean;
}> {
  writeUpdateStatus({ phase: "checking", message: "正在检查更新…" });
  try {
    const { fetchLatestManifest } = await import("./manifest.js");
    const latest = await fetchLatestManifest();
    const { isNewer } = await import("./version.js");
    const currentVersion = readUpdateStatus().currentVersion;
    const updateAvailable = isNewer(latest.version, currentVersion);
    writeUpdateStatus({
      phase: "idle",
      latest,
      message: updateAvailable
        ? `发现新版本 ${latest.version}`
        : "已是最新版本",
      targetVersion: updateAvailable ? latest.version : null,
    });
    return { currentVersion, latest, updateAvailable };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeUpdateStatus({ phase: "idle", message: msg });
    throw e;
  }
}
