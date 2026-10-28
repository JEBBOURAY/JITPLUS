import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { createLanguageProvider } from '@jitplus/shared/src/createLanguageProvider';

function setup(saved: string | null, isRTL: boolean, withCallback = true) {
  const rtl = { isRTL, allowRTL: jest.fn(), forceRTL: jest.fn() };
  const onDirectionChange = jest.fn();
  const { LanguageProvider, useLanguage } = createLanguageProvider<'fr' | 'ar'>({
    storageKey: 'lang',
    storage: { getItem: jest.fn(async () => saved), setItem: jest.fn(async () => {}) },
    i18n: { locale: 'fr', t: (s: string) => s },
    rtl,
    validLocales: ['fr', 'ar'],
    defaultLocale: 'ar',
    rtlLocales: ['ar'],
    ...(withCallback ? { onDirectionChange } : {}),
  });
  function Probe() {
    const { locale } = useLanguage();
    return <Text>{locale}</Text>;
  }
  render(<LanguageProvider><Probe /></LanguageProvider>);
  return { rtl, onDirectionChange };
}

describe('createLanguageProvider direction sync', () => {
  // The first render loads React Native lazily, which can exceed waitFor's 1 s default on slow disks.
  it('switches to RTL and asks for a reload for the default Arabic locale', async () => {
    const { rtl, onDirectionChange } = setup(null, false);
    await waitFor(() => expect(screen.getByText('ar')).toBeTruthy(), { timeout: 15_000 });
    expect(rtl.forceRTL).toHaveBeenCalledWith(true);
    expect(onDirectionChange).toHaveBeenCalledWith(true);
  }, 30_000);

  it('does nothing when the direction already matches the saved locale', async () => {
    const { rtl, onDirectionChange } = setup('fr', false);
    await waitFor(() => expect(screen.getByText('fr')).toBeTruthy());
    expect(rtl.forceRTL).not.toHaveBeenCalled();
    expect(onDirectionChange).not.toHaveBeenCalled();
  });

  it('keeps the legacy behaviour without a callback: no sync for an unsaved locale', async () => {
    const { rtl } = setup(null, false, false);
    await waitFor(() => expect(screen.getByText('ar')).toBeTruthy());
    expect(rtl.forceRTL).not.toHaveBeenCalled();
  });
});
