import { format } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import i18n from "@/i18n";

const localeMap: Record<string, Locale> = { en: enUS, ja };

function getLocale() {
  return localeMap[i18n.language] || enUS;
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "yyyy/MM/dd", { locale: getLocale() });
}

export function formatDateTime(dateStr: string): string {
  return format(new Date(dateStr), "yyyy/MM/dd HH:mm:ss", {
    locale: getLocale(),
  });
}

export function formatShortDate(dateStr: string): string {
  return format(new Date(dateStr), "MM/dd", { locale: getLocale() });
}
