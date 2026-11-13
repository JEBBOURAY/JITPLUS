import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Camera, Edit3, ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { palette } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import type { Merchant } from '@/types';
import { merchantInitials } from './merchantInitials';

const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 };
const COVER_SCRIM = ['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.6)'] as const;

interface Props {
  t: (key: string, opts?: Record<string, unknown>) => string;
  merchant: Merchant | null;
  uploadIsPending: boolean;
  coverUploadIsPending?: boolean;
  /** Omitted for team members: the avatar is then read-only. */
  onLogoPress?: () => void;
  onCoverPress?: () => void;
  onBackPress: () => void;
  onEditName?: () => void;
  /** Extra top padding (safe-area top inset). */
  topInset: number;
}

/**
 * Full-width header: the merchant cover photo, or a solid brand surface.
 * Hosts the back button, the "Changer la couverture" pill, the avatar with a
 * discreet camera badge, and the merchant name with an optional edit affordance.
 * Renders edge-to-edge so the body below can overlap with a negative marginTop
 * + rounded top corners, matching the design mockup.
 */
export default React.memo(function CoverHeader({
  t, merchant, uploadIsPending, coverUploadIsPending = false,
  onLogoPress, onCoverPress, onBackPress, onEditName, topInset,
}: Props) {
  const dir = useDir();
  const initials = useMemo(() => merchantInitials(merchant?.nom), [merchant?.nom]);

  return (
    <View style={styles.cover}>
      {coverUploadIsPending ? (
        <View style={[styles.coverBg, styles.coverUploadPending]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : merchant?.coverUrl ? (
        <>
          <ExpoImage
            source={resolveImageUrl(merchant.coverUrl)}
            style={styles.coverBg}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={merchant.coverUrl}
            transition={200}
          />
          {/* Scrim: keeps the white controls and name readable on a light photo. */}
          <LinearGradient colors={COVER_SCRIM} style={styles.coverBg} />
        </>
      ) : (
        <View style={[styles.coverBg, { backgroundColor: palette.violetDark }]} />
      )}

      <View style={[styles.coverTop, { flexDirection: dir.row, paddingTop: topInset + hp(8) }]}>
        <TouchableOpacity
          onPress={onBackPress}
          activeOpacity={0.7}
          style={styles.backBtn}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={ms(18)}
            color="#fff"
            strokeWidth={icon.stroke}
            style={dir.flip}
          />
        </TouchableOpacity>

        {onCoverPress && !coverUploadIsPending && (
          <TouchableOpacity
            onPress={onCoverPress}
            activeOpacity={0.8}
            style={[styles.coverEditBtn, { flexDirection: dir.row }]}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel={t('account.changeCover')}
          >
            <Camera size={ms(13)} color="#fff" strokeWidth={icon.strokeSmall} />
            <Text style={styles.coverEditBtnText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {t('account.changeCover')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.avatarBlock}>
        <TouchableOpacity
          onPress={onLogoPress}
          disabled={!onLogoPress}
          activeOpacity={0.85}
          accessibilityRole={onLogoPress ? 'button' : 'image'}
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
          {onLogoPress && (
            <View style={[styles.avatarCam, dir.isRTL ? styles.avatarCamRtl : styles.avatarCamLtr]}>
              <Camera size={ms(12)} color={palette.violet} strokeWidth={icon.strokeSmall} />
            </View>
          )}
        </TouchableOpacity>

        {/* The whole name is the edit target, not just the small pencil. */}
        <TouchableOpacity
          onPress={onEditName}
          disabled={!onEditName}
          activeOpacity={0.7}
          style={[styles.merchantNameRow, { flexDirection: dir.row }]}
          hitSlop={HIT_SLOP_8}
          accessibilityRole={onEditName ? 'button' : 'text'}
          accessibilityLabel={onEditName ? `${merchant?.nom ?? ''}, ${t('profileView.editProfileName')}` : undefined}
        >
          <Text
            style={styles.merchantName}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.3}
          >
            {merchant?.nom}
          </Text>
          {onEditName && <Edit3 size={ms(14)} color="#fff" strokeWidth={icon.strokeSmall} />}
        </TouchableOpacity>
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
    ...StyleSheet.absoluteFill,
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  coverEditBtnText: {
    fontSize: FS.xs,
    color: '#fff',
    fontFamily: font.semibold,
  },
  avatarBlock: {
    alignItems: 'center',
    marginTop: hp(14),
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
    fontFamily: font.semibold,
  },
  avatarCam: {
    position: 'absolute',
    bottom: 0,
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  avatarCamLtr: { right: 0 },
  avatarCamRtl: { left: 0 },
  merchantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(7),
    marginTop: hp(12),
    marginHorizontal: wp(20),
    minHeight: ms(28),
  },
  merchantName: {
    fontSize: ms(17),
    color: '#fff',
    fontFamily: font.semibold,
    flexShrink: 1,
  },
});
