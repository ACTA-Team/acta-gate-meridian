"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

import { LOCALES, MESSAGES, type Locale, type Messages } from "@/i18n/messages";

const LOCALE_KEY = "acta-gate:locale";
/** What the server renders, before the visitor's choice is known. */
const DEFAULT_LOCALE: Locale = "en";

interface I18n {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: MESSAGES[DEFAULT_LOCALE],
  setLocale: () => {},
});

const isLocale = (v: string | null): v is Locale => LOCALES.includes(v as Locale);

/** The locale lives in `localStorage`; this is its subscription for React. */
const listeners = new Set<() => void>();
let chosen: Locale | null = null;

/** The visitor's choice, or their browser's language the first time. */
function readLocale(): Locale {
  if (chosen) return chosen;
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (isLocale(stored)) return (chosen = stored);
  } catch {
    // Private mode: fall through to the browser's language.
  }
  return (chosen = navigator.language.toLowerCase().startsWith("es") ? "es" : "en");
}

function writeLocale(next: Locale) {
  chosen = next;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // The choice just won't survive a reload.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, () => DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, t: MESSAGES[locale], setLocale: writeLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
