import crypto from "node:crypto";

/** 图形验证码：内存一次性挑战（进程重启后清空，可接受） */
type CaptchaEntry = {
  answer: string;
  expiresAt: number;
};

const captchas = new Map<string, CaptchaEntry>();

/** 登录失败计数：按 IP / 账号分别限流 */
type FailBucket = {
  count: number;
  lockedUntil: number;
  windowStart: number;
};

const failByIp = new Map<string, FailBucket>();
const failByUser = new Map<string, FailBucket>();

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LOCK_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;

/** 去掉易混字符 */
const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pruneCaptchas(now = Date.now()) {
  for (const [id, e] of captchas) {
    if (e.expiresAt <= now) captchas.delete(id);
  }
}

function pruneFails(map: Map<string, FailBucket>, now = Date.now()) {
  for (const [k, b] of map) {
    if (b.lockedUntil > 0 && b.lockedUntil <= now && now - b.windowStart > FAIL_WINDOW_MS) {
      map.delete(k);
    } else if (b.lockedUntil <= now && now - b.windowStart > FAIL_WINDOW_MS) {
      map.delete(k);
    }
  }
}

function getBucket(map: Map<string, FailBucket>, key: string, now: number): FailBucket {
  let b = map.get(key);
  if (!b || (b.lockedUntil <= now && now - b.windowStart > FAIL_WINDOW_MS)) {
    b = { count: 0, lockedUntil: 0, windowStart: now };
    map.set(key, b);
  }
  return b;
}

export function clientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0]!.trim().slice(0, 64);
  }
  if (Array.isArray(xff) && xff[0]) {
    return String(xff[0]).split(",")[0]!.trim().slice(0, 64);
  }
  return (req.ip || "unknown").slice(0, 64);
}

export function checkLoginAllowed(ip: string, username: string): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  pruneFails(failByIp, now);
  pruneFails(failByUser, now);
  const userKey = username.trim().toLowerCase();
  const ipB = getBucket(failByIp, ip, now);
  const userB = getBucket(failByUser, userKey || "_", now);
  const lockedUntil = Math.max(ipB.lockedUntil, userB.lockedUntil);
  if (lockedUntil > now) {
    const mins = Math.max(1, Math.ceil((lockedUntil - now) / 60000));
    return { ok: false, error: `尝试过多，请 ${mins} 分钟后再试` };
  }
  return { ok: true };
}

export function recordLoginFailure(ip: string, username: string) {
  const now = Date.now();
  const userKey = username.trim().toLowerCase() || "_";
  for (const [map, key] of [
    [failByIp, ip],
    [failByUser, userKey],
  ] as const) {
    const b = getBucket(map, key, now);
    if (now - b.windowStart > FAIL_WINDOW_MS) {
      b.count = 0;
      b.windowStart = now;
      b.lockedUntil = 0;
    }
    b.count += 1;
    if (b.count >= FAIL_MAX) {
      b.lockedUntil = now + FAIL_LOCK_MS;
    }
  }
}

export function clearLoginFailures(ip: string, username: string) {
  failByIp.delete(ip);
  failByUser.delete(username.trim().toLowerCase() || "_");
}

function randomCaptchaText(len = 4): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CAPTCHA_CHARS[bytes[i]! % CAPTCHA_CHARS.length]!;
  }
  return out;
}

function svgCaptcha(text: string): string {
  const w = 140;
  const h = 44;
  const noise: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x1 = Math.floor(Math.random() * w);
    const y1 = Math.floor(Math.random() * h);
    const x2 = Math.floor(Math.random() * w);
    const y2 = Math.floor(Math.random() * h);
    const c = `hsl(${Math.floor(Math.random() * 360)},40%,55%)`;
    noise.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1" opacity="0.55"/>`
    );
  }
  const chars = text.split("").map((ch, i) => {
    const x = 18 + i * 28;
    const rot = Math.floor(Math.random() * 36) - 18;
    const y = 28 + (Math.floor(Math.random() * 6) - 3);
    return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Verdana,sans-serif" font-size="22" font-weight="700" fill="#e8eef8">${ch}</text>`;
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#121820"/>
  ${noise.join("\n  ")}
  ${chars.join("\n  ")}
</svg>`;
  return svg;
}

export function createCaptcha(): { id: string; imageSvg: string; expiresInSec: number } {
  pruneCaptchas();
  const id = crypto.randomBytes(16).toString("hex");
  const answer = randomCaptchaText(4);
  captchas.set(id, { answer, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return {
    id,
    imageSvg: svgCaptcha(answer),
    expiresInSec: Math.floor(CAPTCHA_TTL_MS / 1000),
  };
}

/** 校验并消费验证码（一次性） */
export function consumeCaptcha(id: string, code: string): boolean {
  pruneCaptchas();
  const entry = captchas.get(id);
  captchas.delete(id);
  if (!entry || entry.expiresAt <= Date.now()) return false;
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized || normalized.length > 8) return false;
  const a = Buffer.from(entry.answer);
  const b = Buffer.from(normalized);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
