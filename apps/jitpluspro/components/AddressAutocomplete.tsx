/**
 * AddressAutocomplete — Google Places Autocomplete dropdown for address input.
 * Shows live suggestions as the user types, biased to Morocco.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, Keyboard, Platform,
} from 'react-native';
import { Search, MapPin, X } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useTheme } from '@/contexts/ThemeContext';

const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
  '';

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

interface AutocompleteResponse {
  status: string;
  predictions?: PlacePrediction[];
}

interface PlaceDetailsResult {
  geometry: { location: { lat: number; lng: number } };
  formatted_address?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

interface PlaceDetailsResponse {
  status: string;
  result?: PlaceDetailsResult;
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
  placeholder?: string;
  ville?: string;
}

export default function AddressAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder,
  ville,
}: Props) {
  const theme = useTheme();
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Fetch predictions from Google Places Autocomplete API
  const fetchPredictions = useCallback(async (input: string) => {
    if (!GOOGLE_MAPS_KEY || input.trim().length < 3) {
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
      const query = ville ? `${input}, ${ville}` : input;
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:ma&language=fr&types=geocode|establishment&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url, { signal: controller.signal });
      const json: AutocompleteResponse = await res.json();

      if (!mountedRef.current) return;

      if (json.status === 'OK' && json.predictions) {
        setPredictions(json.predictions.slice(0, 5));
        setShowDropdown(true);
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        if (__DEV__) console.warn('[AddressAutocomplete] fetch error:', e);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ville]);

  // Debounced input handler
  const handleChangeText = useCallback((text: string) => {
    onChangeText(text);
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

    if (!GOOGLE_MAPS_KEY) return;

    setLoading(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(prediction.place_id)}&fields=geometry,formatted_address,address_components&language=fr&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      const json: PlaceDetailsResponse = await res.json();

      if (!mountedRef.current) return;

      if (json.status === 'OK' && json.result) {
        const { geometry, formatted_address, address_components } = json.result;
        const get = (type: string) =>
          address_components?.find((c) => c.types.includes(type))?.long_name;

        onSelect({
          latitude: geometry.location.lat,
          longitude: geometry.location.lng,
          address: prediction.structured_formatting.main_text,
          city: get('locality') || get('administrative_area_level_2'),
          district: get('sublocality') || get('neighborhood'),
          formattedAddress: formatted_address,
        });
      }
    } catch (e) {
      if (__DEV__) console.warn('[AddressAutocomplete] place details error:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [onChangeText, onSelect]);

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
  },
  secondaryText: {
    fontSize: 12,
    marginTop: 2,
  },
});
