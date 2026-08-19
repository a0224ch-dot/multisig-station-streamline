import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Trans, useTranslation } from "react-i18next";
import {
  api,
  type LandingInfo,
  type PageDecorImage,
  type ScenarioItem,
  type User,
} from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

type Draft = {
  title: string;
  summary: string;
  bodyText: string;
  images: PageDecorImage[];
  refPrefix: string;
  templateHint: string;
  enabled: boolean;
};

function emptyDraft(): Draft {
  return {
    title: "",
    summary: "",
    bodyText: "",
    images: [],
    refPrefix: "scene",
    templateHint: "",
    enabled: true,
  };
}

function fromItem(s: ScenarioItem): Draft {
  return {
    title: s.title,
    summary: s.summary,
    bodyText: s.bodyText,
    images: s.images || [],
    refPrefix: s.refPrefix,
    templateHint: s.templateHint || "",
    enabled: s.enabled,
  };
}

export default function BranchScenariosPage({ user }: { user: User }) {
  const { t } = useTranslation();
  const [landing, setLanding] = useState<LandingInfo | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [customCount, setCustomCount] = useState(0);
  const [customLimit, setCustomLimit] = useState(20);
  const [writeOk, setWriteOk] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [copied, setCopied] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const isAdmin = user.role === "SUPER_ADMIN";
  const isMember = user.role === "MEMBER";
  const atLimit = customCount >= customLimit;
  const entryDisplayUrl = landing
    ? isMember
      ? landing.url
      : landing.openUrl || landing.url
    : "";

  async function reload() {
    const r = await api.getScenarios();
    setLanding(r.landing);
    setScenarios(r.scenarios);
    setCustomCount(r.customCount ?? 0);
    setCustomLimit(r.customLimit ?? 20);
  }

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : t("common.loadFailed"))
    );
    void api
      .licenseStatus()
      .then((s) => setWriteOk(s.accessMode === "full"))
      .catch(() => setWriteOk(true));
  }, [t]);

  function canEdit(s: ScenarioItem) {
    if (!writeOk) return false;
    if (isAdmin) return true;
    if (s.isBuiltin) return false;
    return s.createdById === user.id;
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt(t("scenarios.copyPrompt"), text);
    }
  }

  function startCreate() {
    if (!writeOk) {
      setError(t("scenarios.writeLocked"));
      return;
    }
    if (atLimit) {
      setError(t("scenarios.limitReached", { limit: customLimit }));
      return;
    }
    setEditingId("new");
    setDraft(emptyDraft());
    setError("");
    setMsg("");
  }

  function startEdit(s: ScenarioItem) {
    if (!canEdit(s)) {
      setError(t("scenarios.editDenied"));
      return;
    }
    setEditingId(s.id);
    setDraft(fromItem(s));
    setError("");
    setMsg("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!writeOk) {
      setError(t("scenarios.writeLocked"));
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      if (editingId === "new") {
        await api.createScenario(draft);
        setMsg(t("scenarios.created"));
      } else if (editingId) {
        await api.updateScenario(editingId, draft);
        setMsg(t("scenarios.saved"));
      }
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ScenarioItem) {
    if (!canEdit(s) || s.isBuiltin) return;
    if (!confirm(t("scenarios.deleteConfirm", { title: s.title }))) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteScenario(s.id);
      await reload();
      setMsg(t("scenarios.deleted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scenarios.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resetBuiltin(s: ScenarioItem) {
    if (!isAdmin || !s.isBuiltin || !writeOk) return;
    if (!confirm(t("scenarios.resetConfirm", { title: s.title }))) return;
    setBusy(true);
    try {
      await api.resetScenario(s.id);
      await reload();
      setMsg(t("scenarios.resetDone"));
      if (editingId === s.id) setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scenarios.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    if (draft.images.length >= 3) {
      setError(t("scenarios.maxImages"));
      return;
    }
    setUploading(true);
    setError("");
    try {
      const img = await api.uploadScenarioImage(file);
      setDraft((d) => ({ ...d, images: [...d.images, img] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scenarios.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const editingTitle = useMemo(() => {
    if (editingId === "new") return t("scenarios.newTitle");
    if (!editingId) return "";
    return scenarios.find((s) => s.id === editingId)?.title || t("scenarios.editTitle");
  }, [editingId, scenarios, t]);

  return (
    <div>
      <PageIntro>
        <Trans
          i18nKey={isMember ? "scenarios.memberIntro" : "scenarios.intro"}
          components={{
            strong: <strong />,
            code: <code />,
            linkDecor: <Link to="/branch/decor" />,
            linkHelp: (
              <Link
                to={isMember ? "/member/help#help-scenarios" : "/branch/help#help-scenarios"}
              />
            ),
          }}
        />
      </PageIntro>

      {error && <div className="error">{error}</div>}
      {msg && <div style={{ color: "var(--ok)", marginBottom: "0.75rem" }}>{msg}</div>}
      {!writeOk && (
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          {t("scenarios.writeLocked")}
        </p>
      )}

      {landing && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>{t("scenarios.entryTitle")}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            <Trans
              i18nKey={isMember ? "scenarios.memberEntryHint" : "scenarios.entryHint"}
              components={{
                code: <code />,
                linkDecor: <Link to="/branch/decor" />,
              }}
            />
          </p>
          <div
            style={{
              wordBreak: "break-all",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.9rem",
              marginBottom: "0.75rem",
            }}
          >
            {entryDisplayUrl}
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div className="qr-box" style={{ padding: 8 }}>
              <QRCodeSVG value={entryDisplayUrl} size={120} level="M" includeMargin />
            </div>
            <span className="inline-actions">
              <button
                className="btn"
                type="button"
                onClick={() => void copyText("entry", entryDisplayUrl)}
              >
                {copied === "entry" ? t("scenarios.copied") : t("scenarios.copyEntry")}
              </button>
              <HelpTip text={t("scenarios.entryTip")} />
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn"
          type="button"
          onClick={startCreate}
          disabled={busy || !writeOk || atLimit}
        >
          {t("scenarios.create")}
        </button>
        <span className="muted" style={{ fontSize: "0.9rem" }}>
          {t("scenarios.customCount", { count: customCount, limit: customLimit })}
        </span>
        <HelpTip text={t(isMember ? "scenarios.memberCreateTip" : "scenarios.createTip")} />
      </div>

      {editingId && (
        <form className="card" style={{ marginBottom: "1rem" }} onSubmit={(e) => void save(e)}>
          <h3 style={{ marginTop: 0 }}>{editingTitle}</h3>
          <label className="muted">
            {t("scenarios.fieldTitle")}
            <input
              className="input"
              maxLength={40}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
          </label>
          <label className="muted">
            {t("scenarios.fieldSummary")}
            <input
              className="input"
              maxLength={200}
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              required
            />
          </label>
          <label className="muted">
            {t("scenarios.fieldBody")}
            <textarea
              className="input"
              rows={6}
              maxLength={1200}
              value={draft.bodyText}
              onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
            />
          </label>
          <label className="muted">
            {t("scenarios.fieldRef")}
            <input
              className="input"
              maxLength={32}
              value={draft.refPrefix}
              onChange={(e) => setDraft({ ...draft, refPrefix: e.target.value.trim() })}
              required
            />
          </label>
          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            {t("scenarios.fieldEnabled")}
          </label>

          <div style={{ margin: "0.75rem 0" }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              {t("scenarios.fieldImages")}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading || draft.images.length >= 3 || !writeOk}
              onChange={(e) => void onUpload(e.target.files?.[0] || null)}
            />
            <div className="decor-img-list">
              {draft.images.map((img) => (
                <div key={img.id} className="decor-img-card">
                  <img src={img.url} alt="" />
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        images: d.images.filter((x) => x.id !== img.id),
                      }))
                    }
                  >
                    {t("scenarios.removeImage")}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy || !writeOk}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={busy}
              onClick={() => setEditingId(null)}
            >
              {t("scenarios.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="scenario-grid">
        {scenarios.map((s) => {
          const cover = s.images?.[0]?.url;
          const editable = canEdit(s);
          return (
            <div
              key={s.id}
              className={`card scenario-card${!s.enabled ? " scenario-card-off" : ""}`}
            >
              {cover ? (
                <img className="scenario-cover" src={cover} alt="" />
              ) : (
                <div className="scenario-cover scenario-cover-empty muted">
                  {t("scenarios.noCover")}
                </div>
              )}
              <div className="scenario-body">
                <h3 style={{ margin: "0 0 0.35rem" }}>
                  {s.title}
                  {s.isBuiltin && (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {t("scenarios.builtin")}
                    </span>
                  )}
                  {!s.enabled && (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {t("scenarios.disabled")}
                    </span>
                  )}
                </h3>
                <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                  {s.summary}
                </p>
                <p style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", margin: "0 0 0.5rem" }}>
                  {s.bodyText}
                </p>
                <p className="muted" style={{ fontSize: "0.8rem" }}>
                  {t("scenarios.createdBy", { name: s.createdByName || "—" })}
                </p>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: 8 }}>
                  <div className="qr-box" style={{ padding: 6 }}>
                    <QRCodeSVG value={s.sampleEntryUrl} size={100} level="M" includeMargin />
                  </div>
                  <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => void copyText(s.id, s.sampleEntryUrl)}
                    >
                      {copied === s.id ? t("scenarios.copied") : t("scenarios.copyScene")}
                    </button>
                    {editable && (
                      <button className="btn ghost" type="button" onClick={() => startEdit(s)}>
                        {t("scenarios.edit")}
                      </button>
                    )}
                    {editable && !s.isBuiltin && (
                      <button className="btn ghost" type="button" onClick={() => void remove(s)}>
                        {t("scenarios.delete")}
                      </button>
                    )}
                    {isAdmin && s.isBuiltin && writeOk && (
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => void resetBuiltin(s)}
                      >
                        {t("scenarios.reset")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!scenarios.length && <p className="muted">{t("scenarios.empty")}</p>}
      </div>
    </div>
  );
}
