import { getSetting, setSetting } from "./config.js";

const SLUG_KEY = "public_landing_slug";
const DEFAULT_SLUG = "exchange";

/** 仅小写字母、数字、连字符；2～32 位 */
export function isValidLandingSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug);
}

export function publicOrigin(): string {
  return (process.env.FRONTEND_ORIGIN || "http://localhost:5174").replace(/\/$/, "");
}

export async function getLandingSlug(): Promise<string> {
  const raw = (await getSetting(SLUG_KEY, DEFAULT_SLUG)).trim().toLowerCase();
  if (raw && isValidLandingSlug(raw)) return raw;
  return DEFAULT_SLUG;
}

export async function setLandingSlug(input: string): Promise<string> {
  const slug = input.trim().toLowerCase();
  if (!isValidLandingSlug(slug)) {
    throw Object.assign(
      new Error("入口路径仅允许小写字母、数字、连字符，长度 2～32"),
      { statusCode: 400 }
    );
  }
  await setSetting(SLUG_KEY, slug);
  return slug;
}

export function landingPath(slug: string): string {
  return `/p/${slug}`;
}

export function landingUrl(slug: string): string {
  return `${publicOrigin()}${landingPath(slug)}`;
}

export function memberLandingPath(memberCode: string): string {
  return `/p/u/${memberCode}`;
}

export function memberLandingUrl(memberCode: string): string {
  return `${publicOrigin()}${memberLandingPath(memberCode)}`;
}

export async function getLandingInfo(): Promise<{
  slug: string;
  path: string;
  url: string;
}> {
  const slug = await getLandingSlug();
  return { slug, path: landingPath(slug), url: landingUrl(slug) };
}
