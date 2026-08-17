import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, type User } from "../api";

export default function BranchLoginPage({
  onLogin,
}: {
  onLogin: (token: string, user: User) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaBusy, setCaptchaBusy] = useState(false);

  const refreshCaptcha = useCallback(async () => {
    setCaptchaBusy(true);
    setCaptchaCode("");
    try {
      const c = await api.captcha();
      setCaptchaId(c.captchaId);
      setCaptchaSvg(c.imageSvg);
    } catch (err) {
      setCaptchaId("");
      setCaptchaSvg("");
      setError(err instanceof Error ? err.message : "验证码加载失败");
    } finally {
      setCaptchaBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!captchaId || !captchaCode.trim()) {
        setError("请填写验证码");
        return;
      }
      const res = await api.login(
        username.trim(),
        password,
        captchaId,
        captchaCode.trim()
      );
      onLogin(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      void refreshCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>精简多签 · 管理登录</h1>
        <p className="muted">管理员后台。需图形验证码。</p>
        <form onSubmit={(e) => void submit(e)}>
          <input
            className="input"
            placeholder="账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="captcha-row">
            <input
              className="input"
              placeholder="验证码"
              value={captchaCode}
              onChange={(e) => setCaptchaCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              required
            />
            <button
              type="button"
              className="captcha-img-btn"
              onClick={() => void refreshCaptcha()}
              disabled={captchaBusy}
              title="看不清？点击刷新"
              aria-label="刷新验证码"
            >
              {captchaSvg ? (
                <span
                  className="captcha-svg"
                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                />
              ) : (
                <span className="muted">{captchaBusy ? "加载中…" : "点击获取"}</span>
              )}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={busy || !captchaId}>
            {busy ? "登录中…" : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
