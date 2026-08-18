import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { DEV_TELEGRAM_HANDLE, DEV_TELEGRAM_URL } from "../devContact";
import { HELP_DOC_VERSION, HELP_SECTION_META } from "../help/helpContent";

type HelpSectionView = {
  id: string;
  title: string;
  advanced?: boolean;
  steps: string[];
  tips?: string[];
};

export default function BranchHelpPage() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    void api
      .health()
      .then((h) => setAppVersion(h.version || ""))
      .catch(() => setAppVersion(""));
  }, []);

  const sections = useMemo<HelpSectionView[]>(
    () =>
      HELP_SECTION_META.map((meta) => {
        const base = `help.sections.${meta.id}`;
        const tips = t(`${base}.tips`, { returnObjects: true, defaultValue: [] }) as string[];
        return {
          id: meta.id,
          title: t(`${base}.title`),
          advanced: meta.advanced,
          steps: t(`${base}.steps`, { returnObjects: true }) as string[],
          tips: tips.length ? tips : undefined,
        };
      }),
    [t]
  );

  const mismatch =
    appVersion && HELP_DOC_VERSION && appVersion !== HELP_DOC_VERSION;

  return (
    <div className="card help-doc" style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>{t("help.title")}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("help.subtitle")}
      </p>
      <p style={{ fontSize: "0.9rem" }}>
        {t("help.docVersion")}
        <span className="badge">{HELP_DOC_VERSION}</span>
        {appVersion && (
          <>
            {" "}
            · {t("help.runningVersion")}
            <span className="badge">{appVersion}</span>
          </>
        )}
      </p>
      {mismatch && (
        <p className="error" style={{ fontSize: "0.9rem" }}>
          {t("help.versionMismatch")}
        </p>
      )}

      <nav className="help-toc">
        {sections.map((s) => (
          <a key={s.id} href={`#help-${s.id}`}>
            {s.title}
            {s.advanced ? ` · ${t("common.advanced")}` : ""}
          </a>
        ))}
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={`help-${s.id}`} className="help-section">
          <h3>
            {s.title}
            {s.advanced && (
              <span className="badge" style={{ marginLeft: 8 }}>
                {t("common.advanced")}
              </span>
            )}
          </h3>
          <ol>
            {s.steps.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {s.tips && s.tips.length > 0 && (
            <ul className="help-tips">
              {s.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="muted" style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
        {t("help.quickLinks")}
        <Link to="/branch/presets">{t("nav.presets")}</Link>
        {" · "}
        <Link to="/branch/network">{t("nav.network")}</Link>
        {" · "}
        <Link to="/branch/wallets">{t("nav.wallets")}</Link>
        {" · "}
        <Link to="/branch/decor">{t("nav.decor")}</Link>
        {" · "}
        <Link to="/branch/open-wallets">{t("nav.openWallets")}</Link>
        {" · "}
        <Link to="/branch/update">{t("nav.update")}</Link>
        {" · "}
        <Link to="/branch/password">{t("nav.password")}</Link>
      </p>
      <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
        {t("common.developerTelegram")}{" "}
        <a href={DEV_TELEGRAM_URL} target="_blank" rel="noreferrer">
          {DEV_TELEGRAM_HANDLE}
        </a>
      </p>
    </div>
  );
}
