import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, Hand } from 'lucide-react-native';
import { JitStar } from '@/components/icons';
import { getScratchDesign } from '@jitplus/shared/src/scratch';
import { ScratchCardFace, getScratchZone, scratchCardHeight } from '@jitplus/shared/src/scratch/ScratchCardFace';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { GAME_GOLD, GAME_VIOLET, GameStage, STAGE_TEXT, StagePill } from '@/components/games/GameStage';

const DOT_ROWS = 5;
const DOT_COLS = 10;

/** Coating of the client card (gradient, dot pattern, "scratch here" pill), drawn still. */
const Coating = React.memo(function Coating({ designId, width }: { designId?: string | null; width: number }) {
  const { t } = useLanguage();
  const design = getScratchDesign(designId);
  const zone = getScratchZone(width);
  const dotR = ms(6);
  return (
    <View
      pointerEvents="none"
      style={[styles.zone, { left: zone.x, top: zone.y, width: zone.width, height: zone.height, borderRadius: zone.radius }]}
    >
      <Svg width={zone.width} height={zone.height}>
        <Defs>
          <SvgGradient id="scratchPreviewCover" x1={0} y1={0} x2={zone.width} y2={zone.height} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={design.cover[0]} />
            <Stop offset={1} stopColor={design.cover[1]} />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width={zone.width} height={zone.height} fill="url(#scratchPreviewCover)" />
        {Array.from({ length: DOT_ROWS }, (_, row) => Array.from({ length: DOT_COLS }, (__, col) => (
          <Circle
            key={`${row}-${col}`}
            cx={(col + 0.5 + (row % 2) * 0.5) * (zone.width / DOT_COLS)}
            cy={(row + 0.5) * (zone.height / DOT_ROWS)}
            r={dotR}
            fill="#FFFFFF"
            fillOpacity={0.18}
          />
        )))}
      </Svg>
      <View style={styles.labelWrap}>
        <View style={styles.labelPill}>
          <Hand size={ms(16)} color="#FFFFFF" />
          <Text style={styles.labelText} maxFontSizeMultiplier={1.2}>{t('scratch.card.scratchHere')}</Text>
        </View>
      </View>
    </View>
  );
});

interface Props {
  designId?: string | null;
  width: number;
  merchantName: string;
  logoUrl?: string | null;
  /** Before: still covered, as received. After: the revealed reward. */
  side: 'before' | 'after';
  rewardText?: string | null;
  rewardDetail?: string | null;
  footer?: string | null;
  message?: string | null;
  /** "À gratter avant le…" pill above a covered card; hidden when omitted. */
  expiresLabel?: string;
}

/** The scratch card as clients see it in JitPlus: violet stage, glow and coating. */
export const ScratchPreview = React.memo(function ScratchPreview({
  designId, width, merchantName, logoUrl, side, rewardText, rewardDetail, footer, message, expiresLabel,
}: Props) {
  const { t, isRTL } = useLanguage();
  const design = getScratchDesign(designId);
  const height = scratchCardHeight(width);
  const before = side === 'before';

  return (
    <GameStage>
      {before && expiresLabel ? (
        <View style={styles.pills}>
          <StagePill icon={JitStar} text={t('scratch.card.alwaysWin')} />
          <StagePill icon={Clock} text={expiresLabel} muted />
        </View>
      ) : null}

      <View style={styles.cardWrap}>
        <View pointerEvents="none" style={[styles.glow, { width: width * 0.85, height: height * 0.7, backgroundColor: design.gradient[0] }]} />
        <View style={[styles.cardShadow, { width, height }]}>
          <ScratchCardFace
            designId={designId}
            width={width}
            merchantName={merchantName}
            logoUrl={logoUrl}
            caption={before ? t('scratch.card.alwaysWin') : t('scratch.card.youWon')}
            rewardText={rewardText}
            rewardDetail={rewardDetail}
            footer={footer}
            isRTL={isRTL}
          />
          {before && <Coating designId={designId} width={width} />}
        </View>
      </View>

      {message ? (
        <View style={[styles.message, isRTL ? styles.messageRtl : styles.messageLtr]}>
          <Text style={[styles.messageText, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={4} maxFontSizeMultiplier={1.3}>
            {message}
          </Text>
        </View>
      ) : null}
    </GameStage>
  );
});

/** Small card in the campaign's own colours, for list rows. */
export const ScratchTile = React.memo(function ScratchTile({ designId, size }: { designId?: string | null; size: number }) {
  const design = getScratchDesign(designId);
  return (
    <LinearGradient
      colors={[design.gradient[0], design.gradient[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.26, padding: size * 0.14 }]}
    >
      <LinearGradient
        colors={[design.cover[0], design.cover[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tileCover, { height: size * 0.38, borderRadius: size * 0.1 }]}
      >
        <JitStar size={size * 0.2} color="#FFFFFF" strokeWidth={2} />
      </LinearGradient>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  zone: { position: 'absolute', overflow: 'hidden' },
  labelWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  labelText: { color: '#FFFFFF', fontSize: ms(14), fontFamily: font.bold, letterSpacing: 0.4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  cardWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.45,
    shadowColor: GAME_VIOLET.vivid,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 50,
  },
  cardShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 16,
  },
  message: { alignSelf: 'stretch', padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  messageLtr: { borderLeftWidth: 3, borderLeftColor: GAME_GOLD.light },
  messageRtl: { borderRightWidth: 3, borderRightColor: GAME_GOLD.light },
  messageText: { color: STAGE_TEXT.strong, opacity: 0.9, fontSize: ms(13), lineHeight: ms(20), fontFamily: font.regular, fontStyle: 'italic' },
  tile: { justifyContent: 'flex-end' },
  tileCover: { alignItems: 'center', justifyContent: 'center' },
});
