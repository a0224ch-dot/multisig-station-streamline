/** 日期版：20260815 或同日第 N 包 20260815-2 */

export function parseVersion(raw: string): { day: number; seq: number } | null {
  const m = String(raw || "")
    .trim()
    .match(/^(\d{8})(?:-(\d+))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const seq = m[2] ? Number(m[2]) : 1;
  if (!Number.isFinite(day) || !Number.isFinite(seq) || seq < 1) return null;
  return { day, seq };
}

/** a < b → -1；相等 → 0；a > b → 1；无法解析时按字符串 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa && pb) {
    if (pa.day !== pb.day) return pa.day < pb.day ? -1 : 1;
    if (pa.seq !== pb.seq) return pa.seq < pb.seq ? -1 : 1;
    return 0;
  }
  return String(a).localeCompare(String(b));
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
