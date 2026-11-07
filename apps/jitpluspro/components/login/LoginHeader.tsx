// Login header: brass arch around the logo, greeting, brand name and tagline.
// Memoised with stable Animated values as props, so typing in the form below
// never re-renders the arch SVGs or rebuilds their animation nodes.
import React, { useMemo } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import BrandName from '@/components/BrandName';
import { palette } from '@/contexts/ThemeContext';
import { font } from '@/constants/design';
import { fontSize, hp, ms, radius } from '@/utils/responsive';
import ArchCrest from './ArchCrest';

/** Brass readable on white (≈5:1); the lighter palette.gold is used in dark mode. */
const BRASS_TEXT = '#8A6420';

interface LoginHeaderAnims {
  draw: Animated.Value;
  reveal: Animated.Value;
  keystone: Animated.Value;
  halo: Animated.Value;
  text: Animated.Value;
}

interface LoginHeaderProps {
  dark: boolean;
  anims: LoginHeaderAnims;
  compact: Animated.Value;
  isCompact: boolean;
  greeting: string;
  tagline: string;
  taglineColor: string;
}

export default React.memo(function LoginHeader({
  dark, anims, compact, isCompact, greeting, tagline, taglineColor,
}: LoginHeaderProps) {
  const textStyle = useMemo(() => ({
    opacity: anims.text,
    transform: [{ translateY: anims.text.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }), [anims.text]);

  return (
    <View style={styles.header}>
      <ArchCrest
        dark={dark}
        draw={anims.draw}
        reveal={anims.reveal}
        keystone={anims.keystone}
        halo={anims.halo}
        compact={compact}
        isCompact={isCompact}
      >
        <View style={styles.logoShadow}>
          <View style={styles.logo}>
            <Image
              source={require('@/assets/images/jitplusprologo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </ArchCrest>

      <Animated.View style={[styles.text, textStyle]}>
        <Text style={[styles.greeting, { color: dark ? palette.gold : BRASS_TEXT }]}>{greeting}</Text>
        <BrandName fontSize={ms(27)} />
        <Text style={[styles.tagline, { color: taglineColor }]}>{tagline}</Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: hp(28),
  },
  logoShadow: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: palette.violet,
        shadowOpacity: 0.42,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 7 },
    }),
  },
  logo: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  text: {
    alignItems: 'center',
    marginTop: hp(12),
  },
  greeting: {
    fontSize: fontSize.sm,
    fontFamily: font.semibold,
    letterSpacing: 0.4,
    marginBottom: hp(4),
  },
  tagline: {
    marginTop: hp(5),
    fontSize: fontSize.sm,
    fontFamily: font.medium,
  },
});
