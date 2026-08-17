import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User } from "../api";
import HelpTip from "../components/HelpTip";

export default function ChangePasswordPage({
  user,
  helpHref,
}: {
  user: User;
  helpHref?: string;
}) {
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
      setError("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setMsg("密码已修改，请牢记新密码");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)} style={{ maxWidth: 420 }}>
      <h2 style={{ marginTop: 0 }}>修改密码</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        账号 {user.displayName || user.username}（{user.role}）修改登录密码，需验证当前密码。
        {helpHref ? (
          <>
            {" "}
            详见 <Link to={helpHref}>使用说明 · 密码</Link>。
          </>
        ) : null}
        <HelpTip text="修改成功后请牢记新密码；不会强制重新登录。" />
      </p>
      <div style={{ display: "grid", gap: "0.6rem" }}>
        <input
          className="input"
          type="password"
          placeholder="当前密码"
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="新密码（至少 6 位）"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
        />
        <input
          className="input"
          type="password"
          placeholder="确认新密码"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "提交中…" : "保存新密码"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok">{msg}</p>}
    </form>
  );
}
