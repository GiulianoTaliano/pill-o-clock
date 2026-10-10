import i18n from "i18next";
import { initReactI18next, useTranslation, setI18n, setDefaults } from "react-i18next";
import * as Localization from "expo-localization";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";
import { es as esDateLocale, enUS, ptBR } from "date-fns/locale";
import en from "./en";
import es from "./es";
import pt from "./pt";
import ux from "./ux";
import uxMedication from "./uxMedication";
import uxHealth from "./uxHealth";
import uxSettings from "./uxSettings";

// Root reads the translation hook while asynchronous startup is still loading.
// It must render so its initialization effect can run before translations are ready.
setDefaults({ useSuspense: false });
setI18n(i18n);

export const LANGUAGE_KEY = STORAGE_KEYS.LANGUAGE;
export const SUPPORTED_LANGUAGES = ["es", "en", "pt"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// ─── Detect device locale ─────────────────────────────────────────────────

function getDeviceLanguage(): SupportedLanguage {
  const locale = Localization.getLocales()[0]?.languageCode ?? "en";
  // Spanish covers es-AR, es-MX, es-ES, etc.
  if (locale.startsWith("es")) return "es";
  // Portuguese covers pt-BR, pt-PT, etc.
  if (locale.startsWith("pt")) return "pt";
  return "en";
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
      en: {
        translation: {
          ...en,
          ...ux.en,
          ...uxMedication.en,
          ...uxHealth.en,
          ...uxSettings.en,
        },
      },
      es: {
        translation: {
          ...es,
          ...ux.es,
          ...uxMedication.es,
          ...uxHealth.es,
          ...uxSettings.es,
        },
      },
      pt: {
        translation: {
          ...pt,
          ...ux.pt,
          ...uxMedication.pt,
          ...uxHealth.pt,
          ...uxSettings.pt,
        },
      },
    },
    lng: lang,
    fallbackLng: "en",
    react: { useSuspense: false },
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
  if (i18n.language?.startsWith("es")) return esDateLocale;
  if (i18n.language?.startsWith("pt")) return ptBR;
  return enUS;
}

export { useTranslation };
export default i18n;
