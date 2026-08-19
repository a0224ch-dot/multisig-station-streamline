import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";

export default function LicenseBanner({ buyHref }: { buyHref?: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof api.licenseStatus>
  > | null>(null);

  useEffect(() => {
    void api
      .licenseStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    const id = setInterval(() => {
      void api.licenseStatus().then(setStatus).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!status || status.accessMode === "full") return null;

  const until = status.subscriptionUntil
    ? new Date(status.subscriptionUntil).toLocaleString()
    : null;

  const tone =
    status.accessMode === "blocked"
      ? "var(--danger, #c0392b)"
      : "var(--warn, #b8860b)";

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${tone}`,
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
      }}
    >
      <strong style={{ color: tone }}>
        {status.accessMode === "blocked"
          ? t("license.blockedTitle")
          : t("license.limitedTitle")}
      </strong>
      <p className="muted" style={{ margin: "0.35rem 0 0.5rem" }}>
        {status.licenseMessage ||
          (status.accessMode === "blocked"
            ? t("license.blockedDefault")
            : t("license.limitedDefault"))}
      </p>
      {until && (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          {t("license.until", { date: until })}
        </p>
      )}
      {status.accessMode === "limited" && buyHref && (
        <p style={{ margin: "0.5rem 0 0" }}>
          <Link to={buyHref}>{t("license.buyCard")}</Link>
          {" · "}
          {t("license.priceHint", { price: status.monthlyPriceUsdt })}
        </p>
      )}
    </div>
  );
}
