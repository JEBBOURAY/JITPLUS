// ── Shared OfflineBanner ─────────────────────────────────────────────────────
// Shows a red banner when the device has no network connection.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useNetworkStatus } from './useNetworkStatus';

interface OfflineBannerProps {
  text?: string;
  topInset?: number;
}

export default function OfflineBanner({ text = 'Pas de connexion internet', topInset = 0 }: OfflineBannerProps) {
  const { isConnected } = useNetworkStatus();

  if (isConnected !== false) return null;

  return (
    <View style={[styles.banner, { paddingTop: topInset + 4 }]}>
      <WifiOff size={16} color="#fff" strokeWidth={2.5} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
