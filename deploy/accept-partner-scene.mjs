#!/usr/bin/env node
/**
 * 友商柜台场景 · 演示站/指定域名接口验收
 * 用法: node deploy/accept-partner-scene.mjs [BASE_URL]
 */
import { randomBytes } from "crypto";

const BASE = (process.argv[2] || "https://multisig-station-streamline.iqiyia.cyou").replace(
  /\/$/,
  ""
);
const ADMIN_USER = process.env.ACCEPT_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ACCEPT_ADMIN_PASS || "Branch@123456";

let pass = 0;
let fail = 0;
let warn = 0;

function ok(msg) {
  console.log(`PASS  ${msg}`);
  pass++;
}
function bad(msg) {
  console.log(`FAIL  ${msg}`);
  fail++;
}
function note(msg) {
  console.log(`WARN  ${msg}`);
  warn++;
}

function parseCaptchaSvg(svg) {
  const texts = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
  return texts.join("").trim();
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

async function login(username, password) {
  const cap = await api("/api/auth/captcha");
  if (cap.status !== 200 || !cap.json?.captchaId) {
    throw new Error(`captcha failed: ${cap.status} ${JSON.stringify(cap.json)}`);
  }
  const code = parseCaptchaSvg(cap.json.imageSvg || "");
  if (!code) throw new Error("无法解析验证码 SVG");
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { username, password, captchaId: cap.json.captchaId, captchaCode: code },
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(res.json?.error || `login ${res.status}`);
  }
  return res.json;
}

async function waitForVersion(target, maxSec = 180) {
  const deadline = Date.now() + maxSec * 1000;
  while (Date.now() < deadline) {
    const h = await api("/api/health");
    const v = h.json?.version;
    if (v === target) return v;
    await new Promise((r) => setTimeout(r, 5000));
  }
  const h = await api("/api/health");
  return h.json?.version;
}

console.log("==========================================");
console.log(" 友商柜台场景验收");
console.log(` BASE=${BASE}`);
console.log("==========================================");

const health0 = await api("/api/health");
if (health0.json?.edition === "streamline" && health0.json?.ok) {
  ok(`health edition=streamline version=${health0.json.version}`);
} else {
  bad(`health 异常: ${JSON.stringify(health0.json)}`);
}

const needOta = health0.json?.version !== "20260821-4";
if (needOta) {
  note(`当前 ${health0.json?.version}，尝试 OTA 到 20260821-4…`);
  try {
    const admin = await login(ADMIN_USER, ADMIN_PASS);
    ok(`admin 登录 (${ADMIN_USER})`);

    const chk = await api("/api/admin/update/check", {
      method: "POST",
      token: admin.token,
    });
    if (chk.json?.latest?.version === "20260821-4") {
      ok(`检查更新 → latest=${chk.json.latest.version}`);
    } else {
      bad(`检查更新 latest=${chk.json?.latest?.version ?? "?"}`);
    }

    const apply = await api("/api/admin/update/apply", {
      method: "POST",
      token: admin.token,
    });
    if (apply.status === 200 && apply.json?.ok) {
      ok("已触发 OTA apply");
    } else {
      note(`OTA apply: ${apply.status} ${apply.json?.error || JSON.stringify(apply.json)}`);
    }

    const after = await waitForVersion("20260821-4", 180);
    if (after === "20260821-4") ok("OTA 完成 version=20260821-4");
    else bad(`OTA 后仍为 ${after ?? "unknown"}`);
  } catch (e) {
    bad(`OTA 流程: ${e.message}`);
    note("请手动在后台系统更新，或设置 ACCEPT_ADMIN_PASS 后重试");
  }
}

let adminToken;
try {
  const admin = await login(ADMIN_USER, ADMIN_PASS);
  adminToken = admin.token;
  ok("admin 登录成功");
} catch (e) {
  bad(`admin 登录: ${e.message}`);
}

