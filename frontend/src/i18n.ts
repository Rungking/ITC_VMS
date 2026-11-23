import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import th from "./locales/th.json";

// All on-screen text lives in locales/*.json - never hard-code Thai/English strings in components.
i18n.use(initReactI18next).init({
  resources: { th: { translation: th } },
  lng: "th",
  fallbackLng: "th",
  interpolation: { escapeValue: false },
});

export default i18n;
