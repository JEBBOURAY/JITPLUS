/**
 * AddressAutocomplete — Google Places Autocomplete dropdown for address input.
 * Calls the backend /geocode/* proxy (server-side API key, no app-restriction issues).
 * Shows live suggestions as the user types, biased to Morocco.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, Keyboard, Platform,
} from 'react-native';
import { Search, MapPin, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { getServerBaseUrl } from '@/services/api';
import { logWarn } from '@/utils/devLogger';

const DEBOUNCE_MS = 350;

// ── Google Places Autocomplete types ──
interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
}

export interface AddressResult {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  district?: string;
  formattedAddress?: string;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (result: AddressResult) => void;
  onNotFound?: () => void;
  notFoundMessage?: string;
  placeholder?: string;
  ville?: string;
  userLocation?: { latitude: number; longitude: number } | null;
}

export default function AddressAutocomplete({
  value,
  onChangeText,
  onSelect,
  onNotFound,
  notFoundMessage,
  placeholder,
  ville,
  userLocation,
}: Props) {
  const theme = useTheme();
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotFound, setShowNotFound] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Store geocode fallback results so we can retrieve coords on select
  const geoFallbackRef = useRef<Map<string, { lat: number; lng: number; address: string; city?: string; district?: string }>>(new Map());

  // Fetch predictions via backend proxy
  const fetchPredictions = useCallback(async (input: string) => {
    if (input.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({ input });
      if (ville) params.set('ville', ville);
      if (userLocation?.latitude != null && userLocation?.longitude != null) {
        params.set('lat', String(userLocation.latitude));
        params.set('lng', String(userLocation.longitude));
      }
      const url = `${getServerBaseUrl()}/geocode/autocomplete?${params}`;
      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();

      if (!mountedRef.current) return;

      if (json.predictions?.length > 0) {
        geoFallbackRef.current.clear();
        setPredictions(json.predictions.slice(0, 5));
        setShowDropdown(true);
        setShowNotFound(false);
      } else {
        // Fallback: try forward geocode (same as Google Maps search)
        const query = ville ? `${input}, ${ville}` : input;
        const geoUrl = `${getServerBaseUrl()}/geocode/forward?address=${encodeURIComponent(query)}`;
        const geoRes = await fetch(geoUrl, { signal: controller.signal });
        const geoJson = await geoRes.json();

        if (!mountedRef.current) return;

        if (geoJson.results?.length > 0) {
          // Convert geocode results to prediction-like items for the dropdown
          geoFallbackRef.current.clear();
          const geoPredictions: PlacePrediction[] = geoJson.results
            .slice(0, 5)
            .map((r: { formatted_address?: string; place_id?: string; geometry?: { location: { lat: number; lng: number } }; address_components?: Array<{ long_name: string; types: string[] }> }, i: number) => {
              const pid = r.place_id || `geo_${i}`;
              const getComp = (type: string) =>
                r.address_components?.find((c) => c.types.includes(type))?.long_name;
              // Store coordinates for direct retrieval on select
              if (r.geometry?.location) {
                geoFallbackRef.current.set(pid, {
                  lat: r.geometry.location.lat,
                  lng: r.geometry.location.lng,
                  address: r.formatted_address || input,
                  city: getComp('locality') || getComp('administrative_area_level_2'),
                  district: getComp('sublocality') || getComp('neighborhood'),
                });
              }
              return {
                place_id: pid,
                description: r.formatted_address || input,
                structured_formatting: {
                  main_text: r.formatted_address?.split(',')[0] || input,
                  secondary_text: r.formatted_address?.split(',').slice(1).join(',').trim() || '',
                },
              };
            });
          setPredictions(geoPredictions);
          setShowDropdown(true);
          setShowNotFound(false);
        } else {
          setPredictions([]);
          setShowDropdown(false);
          setShowNotFound(true);
          onNotFound?.();
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        logWarn('AddressAutocomplete', 'fetch error:', e);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ville, userLocation, onNotFound]);

  // Debounced input handler
  const handleChangeText = useCallback((text: string) => {
    onChangeText(text);
    setShowNotFound(false);
    clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchPredictions(text), DEBOUNCE_MS);
  }, [onChangeText, fetchPredictions]);

  // Get place details (coordinates) when user selects a prediction
  const handleSelectPrediction = useCallback(async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setShowDropdown(false);
    setPredictions([]);
    onChangeText(prediction.structured_formatting.main_text);

    // Check if this came from geocode fallback (already has coords)
    const cached = geoFallbackRef.current.get(prediction.place_id);
    if (cached) {
      setShowNotFound(false);
      onSelect({
        latitude: cached.lat,
        longitude: cached.lng,
        address: prediction.structured_formatting.main_text,
        city: cached.city,
        district: cached.district,
        formattedAddress: cached.address,
      });
      return;
    }

    setLoading(true);
    try {
      const url = `${getServerBaseUrl()}/geocode/place-details?placeId=${encodeURIComponent(prediction.place_id)}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!mountedRef.current) return;

      if (json.result) {
        const { geometry, formatted_address, address_components } = json.result;
        const get = (type: string) =>
          address_components?.find((c: { types: string[] }) => c.types.includes(type))?.long_name;

        setShowNotFound(false);
        onSelect({
          latitude: geometry.location.lat,
          longitude: geometry.location.lng,
          address: prediction.structured_formatting.main_text,
          city: get('locality') || get('administrative_area_level_2'),
          district: get('sublocality') || get('neighborhood'),
          formattedAddress: formatted_address,
        });
      } else {
        setShowNotFound(true);
        onNotFound?.();
      }
    } catch (e) {
      logWarn('AddressAutocomplete', 'place details error:', e);
      setShowNotFound(true);
      onNotFound?.();
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [onChangeText, onSelect, onNotFound]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={[
        styles.inputWrapper,
        {
          backgroundColor: theme.bgInput,
          borderColor: showDropdown ? theme.primary : value ? theme.primary : theme.border,
        },
      ]}>
        <Search size={18} color={theme.textMuted} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : value.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              onChangeText('');
              setPredictions([]);
              setShowDropdown(false);
              setShowNotFound(false);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Dropdown */}
      {showDropdown && predictions.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {predictions.map((item) => (
            <TouchableOpacity
              key={item.place_id}
              style={[styles.predictionRow, { borderBottomColor: theme.border }]}
              onPress={() => handleSelectPrediction(item)}
              activeOpacity={0.7}
            >
              <MapPin size={16} color={theme.primary} style={{ marginTop: 2 }} />
              <View style={styles.predictionText}>
                <Text style={[styles.mainText, { color: theme.text }]} numberOfLines={1}>
                  {item.structured_formatting.main_text}
                </Text>
                {item.structured_formatting.secondary_text && (
                  <Text style={[styles.secondaryText, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.structured_formatting.secondary_text}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Not-found banner */}
      {showNotFound && !showDropdown && value.trim().length >= 3 && (
        <View style={[styles.notFoundBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <MapPin size={16} color="#EF4444" />
          <Text style={styles.notFoundText}>
            {notFoundMessage || 'Adresse non trouvée. Vérifiez ou sélectionnez manuellement sur la carte.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  dropdown: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  predictionText: {
    flex: 1,
  },
  mainText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  secondaryText: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Lexend_400Regular',
  },
  notFoundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  notFoundText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#DC2626',
    lineHeight: 17,
  },
});
