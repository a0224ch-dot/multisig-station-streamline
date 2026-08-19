/**
 * 抓取精简版宣传效果图（Puppeteer + 系统 Chrome，单张 < 1MB）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BASE_URL =
  process.env.BASE_URL?.replace(/\/$/, "") ||
  "https://multisig-station-streamline.iqiyia.cyou";
const OUT_DIR =
  process.env.OUT_DIR ||
  path.resolve(ROOT, "..", "..", "..", "不夜城发布", "自开发");
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TOKEN_KEY = "branch_multisig_token";
const LANG_KEY = "streamline-lang";
const PROMO_LANG = (process.env.PROMO_LANG || "zh").toLowerCase() === "en" ? "en" : "zh";
const MAX_BYTES = 1024 * 1024;
const VIEWPORT = { width: 1366, height: 900 };

const ALL_SHOTS = [
  { name: "streamline-promo-01-public-home.png", path: "/open", waitMs: 2500 },
  { name: "streamline-promo-02-admin-login.png", path: "/login", waitMs: 1200 },
  { name: "streamline-promo-03-presets.png", path: "/branch/presets", auth: true, waitMs: 1500 },
  { name: "streamline-promo-04-decor.png", path: "/branch/decor", auth: true, waitMs: 1500 },
  { name: "streamline-promo-05-open-wallets.png", path: "/branch/open-wallets", auth: true, waitMs: 1500 },
  { name: "streamline-promo-06-scenarios.png", path: "/branch/scenarios", auth: true, waitMs: 1500 },
  { name: "streamline-promo-07-members.png", path: "/branch/members", auth: true, waitMs: 1500 },
];

/** 英文宣传：5 张最具代表性 */
const EN_SHOTS = [
  { name: "streamline-promo-01-open.png", path: "/open", waitMs: 2500 },
  { name: "streamline-promo-02-login.png", path: "/login", waitMs: 1200 },
  { name: "streamline-promo-03-presets.png", path: "/branch/presets", auth: true, waitMs: 1500 },
  { name: "streamline-promo-04-decor.png", path: "/branch/decor", auth: true, waitMs: 1500 },
  { name: "streamline-promo-05-scenarios.png", path: "/branch/scenarios", auth: true, waitMs: 1500 },
];

const SHOTS = PROMO_LANG === "en" ? EN_SHOTS : ALL_SHOTS;

async function saveScreenshot(page, outPath) {
  for (const q of [92, 86, 80, 74, 68, 62, 56, 50]) {
    const buf = await page.screenshot({ type: "jpeg", quality: q, fullPage: false });
    if (buf.length <= MAX_BYTES) {
      const jpgPath = outPath.replace(/\.png$/i, ".jpg");
      fs.writeFileSync(jpgPath, buf);
      if (jpgPath !== outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath);
      return { path: jpgPath, bytes: buf.length };
    }
  }
  const buf = await page.screenshot({ type: "jpeg", quality: 45, fullPage: false });
  const jpgPath = outPath.replace(/\.png$/i, ".jpg");
  fs.writeFileSync(jpgPath, buf);
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  return { path: jpgPath, bytes: buf.length };
}

async function loginAdmin(page) {
  const user = process.env.ADMIN_USER?.trim() || "admin";
  const pass = process.env.ADMIN_PASS?.trim() || "Branch@123456";
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.type('input[autocomplete="username"]', user, { delay: 20 });
  await page.type('input[type="password"]', pass, { delay: 20 });
  await page.waitForSelector(".captcha-svg text", { timeout: 15000 });
  const code = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".captcha-svg text"))
      .map((el) => el.textContent || "")
      .join("")
      .trim()
      .toUpperCase()
  );
  if (!code) throw new Error("captcha_read_failed");
  await page.type('input[autocomplete="off"]', code, { delay: 30 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  const url = page.url();
  if (!url.includes("/branch/") && !url.includes("/member/")) {
    throw new Error(`login_failed: ${url}`);
  }
}

async function primeLanguage(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(
    (langKey, lang) => localStorage.setItem(langKey, lang),
    LANG_KEY,
    PROMO_LANG
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      PROMO_LANG === "en" ? "--lang=en-US" : "--lang=zh-CN",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await primeLanguage(page);

  if (process.env.PROMO_TOKEN?.trim()) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (k, v) => localStorage.setItem(k, v),
      TOKEN_KEY,
      process.env.PROMO_TOKEN.trim()
    );
  }

  let hasAuth = Boolean(process.env.PROMO_TOKEN?.trim());
  if (!hasAuth) {
    try {
      console.log("Try admin login…");
      await loginAdmin(page);
      hasAuth = true;
      console.log("Login OK");
    } catch (e) {
      console.warn("Login skipped:", e instanceof Error ? e.message : e);
    }
  }

  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`OUT_DIR=${OUT_DIR}`);
  console.log(`LANG=${PROMO_LANG}`);

  for (const shot of SHOTS) {
    if (shot.auth && !hasAuth) {
      console.warn(`SKIP ${shot.name}`);
      continue;
    }
    const url = `${BASE_URL}${shot.path}`;
    console.log(`Capture ${shot.name} <- ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      if (shot.waitMs) await new Promise((r) => setTimeout(r, shot.waitMs));
      const outPath = path.join(OUT_DIR, shot.name);
      const saved = await saveScreenshot(page, outPath);
      console.log(`  OK ${path.basename(saved.path)} ${(saved.bytes / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.error(`  FAIL:`, e instanceof Error ? e.message : e);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
