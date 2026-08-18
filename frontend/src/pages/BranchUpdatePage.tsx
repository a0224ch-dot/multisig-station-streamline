import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { api, type User, type UpdateStatus } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

export default function BranchUpdatePage({ user }: { user: User }) {
  const { t } = useTranslation();
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "EMPLOYEE";
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.updateStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("update.statusReadFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (!canEdit) return;
    void refresh();
  }, [canEdit, refresh]);

  useEffect(() => {
    if (!canEdit || !status?.busy) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [canEdit, status?.busy, refresh]);

  async function onCheck() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await api.updateCheck();
      setMsg(
        res.updateAvailable
          ? t("update.foundVersion", { version: res.latest.version })
          : t("update.alreadyLatest")
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("update.checkFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!confirm(t("update.confirmApply"))) {
      return;
    }
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await api.updateApply();
      setMsg(res.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("update.applyFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="card">
        <p className="muted">{t("update.readonly")}</p>
      </div>
    );
  }

  const latest = status?.latest;
  const canApply =
    !!status?.latest &&
    !!status.targetVersion &&
    status.targetVersion !== status.currentVersion &&
    !status.busy &&
    !busy;

  function phaseLabel(phase: string) {
    return t(`update.phases.${phase}`, { defaultValue: phase });
  }

  return (
    <div>
      <PageIntro>
        <Trans
          i18nKey="update.intro"
          components={{
            strong: <strong />,
            linkHelp: <Link to="/branch/help#help-update" />,
          }}
        />
      </PageIntro>
      <div className="card" style={{ maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>{t("update.title")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("update.subtitle")}
        </p>

        <p>
          {t("update.currentVersion")}
          <span className="badge">{status?.currentVersion || "…"}</span>
          <br />
          {t("update.status")}
          <span className="badge">{status ? phaseLabel(status.phase) : "…"}</span>
          {status?.busy && <span className="muted"> {t("update.inProgress")}</span>}
        </p>

        {latest && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              background: "var(--panel-2, #f4f4f5)",
              borderRadius: 8,
            }}
          >
            <div>
              {t("update.latest")}
              <strong>{latest.version}</strong>
            </div>
            <p className="muted" style={{ margin: "0.5rem 0 0" }}>
              {t("update.notes")}
            </p>
          </div>
        )}

        {status?.message && (
          <p style={{ marginTop: 0 }}>{status.message}</p>
        )}

        {error && <div className="error">{error}</div>}
        {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="inline-actions">
            <button
              className="btn ghost"
              type="button"
              disabled={busy || !!status?.busy}
              onClick={() => void onCheck()}
            >
              {t("update.check")}
            </button>
            <HelpTip text={t("update.checkTip")} />
          </span>
          <span className="inline-actions">
            <button
              className="btn"
              type="button"
              disabled={busy || !canApply}
              onClick={() => void onApply()}
            >
              {t("update.apply")}
            </button>
            <HelpTip text={t("update.applyTip")} />
          </span>
          <button className="btn ghost" type="button" onClick={() => void refresh()}>
            {t("update.refresh")}
          </button>
        </div>

        {status?.logs && status.logs.length > 0 && (
          <pre
            style={{
              marginTop: "1rem",
              maxHeight: 240,
              overflow: "auto",
              fontSize: "0.8rem",
              background: "#111",
              color: "#ddd",
              padding: "0.75rem",
              borderRadius: 8,
            }}
          >
            {status.logs.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
