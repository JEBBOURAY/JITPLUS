import { memo } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { s, ACTIVE_COLORS, DISABLED_COLORS, GRAD_START, GRAD_END_HORIZ, ICON_18, ICON_20 } from './styles';
import type { TranslateFn } from './types';

interface BottomActionBarProps {
  theme: ThemeColors;
  t: TranslateFn;
  step: number;
  isLoading: boolean;
  canProceed: boolean;
  hasDate: boolean;
  onBack: () => void;
  onPrimary: () => void;
}

export const BottomActionBar = memo(function BottomActionBar({
  theme, t, step, isLoading, canProceed, hasDate, onBack, onPrimary,
}: BottomActionBarProps) {
  const btnColors = canProceed ? ACTIVE_COLORS : DISABLED_COLORS;
  return (
    <View style={[s.bottomBar, { borderTopColor: theme.border }]}>
      {step > 0 ? (
        <TouchableOpacity onPress={onBack} style={[s.backBtn, { borderColor: theme.border }]} activeOpacity={0.7}>
          <ArrowLeft size={ICON_20} color={theme.text} strokeWidth={2} />
        </TouchableOpacity>
      ) : (
        <View style={s.backBtnPlaceholder} />
      )}

      <TouchableOpacity
        onPress={onPrimary}
        disabled={isLoading}
        activeOpacity={0.85}
        style={{ flex: 1 }}
      >
        <LinearGradient colors={btnColors} start={GRAD_START} end={GRAD_END_HORIZ} style={s.mainBtn}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={[s.mainBtnText, { opacity: canProceed ? 1 : 0.5 }]}>
                {step < 2
                  ? t('completeProfile.continue')
                  : hasDate
                    ? t('completeProfile.createAccount')
                    : t('completeProfile.skipAndFinish')}
              </Text>
              <ArrowRight size={ICON_18} color={canProceed ? '#fff' : 'rgba(255,255,255,0.5)'} />
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
});
