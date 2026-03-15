import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface LangStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface I18nInstance {
  locale: string;
  t(scope: string, options?: Record<string, unknown>): string;
}

export interface RTLManager {
  isRTL: boolean;
  allowRTL(allow: boolean): void;
  forceRTL(force: boolean): void;
}

export interface LanguageProviderConfig<L extends string> {
  storageKey: string;
  storage: LangStorageAdapter;
  i18n: I18nInstance;
  rtl: RTLManager;
  showRestartAlert(isRTL: boolean): void;
  validLocales: readonly L[];
  defaultLocale: L;
  rtlLocales: readonly L[];
}

export function createLanguageProvider<L extends string>(config: LanguageProviderConfig<L>) {
  interface ContextType {
    locale: L;
    setLocale: (locale: L) => Promise<void>;
    t: (scope: string, options?: Record<string, unknown>) => string;
    isRTL: boolean;
  }

  const Context = createContext<ContextType>({
    locale: config.defaultLocale,
    setLocale: async () => {},
    t: (scope) => scope,
    isRTL: false,
  });

  function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<L>(config.defaultLocale);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      config.storage.getItem(config.storageKey)
        .then((saved) => {
          if (saved && config.validLocales.includes(saved as L)) {
            config.i18n.locale = saved;
            setLocaleState(saved as L);
            const rtl = config.rtlLocales.includes(saved as L);
            if (config.rtl.isRTL !== rtl) {
              config.rtl.allowRTL(rtl);
              config.rtl.forceRTL(rtl);
            }
          }
        })
        .catch(() => {})
        .finally(() => setReady(true));
    }, []);

    const setLocale = useCallback(async (newLocale: L) => {
      config.i18n.locale = newLocale;
      setLocaleState(newLocale);
      await config.storage.setItem(config.storageKey, newLocale).catch(() => {});

      const rtl = config.rtlLocales.includes(newLocale);
      if (config.rtl.isRTL !== rtl) {
        config.rtl.allowRTL(rtl);
        config.rtl.forceRTL(rtl);
        config.showRestartAlert(rtl);
      }
    }, []);

    const t = useCallback(
      (scope: string, options?: Record<string, unknown>) => config.i18n.t(scope, options),
      [locale], // eslint-disable-line react-hooks/exhaustive-deps
    );

    const isRTL = config.rtlLocales.includes(locale);

    const value = useMemo(() => ({ locale, setLocale, t, isRTL }), [locale, setLocale, t, isRTL]);

    if (!ready) return null;

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useLanguage() {
    return useContext(Context);
  }

  return { LanguageProvider, useLanguage };
}
