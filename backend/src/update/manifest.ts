import { z } from "zod";
import { releasesLatestUrl } from "./paths.js";
import type { ReleaseManifest } from "./status.js";

const manifestSchema = z.object({
  version: z.string().min(1),
  notes: z.string().default(""),
  zipUrl: z.string().url(),
  sha256: z.string().min(32),
});

export async function fetchLatestManifest(
  url = releasesLatestUrl()
): Promise<ReleaseManifest> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "multisig-station-branch-updater" },
  });
  if (!res.ok) {
    throw new Error(`拉取版本清单失败 HTTP ${res.status}（${url}）`);
  }
  const json = await res.json();
  const parsed = manifestSchema.parse(json);
  return {
    version: parsed.version.trim(),
    notes: parsed.notes || "",
    zipUrl: parsed.zipUrl.trim(),
    sha256: parsed.sha256.trim().toLowerCase(),
  };
}
