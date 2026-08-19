import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";
import MemberPayPanel from "../components/MemberPayPanel";

export default function MemberBuyRegisterPage() {
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

  return (
    <div className="login-wrap">
      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
        <LanguageSwitcher />
      </div>
      <div className="card login-card" style={{ maxWidth: 560 }}>
        <h1>{t("memberBilling.buyRegisterTitle")}</h1>
        {error && <div className="error">{error}</div>}
        {meta && !meta.payEnabled && (
          <p className="muted">{t("memberBilling.payDisabled")}</p>
        )}
        {meta && meta.payEnabled && (
          <>
            <p className="muted">
              {t("memberBilling.buyRegisterIntro", {
                price: meta.regPriceUsdt,
                days: meta.regGrantDays,
              })}
            </p>
            <MemberPayPanel orderType="REGISTER" />
          </>
        )}
        <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <Link to="/member/register">{t("member.registerLink")}</Link>
          {" · "}
          <Link to="/">{t("member.backHome")}</Link>
        </p>
      </div>
    </div>
  );
}
