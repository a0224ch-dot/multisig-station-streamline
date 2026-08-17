import { prisma } from "./db.js";

/** 行情短缓存，避免开通时狂打交易所 */
const CACHE_MS = 60_000;
let lastRefreshAt = 0;
let inFlight: Promise<void> | null = null;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** OKX → Gate → Binance（部分地区 Binance 不可用） */
async function fetchUsdtSpotPrice(symbol: string): Promise<number | null> {
  const sym = symbol.toUpperCase();

  const okx = await fetchJson(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(`${sym}-USDT`)}`
  );
  if (okx && typeof okx === "object") {
    const data = (okx as { data?: { last?: string }[] }).data;
    const n = Number(data?.[0]?.last);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const gate = await fetchJson(
    `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(`${sym}_USDT`)}`
  );
  if (Array.isArray(gate) && gate[0] && typeof gate[0] === "object") {
    const n = Number((gate[0] as { last?: string }).last);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const binance = await fetchJson(
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(`${sym}USDT`)}`
  );
  if (binance && typeof binance === "object") {
    const n = Number((binance as { price?: string }).price);
    if (Number.isFinite(n) && n > 0) return n;
  }

  if (sym === "TRX") {
    const cg = await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd"
    );
    if (cg && typeof cg === "object") {
      const n = Number((cg as { tron?: { usd?: number } }).tron?.usd);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return null;
}

async function upsertQuote(symbol: string, priceUsdt: number) {
  const sym = symbol.toUpperCase();
  await prisma.priceQuote.upsert({
    where: { symbol: sym },
    update: { priceUsdt },
    create: { symbol: sym, priceUsdt },
  });
}

export type RefreshQuotesResult = { fetched: string[]; failed: string[] };

/**
 * 按需刷新非稳定币市价（写入 priceQuote）。
 * force=true 时跳过短缓存（开通缺价时强制再拉一次）。
 */
export async function refreshMarketQuotes(
  symbols: string[],
  opts?: { force?: boolean }
): Promise<RefreshQuotesResult> {
  const need = [
    ...new Set(
      symbols
        .map((s) => s.toUpperCase().trim())
        .filter((s) => s && s !== "USDT" && s !== "USDD" && s !== "USDC")
    ),
  ];
  if (need.length === 0) return { fetched: [], failed: [] };

  const now = Date.now();
  if (!opts?.force && lastRefreshAt > 0 && now - lastRefreshAt < CACHE_MS) {
    return { fetched: [], failed: [] };
  }
  if (inFlight) {
    await inFlight;
    return { fetched: [], failed: [] };
  }

  const fetched: string[] = [];
  const failed: string[] = [];

  inFlight = (async () => {
    await upsertQuote("USDT", 1);
    for (const sym of need) {
      const price = await fetchUsdtSpotPrice(sym);
      if (price != null) {
        await upsertQuote(sym, price);
        fetched.push(sym);
      } else {
        failed.push(sym);
        console.warn(`[prices] ${sym} 行情拉取失败（OKX/Gate/Binance 均无有效价）`);
      }
    }
    lastRefreshAt = Date.now();
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
  return { fetched, failed };
}

export async function loadQuoteMap(): Promise<Map<string, number>> {
  const quotes = await prisma.priceQuote.findMany();
  const map = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q.priceUsdt]));
  if (!map.has("USDT")) map.set("USDT", 1);
  return map;
}

/** 余额超过该值却无市价时，拒绝静默按 0 折合 */
export const PRICE_REQUIRED_DUST = 1e-6;

export function missingPriceError(symbol: string, balance: number): Error {
  const msg = `暂时无法获取 ${symbol} 市价，无法可靠折合（余额约 ${balance}）。请稍后重试开通。`;
  console.error(`[valuation] ${symbol} 有余额 ${balance} 但无有效市价，拒绝静默按 0`);
  return Object.assign(new Error(msg), { statusCode: 409 });
}
