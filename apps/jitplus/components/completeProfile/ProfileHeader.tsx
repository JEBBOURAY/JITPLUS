import { memo } from 'react';
import { View, Image, Animated } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import BrandText from '@/components/BrandText';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { s } from './styles';
import type { TranslateFn } from './types';

type BorderTheme = { border: string };

export const StepDot = memo(function StepDot({ index, current, theme }: { index: number; current: number; theme: BorderTheme }) {
  const active = index <= current;
  return (
    <View style={[s.stepDot, { backgroundColor: active ? palette.violet : theme.border }]}>
      {index < current && <CheckCircle2 size={ms(12)} color="#fff" strokeWidth={2} />}
      {index === current && <View style={s.stepDotInner} />}
    </View>
  );
});

export const StepLine = memo(function StepLine({ filled, theme }: { filled: boolean; theme: BorderTheme }) {
  return <View style={[s.stepLine, { backgroundColor: filled ? palette.violet : theme.border }]} />;
});

interface ProfileHeaderProps {
  headerStyle: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  visibleSteps: number[];
  step: number;
  visibleStepIndex: number;
  displayTotal: number;
  theme: BorderTheme;
  t: TranslateFn;
}

export const ProfileHeader = memo(function ProfileHeader({
  headerStyle, visibleSteps, step, visibleStepIndex, displayTotal, theme, t,
}: ProfileHeaderProps) {
  return (
    <Animated.View style={[s.header, headerStyle]}>
      <View style={s.logoRow}>
        <Image source={require('@/assets/images/jitpluslogo-app.png')} style={s.logo} resizeMode="contain" />
        <BrandText size={18} />
      </View>

      <View style={s.stepIndicator}>
        {visibleSteps.map((vstep, i) => (
          <View key={vstep} style={s.stepGroup}>
            {i > 0 && <StepLine filled={step >= vstep} theme={theme} />}
            <StepDot index={i} current={visibleStepIndex} theme={theme} />
          </View>
        ))}
      </View>
      <Text style={s.stepCounter}>
        {t('completeProfile.stepOf', { current: visibleStepIndex + 1, total: displayTotal })}
      </Text>
    </Animated.View>
  );
});
