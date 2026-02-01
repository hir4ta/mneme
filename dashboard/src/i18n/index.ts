import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// English translations
import enCommon from "./locales/en/common.json";
import enDecisions from "./locales/en/decisions.json";
import enErrors from "./locales/en/errors.json";
import enGraph from "./locales/en/graph.json";
import enGuide from "./locales/en/guide.json";
import enLayout from "./locales/en/layout.json";
import enPatterns from "./locales/en/patterns.json";
import enRules from "./locales/en/rules.json";
import enSessions from "./locales/en/sessions.json";
import enStats from "./locales/en/stats.json";

// Japanese translations
import jaCommon from "./locales/ja/common.json";
import jaDecisions from "./locales/ja/decisions.json";
import jaErrors from "./locales/ja/errors.json";
import jaGraph from "./locales/ja/graph.json";
import jaGuide from "./locales/ja/guide.json";
import jaLayout from "./locales/ja/layout.json";
import jaPatterns from "./locales/ja/patterns.json";
import jaRules from "./locales/ja/rules.json";
import jaSessions from "./locales/ja/sessions.json";
import jaStats from "./locales/ja/stats.json";

const resources = {
  en: {
    common: enCommon,
    layout: enLayout,
    sessions: enSessions,
    decisions: enDecisions,
    rules: enRules,
    patterns: enPatterns,
    stats: enStats,
    graph: enGraph,
    errors: enErrors,
    guide: enGuide,
  },
  ja: {
    common: jaCommon,
    layout: jaLayout,
    sessions: jaSessions,
    decisions: jaDecisions,
    rules: jaRules,
    patterns: jaPatterns,
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
    "sessions",
    "decisions",
    "rules",
    "patterns",
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
