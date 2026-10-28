import { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/AppText';
import { s } from './styles';

export const StrengthBar = memo(function StrengthBar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <View style={s.strengthRow}>
      <View style={s.strengthTrack}>
        <View style={[s.strengthFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.strengthLabel, { color }]}>{label}</Text>
    </View>
  );
});
