import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface SystemAppearanceAdapter {
  getColorScheme(): 'light' | 'dark';
  subscribe(listener: (scheme: 'light' | 'dark') => void): () => void;
}

export interface ThemeProviderConfig<T extends { mode: 'light' | 'dark' }> {
  storageKey: string;
  storage: ThemeStorageAdapter;
  appearance: SystemAppearanceAdapter;
  lightTheme: T;
  darkTheme: T;
}

export function createThemeProvider<T extends { mode: 'light' | 'dark' }>(
  config: ThemeProviderConfig<T>,
) {
  type ContextValue = T & { toggleDarkMode: () => void; isDark: boolean; themeMode: ThemeMode };

  const ThemeContext = createContext<ContextValue>({
    ...config.lightTheme,
    toggleDarkMode: () => {},
    isDark: false,
    themeMode: 'system',
  });

  const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [systemColorScheme, setSystemColorScheme] = useState<'light' | 'dark'>(
      config.appearance.getColorScheme(),
    );

    useEffect(() => {
      return config.appearance.subscribe(setSystemColorScheme);
    }, []);

    useEffect(() => {
      config.storage.getItem(config.storageKey).then((val) => {
        if (val === 'dark' || val === 'light' || val === 'system') {
          setThemeMode(val);
        }
      }).catch(() => {});
    }, []);

    const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';

    const toggleDarkMode = useCallback(() => {
      setThemeMode((prev) => {
        const next: ThemeMode = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
        config.storage.setItem(config.storageKey, next).catch(() => {});
        return next;
      });
    }, []);

    const value = useMemo<ContextValue>(() => ({
      ...(isDark ? config.darkTheme : config.lightTheme),
      toggleDarkMode,
      isDark,
      themeMode,
    }), [isDark, toggleDarkMode, themeMode]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
  };

  const useTheme = () => useContext(ThemeContext);

  return { ThemeProvider, useTheme };
}
