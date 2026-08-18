import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { api, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

export default function BranchNetworkPage({ user }: { user: User }) {
  const { t } = useTranslation();
  const [network, setNetwork] = useState<"mainnet" | "shasta">("shasta");
  const [draft, setDraft] = useState<"mainnet" | "shasta">("shasta");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const canEdit = user.role === "SUPER_ADMIN";

  useEffect(() => {
    void api
      .getNetworkSetting()
      .then((res) => {
        setNetwork(res.network);
        setDraft(res.network);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("common.loadFailed")));
  }, [t]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError("");
    setMsg("");
    try {
      const res = await api.setNetworkSetting(draft);
      setNetwork(res.network as "mainnet" | "shasta");
      setMsg(t("network.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    }
  }

  return (
    <div>
      <PageIntro>
        <Trans
          i18nKey="network.intro"
          components={{
            strong: <strong />,
            linkHelp: <Link to="/branch/help#help-network" />,
          }}
        />
      </PageIntro>
      <div className="card" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>{t("network.title")}</h2>
        <p className="muted">
          {t("network.current")}
          <span className="badge">{t(`network.${network}`)}</span>
          <span className="muted">（{network}）</span>
        </p>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          <Trans
            i18nKey="network.note"
            components={{ linkPresets: <Link to="/branch/presets" /> }}
          />
        </p>
        {!canEdit && <p className="muted">{t("network.readonly")}</p>}
        <form onSubmit={(e) => void save(e)} style={{ display: "grid", gap: "0.75rem" }}>
          <select
            className="input"
            value={draft}
            disabled={!canEdit}
            onChange={(e) => setDraft(e.target.value as "mainnet" | "shasta")}
          >
            <option value="shasta">{t("network.shasta")}</option>
            <option value="mainnet">{t("network.mainnet")}</option>
          </select>
          {error && <div className="error">{error}</div>}
          {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}
          {canEdit && (
            <div className="inline-actions">
              <button className="btn" type="submit" disabled={draft === network}>
                {t("network.save")}
              </button>
              <HelpTip text={t("network.tip")} />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
