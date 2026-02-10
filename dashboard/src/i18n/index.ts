import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// English translations
import enCommon from "./locales/en/common.json";
import enDevRules from "./locales/en/devRules.json";
import enErrors from "./locales/en/errors.json";
import enGraph from "./locales/en/graph.json";
import enGuide from "./locales/en/guide.json";
import enLayout from "./locales/en/layout.json";
import enRules from "./locales/en/rules.json";
import enSessions from "./locales/en/sessions.json";
import enStats from "./locales/en/stats.json";

// Japanese translations
import jaCommon from "./locales/ja/common.json";
import jaDevRules from "./locales/ja/devRules.json";
import jaErrors from "./locales/ja/errors.json";
import jaGraph from "./locales/ja/graph.json";
import jaGuide from "./locales/ja/guide.json";
import jaLayout from "./locales/ja/layout.json";
import jaRules from "./locales/ja/rules.json";
import jaSessions from "./locales/ja/sessions.json";
import jaStats from "./locales/ja/stats.json";

const resources = {
  en: {
    common: enCommon,
    layout: enLayout,
    devRules: enDevRules,
    sessions: enSessions,
    rules: enRules,
    stats: enStats,
    graph: enGraph,
    errors: enErrors,
    guide: enGuide,
  },
  ja: {
    common: jaCommon,
    layout: jaLayout,
    devRules: jaDevRules,
    sessions: jaSessions,
    rules: jaRules,
    stats: jaStats,
    graph: jaGraph,
    errors: jaErrors,
    guide: jaGuide,
  },
};

// Get initial language from localStorage
const STORAGE_KEY = "mneme-lang";
const getInitialLanguage = (): string => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ja" || stored === "en") {
    return stored;
  }
  return "en";
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: [
    "common",
    "layout",
    "devRules",
    "sessions",
    "rules",
    "stats",
    "graph",
    "errors",
    "guide",
  ],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
