import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type User } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { DEV_TELEGRAM_HANDLE, DEV_TELEGRAM_URL } from "../devContact";

export default function BranchLoginPage({
  onLogin,
}: {
  onLogin: (token: string, user: User) => void;
}) {
  const { t } = useTranslation();
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
      setError(err instanceof Error ? err.message : t("login.captchaLoadFailed"));
    } finally {
      setCaptchaBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!captchaId || !captchaCode.trim()) {
        setError(t("login.captchaRequired"));
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
      setError(err instanceof Error ? err.message : t("login.failed"));
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
        <h1>{t("login.title")}</h1>
        <p className="muted">{t("login.subtitle")}</p>
        <form onSubmit={(e) => void submit(e)}>
          <input
            className="input"
            placeholder={t("login.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="input"
            type="password"
            placeholder={t("login.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="captcha-row">
            <input
              className="input"
              placeholder={t("login.captcha")}
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
              title={t("login.captchaRefreshTitle")}
              aria-label={t("login.captchaRefreshAria")}
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
            {busy ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.85rem" }}>
          {t("common.developerTelegram")}{" "}
          <a href={DEV_TELEGRAM_URL} target="_blank" rel="noreferrer">
            {DEV_TELEGRAM_HANDLE}
          </a>
        </p>
      </div>
    </div>
  );
}
