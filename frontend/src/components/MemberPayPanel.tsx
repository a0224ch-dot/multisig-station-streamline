import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { api, type MemberPayOrder } from "../api";

export default function MemberPayPanel({
  orderType,
  onPaid,
}: {
  orderType: "REGISTER" | "RENEW";
  onPaid?: (order: MemberPayOrder) => void;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<MemberPayOrder | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshOrder = useCallback(
    async (orderId: string) => {
      const res = await api.memberOrderStatus(orderId);
      setOrder(res.order);
      if (res.order.status === "PAID") {
        setMsg(
          orderType === "REGISTER"
            ? t("memberBilling.registerPaid", { code: res.order.registerCode || "—" })
            : t("memberBilling.renewPaid")
        );
        onPaid?.(res.order);
      }
      return res.order;
    },
    [onPaid, orderType, t]
  );

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
      const res = await api.createMemberOrder(orderType);
      setOrder(res.order);
      setMsg(t("memberBilling.orderCreated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("memberBilling.orderFailed"));
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

  const orderPending = order?.status === "PENDING";

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {msg && <div style={{ color: "var(--ok)", marginBottom: "0.75rem" }}>{msg}</div>}

      {!orderPending && (
        <button className="btn" type="button" disabled={busy} onClick={() => void onCreateOrder()}>
          {busy ? t("memberBilling.creatingOrder") : t("memberBilling.buyNow")}
        </button>
      )}

      {order && (
        <div
          className="card"
          style={{
            marginTop: "1rem",
            background: "var(--surface-2, rgba(0,0,0,0.03))",
          }}
        >
          <h3 style={{ marginTop: 0 }}>{t("memberBilling.orderTitle")}</h3>
          <table className="table">
            <tbody>
              <tr>
                <th>{t("license.orderStatus")}</th>
                <td>{t(`license.order.${order.status}`)}</td>
              </tr>
              <tr>
                <th>{t("license.payAmount")}</th>
                <td>
                  <strong>{order.amountUsdt} USDT</strong>{" "}
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      void copyText(String(order.amountUsdt), t("license.copiedAmount"))
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
                      void copyText(order.payToAddress, t("license.copiedAddress"))
                    }
                  >
                    {t("license.copyAddress")}
                  </button>
                  {orderPending && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <QRCodeSVG value={order.payToAddress} size={140} level="M" includeMargin />
                    </div>
                  )}
                </td>
              </tr>
              <tr>
                <th>{t("license.network")}</th>
                <td>{order.network}</td>
              </tr>
              <tr>
                <th>{t("license.orderExpires")}</th>
                <td>{new Date(order.expiresAt).toLocaleString()}</td>
              </tr>
              {order.registerCode && (
                <tr>
                  <th>{t("memberBilling.registerCodeLabel")}</th>
                  <td>
                    <code>{order.registerCode}</code>{" "}
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() =>
                        void copyText(order.registerCode!, t("memberBilling.codeCopied"))
                      }
                    >
                      {t("memberBilling.copyCode")}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted">{t("memberBilling.payHint")}</p>
          {order.status !== "PENDING" && (
            <button className="btn ghost" type="button" onClick={() => void onCreateOrder()}>
              {t("license.retryOrder")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
