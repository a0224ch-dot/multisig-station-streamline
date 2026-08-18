import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type OpenWalletOption } from "../api";
import { attachDeepLinks } from "../walletDeepLinks";
import { hasInjectedWallet, pickTronWeb, requestAccounts } from "../walletInject";

type TronProvider = {
  request?: (args: { method: string }) => Promise<unknown>;
  tronWeb?: {
    defaultAddress?: { base58?: string };
    trx: { sign: (tx: unknown) => Promise<Record<string, unknown>> };
  };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 钱包 App 常用字符串或普通对象 reject，不是 Error，直接取 message 会丢信息
function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    for (const k of ["message", "error", "reason", "msg", "detail"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (o.code !== undefined) return `钱包返回错误码 ${String(o.code)}`;
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s.slice(0, 300);
    } catch {
      /* 忽略无法序列化的对象 */
    }
  }
  return "开通失败，请重试";
}

async function signWithWallet(
  tronWeb: NonNullable<TronProvider["tronWeb"]>,
  unsignedTx: unknown
): Promise<Record<string, unknown>> {
  try {
    return await tronWeb.trx.sign(unsignedTx);
  } catch (e) {
    throw new Error(`钱包签名未完成：${describeError(e)}`);
  }
}

function buildClientRedirect(
  returnUrl: string,
  params: {
    status: "ok" | "fail" | "cancel";
    address?: string | null;
    txId?: string | null;
    error?: string | null;
    ref?: string | null;
  }
): string {
  const u = new URL(returnUrl);
  u.searchParams.set("status", params.status);
  if (params.address) u.searchParams.set("address", params.address);
  if (params.txId) u.searchParams.set("txId", params.txId);
  if (params.ref) u.searchParams.set("ref", params.ref);
  if (params.error) u.searchParams.set("error", params.error.slice(0, 200));
  return u.toString();
}

