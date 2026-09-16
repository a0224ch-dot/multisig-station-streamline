import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { api, type OpenWalletOption } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { attachDeepLinks } from "../walletDeepLinks";
import { hasInjectedWallet, pickTronWeb, requestAccounts } from "../walletInject";
import { localizedWalletHint } from "../walletHints";

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

function explorerBase(network: string) {
  return network === "shasta" ? "https://shasta.tronscan.org" : "https://tronscan.org";
}

function accountExplorerUrl(network: string, address: string) {
  return `${explorerBase(network)}/#/address/${encodeURIComponent(address)}`;
}

function txExplorerUrl(network: string, txId: string) {
  return `${explorerBase(network)}/#/transaction/${encodeURIComponent(txId)}`;
}

export default function OpenPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();

  function describeError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string" && err.trim()) return err.trim();
    if (err && typeof err === "object") {
      const o = err as Record<string, unknown>;
      for (const k of ["message", "error", "reason", "msg", "detail"]) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      if (o.code !== undefined) {
        return t("open.walletErrorCode", { code: String(o.code) });
      }
      try {
        const s = JSON.stringify(err);
        if (s && s !== "{}") return s.slice(0, 300);
      } catch {
        /* ignore */
      }
    }
    return t("open.openFailedRetry");
  }

  async function signWithWallet(
    tronWeb: NonNullable<TronProvider["tronWeb"]>,
    unsignedTx: unknown
  ): Promise<Record<string, unknown>> {
    try {
      return await tronWeb.trx.sign(unsignedTx);
    } catch (e) {
      throw new Error(t("open.signFailed", { detail: describeError(e) }));
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

  const [phase, setPhase] = useState<"choose" | "working" | "ok" | "fail">("working");
  const [detail, setDetail] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  function networkLabel(net: string) {
    if (net === "shasta") return t("open.networkShasta");
    if (net === "mainnet") return t("open.networkMainnet");
    return net || t("open.networkMainnet");
  }

  function humanizeOpenError(msg: string): string {
    if (msg === "expired") return t("open.sessionExpired");
    if (msg === "already_multisig") return t("open.alreadyMultisig");
    if (msg === "not_found") return t("open.sessionMissing");
    if (msg === "not_prepared") return t("open.notPrepared");
    if (msg === "broadcast_failed" || msg === "fail") return t("open.openFailedRetry");
    return msg;
  }
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
    return attachDeepLinks(wallets, pageUrl).map((w) => ({
      ...w,
      hint: localizedWalletHint(w.id, w.hint, t),
    }));
  }, [wallets, t]);

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
        if (session.expiresAt) setExpiresAt(session.expiresAt);
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
          setDetail(t("open.addressMissing"));
          return;
        }
        setWalletAddress(address);
        const prepared = await api.prepareOpen(token, address);
        if (!tronWeb?.trx?.sign) throw new Error(t("open.signUnsupported"));
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
        setDetail(humanizeOpenError(msg));
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  useEffect(() => {
    if (phase !== "fail" || !returnUrl || redirected.current) return;
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
      window.prompt(t("open.copyPrompt"), link);
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
      if (!tronWeb?.trx?.sign) throw new Error(t("open.signUnsupported"));
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
        setDetail(t("open.noWalletDetected"));
        return;
      }
      setPhase("fail");
      setDetail(humanizeOpenError(msg));
    }
  }

  return (
    <div className="open-clean">
      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
        <LanguageSwitcher />
      </div>
      <div className={`card open-card${phase === "ok" ? " open-card-wide" : ""}`}>
        {phase !== "ok" && (
          <p className="muted" style={{ textAlign: "center", fontSize: "0.85rem", marginTop: 0 }}>
            {t("open.sessionHint")}
            {expiresAt ? (
              <>
                <br />
                {t("open.expiresAt", { time: new Date(expiresAt).toLocaleString() })}
              </>
            ) : null}
          </p>
        )}
        {phase === "working" && (
          <div className="muted" style={{ textAlign: "center" }}>
            {t("open.connecting")}
          </div>
        )}

        {phase === "ok" && (
          <div className="open-success">
            <div className="open-success-title">{t("open.success")}</div>
            <p className="muted open-success-lead">{t("open.guideLead")}</p>

            {walletAddress ? (
              <div className="muted open-success-meta">
                {t("open.addressLabel")}
                <br />
                <span className="open-mono">{walletAddress}</span>
              </div>
            ) : null}
            {detail ? (
              <div className="muted open-success-meta">
                {t("open.txLabel")}
                <br />
                <span className="open-mono">{detail}</span>
              </div>
            ) : null}

            <div className="open-guide-actions">
              {walletAddress ? (
                <a
                  className="btn"
                  href={accountExplorerUrl(network, walletAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("open.viewAddress")}
                </a>
              ) : null}
              {detail ? (
                <a
                  className="btn ghost"
                  href={txExplorerUrl(network, detail)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("open.viewTx")}
                </a>
              ) : (
                <a
                  className="btn ghost"
                  href={explorerBase(network)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("open.openExplorer")}
                </a>
              )}
            </div>

            <section className="open-guide">
              <h3>{t("open.verifyTitle")}</h3>
              <ol>
                <li>{t("open.verify1", { network: networkLabel(network) })}</li>
                <li>
                  <Trans i18nKey="open.verify2" components={{ strong: <strong /> }} />
                </li>
                <li>{t("open.verify3")}</li>
                <li>{t("open.verify4")}</li>
              </ol>
            </section>

            <section className="open-guide">
              <h3>{t("open.useTitle")}</h3>
              <ol>
                {(["use1", "use2", "use3", "use4", "use5"] as const).map((key) => (
                  <li key={key}>
                    <Trans i18nKey={`open.${key}`} components={{ strong: <strong /> }} />
                  </li>
                ))}
              </ol>
            </section>

            {returnUrl && (
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.9rem", textAlign: "center" }}>
                {t("open.returnSoon")}
                <br />
                <button
                  className="btn ghost"
                  type="button"
                  style={{ marginTop: 8 }}
                  onClick={() => goReturnNow("ok", { txId: detail })}
                >
                  {t("open.returnNow")}
                </button>
              </p>
            )}
          </div>
        )}

        {phase === "fail" && (
          <div style={{ textAlign: "center" }}>
            <div className="error" style={{ marginBottom: "0.75rem" }}>
              {detail || t("open.fail")}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn ghost" type="button" onClick={() => void retryInPage()}>
                {t("open.retry")}
              </button>
              {returnUrl && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => goReturnNow("fail", { error: detail })}
                >
                  {t("open.returnExchange")}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "choose" && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: "1.15rem", textAlign: "center" }}>
              {t("open.chooseTitle")}
            </h2>
            <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
              {t("open.chooseDesc")}
              {network && (
                <>
                  <br />
                  {t("open.networkLabel")}
                  <span className="badge">{network}</span>
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
            {!deepLinks.length && <p className="error">{t("open.noWalletsEnabled")}</p>}

            <div className="open-fallback">
              <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
                {t("open.fallbackHint")}
              </p>
              <button className="btn ghost" type="button" onClick={() => void copyPageLink()}>
                {copied ? t("open.copiedLink") : t("open.copyLink")}
              </button>
            </div>

            <p className="muted" style={{ fontSize: "0.8rem", marginTop: "1rem" }}>
              {t("open.retryInWallet")}
            </p>
            <button className="btn ghost" type="button" onClick={() => void retryInPage()}>
              {t("open.retryConnect")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
