import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "../locales/zh.json";
import en from "../locales/en.json";

export const LANG_STORAGE_KEY = "streamline-lang";
export const SUPPORTED_LANGS = ["zh", "en"] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];

function readUrlLang(): AppLang | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("lang");
  if (raw === "zh" || raw === "en") return raw;
  return null;
}

function readStoredLang(): AppLang | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LANG_STORAGE_KEY);
  if (raw === "zh" || raw === "en") return raw;
  return null;
}

export function resolveInitialLang(): AppLang {
  return readUrlLang() || readStoredLang() || "zh";
}

export function setAppLang(lang: AppLang) {
  void i18n.changeLanguage(lang);
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}

const initialLang = resolveInitialLang();

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLang === "zh" ? "zh-CN" : "en";

export default i18n;
