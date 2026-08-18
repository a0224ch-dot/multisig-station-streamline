import { FormEvent, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { api, type OpenWalletOption, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";
import { localizedWalletHint } from "../walletHints";

export default function BranchOpenWalletsPage({ user }: { user: User }) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<OpenWalletOption[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") return;
    void api
      .getOpenWalletsSetting()
      .then((r) => {
        setCatalog(r.catalog);
        setEnabled(r.enabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("common.loadFailed")));
  }, [user.role, t]);

  if (user.role !== "SUPER_ADMIN" && user.role !== "EMPLOYEE") {
    return <div className="error">{t("common.noPermission")}</div>;
  }

  function toggle(id: string) {
    setEnabled((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!enabled.length) {
      setError(t("openWallets.minOne"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.saveOpenWalletsSetting(enabled);
      setEnabled(res.enabled);
      setMsg(t("openWallets.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro>
        <Trans i18nKey="openWallets.intro" components={{ strong: <strong /> }} />
      </PageIntro>
      <form
        className="card"
        onSubmit={(e) => void save(e)}
        style={{ maxWidth: 640, display: "grid", gap: "0.75rem" }}
      >
        <h2 style={{ marginTop: 0 }}>{t("openWallets.title")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("openWallets.subtitle")}
        </p>
        <div className="wallet-check-list">
          {catalog.map((w) => (
            <label key={w.id} className="wallet-check">
              <input
                type="checkbox"
                checked={enabled.includes(w.id)}
                onChange={() => toggle(w.id)}
              />
              <span>
                <strong>{w.name}</strong>
                <span className="muted"> — {localizedWalletHint(w.id, w.hint, t)}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}
        <div className="inline-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
          <HelpTip text={t("openWallets.tip")} />
        </div>
      </form>
    </div>
  );
}
