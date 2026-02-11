import { format } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import i18n from "@/i18n";

const localeMap: Record<string, Locale> = { en: enUS, ja };

function getLocale() {
  return localeMap[i18n.language] || enUS;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "yyyy/MM/dd", { locale: getLocale() });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "yyyy/MM/dd HH:mm:ss", { locale: getLocale() });
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "MM/dd", { locale: getLocale() });
}
