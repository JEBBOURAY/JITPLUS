import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logWarn } from '@/utils/devLogger';

/** null hides the associated banner until its saved preference is loaded. */
export function usePersistedFlag(storageKey: string, trueValue = 'true') {
  const [state, setState] = useState<{ key: string; trueValue: string; value: boolean | null }>({
    key: storageKey,
    trueValue,
    value: null,
  });
  const writeVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const version = writeVersion.current;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active && version === writeVersion.current) {
          setState({ key: storageKey, trueValue, value: value === trueValue });
        }
      })
      .catch(() => {
        if (active && version === writeVersion.current) {
          setState({ key: storageKey, trueValue, value: false });
        }
      });
    return () => { active = false; };
  }, [storageKey, trueValue]);

  const setValue = useCallback((value: boolean) => {
    writeVersion.current += 1;
    setState({ key: storageKey, trueValue, value });
    AsyncStorage.setItem(storageKey, value ? trueValue : 'false').catch(() => {
      logWarn('Preferences', 'Could not save a display preference');
    });
  }, [storageKey, trueValue]);

  return { value: state.key === storageKey && state.trueValue === trueValue ? state.value : null, setValue };
}
