import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { api } from "../api";
import PageIntro from "../components/PageIntro";

export default function BranchWalletsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<
    {
      network: string;
      address: string;
      tier: string;
      channel: string;
      openedAt: string;
      openTxId?: string | null;
    }[]
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listWallets()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t("common.loadFailed")));
  }, [t]);

  function tierLabel(tier: string) {
    if (tier === "THREE_OF_FOUR") return t("wallets.tier34");
    if (tier === "THREE_OF_FIVE") return t("wallets.tier35Legacy");
    return t("wallets.tier23");
  }

  return (
    <div>
      <PageIntro>
        <Trans i18nKey="wallets.intro" components={{ strong: <strong /> }} />
      </PageIntro>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("wallets.title")}</h2>
        {error && <div className="error">{error}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>{t("wallets.channel")}</th>
              <th>{t("wallets.network")}</th>
              <th>{t("wallets.address")}</th>
              <th>{t("wallets.tier")}</th>
              <th>{t("wallets.time")}</th>
              <th>{t("wallets.tx")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.network}-${r.address}`}>
                <td>
                  {r.channel === "internal" ? t("wallets.channelInternal") : t("wallets.channelPublic")}
                </td>
                <td>{r.network}</td>
                <td>{r.address}</td>
                <td>{tierLabel(r.tier)}</td>
                <td>{new Date(r.openedAt).toLocaleString()}</td>
                <td>{r.openTxId || "-"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="muted">
                  {t("common.none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
