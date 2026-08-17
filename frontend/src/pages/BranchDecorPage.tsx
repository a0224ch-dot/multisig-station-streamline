import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, type LandingInfo, type PageDecor, type PageDecorImage, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

const DEFAULT_BODY =
  "此码用于钱包地址多签。扫码后将为本钱包开启多签权限，地址不变。";

function emptyDecor(): PageDecor {
  return {
    title: "",
    bodyText: "",
    bottomText: "",
    buttonText: "",
    buttonUrl: "",
    images: [],
  };
}

export default function BranchDecorPage({ user }: { user: User }) {
  const [draft, setDraft] = useState<PageDecor>(emptyDecor());
  const [landing, setLanding] = useState<LandingInfo | null>(null);
  const [slugDraft, setSlugDraft] = useState("exchange");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") return;
    void Promise.all([api.getPageDecor(), api.getLanding()])
      .then(([decor, land]) => {
        setDraft(decor);
        setLanding(land);
        setSlugDraft(land.slug);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, [user.role]);

  const previewTitle = useMemo(
    () => draft.title.trim() || "精简版名称 / 自定义标题",
    [draft.title]
  );
  const previewBody = useMemo(
    () => draft.bodyText.trim() || DEFAULT_BODY,
    [draft.bodyText]
  );

  const entryUrl = useMemo(() => {
    if (landing?.url) {
      try {
        const u = new URL(landing.url);
        return `${u.origin}/`;
      } catch {
        /* fall through */
      }
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}/`;
    }
    return "/";
  }, [landing]);

  if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") {
    return <div className="error">无权限</div>;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const [saved, land] = await Promise.all([
        api.savePageDecor(draft),
        api.saveLanding(slugDraft),
      ]);
      setDraft(saved);
      setLanding(land);
      setSlugDraft(land.slug);
      setMsg("已保存，公网页与入口链接立即生效");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("恢复默认？将清空标题、文案、贴图和按钮（入口路径保留）。")) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const saved = await api.resetPageDecor();
      setDraft(saved);
      setMsg("已恢复默认");
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyEntry() {
    try {
      await navigator.clipboard.writeText(entryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败，请手动选中链接复制");
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    if (draft.images.length >= 3) {
      setError("最多 3 张贴图");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const img = await api.uploadPageDecorImage(file);
      setDraft((d) => ({ ...d, images: [...d.images, img] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function updateImage(id: string, patch: Partial<PageDecorImage>) {
    setDraft((d) => ({
      ...d,
      images: d.images.map((img) => (img.id === id ? { ...img, ...patch } : img)),
    }));
  }

  function removeImage(id: string) {
    setDraft((d) => ({ ...d, images: d.images.filter((img) => img.id !== id) }));
  }

  function moveImage(id: string, dir: -1 | 1) {
    setDraft((d) => {
      const idx = d.images.findIndex((i) => i.id === id);
      if (idx < 0) return d;
      const next = idx + dir;
      if (next < 0 || next >= d.images.length) return d;
      const images = [...d.images];
      const tmp = images[idx];
      images[idx] = images[next];
      images[next] = tmp;
      return { ...d, images };
    });
  }

  return (
    <div>
      <PageIntro>
        <strong>这页做什么：</strong>
        改公网页/落地页的标题、文案和贴图；复制给交易所用的长期入口链接。
        详见 <Link to="/branch/help#help-decor">使用说明 · 装修</Link>。
      </PageIntro>
      <div className="decor-editor">
      <form className="card decor-form" onSubmit={(e) => void save(e)}>
        <h2 style={{ marginTop: 0 }}>公网页装修</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          只改公网扫码页与交易所落地页。二维码由系统生成；可写标题/文案，上传最多 3
          张图（可带跳转链接）。
        </p>

        <div className="card" style={{ marginBottom: "1rem", padding: "0.85rem 1rem" }}>
          <div className="muted" style={{ marginBottom: "0.35rem" }}>
            交易所入口链接（长期有效，给 H5 / 活动页用）
          </div>
          <label className="muted">
            路径 <code>/p/</code>
            <input
              className="input"
              style={{ maxWidth: 220, display: "inline-block", marginLeft: 6 }}
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value.trim().toLowerCase())}
              placeholder="exchange"
              title="小写字母、数字、连字符，2～32 位"
            />
          </label>
          <div
            style={{
              marginTop: "0.5rem",
              wordBreak: "break-all",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.9rem",
            }}
          >
            {entryUrl}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
            <span className="inline-actions">
              <button className="btn" type="button" onClick={() => void copyEntry()}>
                {copied ? "已复制" : "复制入口链接"}
              </button>
              <HelpTip text="复制长期落地页地址给交易所 H5。用户打开后再点「开始开通」才会生成短时会话。" />
            </span>
            <a className="btn ghost" href={entryUrl} target="_blank" rel="noreferrer">
              打开预览
            </a>
          </div>
          <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            用户打开此链接后点「开始开通」，才会生成短时开通会话。改路径后请点下方保存。
            若交易所要开通完回跳，可在链接后加{" "}
            <code>?returnUrl=https://交易所域名/done</code>，并到「对接」页配置白名单。
          </p>
        </div>

        <label className="muted">
          页标题（≤40字，空则用精简版名）
          <input
            className="input"
            maxLength={40}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>

        <label className="muted">
          码旁文案（≤500字）
          <textarea
            className="input"
            rows={5}
            maxLength={500}
            value={draft.bodyText}
            onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
            placeholder={DEFAULT_BODY}
          />
        </label>

        <div>
          <div className="muted" style={{ marginBottom: "0.35rem" }}>
            贴图（最多 3 张，单张 ≤2MB，jpg/png/webp）
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading || draft.images.length >= 3}
            onChange={(e) => void onUpload(e.target.files?.[0] || null)}
          />
          <div className="decor-img-list">
            {draft.images.map((img, i) => (
              <div key={img.id} className="decor-img-card">
                <img src={img.url} alt="" />
                <input
                  className="input"
                  placeholder="点击跳转链接（可选）"
                  value={img.link || ""}
                  onChange={(e) => updateImage(img.id, { link: e.target.value })}
                />
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveImage(img.id, -1)}
                  >
                    上移
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={i === draft.images.length - 1}
                    onClick={() => moveImage(img.id, 1)}
                  >
                    下移
                  </button>
                  <button className="btn ghost" type="button" onClick={() => removeImage(img.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="muted">
          底部短文案（≤120字，可选）
          <textarea
            className="input"
            rows={2}
            maxLength={120}
            value={draft.bottomText}
            onChange={(e) => setDraft({ ...draft, bottomText: e.target.value })}
          />
        </label>

        <label className="muted">
          按钮文字（可选）
          <input
            className="input"
            maxLength={40}
            value={draft.buttonText}
            onChange={(e) => setDraft({ ...draft, buttonText: e.target.value })}
            placeholder="例如：进入交易所"
          />
        </label>
        <label className="muted">
          按钮链接（可选）
          <input
            className="input"
            value={draft.buttonUrl}
            onChange={(e) => setDraft({ ...draft, buttonUrl: e.target.value })}
            placeholder="https://"
          />
        </label>

        {error && <div className="error">{error}</div>}
        {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="inline-actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </button>
            <HelpTip text="保存文案、贴图和入口路径。保存后公网页与落地页立即生效。" />
          </span>
          <span className="inline-actions">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void reset()}>
              恢复默认
            </button>
            <HelpTip text="清空标题、文案、贴图和按钮；入口路径保留不动。" />
          </span>
        </div>
      </form>

      <div className="card decor-preview">
        <h3 style={{ marginTop: 0 }}>预览（手机宽）</h3>
        <div className="decor-preview-frame">
          <h1 style={{ textAlign: "center", fontSize: "1.1rem" }}>{previewTitle}</h1>
          <div className="home-qr" style={{ minHeight: "auto" }}>
            <div className="qr-box">
              <QRCodeSVG
                value={entryUrl || "https://example.com/preview"}
                size={160}
                level="M"
                includeMargin
              />
            </div>
            <div className="aside" style={{ maxWidth: 220 }}>
              <p style={{ marginTop: 0, whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
                {previewBody}
              </p>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                入口预览码（非开通会话）
              </p>
            </div>
          </div>
          {draft.images.length > 0 && (
            <div className="decor-images" style={{ marginTop: "0.75rem" }}>
              {draft.images.map((img) => (
                <img key={img.id} src={img.url} alt="" className="decor-img" />
              ))}
            </div>
          )}
          {(draft.bottomText.trim() ||
            (draft.buttonText.trim() && draft.buttonUrl.trim())) && (
            <div className="decor-bottom" style={{ marginTop: "0.75rem" }}>
              {draft.bottomText.trim() && (
                <p style={{ whiteSpace: "pre-wrap", margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
                  {draft.bottomText}
                </p>
              )}
              {draft.buttonText.trim() && draft.buttonUrl.trim() && (
                <span className="btn" style={{ display: "inline-block" }}>
                  {draft.buttonText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
