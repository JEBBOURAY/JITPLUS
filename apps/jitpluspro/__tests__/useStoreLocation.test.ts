import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useStoreLocation } from '@/hooks/useStoreLocation';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@/utils/geocodeCache', () => ({ reverseGeocodeAsync: jest.fn(() => Promise.resolve([])) }));
jest.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));

const loc = jest.mocked(Location);
const position = { coords: { latitude: 33.59, longitude: -7.61 } } as Location.LocationObject;

describe('store location: "my location" button', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    loc.getCurrentPositionAsync.mockResolvedValue(position);
  });

  it('reads the position straight away once access is granted (no disclosure)', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true } as never);
    const { result } = renderHook(() => useStoreLocation());
    await act(() => result.current.locateMe());
    expect(alert).not.toHaveBeenCalled();
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(result.current.marker).toEqual({ latitude: 33.59, longitude: -7.61 });
  });

  it('shows the disclosure before the first system prompt', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true } as never);
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    // The merchant taps "Allow" in the disclosure.
    alert.mockImplementation((_title, _body, buttons) => buttons?.[1]?.onPress?.());
    const { result } = renderHook(() => useStoreLocation());
    await act(() => result.current.locateMe());
    expect(alert).toHaveBeenCalledWith('stores.locationDisclosureTitle', 'stores.locationDisclosureBody', expect.any(Array), expect.any(Object));
    expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.marker).not.toBeNull();
  });

  it('does not ask the OS when the merchant cancels the disclosure', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true } as never);
    alert.mockImplementation((_title, _body, buttons) => buttons?.[0]?.onPress?.());
    const { result } = renderHook(() => useStoreLocation());
    await act(() => result.current.locateMe());
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(result.current.marker).toBeNull();
  });

  it('points to the settings when the OS will not ask again', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false } as never);
    const { result } = renderHook(() => useStoreLocation());
    await act(() => result.current.locateMe());
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('stores.permissionDenied', 'stores.enableLocation');
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});
