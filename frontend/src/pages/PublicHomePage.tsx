import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import LanguageSwitcher from "../components/LanguageSwitcher";

/** 公开首页：介绍站 + 登录 / 条件注册，不开通码 */
export default function PublicHomePage() {
  const { t } = useTranslation();
  const [registerOpen, setRegisterOpen] = useState(false);

  const points = useMemo(() => {
    const raw = t("public.homePoints", { returnObjects: true });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [t]);

  const load = useCallback(async () => {
    try {
      const meta = await api.publicMeta();
      setRegisterOpen(Boolean(meta.memberRegisterEnabled));
    } catch {
      setRegisterOpen(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const title = t("public.homeTitle");

  return (
    <div className="public-wrap">
      <div className="public-top-bar" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
        <LanguageSwitcher />
        <Link className="btn ghost" to="/login">
          {t("public.login")}
        </Link>
        {registerOpen && (
          <Link className="btn ghost" to="/member/register">
            {t("member.registerLink")}
          </Link>
        )}
      </div>

      <div className="card public-guide" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0, fontSize: "1.35rem", textAlign: "center" }}>{title}</h1>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{t("public.homeLead")}</p>
        {points.length > 0 && (
          <ol style={{ margin: "0 0 1rem", paddingLeft: "1.2rem", color: "var(--muted)" }}>
            {points.map((line) => (
              <li key={line} style={{ marginBottom: "0.4rem" }}>
                {line}
              </li>
            ))}
          </ol>
        )}
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn" to="/login">
            {t("public.login")}
          </Link>
          {registerOpen && (
            <Link className="btn ghost" to="/member/register">
              {t("member.registerLink")}
            </Link>
          )}
          <Link className="btn ghost" to="/open">
            {t("public.goOpen")}
          </Link>
        </div>
      </div>
    </div>
  );
}