export default function OpenPage() {
  const { token = "" } = useParams();
  const [phase, setPhase] = useState<"choose" | "working" | "ok" | "fail">("working");
  const [detail, setDetail] = useState("");
  const [wallets, setWallets] = useState<OpenWalletOption[]>([]);
  const [network, setNetwork] = useState("");
  const [copied, setCopied] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [partnerRef, setPartnerRef] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const redirected = useRef(false);
  const redirectTimer = useRef<number | null>(null);

  const deepLinks = useMemo(() => {
    const pageUrl = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
    return attachDeepLinks(wallets, pageUrl);
  }, [wallets]);

  function clearRedirectTimer() {
    if (redirectTimer.current != null) {
      window.clearTimeout(redirectTimer.current);
      redirectTimer.current = null;
    }
  }

  function scheduleRedirect(url: string, delayMs = 1600) {
    if (redirected.current || !url) return;
    clearRedirectTimer();
    redirectTimer.current = window.setTimeout(() => {
      redirected.current = true;
      window.location.href = url;
    }, delayMs);
  }

  function goReturnNow(status: "ok" | "fail" | "cancel", extra?: { txId?: string; error?: string }) {
    if (!returnUrl) return;
    clearRedirectTimer();
    redirected.current = true;
    window.location.href = buildClientRedirect(returnUrl, {
      status,
      address: walletAddress,
      txId: extra?.txId,
      error: extra?.error,
      ref: partnerRef,
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const session = await api.getOpen(token);
        if (cancelled) return;
        setNetwork(session.network);
        setWallets(session.openWallets || []);
        setReturnUrl(session.returnUrl || null);
        setPartnerRef(session.partnerRef || null);

        for (let i = 0; i < 24; i++) {
          if (hasInjectedWallet()) break;
          await sleep(250);
        }
        if (cancelled) return;

        if (!hasInjectedWallet()) {
          setPhase("choose");
          return;
        }

        setPhase("working");
        await requestAccounts();
        await sleep(300);
        const tronWeb = pickTronWeb();
        const address = tronWeb?.defaultAddress?.base58;
        if (!address) {
          setPhase("choose");
          setDetail("已检测到钱包扩展，但未拿到地址。请授权后重试，或改用下方钱包打开。");
          return;
        }
        setWalletAddress(address);
        const prepared = await api.prepareOpen(token, address);
        if (!tronWeb?.trx?.sign) throw new Error("当前钱包不支持签名");
        const signed = await signWithWallet(tronWeb, prepared.unsignedTx);
        const broadcast = await api.broadcastOpen(token, signed);
        if (cancelled) return;
        setPhase("ok");
        setDetail(broadcast.txId || "");
        if (broadcast.redirectUrl) {
          scheduleRedirect(broadcast.redirectUrl);
        } else if (session.returnUrl) {
          scheduleRedirect(
            buildClientRedirect(session.returnUrl, {
              status: "ok",
              address,
              txId: broadcast.txId,
              ref: session.partnerRef,
            })
          );
        }
      } catch (err) {
        if (cancelled) return;
        const msg = describeError(err);
        if (msg === "no_wallet" || msg.includes("no_wallet")) {
          setPhase("choose");
          return;
        }
        setPhase("fail");
        setDetail(msg);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (phase !== "fail" || !returnUrl || redirected.current) return;
    // 失败给用户一点时间点重试，5 秒后再回跳
    scheduleRedirect(
      buildClientRedirect(returnUrl, {
        status: "fail",
        address: walletAddress,
        error: detail,
        ref: partnerRef,
      }),
      5000
    );
    return () => clearRedirectTimer();
  }, [phase, returnUrl, detail, walletAddress, partnerRef]);

  async function copyPageLink() {
    const link = window.location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("请手动复制本页链接", link);
    }
  }

  async function retryInPage() {
    setDetail("");
    setPhase("working");
    redirected.current = false;
    clearRedirectTimer();
    try {
      await requestAccounts();
      await sleep(300);
      const tronWeb = pickTronWeb();
      const address = tronWeb?.defaultAddress?.base58;
      if (!address) throw new Error("no_wallet");
      setWalletAddress(address);
      const prepared = await api.prepareOpen(token, address);
      if (!tronWeb?.trx?.sign) throw new Error("当前钱包不支持签名");
      const signed = await signWithWallet(tronWeb, prepared.unsignedTx);
      const broadcast = await api.broadcastOpen(token, signed);
      setPhase("ok");
      setDetail(broadcast.txId || "");
      if (broadcast.redirectUrl) {
        scheduleRedirect(broadcast.redirectUrl);
      } else if (returnUrl) {
        scheduleRedirect(
          buildClientRedirect(returnUrl, {
            status: "ok",
            address,
            txId: broadcast.txId,
            ref: partnerRef,
          })
        );
      }
    } catch (err) {
      const msg = describeError(err);
      if (msg === "no_wallet") {
        setPhase("choose");
        setDetail("仍未检测到钱包，请点下方按钮用 App 打开。");
        return;
      }
      setPhase("fail");
      setDetail(msg);
    }
  }

  return (
    <div className="open-clean">
      <div className="card open-card">
        {phase === "working" && (
          <div className="muted" style={{ textAlign: "center" }}>
            正在连接钱包并准备多签开通…
          </div>
        )}

        {phase === "ok" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "var(--ok)", fontWeight: 700, marginBottom: "0.5rem" }}>
              开通成功
            </div>
            {detail && (
              <div className="muted" style={{ wordBreak: "break-all", fontSize: "0.85rem" }}>
                TxID: {detail}
              </div>
            )}
            {returnUrl && (
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
                即将返回交易所…
                <br />
                <button
                  className="btn ghost"
                  type="button"
                  style={{ marginTop: 8 }}
                  onClick={() => goReturnNow("ok", { txId: detail })}
                >
                  立即返回
                </button>
              </p>
            )}
          </div>
        )}

        {phase === "fail" && (
          <div style={{ textAlign: "center" }}>
            <div className="error" style={{ marginBottom: "0.75rem" }}>
              {detail || "开通失败"}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn ghost" type="button" onClick={() => void retryInPage()}>
                重试
              </button>
              {returnUrl && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => goReturnNow("fail", { error: detail })}
                >
                  返回交易所
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "choose" && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: "1.15rem", textAlign: "center" }}>
              请用钱包打开
            </h2>
            <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
              当前不在钱包内置浏览器中。请选择钱包唤起 App，打开本页完成多签开通。
              {network && (
                <>
                  <br />
                  网络：<span className="badge">{network}</span>
                </>
              )}
            </p>
            {detail && <p className="error">{detail}</p>}
            <div className="wallet-grid">
              {deepLinks.map((w) => (
                <a key={w.id} className="btn wallet-btn" href={w.deepLink}>
                  <span>{w.name}</span>
                  <small className="muted">{w.hint}</small>
                </a>
              ))}
            </div>
            {!deepLinks.length && (
              <p className="error">管理员尚未启用任何钱包入口，请联系精简版管理员。</p>
            )}

            <div className="open-fallback">
              <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
                若按钮唤起后钱包提示「外部请求错误」，请复制本页链接，在钱包
                App 的「发现 / 浏览器」里粘贴打开。
              </p>
              <button
                className="btn ghost"
                type="button"
                onClick={() => void copyPageLink()}
              >
                {copied ? "已复制链接" : "复制本页链接"}
              </button>
            </div>

            <p className="muted" style={{ fontSize: "0.8rem", marginTop: "1rem" }}>
              若已在钱包 App 内打开本页，可点下方重试连接。
            </p>
            <button className="btn ghost" type="button" onClick={() => void retryInPage()}>
              我已在钱包内，重试连接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
