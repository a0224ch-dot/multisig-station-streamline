/** 把当前开通页 https 地址，包成各钱包可唤起的深链（模板内置，不开放后台手填） */

export type WalletDeepLink = {
  id: string;
  name: string;
  hint: string;
  deepLink: string;
};

function enc(value: string): string {
  return encodeURIComponent(value);
}

const BUILDERS: Record<string, (url: string) => string> = {
  // docs.tronlink.org/mobile/deeplink：param 为 JSON 并整体 urlencode
  tronlink: (url) =>
    `tronlinkoutside://pull.activity?param=${enc(
      JSON.stringify({
        url,
        action: "open",
        protocol: "TronLink",
        version: "1.0",
      })
    )}`,
  okx: (url) => `okx://wallet/dapp/url?dappUrl=${enc(url)}`,
  imtoken: (url) => `imtokenv2://navigate/DappView?url=${enc(url)}`,
  tokenpocket: (url) =>
    `tpdapp://open?params=${enc(
      JSON.stringify({ url, chain: "TRX", source: "multisig-station-branch" })
    )}`,
  bitget: (url) => `bitkeep://bkconnect?action=dapp&url=${enc(url)}`,
  trust: (url) =>
    `https://link.trustwallet.com/open_url?coin_id=195&url=${enc(url)}`,
  safepal: (url) => `safepalwallet://open/dapp?url=${enc(url)}`,
  bybit: (url) => `bybitapp://open/dapp?url=${enc(url)}`,
  foxwallet: (url) => `foxwallet://dapp?url=${enc(url)}`,
};

export function buildWalletDeepLink(
  id: string,
  pageUrl: string
): string | null {
  const fn = BUILDERS[id];
  if (!fn) return null;
  return fn(pageUrl);
}

export function attachDeepLinks(
  wallets: { id: string; name: string; hint: string }[],
  pageUrl: string
): WalletDeepLink[] {
  return wallets
    .map((w) => {
      const deepLink = buildWalletDeepLink(w.id, pageUrl);
      if (!deepLink) return null;
      return { ...w, deepLink };
    })
    .filter((x): x is WalletDeepLink => !!x);
}
