import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

const STORAGE_KEY = "memoria-lang";
type Language = "en" | "ja";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang: Language = i18n.language?.startsWith("ja") ? "ja" : "en";

  const toggleLanguage = async () => {
    const newLang: Language = currentLang === "en" ? "ja" : "en";
    await i18n.changeLanguage(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="font-mono text-xs px-2"
    >
      {currentLang.toUpperCase()}
    </Button>
  );
}
