import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type Language, languageAtom } from "@/i18n/atoms";
import { Button } from "./ui/button";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [language, setLanguage] = useAtom(languageAtom);
  const isInitialMount = useRef(true);

  // Sync i18n to atom on mount (in case they diverged)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Ensure i18n matches the persisted atom value on initial load
      const currentI18nLang = i18n.language?.startsWith("ja") ? "ja" : "en";
      if (currentI18nLang !== language) {
        i18n.changeLanguage(language);
      }
    }
  }, [i18n, language]);

  const toggleLanguage = () => {
    const newLang: Language = language === "en" ? "ja" : "en";
    // Update both synchronously to avoid any race conditions
    i18n.changeLanguage(newLang);
    setLanguage(newLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="font-mono text-xs px-2"
    >
      {language.toUpperCase()}
    </Button>
  );
}