if (adminToken) {
  const adminSc = await api("/api/admin/scenarios", { token: adminToken });
  if (adminSc.status !== 200) {
    bad(`admin scenarios HTTP ${adminSc.status}`);
  } else {
    const list = adminSc.json?.scenarios || [];
    const partner = list.find((c) => c.builtinKey === "partner-counter");
    const counter = list.find((c) => c.builtinKey === "counter-open");
    if (!partner) ok("admin 列表不含 partner-counter（友商柜台）");
    else bad("admin 不应看到 partner-counter");
    if (counter) ok("admin 仍可见 counter-open（柜台/门店）");
    else note("admin 未看到 counter-open（可能被禁用或未种子）");
  }
}

let memberToken;
let memberCode;
const memberUser = `accept_${Date.now().toString(36)}`;
const memberPass = "Accept@123456";

if (adminToken) {
  const bill = await api("/api/admin/member-billing", { token: adminToken });
  const mode = bill.json?.mode;
  const uniOn = bill.json?.universalCodeEnabled;
  const uniCode = bill.json?.universalCode;
  if (mode === "code_required" && uniOn && uniCode) {
    ok("通用注册码通道已开");
    const cap = await api("/api/auth/captcha");
    const code = parseCaptchaSvg(cap.json?.imageSvg || "");
    const reg = await api("/api/auth/member/register", {
      method: "POST",
      body: {
        username: memberUser,
        password: memberPass,
        captchaId: cap.json.captchaId,
        captchaCode: code,
        registerCode: uniCode,
      },
    });
    if (reg.status === 200 && reg.json?.token) {
      memberToken = reg.json.token;
      memberCode = reg.json.user?.memberCode;
      ok(`注册测试会员 ${memberUser} code=${memberCode}`);
    } else {
      bad(`会员注册失败: ${reg.json?.error || reg.status}`);
    }
  } else {
    note(`跳过注册：mode=${mode} universal=${uniOn}（需 code_required + 通用码开启）`);
    try {
      const m = await login(memberUser, memberPass);
      memberToken = m.token;
      memberCode = m.user?.memberCode;
    } catch {
      /* no existing member */
    }
  }
}

if (memberToken) {
  const memSc = await api("/api/admin/scenarios", { token: memberToken });
  if (memSc.status !== 200) {
    bad(`member scenarios HTTP ${memSc.status}`);
  } else {
    const list = memSc.json?.scenarios || [];
    const partner = list.find((c) => c.builtinKey === "partner-counter");
    if (partner?.title === "友商柜台") ok("会员可见「友商柜台」");
    else bad(`会员未看到友商柜台: ${JSON.stringify(list.map((c) => c.builtinKey))}`);

    if (partner) {
      if (partner.refPrefix === "partner") ok("refPrefix=partner");
      else bad(`refPrefix=${partner.refPrefix}`);
      if (partner.templateHint?.includes("streamline-partner-scene")) {
        ok("templateHint 指向 examples/streamline-partner-scene");
      } else {
        bad(`templateHint=${partner.templateHint}`);
      }
      const entry = partner.entryUrl || "";
      if (entry.includes("/p/u/") && entry.includes("ref=partner")) {
        ok(`entryUrl 含 /p/u/ 与 ref=partner → ${entry.slice(0, 80)}…`);
      } else {
        bad(`entryUrl 异常: ${entry}`);
      }
      if (memberCode && entry.includes(`/p/u/${memberCode}`)) {
        ok(`entryUrl 含本会员短码 ${memberCode}`);
      } else if (memberCode) {
        bad(`entryUrl 未含会员短码 ${memberCode}`);
      }
      const img = partner.images?.[0]?.url;
      if (img?.includes("partner-counter.svg")) {
        const svg = await api(img.startsWith("http") ? new URL(img).pathname : img);
        if (svg.status === 200) ok("partner-counter.svg 可访问");
        else bad(`封面 SVG HTTP ${svg.status}`);
      } else {
        note(`封面 url=${img}`);
      }
    }
  }
} else {
  note("无会员 token，跳过会员侧场景检查");
}

console.log("------------------------------------------");
console.log(` PASS=${pass}  FAIL=${fail}  WARN=${warn}`);
console.log("------------------------------------------");
process.exit(fail > 0 ? 1 : 0);
