import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type User } from "../api";
import HelpTip from "../components/HelpTip";

export default function ChangePasswordPage({
  user,
  helpHref,
}: {
  user: User;
  helpHref?: string;
}) {
  const { t } = useTranslation();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (newPassword.length < 6) {
      setError(t("password.minLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("password.mismatch"));
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setMsg(t("password.success"));
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("password.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)} style={{ maxWidth: 420 }}>
      <h2 style={{ marginTop: 0 }}>{t("password.title")}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("password.intro", { name: user.displayName || user.username, role: user.role })}
        {helpHref ? (
          <>
            {" "}
            {t("password.seeHelp")}{" "}
            <Link to={helpHref}>{t("password.helpLink")}</Link>
            {t("password.helpPunct")}
          </>
        ) : null}
        <HelpTip text={t("password.tip")} />
      </p>
      <div style={{ display: "grid", gap: "0.6rem" }}>
        <input
          className="input"
          type="password"
          placeholder={t("password.current")}
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder={t("password.new")}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
        />
        <input
          className="input"
          type="password"
          placeholder={t("password.confirm")}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t("password.submitting") : t("password.submit")}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok">{msg}</p>}
    </form>
  );
}
