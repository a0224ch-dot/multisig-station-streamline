import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  api,
  type MemberBillingSettings,
  type MemberRegisterCodeRow,
  type MemberRegisterMode,
  type User,
} from "../api";
import HelpTip from "../components/HelpTip";
import PageIntro from "../components/PageIntro";

type MemberRow = {
  id: string;
  username: string;
  displayName?: string | null;
  active: boolean;
  memberCode?: string | null;
  memberExpiresAt?: string | null;
  subscriptionActive?: boolean;
  createdAt: string;
};

export default function BranchMembersPage({ user }: { user: User }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [mode, setMode] = useState<MemberRegisterMode>("off");
  const [modeDraft, setModeDraft] = useState<MemberRegisterMode>("off");
  const [billing, setBilling] = useState<MemberBillingSettings | null>(null);
  const [codes, setCodes] = useState<MemberRegisterCodeRow[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetLabel, setResetLabel] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [genCount, setGenCount] = useState(5);
  const canEdit = user.role === "SUPER_ADMIN";

  async function load() {
    const [list, reg, bill, codeRows] = await Promise.all([
      api.listMembers(),
      api.getMemberRegister(),
      api.getMemberBilling(),
      api.listMemberCodes(),
    ]);
    setRows(list);
    setMode(reg.mode);
    setModeDraft(reg.mode);
    setBilling({
      ...bill,
      universalCode: bill.universalCode ?? "",
      universalCodeEnabled: Boolean(bill.universalCodeEnabled),
    });
    setCodes(codeRows);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : t("common.loadFailed"))
    );
  }, [t]);

  async function saveMode(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await api.setMemberRegister({ mode: modeDraft });
      setMode(r.mode);
      setModeDraft(r.mode);
      setMsg(t(`members.modeSaved.${r.mode}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveBilling(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !billing) return;
    if (billing.payEnabled && !billing.payAddress.trim()) {
      setError(t("members.payAddressRequired"));
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const saved = await api.saveMemberBilling({
        regPriceUsdt: billing.regPriceUsdt,
        renewPriceUsdt: billing.renewPriceUsdt,
        regGrantDays: billing.regGrantDays,
        renewGrantDays: billing.renewGrantDays,
        payEnabled: billing.payEnabled,
        payAddress: billing.payAddress,
        orderTtlMinutes: billing.orderTtlMinutes,
      });
      setBilling(saved);
      setMsg(t("members.billingSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveUniversal(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !billing) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const saved = await api.saveMemberBilling({
        universalCodeEnabled: billing.universalCodeEnabled,
        universalCode: billing.universalCode,
      });
      setBilling(saved);
      setMsg(t("members.universalSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateUniversal() {
    if (!canEdit || !billing) return;
    if (!window.confirm(t("members.regenerateUniversalConfirm"))) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const saved = await api.saveMemberBilling({ regenerateUniversalCode: true });
      setBilling(saved);
      setMsg(t("members.universalRegenerated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyUniversal() {
    if (!billing?.universalCode) return;
    try {
      await navigator.clipboard.writeText(billing.universalCode);
      setMsg(t("members.universalCopied"));
    } catch {
      setError(t("members.universalCopyFailed"));
    }
  }

  async function generateCodes() {
    if (!canEdit) return;
    setBusy(true);
    setError("");
    try {
      await api.generateMemberCodes({ count: genCount });
      const codeRows = await api.listMemberCodes();
      setCodes(codeRows);
      setMsg(t("members.codesGenerated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function extendMember(row: MemberRow, days: number) {
    if (!canEdit) return;
    setBusy(true);
    setError("");
    try {
      await api.extendMember(row.id, days);
      await load();
      setMsg(t("members.extended", { name: row.displayName || row.username, days }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: MemberRow) {
    if (!canEdit) return;
    const next = !row.active;
    if (
      !window.confirm(
        next
          ? t("members.enableConfirm", { name: row.displayName || row.username })
          : t("members.disableConfirm", { name: row.displayName || row.username })
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.setMemberActive(row.id, next);
      await load();
      setMsg(next ? t("members.enabled") : t("members.disabled"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetId || !canEdit) return;
    if (resetPassword.length < 6) {
      setError(t("password.minLength"));
      return;
    }
    if (resetPassword !== resetConfirm) {
      setError(t("password.mismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.resetUserPassword(resetId, resetPassword);
      setMsg(t("members.resetOk", { name: resetLabel }));
      setResetId(null);
      setResetPassword("");
      setResetConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("members.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro>
        {t("members.intro")}
        <HelpTip text={t("members.tip")} />
      </PageIntro>
      {error && <div className="error">{error}</div>}
      {msg && <div style={{ color: "var(--ok)", marginBottom: "0.75rem" }}>{msg}</div>}

      <form className="card" style={{ marginBottom: "1rem" }} onSubmit={(e) => void saveMode(e)}>
        <h2 style={{ marginTop: 0 }}>{t("members.registerTitle")}</h2>
        <p className="muted">{t("members.registerHint")}</p>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {(["off", "open", "code_required"] as MemberRegisterMode[]).map((m) => (
            <label key={m} className="muted" style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="radio"
                name="memberMode"
                checked={modeDraft === m}
                disabled={!canEdit || busy}
                onChange={() => setModeDraft(m)}
              />
              {t(`members.mode.${m}`)}
            </label>
          ))}
        </div>
        {canEdit && (
          <button
            className="btn"
            type="submit"
            disabled={busy || modeDraft === mode}
            style={{ marginTop: "0.75rem" }}
          >
            {busy ? t("common.saving") : t("members.saveRegister")}
          </button>
        )}
      </form>

      {billing && (
        <form
          className="card"
          style={{ marginBottom: "1rem" }}
          onSubmit={(e) => void saveUniversal(e)}
        >
          <h2 style={{ marginTop: 0 }}>{t("members.universalTitle")}</h2>
          <p className="muted">{t("members.universalHint")}</p>
          {mode !== "code_required" && (
            <p className="error" style={{ marginBottom: "0.75rem" }}>
              {t("members.universalNeedCodeRequired")}
            </p>
          )}
          <label className="muted" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={billing.universalCodeEnabled}
              disabled={!canEdit || busy}
              onChange={(e) =>
                setBilling({ ...billing, universalCodeEnabled: e.target.checked })
              }
            />
            {t("members.universalEnabled")}
          </label>
          <label style={{ display: "block", marginTop: "0.75rem", maxWidth: 420 }}>
            <span className="muted">{t("members.universalCode")}</span>
            <input
              className="input"
              value={billing.universalCode}
              disabled={!canEdit || busy}
              onChange={(e) =>
                setBilling({
                  ...billing,
                  universalCode: e.target.value.toUpperCase().replace(/\s+/g, ""),
                })
              }
              placeholder={t("members.universalCodePlaceholder")}
              maxLength={24}
              autoComplete="off"
            />
          </label>
          {canEdit && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? t("common.saving") : t("members.saveUniversal")}
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => void regenerateUniversal()}
              >
                {t("members.regenerateUniversal")}
              </button>
              {billing.universalCode && (
                <button
                  className="btn ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void copyUniversal()}
                >
                  {t("members.copyUniversal")}
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {billing && (
        <form className="card" style={{ marginBottom: "1rem" }} onSubmit={(e) => void saveBilling(e)}>
          <h2 style={{ marginTop: 0 }}>{t("members.billingTitle")}</h2>
          <p className="muted">{t("members.billingHint")}</p>
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 560 }}>
            <label>
              <span className="muted">{t("members.payAddress")}</span>
              <input
                className="input"
                value={billing.payAddress}
                disabled={!canEdit || busy}
                onChange={(e) => setBilling({ ...billing, payAddress: e.target.value })}
                placeholder="T..."
              />
            </label>
            <label className="muted" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={billing.payEnabled}
                disabled={!canEdit || busy}
                onChange={(e) => setBilling({ ...billing, payEnabled: e.target.checked })}
              />
              {t("members.payEnabled")}
            </label>
            <label>
              <span className="muted">{t("members.regPrice")}</span>
              <input
                className="input"
                type="number"
                step="0.01"
                min={0.01}
                value={billing.regPriceUsdt}
                disabled={!canEdit || busy}
                onChange={(e) =>
                  setBilling({ ...billing, regPriceUsdt: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span className="muted">{t("members.renewPrice")}</span>
              <input
                className="input"
                type="number"
                step="0.01"
                min={0.01}
                value={billing.renewPriceUsdt}
                disabled={!canEdit || busy}
                onChange={(e) =>
                  setBilling({ ...billing, renewPriceUsdt: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span className="muted">{t("members.regGrantDays")}</span>
              <input
                className="input"
                type="number"
                min={1}
                value={billing.regGrantDays}
                disabled={!canEdit || busy}
                onChange={(e) =>
                  setBilling({ ...billing, regGrantDays: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span className="muted">{t("members.renewGrantDays")}</span>
              <input
                className="input"
                type="number"
                min={1}
                value={billing.renewGrantDays}
                disabled={!canEdit || busy}
                onChange={(e) =>
                  setBilling({ ...billing, renewGrantDays: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {canEdit && (
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: "0.75rem" }}>
              {busy ? t("common.saving") : t("members.saveBilling")}
            </button>
          )}
          <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            <Link to="/member/buy-register" target="_blank" rel="noreferrer">
              {t("members.buyRegisterPage")}
            </Link>
          </p>
        </form>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>{t("members.codesTitle")}</h2>
        <p className="muted">{t("members.codesHint")}</p>
        {canEdit && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={genCount}
              style={{ maxWidth: 100 }}
              onChange={(e) => setGenCount(Number(e.target.value))}
            />
            <button className="btn" type="button" disabled={busy} onClick={() => void generateCodes()}>
              {t("members.generateCodes")}
            </button>
          </div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>{t("members.colCode")}</th>
              <th>{t("members.colGrantDays")}</th>
              <th>{t("members.colCodeStatus")}</th>
              <th>{t("members.colUsedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  {t("members.codesEmpty")}
                </td>
              </tr>
            ) : (
              codes.slice(0, 50).map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>{c.grantDays}</td>
                  <td>
                    {c.usedAt
                      ? t("members.codeUsed")
                      : c.codeExpiresAt && new Date(c.codeExpiresAt) < new Date()
                        ? t("members.codeExpired")
                        : t("members.codeAvailable")}
                  </td>
                  <td>{c.usedBy?.displayName || c.usedBy?.username || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {resetId && (
        <form className="card" style={{ marginBottom: "1rem" }} onSubmit={(e) => void submitReset(e)}>
          <h2 style={{ marginTop: 0 }}>{t("members.resetTitle")}</h2>
          <p className="muted">{t("members.resetHint", { name: resetLabel })}</p>
          <input
            className="input"
            type="password"
            placeholder={t("password.new")}
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            required
            minLength={6}
          />
          <input
            className="input"
            type="password"
            placeholder={t("password.confirm")}
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            required
            minLength={6}
          />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button className="btn" type="submit" disabled={busy}>
              {t("members.resetSubmit")}
            </button>
            <button className="btn ghost" type="button" onClick={() => setResetId(null)}>
              {t("scenarios.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t("members.listTitle")}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{t("members.colUser")}</th>
              <th>{t("members.colName")}</th>
              <th>{t("members.colCode")}</th>
              <th>{t("members.colExpires")}</th>
              <th>{t("members.colStatus")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {t("members.empty")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.username}</td>
                  <td>{r.displayName || "—"}</td>
                  <td>
                    <code>{r.memberCode || "—"}</code>
                  </td>
                  <td>
                    {r.memberExpiresAt
                      ? new Date(r.memberExpiresAt).toLocaleString()
                      : t("memberBilling.unlimited")}
                    {r.subscriptionActive === false && (
                      <span className="error" style={{ marginLeft: 6 }}>
                        ({t("memberBilling.expired")})
                      </span>
                    )}
                  </td>
                  <td>{r.active ? t("members.active") : t("members.inactive")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canEdit && (
                      <>
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => void extendMember(r, 7)}
                        >
                          +7
                        </button>{" "}
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => void extendMember(r, 30)}
                        >
                          +30
                        </button>{" "}
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => void toggleActive(r)}
                        >
                          {r.active ? t("members.disable") : t("members.enable")}
                        </button>{" "}
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => {
                            setResetId(r.id);
                            setResetLabel(r.displayName || r.username);
                            setResetPassword("");
                            setResetConfirm("");
                          }}
                        >
                          {t("members.reset")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="muted">
          <Link to="/login" target="_blank" rel="noreferrer">
            {t("members.loginPage")}
          </Link>
        </p>
      </div>
    </div>
  );
}
