// Sign-in header: brass arch around the logo, greeting, brand name and tagline.
// Memoised with stable Animated values as props, so typing in the form below
// never re-renders the arch SVGs or rebuilds their animation nodes.
import React, { useMemo } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import BrandText from '@/components/BrandText';
import { fontSize, hp, ms, radius } from '@/utils/responsive';
import ArchCrest, { ARCH_CREST_BASE_WIDTH } from '@jitplus/shared/src/login/ArchCrest';
import { BRASS, BRASS_TEXT } from './brass';

export interface LoginHeaderAnims {
  draw: Animated.Value;
  reveal: Animated.Value;
  keystone: Animated.Value;
  text: Animated.Value;
}

interface LoginHeaderProps {
  dark: boolean;
  anims: LoginHeaderAnims;
  compact: Animated.Value;
  isCompact: boolean;
  greeting?: string;
  tagline?: string;
  /** What the app does, for a first-time visitor; hidden once the email form opens. */
  subtitle?: string;
  taglineColor: string;
}

export default React.memo(function LoginHeader({
  dark, anims, compact, isCompact, greeting, tagline, subtitle, taglineColor,
}: LoginHeaderProps) {
  const textStyle = useMemo(() => ({
    opacity: anims.text,
    transform: [{ translateY: anims.text.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }), [anims.text]);

  return (
    <View style={styles.header}>
      <ArchCrest
        dark={dark}
        width={ms(ARCH_CREST_BASE_WIDTH)}
        draw={anims.draw}
        reveal={anims.reveal}
        keystone={anims.keystone}
        compact={compact}
        isCompact={isCompact}
      >
        <View style={styles.logoShadow}>
          <View style={styles.logo}>
            <Image source={require('@/assets/images/jitpluslogo-app.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
        </View>
      </ArchCrest>

      <Animated.View style={[styles.text, textStyle]}>
        {!!greeting && <Text style={[styles.greeting, { color: dark ? BRASS : BRASS_TEXT }]}>{greeting}</Text>}
        <BrandText size={27} />
        {!!tagline && <Text style={[styles.tagline, { color: taglineColor }]}>{tagline}</Text>}
        {!!subtitle && !isCompact && <Text style={[styles.subtitle, { color: taglineColor }]}>{subtitle}</Text>}
      </Animated.View>
    </View>
  );
});

/** Values for a header shown without its intro (already drawn). */
export function staticHeaderAnims(): LoginHeaderAnims {
  const done = new Animated.Value(1);
  return { draw: done, reveal: done, keystone: done, text: done };
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: hp(24) },
  logoShadow: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      default: { elevation: 1 },
    }),
  },
  logo: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: radius.lg, overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  text: { alignItems: 'center', marginTop: hp(12) },
  greeting: { fontSize: fontSize.sm, fontWeight: '600', letterSpacing: 0.4, marginBottom: hp(4) },
  tagline: { marginTop: hp(5), fontSize: fontSize.sm, fontWeight: '500', textAlign: 'center' },
  subtitle: { marginTop: hp(10), maxWidth: 320, fontSize: fontSize.sm, lineHeight: fontSize.sm * 1.45, textAlign: 'center' },
});
