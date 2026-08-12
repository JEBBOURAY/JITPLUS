import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, I18nManager, Platform } from 'react-native';
import { Camera, Edit3, ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { palette } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import type { Merchant } from '@/types';

interface Props {
  t: (key: string, opts?: Record<string, unknown>) => string;
  merchant: Merchant | null;
  uploadIsPending: boolean;
  coverUploadIsPending?: boolean;
  onLogoPress: () => void;
  onCoverPress?: () => void;
  onBackPress: () => void;
  onEditName?: () => void;
  /** Extra top padding (safe-area top inset). */
  topInset: number;
}

/**
 * Full-width gradient header (or ExpoImage if merchant.coverUrl is set).
 * Hosts the back button, the "Changer la couverture" pill, the avatar with a
 * discreet camera badge, and the merchant name with an optional edit affordance.
 * Renders edge-to-edge so the body below can overlap with a negative marginTop
 * + rounded top corners, matching the design mockup.
 */
export default React.memo(function CoverHeader({
  t, merchant, uploadIsPending, coverUploadIsPending = false,
  onLogoPress, onCoverPress, onBackPress, onEditName, topInset,
}: Props) {
  const initials = useMemo(
    () => (merchant?.nom
      ? merchant.nom.split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 2).toUpperCase()
      : '?'),
    [merchant?.nom],
  );

  return (
    <View style={styles.cover}>
      {/* -- Background: real cover image OR the brand gradient -- */}
      {coverUploadIsPending ? (
        <View style={[styles.coverBg, styles.coverUploadPending]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : merchant?.coverUrl ? (
        <ExpoImage
          source={resolveImageUrl(merchant.coverUrl)}
          style={styles.coverBg}
          contentFit="cover"
          cachePolicy="disk"
          recyclingKey={merchant.coverUrl}
          transition={200}
        />
      ) : (
        <LinearGradient
          colors={['#5B21B6', '#7C3AED', '#1F2937']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.55, 1]}
          style={styles.coverBg}
        />
      )}

      {/* -- Top row: back button (LTR left / RTL right) + "Changer la couverture" pill -- */}
      <View style={[styles.coverTop, { paddingTop: topInset + hp(8) }]}>
        <TouchableOpacity
          onPress={onBackPress}
          activeOpacity={0.7}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ChevronLeft
            size={ms(18)}
            color="#fff"
            strokeWidth={2}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>

        {onCoverPress && !coverUploadIsPending && (
          <TouchableOpacity
            onPress={onCoverPress}
            activeOpacity={0.8}
            style={styles.coverEditBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('account.changeCover')}
          >
            <Camera size={ms(13)} color="#fff" strokeWidth={2} />
            <Text style={styles.coverEditBtnText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {t('account.changeCover')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* -- Avatar with discreet white/violet camera badge -- */}
      <View style={styles.avatarBlock}>
        <TouchableOpacity
          onPress={onLogoPress}
          activeOpacity={0.85}
          style={styles.avatarWrap}
          accessibilityRole="button"
          accessibilityLabel={t('account.profilePhoto')}
        >
          <View style={styles.avatar}>
            {uploadIsPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : merchant?.logoUrl ? (
              <MerchantLogo logoUrl={merchant.logoUrl} style={styles.avatarLogo} />
            ) : (
              <Text style={styles.avatarInitials} maxFontSizeMultiplier={1.3}>{initials}</Text>
            )}
          </View>
          <View style={styles.avatarCam}>
            <Camera size={ms(12)} color={palette.violet} strokeWidth={2.4} />
          </View>
        </TouchableOpacity>

        <View style={styles.merchantNameRow}>
          <Text
            style={styles.merchantName}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.3}
          >
            {merchant?.nom}
          </Text>
          {onEditName && (
            <TouchableOpacity
              onPress={onEditName}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t('profileView.editProfileName')}
            >
              <Edit3 size={ms(13)} color="rgba(255,255,255,0.7)" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    paddingBottom: hp(46),
    position: 'relative',
    overflow: 'hidden',
  },
  coverBg: {
    ...StyleSheet.absoluteFillObject,
  },
  coverUploadPending: {
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(18),
  },
  backBtn: {
    width: ms(38),
    height: ms(38),
    borderRadius: ms(12),
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(12),
    height: ms(34),
    borderRadius: ms(12),
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  coverEditBtnText: {
    fontSize: FS.xs,
    color: '#fff',
    fontFamily: 'Lexend_600SemiBold',
  },
  avatarBlock: {
    alignItems: 'center',
    marginTop: hp(14),
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: ms(90),
    height: ms(90),
    borderRadius: ms(45),
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarLogo: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: ms(30),
    color: '#fff',
    letterSpacing: 1,
    fontFamily: 'Lexend_700Bold',
  },
  avatarCam: {
    position: 'absolute',
    bottom: 0,
    [I18nManager.isRTL ? 'left' : 'right']: 0,
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  merchantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(7),
    marginTop: hp(12),
    paddingHorizontal: wp(20),
  },
  merchantName: {
    fontSize: ms(17),
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
  },
});
