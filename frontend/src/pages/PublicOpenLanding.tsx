import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { api, type PageDecor } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";

/**
 * 开通出码页（不跳转）：
 * /open、/p/:slug → 站长地址
 * /p/u/:code → 该会员自己的地址
 * 扫出的短时会话在 /o/:token 签名
 */
export default function PublicOpenLanding() {
  const { t } = useTranslation();
  const { code = "" } = useParams();
  const [searchParams] = useSearchParams();
  const memberCode = code.trim().toLowerCase();
  const sceneRef = (searchParams.get("ref") || "").trim();
  const [openUrl, setOpenUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [network, setNetwork] = useState("");
  const [branchName, setBranchName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [decor, setDecor] = useState<PageDecor | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [entryMissing, setEntryMissing] = useState(false);

  const guideLines = useMemo(() => {
    const raw = t("public.guideLines", { returnObjects: true });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [t]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    setEntryMissing(false);
    try {
      if (memberCode) {
        const data = await api.getPublicMemberLanding(memberCode);
        setNetwork(data.network);
        setBranchName(data.branchName);
        setMemberName(data.member.displayName);
        setDecor(data.pageDecor || null);
        const created = await api.publicOpenSession({
          memberCode,
          ...(sceneRef ? { ref: sceneRef } : {}),
        });
        setOpenUrl(created.openUrl);
        setExpiresAt(created.expiresAt);
        return;
      }
      setMemberName("");
      const meta = await api.publicMeta();
      setNetwork(meta.network);
      setBranchName(meta.branchName);
      setDecor(meta.pageDecor || null);
      const created = await api.publicOpenSession(
        sceneRef ? { ref: sceneRef } : undefined
      );
      setOpenUrl(created.openUrl);
      setExpiresAt(created.expiresAt);
    } catch (err) {
      setOpenUrl("");
      setExpiresAt(null);
      if (memberCode) setEntryMissing(true);
      setError(err instanceof Error ? err.message : t("public.sessionError"));
    } finally {
      setBusy(false);
    }
  }, [memberCode, sceneRef, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const siteName = branchName.trim();
  const title =
    (decor?.title || "").trim() ||
    (siteName && siteName !== "精简多签" ? siteName : "") ||
    t("public.homeTitle");
  const body = (decor?.bodyText || "").trim() || t("public.defaultBody");
  const images = decor?.images || [];
  const bottom = (decor?.bottomText || "").trim();
  const btnText = (decor?.buttonText || "").trim();
  const btnUrl = (decor?.buttonUrl || "").trim();

  if (entryMissing && !decor) {
    return (
      <div className="public-wrap">
        <p className="error">{error || t("member.entryMissing")}</p>
        <Link className="btn ghost" to="/">
          {t("member.backHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="public-wrap">
      <div className="public-top-bar" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
        <LanguageSwitcher />
        <Link className="btn ghost" to="/">
          {t("public.siteHome")}
        </Link>
        <Link className="btn ghost" to="/login">
          {t("public.login")}
        </Link>
      </div>

      <h1 style={{ textAlign: "center", fontSize: "1.25rem" }}>{title}</h1>

      <div className="card public-guide">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>{t("public.guideTitle")}</h2>
        <ol style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--muted)" }}>
          {guideLines.map((line) => (
            <li key={line} style={{ marginBottom: "0.35rem" }}>
              {line}
            </li>
          ))}
        </ol>
      </div>

      <div className="public-grid">
        <div className="home-qr" style={{ minHeight: "auto", flex: 1 }}>
          <div className="qr-box">
            {openUrl ? (
              <QRCodeSVG value={openUrl} size={220} level="M" includeMargin />
            ) : (
              <div style={{ width: 220, height: 220 }} className="muted" />
            )}
          </div>
          <div className="aside">
            {memberName && (
              <p className="muted" style={{ marginTop: 0 }}>
                {t("member.handledBy", { name: memberName })}
              </p>
            )}
            <p style={{ marginTop: memberName ? undefined : 0, whiteSpace: "pre-wrap" }}>{body}</p>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              {t("public.networkLabel")}
              <span className="badge">{network || "…"}</span>
              {expiresAt && (
                <>
                  <br />
                  {t("public.expiresLabel")}
                  {new Date(expiresAt).toLocaleString()}
                </>
              )}
            </p>
            {error && <p className="error">{error}</p>}
            <button
              className="btn ghost"
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
            >
              {busy ? t("public.generating") : t("public.refreshCode")}
            </button>
          </div>
        </div>

        {images.length > 0 && (
          <aside className="decor-images">
            {images.map((img) => {
              const pic = <img src={img.url} alt="" className="decor-img" />;
              const link = (img.link || "").trim();
              if (link) {
                return (
                  <a
                    key={img.id}
                    href={link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="decor-img-link"
                  >
                    {pic}
                  </a>
                );
              }
              return (
                <div key={img.id} className="decor-img-wrap">
                  {pic}
                </div>
              );
            })}
          </aside>
        )}
      </div>

      {(bottom || (btnText && btnUrl)) && (
        <div className="decor-bottom">
          {bottom && <p style={{ whiteSpace: "pre-wrap", margin: "0 0 0.75rem" }}>{bottom}</p>}
          {btnText && btnUrl && (
            <a className="btn" href={btnUrl} target="_blank" rel="noreferrer noopener">
              {btnText}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
