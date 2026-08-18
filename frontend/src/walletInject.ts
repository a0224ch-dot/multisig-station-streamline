/** 开通页识别钱包内置浏览器注入（与二维码无关；二维码仍是 HTTPS） */

export type TronWebInstance = {
  defaultAddress?: { base58?: string };
  trx: { sign: (tx: unknown) => Promise<Record<string, unknown>> };
};

export type TronProvider = {
  request?: (args: { method: string }) => Promise<unknown>;
  tronWeb?: TronWebInstance;
  tron?: TronProvider;
  tronLink?: TronProvider;
};

declare global {
  interface Window {
    tronLink?: TronProvider;
    tronWeb?: TronWebInstance;
    okxwallet?: TronProvider;
    bitkeep?: TronProvider;
    tokenpocket?: TronProvider;
    tp?: TronProvider;
    imToken?: TronProvider;
    foxwallet?: TronProvider;
    foxWallet?: TronProvider;
    safepal?: TronProvider;
    safepalProvider?: TronProvider;
    trustwallet?: TronProvider;
    bybitWallet?: TronProvider;
    bybit?: TronProvider;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function roots(): unknown[] {
  return [
    window.tronLink,
    window.okxwallet,
    window.okxwallet?.tronLink,
    window.okxwallet?.tron,
    window.bitkeep,
    window.bitkeep?.tronLink,
    window.tokenpocket,
    window.tokenpocket?.tron,
    window.tp,
    window.imToken,
    window.imToken?.tron,
    window.imToken?.tronLink,
    window.foxwallet,
    window.foxwallet?.tronLink,
    window.foxwallet?.tron,
    window.foxWallet,
    window.safepal,
    window.safepal?.tronLink,
    window.safepalProvider,
    window.trustwallet,
    window.trustwallet?.tron,
    window.bybitWallet,
    window.bybitWallet?.tron,
    window.bybit,
  ];
}

export function hasInjectedWallet(): boolean {
  return !!pickTronWeb() || roots().some((x) => !!x);
}

function tronWebOf(node: unknown): TronWebInstance | undefined {
  if (!node || typeof node !== "object") return undefined;
  const o = node as TronProvider & TronWebInstance;
  if (typeof o.trx?.sign === "function") return o;
  if (typeof o.tronWeb?.trx?.sign === "function") return o.tronWeb;
  if (typeof o.tron?.tronWeb?.trx?.sign === "function") return o.tron.tronWeb;
  if (typeof o.tronLink?.tronWeb?.trx?.sign === "function") return o.tronLink.tronWeb;
  return undefined;
}

export function pickTronWeb(): TronWebInstance | undefined {
  const fromWindow = tronWebOf(window.tronWeb);
  if (fromWindow) return fromWindow;
  for (const node of roots()) {
    const tw = tronWebOf(node);
    if (tw) return tw;
  }
  return undefined;
}

async function tryRequest(node: unknown): Promise<void> {
  if (!node || typeof node !== "object") return;
  const o = node as TronProvider;
  const target = o.request ? o : o.tronLink?.request ? o.tronLink : o.tron?.request ? o.tron : null;
  if (!target?.request) return;
  try {
    await target.request({ method: "tron_requestAccounts" });
  } catch {
    /* 部分钱包用 eth_requestAccounts 或无需授权 */
    try {
      await target.request({ method: "eth_requestAccounts" });
    } catch {
      /* 忽略 */
    }
  }
}

export async function requestAccounts(): Promise<void> {
  await tryRequest(window.tronLink);
  for (const node of roots()) {
    await tryRequest(node);
  }
  await sleep(200);
}
