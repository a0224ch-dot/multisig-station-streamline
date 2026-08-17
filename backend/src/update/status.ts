import fs from "fs";
import { updateStatusFile, updateWorkDir, readLocalVersion } from "./paths.js";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "queued"
  | "downloading"
  | "verifying"
  | "backing_up"
  | "extracting"
  | "installing"
  | "migrating"
  | "restarting"
  | "healthcheck"
  | "success"
  | "rolling_back"
  | "rolled_back"
  | "failed";

export type ReleaseManifest = {
  version: string;
  notes: string;
  zipUrl: string;
  sha256: string;
};

export type UpdateStatus = {
  phase: UpdatePhase;
  currentVersion: string;
  targetVersion: string | null;
  latest: ReleaseManifest | null;
  message: string;
  logs: string[];
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  /** 是否仍在执行（queued～healthcheck / rolling_back） */
  busy: boolean;
};

const BUSY: UpdatePhase[] = [
  "checking",
  "queued",
  "downloading",
  "verifying",
  "backing_up",
  "extracting",
  "installing",
  "migrating",
  "restarting",
  "healthcheck",
  "rolling_back",
];

function emptyStatus(): UpdateStatus {
  const now = new Date().toISOString();
  return {
    phase: "idle",
    currentVersion: readLocalVersion(),
    targetVersion: null,
    latest: null,
    message: "",
    logs: [],
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
    busy: false,
  };
}

export function ensureUpdateDirs(): void {
  fs.mkdirSync(updateWorkDir(), { recursive: true });
}

export function readUpdateStatus(): UpdateStatus {
  ensureUpdateDirs();
  try {
    const raw = fs.readFileSync(updateStatusFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<UpdateStatus>;
    const phase = (parsed.phase || "idle") as UpdatePhase;
    return {
      phase,
      currentVersion: readLocalVersion(),
      targetVersion: parsed.targetVersion ?? null,
      latest: parsed.latest ?? null,
      message: parsed.message || "",
      logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-80) : [],
      startedAt: parsed.startedAt ?? null,
      finishedAt: parsed.finishedAt ?? null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      busy: BUSY.includes(phase),
    };
  } catch {
    return emptyStatus();
  }
}

export function writeUpdateStatus(patch: Partial<UpdateStatus> & { phase?: UpdatePhase }): UpdateStatus {
  ensureUpdateDirs();
  const prev = readUpdateStatus();
  const phase = patch.phase ?? prev.phase;
  const next: UpdateStatus = {
    ...prev,
    ...patch,
    phase,
    currentVersion: readLocalVersion(),
    logs: patch.logs ?? prev.logs,
    updatedAt: new Date().toISOString(),
    busy: BUSY.includes(phase),
  };
  if (next.logs.length > 80) next.logs = next.logs.slice(-80);
  fs.writeFileSync(updateStatusFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function appendLog(line: string): UpdateStatus {
  const prev = readUpdateStatus();
  const stamp = new Date().toISOString().slice(11, 19);
  return writeUpdateStatus({
    logs: [...prev.logs, `[${stamp}] ${line}`],
    message: line,
  });
}

export function isBusyPhase(phase: UpdatePhase): boolean {
  return BUSY.includes(phase);
}
