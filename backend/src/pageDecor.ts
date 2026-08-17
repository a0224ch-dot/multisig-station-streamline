import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getSetting, setSetting } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTING_KEY = "page_decor";

export const pageDecorImageSchema = z.object({
  id: z.string().min(1).max(64),
  url: z.string().min(1).max(300),
  link: z.string().max(500).optional().default(""),
});

export const pageDecorSchema = z.object({
  title: z.string().max(40).default(""),
  bodyText: z.string().max(500).default(""),
  bottomText: z.string().max(120).default(""),
  buttonText: z.string().max(40).default(""),
  buttonUrl: z.string().max(500).default(""),
  images: z.array(pageDecorImageSchema).max(3).default([]),
});

export type PageDecor = z.infer<typeof pageDecorSchema>;

export function emptyPageDecor(): PageDecor {
  return {
    title: "",
    bodyText: "",
    bottomText: "",
    buttonText: "",
    buttonUrl: "",
    images: [],
  };
}

export function uploadsRoot(): string {
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, "../data/uploads");
}

export function pageDecorUploadDir(): string {
  return path.join(uploadsRoot(), "page-decor");
}

export function ensureUploadDirs(): void {
  fs.mkdirSync(pageDecorUploadDir(), { recursive: true });
}

export async function getPageDecor(): Promise<PageDecor> {
  const raw = await getSetting(SETTING_KEY, "");
  if (!raw) return emptyPageDecor();
  try {
    return pageDecorSchema.parse(JSON.parse(raw));
  } catch {
    return emptyPageDecor();
  }
}

export async function savePageDecor(input: unknown): Promise<PageDecor> {
  const parsed = pageDecorSchema.parse(input);
  // 只允许本站媒体路径，防止外链脚本
  for (const img of parsed.images) {
    if (!img.url.startsWith("/api/media/page-decor/")) {
      throw new Error("图片地址无效，请重新上传");
    }
  }
  await setSetting(SETTING_KEY, JSON.stringify(parsed));
  return parsed;
}

export function isSafeUploadName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,120}$/.test(name) && !name.includes("..");
}

export function detectImageExt(buf: Buffer, mime: string): "jpg" | "png" | "webp" | null {
  const m = (mime || "").toLowerCase();
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return null;
}
