import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type User } from "../api";
import MemberPayPanel from "../components/MemberPayPanel";

export default function MemberSubscriptionPage({
  user,
  onUserUpdate,
}: {
  user: User;
  onUserUpdate?: (u: User) => void;
}) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof api.memberBillingMeta>> | null>(
    null
  );
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .memberBillingMeta()
      .then(setMeta)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.loadFailed")));
  }, [t]);

  async function refreshMe() {
    const me = await api.me();
    onUserUpdate?.(me);
  }

  const expiresLabel = user.memberExpiresAt
    ? new Date(user.memberExpiresAt).toLocaleString()
    : t("memberBilling.unlimited");

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("memberBilling.renewTitle")}</h2>
        {error && <div className="error">{error}</div>}
        <p className="muted">{t("memberBilling.renewIntro")}</p>
        <table className="table">
          <tbody>
            <tr>
              <th>{t("memberBilling.expiresLabel")}</th>
              <td>{expiresLabel}</td>
            </tr>
            <tr>
              <th>{t("memberBilling.statusLabel")}</th>
              <td>
                {user.subscriptionActive === false
                  ? t("memberBilling.expired")
                  : t("memberBilling.active")}
              </td>
            </tr>
            {meta && (
              <tr>
                <th>{t("memberBilling.renewPriceLabel")}</th>
                <td>
                  {meta.renewPriceUsdt} USDT / {meta.renewGrantDays} {t("memberBilling.days")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {meta && !meta.payEnabled && (
          <p className="muted" style={{ marginTop: "1rem" }}>
            {t("memberBilling.payDisabledRenew")}
          </p>
        )}
        {meta?.payEnabled && (
          <div style={{ marginTop: "1rem" }}>
            <MemberPayPanel orderType="RENEW" onPaid={() => void refreshMe()} />
          </div>
        )}
      </div>
    </div>
  );
}
