import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { api, type LicenseOrder, type User } from "../api";

export default function BranchSubscriptionPage({ user: _user }: { user: User }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof api.licenseStatus>
  > | null>(null);
  const [order, setOrder] = useState<LicenseOrder | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshLicense = useCallback(async (sync = false) => {
    const s = await api.licenseStatus({ sync });
    setStatus(s);
    return s;
  }, []);

  const refreshOrder = useCallback(async (orderId: string) => {
    const res = await api.licenseOrderStatus(orderId);
    setOrder(res.order);
    if (res.order.status === "PAID") {
      await refreshLicense();
      setMsg(t("license.paySuccess"));
    }
    return res.order;
  }, [refreshLicense, t]);

  useEffect(() => {
    void refreshLicense(true).catch((e) =>
      setError(e instanceof Error ? e.message : t("common.loadFailed"))
    );
    const id = setInterval(() => {
      void refreshLicense(true).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshLicense, t]);

  useEffect(() => {
    if (!order || order.status !== "PENDING") return;
    const timer = setInterval(() => {
      void refreshOrder(order.id).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [order, refreshOrder]);

  async function onCreateOrder() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await api.createLicenseOrder();
      setOrder(res.order);
      setMsg(t("license.orderCreated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("license.orderFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(okMsg);
    } catch {
      setError(t("license.copyFailed"));
    }
  }

  const canPay = status?.paymentEnabled && status?.hqConfigured;
  const orderPending = order?.status === "PENDING";

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("license.pageTitle")}</h2>
        {error && <div className="error">{error}</div>}
        {msg && <div style={{ color: "var(--ok)" }}>{msg}</div>}
        {status && (
          <>
            <p className="muted">{t("license.pageIntro")}</p>
            <table className="table">
              <tbody>
                <tr>
                  <th>{t("license.status")}</th>
                  <td>{t(`license.mode.${status.accessMode}`)}</td>
                </tr>
                <tr>
                  <th>{t("license.plan")}</th>
                  <td>{status.plan}</td>
                </tr>
                <tr>
                  <th>{t("license.untilLabel")}</th>
                  <td>
                    {status.subscriptionUntil
                      ? new Date(status.subscriptionUntil).toLocaleString()
                      : t("common.none")}
                  </td>
                </tr>
                <tr>
                  <th>{t("license.monthlyPrice")}</th>
                  <td>{status.monthlyPriceUsdt} USDT</td>
                </tr>
              </tbody>
            </table>

            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                gap: "0.75rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {status.lastSyncAt && (
                <span className="muted" style={{ fontSize: "0.9rem" }}>
                  {t("license.lastSync", {
                    time: new Date(status.lastSyncAt).toLocaleString(),
                  })}
                </span>
              )}
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void refreshLicense(true)
                    .then(() => setMsg(t("license.syncOk")))
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : t("common.loadFailed"))
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {t("license.syncNow")}
              </button>
            </div>

            {canPay && !orderPending && (
              <div style={{ marginTop: "1rem" }}>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => void onCreateOrder()}
                >
                  {busy ? t("license.creatingOrder") : t("license.buyNow")}
                </button>
              </div>
            )}

            {!canPay && (
              <p className="muted" style={{ marginTop: "1rem" }}>
                {t("license.paymentNotConfigured")}
              </p>
            )}

            {order && (
              <div
                className="card"
                style={{
                  marginTop: "1rem",
                  background: "var(--surface-2, rgba(0,0,0,0.03))",
                }}
              >
                <h3 style={{ marginTop: 0 }}>{t("license.orderTitle")}</h3>
                <table className="table">
                  <tbody>
                    <tr>
                      <th>{t("license.orderStatus")}</th>
                      <td>{t(`license.order.${order.status}`)}</td>
                    </tr>
                    <tr>
                      <th>{t("license.payAmount")}</th>
                      <td>
                        <strong>{order.amountUsdt} USDT</strong>
                        {" "}
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() =>
                            void copyText(
                              String(order.amountUsdt),
                              t("license.copiedAmount")
                            )
                          }
                        >
                          {t("license.copyAmount")}
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <th>{t("license.payAddress")}</th>
                      <td style={{ wordBreak: "break-all" }}>
                        {order.payToAddress}{" "}
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() =>
                            void copyText(
                              order.payToAddress,
                              t("license.copiedAddress")
                            )
                          }
                        >
                          {t("license.copyAddress")}
                        </button>
                        {order.status === "PENDING" && (
                          <div style={{ marginTop: "0.5rem" }}>
                            <QRCodeSVG value={order.payToAddress} size={140} level="M" includeMargin />
                          </div>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th>{t("license.network")}</th>
                      <td>TRON {order.network}</td>
                    </tr>
                    <tr>
                      <th>{t("license.orderExpires")}</th>
                      <td>{new Date(order.expiresAt).toLocaleString()}</td>
                    </tr>
                    {order.txId && (
                      <tr>
                        <th>TxID</th>
                        <td style={{ wordBreak: "break-all" }}>{order.txId}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {order.status === "PENDING" && (
                  <p className="muted">{t("license.payHint")}</p>
                )}
                {order.status === "EXPIRED" && (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => void onCreateOrder()}
                  >
                    {t("license.retryOrder")}
                  </button>
                )}
              </div>
            )}

            <div className="card" style={{ marginTop: "1rem" }}>
              <h3 style={{ marginTop: 0 }}>{t("license.manualTitle")}</h3>
              <p className="muted">{t("license.manualBody")}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
