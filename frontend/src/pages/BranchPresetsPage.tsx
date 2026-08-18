import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { api, type User } from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

type Row = { address: string; name: string };

const PRESET_COUNT = 2;

function fixedRows(list: Row[], count: number): Row[] {
  const rows = list.slice(0, count).map((x) => ({ address: x.address, name: x.name }));
  while (rows.length < count) rows.push({ address: "", name: "" });
  return rows;
}

export default function BranchPresetsPage({ user }: { user: User }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() => fixedRows([], PRESET_COUNT));
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const canEdit = user.role === "SUPER_ADMIN" || user.role === "EMPLOYEE";

  useEffect(() => {
    void api
      .listPresets()
      .then((list) => setRows(fixedRows(list, PRESET_COUNT)))
      .catch((err) => setError(err instanceof Error ? err.message : t("common.loadFailed")));
  }, [t]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setMsg("");
    setError("");
    try {
      await api.savePresets(rows);
      setMsg(t("presets.saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    }
  }

  return (
    <div>
      <PageIntro>
        <Trans
          i18nKey="presets.intro"
          components={{
            strong: <strong />,
            linkNetwork: <Link to="/branch/network" />,
            linkHelp: <Link to="/branch/help#help-presets" />,
          }}
        />
        <HelpTip text={t("presets.tip")} />
      </PageIntro>

      <form className="card" onSubmit={(e) => void save(e)}>
        <h2 style={{ marginTop: 0 }}>{t("presets.title")}</h2>
        <p className="muted">{t("presets.subtitle")}</p>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <input
              className="input"
              placeholder={t("presets.namePlaceholder")}
              value={row.name}
              disabled={!canEdit}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], name: e.target.value };
                setRows(next);
              }}
            />
            <input
              className="input"
              placeholder={t("presets.addressPlaceholder")}
              value={row.address}
              disabled={!canEdit}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], address: e.target.value.trim() };
                setRows(next);
              }}
            />
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        {msg && <p style={{ color: "var(--ok)" }}>{msg}</p>}
        {canEdit && (
          <button className="btn" type="submit">
            {t("common.save")}
          </button>
        )}
      </form>
    </div>
  );
}
