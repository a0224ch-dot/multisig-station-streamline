const TOKEN_KEY = "branch_multisig_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export type User = {
  id: string;
  username: string;
  displayName?: string | null;
  role: "SUPER_ADMIN" | "EMPLOYEE" | "MEMBER";
  memberCode?: string | null;
  memberEntryUrl?: string | null;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();
  let body = init.body;
  if (body !== undefined && body !== null) {
    headers.set("Content-Type", "application/json");
  } else if (method !== "GET" && method !== "HEAD") {
    headers.set("Content-Type", "application/json");
    body = "{}";
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "请求失败");
  return data as T;
}

export const api = {
  health: () =>
    request<{ ok: boolean; version?: string; edition?: string }>("/api/health"),
  login: (username: string, password: string, captchaId: string, captchaCode: string) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, captchaId, captchaCode }),
    }),
  captcha: () =>
    request<{ captchaId: string; imageSvg: string; expiresInSec: number }>(
      "/api/auth/captcha"
    ),
  memberRegister: (body: {
    username: string;
    password: string;
    displayName?: string;
  }) =>
    request<{ token: string; user: User }>("/api/auth/member/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<User>("/api/auth/me"),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
  changeDisplayName: (displayName: string) =>
    request<User>("/api/auth/display-name", {
      method: "POST",
      body: JSON.stringify({ displayName }),
    }),
  listUsers: () =>
    request<
      {
        id: string;
        username: string;
        displayName?: string | null;
        role: string;
        active: boolean;
        createdAt: string;
      }[]
    >("/api/admin/users"),
  listMembers: () =>
    request<
      {
        id: string;
        username: string;
        displayName?: string | null;
        role: string;
        active: boolean;
        memberCode?: string | null;
        createdAt: string;
      }[]
    >("/api/admin/members"),
  createUser: (body: {
    username: string;
    password: string;
    displayName?: string;
    role: "SUPER_ADMIN" | "EMPLOYEE";
  }) =>
    request<{
      id: string;
      username: string;
      displayName?: string | null;
      role: string;
      active: boolean;
    }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  resetUserPassword: (id: string, newPassword: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),
  publicMeta: () =>
    request<{
      network: string;
      thresholdUsdt: number;
      branchName: string;
      pageDecor: PageDecor;
      landing?: LandingInfo;
      ads: { sideHtml: string; bottomHtml: string; exchangeUrl: string };
    }>("/api/meta/public"),
  getPublicLanding: (slug: string) =>
    request<{
      network: string;
      branchName: string;
      pageDecor: PageDecor;
      landing: LandingInfo;
      openWallets?: OpenWalletOption[];
    }>(`/api/public/landing/${encodeURIComponent(slug)}`),
  getPublicMemberLanding: (code: string) =>
    request<{
      network: string;
      branchName: string;
      pageDecor: PageDecor;
      openWallets?: OpenWalletOption[];
      member: {
        memberCode: string;
        displayName: string;
        entryPath: string;
      };
    }>(`/api/public/member/${encodeURIComponent(code)}`),
  getLanding: () => request<LandingInfo>("/api/admin/landing"),
  saveLanding: (slug: string) =>
    request<LandingInfo>("/api/admin/landing", {
      method: "PUT",
      body: JSON.stringify({ slug }),
    }),
  publicOpenSession: (opts?: {
    returnUrl?: string;
    ref?: string;
    memberCode?: string;
  }) =>
    request<{
      openUrl: string;
      expiresAt: string;
      network: string;
      token?: string;
      returnUrl?: string | null;
    }>("/api/public/open/session", {
      method: "POST",
      body: JSON.stringify(opts || {}),
    }),
  getPartnerSettings: () =>
    request<{
      returnUrlAllowlist: string[];
      apiKeys: PartnerApiKey[];
    }>("/api/admin/partner"),
  getScenarios: () =>
    request<{
      landing: LandingInfo;
      scenarios: ScenarioItem[];
      memberEntryUrl?: string;
      integrateDocPath?: string;
    }>("/api/admin/scenarios"),
  createScenario: (body: {
    title: string;
    summary: string;
    bodyText: string;
    images: PageDecorImage[];
    refPrefix: string;
    templateHint: string;
    enabled: boolean;
  }) =>
    request<ScenarioItem>("/api/admin/scenarios", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateScenario: (
    id: string,
    body: {
      title: string;
      summary: string;
      bodyText: string;
      images: PageDecorImage[];
      refPrefix: string;
      templateHint: string;
      enabled: boolean;
    }
  ) =>
    request<ScenarioItem>(`/api/admin/scenarios/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteScenario: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/scenarios/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  resetScenario: (id: string) =>
    request<ScenarioItem>(`/api/admin/scenarios/${encodeURIComponent(id)}/reset`, {
      method: "POST",
    }),
  uploadScenarioImage: async (file: File) => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/scenarios/upload", {
      method: "POST",
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || "上传失败");
    return data as PageDecorImage;
  },
  saveReturnUrlAllowlist: (hosts: string[]) =>
    request<{ returnUrlAllowlist: string[] }>(
      "/api/admin/partner/return-url-allowlist",
      { method: "PUT", body: JSON.stringify({ hosts }) }
    ),
  createPartnerApiKey: (name: string) =>
    request<{ record: PartnerApiKey; apiKey: string }>(
      "/api/admin/partner/api-keys",
      { method: "POST", body: JSON.stringify({ name }) }
    ),
  revokePartnerApiKey: (id: string) =>
    request<{ ok: boolean; apiKeys: PartnerApiKey[] }>(
      `/api/admin/partner/api-keys/${encodeURIComponent(id)}/revoke`,
      { method: "POST" }
    ),
  internalOpenSession: () =>
    request<{ openUrl: string; expiresAt: string; network: string }>(
      "/api/open/session",
      { method: "POST" }
    ),
  getOpen: (token: string) =>
    request<{
      status: string;
      unsignedTx?: unknown;
      network: string;
      walletAddress?: string | null;
      txId?: string | null;
      returnUrl?: string | null;
      partnerRef?: string | null;
      openWallets?: OpenWalletOption[];
    }>(`/api/open/${token}`),
  prepareOpen: (token: string, walletAddress: string) =>
    request<{ unsignedTx: unknown }>(`/api/open/${token}/prepare`, {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    }),
  broadcastOpen: (token: string, signedTx: Record<string, unknown>) =>
    request<{ ok: boolean; txId?: string; redirectUrl?: string | null }>(
      `/api/open/${token}/broadcast`,
      {
        method: "POST",
        body: JSON.stringify({ signedTx }),
      }
    ),
  listPresets: () =>
    request<{ address: string; name: string }[]>("/api/admin/presets"),
  savePresets: (signers: { address: string; name: string }[]) =>
    request("/api/admin/presets", {
      method: "PUT",
      body: JSON.stringify({ signers }),
    }),
  getNetworkSetting: () =>
    request<{
      network: "mainnet" | "shasta";
      options?: { value: string; label: string }[];
    }>("/api/admin/settings/network"),
  setNetworkSetting: (network: "mainnet" | "shasta") =>
    request<{ network: string }>("/api/admin/settings/network", {
      method: "PUT",
      body: JSON.stringify({ network }),
    }),
  getAds: () =>
    request<{ sideHtml: string; bottomHtml: string; exchangeUrl: string }>(
      "/api/admin/ads"
    ),
  saveAds: (body: {
    sideHtml?: string;
    bottomHtml?: string;
    exchangeUrl?: string;
  }) =>
    request("/api/admin/ads", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  listWallets: () =>
    request<
      {
        network: string;
        address: string;
        tier: string;
        channel: string;
        openedAt: string;
        openTxId?: string | null;
      }[]
    >("/api/admin/wallets"),
  getPageDecor: () => request<PageDecor>("/api/admin/page-decor"),
  savePageDecor: (body: PageDecor) =>
    request<PageDecor>("/api/admin/page-decor", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  resetPageDecor: () =>
    request<PageDecor>("/api/admin/page-decor/reset", { method: "POST" }),
  getOpenWalletsSetting: () =>
    request<{ catalog: OpenWalletOption[]; enabled: string[] }>(
      "/api/admin/open-wallets"
    ),
  saveOpenWalletsSetting: (enabled: string[]) =>
    request<{ catalog: OpenWalletOption[]; enabled: string[] }>(
      "/api/admin/open-wallets",
      { method: "PUT", body: JSON.stringify({ enabled }) }
    ),
  uploadPageDecorImage: async (file: File) => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/page-decor/upload", {
      method: "POST",
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || "上传失败");
    return data as PageDecorImage;
  },
  updateStatus: () => request<UpdateStatus>("/api/admin/update/status"),
  updateCheck: () =>
    request<{
      currentVersion: string;
      latest: ReleaseManifest;
      updateAvailable: boolean;
    }>("/api/admin/update/check", { method: "POST" }),
  updateApply: () =>
    request<{ ok: boolean; message: string; status: UpdateStatus }>(
      "/api/admin/update/apply",
      { method: "POST" }
    ),
};

export type OpenWalletOption = {
  id: string;
  name: string;
  hint: string;
};

export type PageDecorImage = {
  id: string;
  url: string;
  link?: string;
};

export type PageDecor = {
  title: string;
  bodyText: string;
  bottomText: string;
  buttonText: string;
  buttonUrl: string;
  images: PageDecorImage[];
};

export type LandingInfo = {
  slug: string;
  path: string;
  url: string;
};

export type PartnerApiKey = {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  createdAt: string;
};

export type ScenarioItem = {
  id: string;
  builtinKey?: string | null;
  title: string;
  summary: string;
  bodyText: string;
  images: PageDecorImage[];
  refPrefix: string;
  templateHint?: string;
  enabled: boolean;
  sortOrder: number;
  createdById?: string | null;
  createdByName?: string;
  isBuiltin: boolean;
  sampleEntryUrl: string;
  entryUrl?: string;
};

export type ReleaseManifest = {
  version: string;
  notes: string;
  zipUrl: string;
  sha256: string;
};

export type UpdateStatus = {
  phase: string;
  currentVersion: string;
  targetVersion: string | null;
  latest: ReleaseManifest | null;
  message: string;
  logs: string[];
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  busy: boolean;
};
