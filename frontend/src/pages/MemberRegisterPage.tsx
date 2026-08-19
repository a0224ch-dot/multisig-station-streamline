import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type User } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function MemberRegisterPage({
  onLogin,
}: {
  onLogin: (token: string, user: User) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<boolean | null>(null);
  const [requireCode, setRequireCode] = useState(false);
  const [payEnabled, setPayEnabled] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [registerCode, setRegisterCode] = useState("");
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
      setError(err instanceof Error ? err.message : t("login.captchaLoadFailed"));
    } finally {
      setCaptchaBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void api
      .publicMeta()
      .then((m) => {
        setOpen(Boolean(m.memberRegisterEnabled));
        setRequireCode(Boolean(m.memberRegisterRequireCode));
        setPayEnabled(Boolean(m.memberPayEnabled));
        if (m.memberRegisterEnabled) void refreshCaptcha();
      })
      .catch(() => setOpen(false));
  }, [refreshCaptcha]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setError(t("member.passwordMismatch"));
      return;
    }
    if (requireCode && !registerCode.trim()) {
      setError(t("member.registerCodeRequired"));
      return;
    }
    if (!captchaId || !captchaCode.trim()) {
      setError(t("login.captchaRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.memberRegister({
        username: username.trim(),
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(requireCode ? { registerCode: registerCode.trim() } : {}),
        captchaId,
        captchaCode: captchaCode.trim(),
      });
      onLogin(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("member.registerFailed"));
      void refreshCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
        <LanguageSwitcher />
      </div>
      <div className="card login-card">
        <h1>{t("member.registerTitle")}</h1>
        {open === false && (
          <>
            <p className="muted">{t("member.registerClosed")}</p>
            <p className="muted">
              <Link to="/login">{t("public.login")}</Link>
              {" · "}
              <Link to="/">{t("member.backHome")}</Link>
            </p>
          </>
        )}
        {open && (
          <>
            <p className="muted">{t("member.registerIntro")}</p>
            {requireCode && payEnabled && (
              <p className="muted">
                {t("member.buyRegisterHint")}{" "}
                <Link to="/member/buy-register">{t("member.buyRegisterLink")}</Link>
              </p>
            )}
            <form onSubmit={(e) => void submit(e)}>
              <input
                className="input"
                placeholder={t("login.username")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <input
                className="input"
                placeholder={t("member.displayName")}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {requireCode && (
                <input
                  className="input"
                  placeholder={t("member.registerCodePlaceholder")}
                  value={registerCode}
                  onChange={(e) => setRegisterCode(e.target.value)}
                  required
                />
              )}
              <input
                className="input"
                type="password"
                placeholder={t("member.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
              <input
                className="input"
                type="password"
                placeholder={t("member.password2")}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
              <div className="captcha-row">
                <input
                  className="input"
                  placeholder={t("login.captcha")}
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  autoComplete="off"
                  maxLength={8}
                  required
                />
                <button
                  type="button"
                  className="captcha-img-btn"
                  onClick={() => void refreshCaptcha()}
                  disabled={captchaBusy}
                >
                  {captchaSvg ? (
                    <span
                      className="captcha-svg"
                      dangerouslySetInnerHTML={{ __html: captchaSvg }}
                    />
                  ) : (
                    <span className="muted">
                      {captchaBusy ? t("login.captchaLoading") : t("login.captchaFetch")}
                    </span>
                  )}
                </button>
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn" type="submit" disabled={busy || !captchaId}>
                {busy ? t("member.registering") : t("member.registerSubmit")}
              </button>
            </form>
            <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
              <Link to="/login">{t("member.hasAccount")}</Link>
              {" · "}
              <Link to="/">{t("member.backHome")}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
