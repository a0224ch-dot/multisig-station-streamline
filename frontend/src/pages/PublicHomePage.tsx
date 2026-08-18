import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, type PageDecor } from "../api";

const DEFAULT_BODY =
  "此码用于钱包地址多签。扫码后将为本钱包开启多签权限，地址不变。";

const GUIDE_LINES = [
  "多签是给原钱包加多人权限，收款地址不变。",
  "TokenPocket / OKX / Bitget 可用钱包首页扫码；TronLink 请用「发现 / 浏览器」打开链接。",
  "开通码有时效；过期点「刷新开通码」。",
];

export default function PublicHomePage() {
  const [openUrl, setOpenUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [network, setNetwork] = useState("");
  const [branchName, setBranchName] = useState("");
  const [decor, setDecor] = useState<PageDecor | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      setError(err instanceof Error ? err.message : "无法生成开通码");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const title = (decor?.title || "").trim() || branchName || "钱包地址多签";
  const body = (decor?.bodyText || "").trim() || DEFAULT_BODY;
  const images = decor?.images || [];
  const bottom = (decor?.bottomText || "").trim();
  const btnText = (decor?.buttonText || "").trim();
  const btnUrl = (decor?.buttonUrl || "").trim();

  return (
    <div className="public-wrap">
      <div className="public-top-bar" style={{ justifyContent: "flex-end" }}>
        <Link className="btn ghost" to="/branch/login">
          管理登录
        </Link>
      </div>

      <h1 style={{ textAlign: "center", fontSize: "1.25rem" }}>{title}</h1>

      <div className="card public-guide">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>多签钱包 · 怎么用</h2>
        <ol style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--muted)" }}>
          {GUIDE_LINES.map((line) => (
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
              当前网络：<span className="badge">{network || "…"}</span>
              {expiresAt && (
                <>
                  <br />
                  有效至：{new Date(expiresAt).toLocaleString()}
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
              {busy ? "生成中…" : "刷新开通码"}
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
