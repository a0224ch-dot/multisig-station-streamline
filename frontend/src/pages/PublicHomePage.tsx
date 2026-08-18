import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { api, type PageDecor } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function PublicHomePage() {
  const { t } = useTranslation();
  const [openUrl, setOpenUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [network, setNetwork] = useState("");
  const [branchName, setBranchName] = useState("");
  const [decor, setDecor] = useState<PageDecor | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const guideLines = useMemo(
    () => t("public.guideLines", { returnObjects: true }) as string[],
    [t]
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const meta = await api.publicMeta();
      setNetwork(meta.network);
      setBranchName(meta.branchName);
      setDecor(meta.pageDecor || null);
      const created = await api.publicOpenSession();
      setOpenUrl(created.openUrl);
      setExpiresAt(created.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("public.sessionError"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const title = (decor?.title || "").trim() || branchName || t("public.defaultTitle");
  const body = (decor?.bodyText || "").trim() || t("public.defaultBody");
  const images = decor?.images || [];
  const bottom = (decor?.bottomText || "").trim();
  const btnText = (decor?.buttonText || "").trim();
  const btnUrl = (decor?.buttonUrl || "").trim();

  return (
    <div className="public-wrap">
      <div className="public-top-bar" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
        <LanguageSwitcher />
        <Link className="btn ghost" to="/branch/login">
          {t("public.adminLogin")}
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
            <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{body}</p>
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
