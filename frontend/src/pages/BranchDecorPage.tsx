import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Trans, useTranslation } from "react-i18next";
import { api, type LandingInfo, type PageDecor, type PageDecorImage, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

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
  const { t } = useTranslation();
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
      .catch((err) => setError(err instanceof Error ? err.message : t("common.loadFailed")));
  }, [user.role, t]);

  const previewTitle = useMemo(
    () => draft.title.trim() || t("decor.previewDefaultTitle"),
    [draft.title, t]
  );
  const previewBody = useMemo(
    () => draft.bodyText.trim() || t("public.defaultBody"),
    [draft.bodyText, t]
  );

  const openUrl = useMemo(() => {
    if (landing?.openUrl) return landing.openUrl;
    if (landing?.url) {
      try {
        return `${new URL(landing.url).origin}/open`;
      } catch {
        /* fall through */
      }
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}/open`;
    }
    return "/open";
  }, [landing]);

  const slugUrl = landing?.url || "";

  if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") {
    return <div className="error">{t("common.noPermission")}</div>;
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
      setMsg(t("decor.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm(t("decor.resetConfirm"))) return;
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const saved = await api.resetPageDecor();
      setDraft(saved);
      setMsg(t("decor.resetDone"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("decor.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyEntry() {
    try {
      await navigator.clipboard.writeText(openUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("decor.copyFailed"));
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    if (draft.images.length >= 3) {
      setError(t("decor.maxImages"));
      return;
    }
    setError("");
    setUploading(true);
    try {
      const img = await api.uploadPageDecorImage(file);
      setDraft((d) => ({ ...d, images: [...d.images, img] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("decor.uploadFailed"));
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
        <Trans
          i18nKey="decor.intro"
          components={{
            strong: <strong />,
            linkHelp: <Link to="/branch/help#help-decor" />,
          }}
        />
      </PageIntro>
      <div className="decor-editor">
        <form className="card decor-form" onSubmit={(e) => void save(e)}>
          <h2 style={{ marginTop: 0 }}>{t("decor.title")}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("decor.subtitle")}
          </p>

          <div className="card" style={{ marginBottom: "1rem", padding: "0.85rem 1rem" }}>
            <div className="muted" style={{ marginBottom: "0.35rem" }}>
              {t("decor.entryTitle")}
            </div>
            <label className="muted">
              {t("decor.pathLabel")} <code>/p/</code>
              <input
                className="input"
                style={{ maxWidth: 220, display: "inline-block", marginLeft: 6 }}
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value.trim().toLowerCase())}
                placeholder={t("decor.pathPlaceholder")}
                title={t("decor.pathTitle")}
              />
            </label>
            {slugUrl && (
              <div
                className="muted"
                style={{
                  marginTop: "0.45rem",
                  wordBreak: "break-all",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.85rem",
                }}
              >
                {t("decor.slugUrlLabel")} {slugUrl}
              </div>
            )}
            <div
              style={{
                marginTop: "0.5rem",
                wordBreak: "break-all",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.9rem",
              }}
            >
              {t("decor.openEntryLabel")} {openUrl}
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginTop: "0.6rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span className="inline-actions">
                <button className="btn" type="button" onClick={() => void copyEntry()}>
                  {copied ? t("decor.copied") : t("decor.copyEntry")}
                </button>
                <HelpTip text={t("decor.entryTip")} />
              </span>
              <a className="btn ghost" href={openUrl} target="_blank" rel="noreferrer">
                {t("decor.preview")}
              </a>
            </div>
            <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              <Trans i18nKey="decor.entryNote" components={{ code: <code /> }} />
            </p>
          </div>

          <label className="muted">
            {t("decor.pageTitle")}
            <input
              className="input"
              maxLength={40}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>

          <label className="muted">
            {t("decor.bodyText")}
            <textarea
              className="input"
              rows={5}
              maxLength={500}
              value={draft.bodyText}
              onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
              placeholder={t("public.defaultBody")}
            />
          </label>

          <div>
            <div className="muted" style={{ marginBottom: "0.35rem" }}>
              {t("decor.images")}
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
                    placeholder={t("decor.imageLinkPlaceholder")}
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
                      {t("decor.moveUp")}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={i === draft.images.length - 1}
                      onClick={() => moveImage(img.id, 1)}
                    >
                      {t("decor.moveDown")}
                    </button>
                    <button className="btn ghost" type="button" onClick={() => removeImage(img.id)}>
                      {t("decor.remove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="muted">
            {t("decor.bottomText")}
            <textarea
              className="input"
              rows={2}
              maxLength={120}
              value={draft.bottomText}
              onChange={(e) => setDraft({ ...draft, bottomText: e.target.value })}
            />
          </label>

          <label className="muted">
            {t("decor.buttonText")}
            <input
              className="input"
              maxLength={40}
              value={draft.buttonText}
              onChange={(e) => setDraft({ ...draft, buttonText: e.target.value })}
              placeholder={t("decor.buttonTextPlaceholder")}
            />
          </label>
          <label className="muted">
            {t("decor.buttonUrl")}
            <input
              className="input"
              value={draft.buttonUrl}
              onChange={(e) => setDraft({ ...draft, buttonUrl: e.target.value })}
              placeholder={t("decor.buttonUrlPlaceholder")}
            />
          </label>

          {error && <div className="error">{error}</div>}
          {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <span className="inline-actions">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? t("common.saving") : t("common.save")}
              </button>
              <HelpTip text={t("decor.saveTip")} />
            </span>
            <span className="inline-actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void reset()}>
                {t("decor.reset")}
              </button>
              <HelpTip text={t("decor.resetTip")} />
            </span>
          </div>
        </form>

        <div className="card decor-preview">
          <h3 style={{ marginTop: 0 }}>{t("decor.previewTitle")}</h3>
          <div className="decor-preview-frame">
            <h1 style={{ textAlign: "center", fontSize: "1.1rem" }}>{previewTitle}</h1>
            <div className="home-qr" style={{ minHeight: "auto" }}>
              <div className="qr-box">
                <QRCodeSVG
                  value={openUrl || "https://example.com/open"}
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
                  {t("decor.previewEntryNote")}
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
