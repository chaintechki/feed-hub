import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";

const stored = typeof window !== "undefined" ? window.localStorage.getItem("fp.lang") : null;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: stored ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: "en" | "de") {
  window.localStorage.setItem("fp.lang", lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
