import { useTranslation } from "react-i18next";
import { setAppLang, type AppLang } from "../i18n";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "zh") as AppLang;

  function pick(next: AppLang) {
    if (next === lang) return;
    setAppLang(next);
  }

  return (
    <span className={`lang-switch ${className}`.trim()} role="group" aria-label="Language">
      <button
        type="button"
        className={`lang-switch-btn${lang === "zh" ? " active" : ""}`}
        onClick={() => pick("zh")}
      >
        中
      </button>
      <button
        type="button"
        className={`lang-switch-btn${lang === "en" ? " active" : ""}`}
        onClick={() => pick("en")}
      >
        EN
      </button>
    </span>
  );
}
