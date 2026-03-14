import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import * as Localization from "expo-localization";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";
import { es as esDateLocale, enUS } from "date-fns/locale";
import en from "./en";
import es from "./es";

export const LANGUAGE_KEY = STORAGE_KEYS.LANGUAGE;
export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// ─── Detect device locale ─────────────────────────────────────────────────

function getDeviceLanguage(): SupportedLanguage {
  const locale = Localization.getLocales()[0]?.languageCode ?? "en";
  // Spanish covers es-AR, es-MX, es-ES, etc.
  return locale.startsWith("es") ? "es" : "en";
}

// ─── Init (called once at app start, before rendering) ────────────────────

export async function initI18n(): Promise<void> {
  // Try to load user override; fall back to device locale
  let lang: SupportedLanguage;
  try {
    const stored = storage.getString(LANGUAGE_KEY);
    lang =
      stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)
        ? (stored as SupportedLanguage)
        : getDeviceLanguage();
  } catch {
    lang = getDeviceLanguage();
  }

  // eslint-disable-next-line import/no-named-as-default-member
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: lang,
    fallbackLng: "en",
    interpolation: {
      // React already escapes values
      escapeValue: false,
    },
    compatibilityJSON: "v4",
  });
}

// ─── Runtime language switch (persisted) ──────────────────────────────────

export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  // eslint-disable-next-line import/no-named-as-default-member
  await i18n.changeLanguage(lang);
  storage.set(LANGUAGE_KEY, lang);
}

// ─── date-fns locale helper ────────────────────────────────────────────────

/** Returns the date-fns locale matching the current i18n language. */
export function getDateLocale() {
  return i18n.language?.startsWith("es") ? esDateLocale : enUS;
}

export { useTranslation };
export default i18n;
