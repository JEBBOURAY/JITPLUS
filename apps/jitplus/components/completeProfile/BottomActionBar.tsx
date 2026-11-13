import { memo } from 'react';
import { View, TouchableOpacity, ActivityIndicator, I18nManager } from 'react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { s, DISABLED_COLORS, ICON_18, ICON_20 } from './styles';
import type { TranslateFn } from './types';

// Directional arrows point the reading way: Arabic reloads the app with forceRTL.
const DIR_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

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
  const btnColor = canProceed ? palette.violet : DISABLED_COLORS[0];
  return (
    <View style={[s.bottomBar, { borderTopColor: theme.border }]}>
      {step > 0 ? (
        <TouchableOpacity onPress={onBack} style={[s.backBtn, { borderColor: theme.border }]} activeOpacity={0.7}>
          <ArrowLeft size={ICON_20} color={theme.text} strokeWidth={2} style={DIR_FLIP} />
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
        <View style={[s.mainBtn, { backgroundColor: btnColor }]}>
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
              <ArrowRight size={ICON_18} color={canProceed ? '#fff' : 'rgba(255,255,255,0.5)'} style={DIR_FLIP} />
            </>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});
