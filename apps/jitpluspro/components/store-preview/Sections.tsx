/**
 * Memoized subsections for the Store Preview screen.
 *
 * Why this file exists
 * --------------------
 * `app/store-preview.tsx` is a single mega-component that mounts ~43 lucide
 * icon tiles + 7 hour blocks + chip grids + gallery + color rows inside one
 * ScrollView. Before this split, every keystroke in the tagline TextInput
 * re-rendered the *entire* subtree, which is the root cause of the iOS lag
 * reported after 1.4.9 (the customization page added all of the above at
 * once). Splitting into pure `React.memo` children with primitive props
 * means siblings no longer re-render when an unrelated piece of state
 * changes — this is where the perceptible perf wins come from.
 */
import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Check,
  X as XIcon,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react-native';
import { ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import {
  MERCHANT_ICON_MAP,
  MERCHANT_ICON_SLUGS,
} from '@/utils/merchantIcons';
import {
  getCategoryOptions,
  CATEGORY_EMOJIS,
} from '@/constants/categories';
import {
  MERCHANT_BADGE_CODES,
  type MerchantBadge,
  type MerchantCategory,
  type OpeningHours,
} from '@/types';

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WeekDayKey = (typeof WEEK_DAYS)[number];

function autoFormatTime(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

type T = (key: string, opts?: any) => string;

// ──────────────────────────────────────────────────────────────
// Preset color swatches
// ──────────────────────────────────────────────────────────────
export interface PresetSwatchesProps {
  presets: readonly { hex: string; nameKey: string }[];
  selected: string;
  textColor: string;
  onPick: (hex: string) => void;
}
export const PresetSwatches = memo(function PresetSwatches({
  presets, selected, textColor, onPick,
}: PresetSwatchesProps) {
  const lower = selected.toLowerCase();
  return (
    <View style={s.swatchGrid}>
      {presets.map(({ hex }) => (
        <PresetSwatch
          key={hex}
          hex={hex}
          isActive={hex.toLowerCase() === lower}
          textColor={textColor}
          onPick={onPick}
        />
      ))}
    </View>
  );
});

const PresetSwatch = memo(function PresetSwatch({
  hex, isActive, textColor, onPick,
}: {
  hex: string;
  isActive: boolean;
  textColor: string;
  onPick: (hex: string) => void;
}) {
  const handlePress = useCallback(() => onPick(hex), [hex, onPick]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[
        s.swatch,
        { backgroundColor: hex, borderColor: isActive ? textColor : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={hex}
      accessibilityState={{ selected: isActive }}
    >
      {isActive && <Check size={18} color="#FFFFFF" strokeWidth={3} />}
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Icon picker grid (43 lucide tiles — the heaviest child)
// ──────────────────────────────────────────────────────────────
export interface IconGridProps {
  selectedIcon: string | null;
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  textMuted: string;
  noIconLabel: string;
  onSelect: (slug: string | null) => void;
}
export const IconGrid = memo(function IconGrid({
  selectedIcon, accent, bgCard, borderLight, textColor, textMuted, noIconLabel, onSelect,
}: IconGridProps) {
  const handleClear = useCallback(() => onSelect(null), [onSelect]);
  return (
    <View style={s.iconGrid}>
      <TouchableOpacity
        onPress={handleClear}
        activeOpacity={0.85}
        style={[
          s.iconTile,
          { backgroundColor: bgCard, borderColor: !selectedIcon ? accent : borderLight },
        ]}
        accessibilityRole="button"
        accessibilityLabel={noIconLabel}
        accessibilityState={{ selected: !selectedIcon }}
      >
        <XIcon size={ms(18)} color={textMuted} strokeWidth={1.75} />
      </TouchableOpacity>
      {MERCHANT_ICON_SLUGS.map((slug) => (
        <IconTile
          key={slug}
          slug={slug}
          isActive={selectedIcon === slug}
          accent={accent}
          bgCard={bgCard}
          borderLight={borderLight}
          textColor={textColor}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
});

const IconTile = memo(function IconTile({
  slug, isActive, accent, bgCard, borderLight, textColor, onSelect,
}: {
  slug: string;
  isActive: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  onSelect: (slug: string) => void;
}) {
  const Cmp = MERCHANT_ICON_MAP[slug];
  const handlePress = useCallback(() => onSelect(slug), [slug, onSelect]);
  if (!Cmp) return null;
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[
        s.iconTile,
        {
          backgroundColor: isActive ? `${accent}15` : bgCard,
          borderColor: isActive ? accent : borderLight,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={slug}
      accessibilityState={{ selected: isActive }}
    >
      <Cmp size={ms(18)} color={isActive ? accent : textColor} strokeWidth={1.75} />
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Secondary category chips
// ──────────────────────────────────────────────────────────────
export interface SecondaryChipsProps {
  primaryCategory: MerchantCategory | null | undefined;
  selected: MerchantCategory[];
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  onToggle: (cat: MerchantCategory) => void;
}
export const SecondaryChips = memo(function SecondaryChips({
  primaryCategory, selected, accent, bgCard, borderLight, textColor, onToggle,
}: SecondaryChipsProps) {
  return (
    <View style={s.categoryChipsRow}>
      {getCategoryOptions()
        .filter((opt) => opt.value !== primaryCategory)
        .map((opt) => (
          <SecondaryChip
            key={opt.value}
            value={opt.value}
            label={opt.label}
            emoji={CATEGORY_EMOJIS[opt.value] ?? '🏷️'}
            isActive={selected.includes(opt.value)}
            disabled={!selected.includes(opt.value) && selected.length >= 3}
            accent={accent}
            bgCard={bgCard}
            borderLight={borderLight}
            textColor={textColor}
            onToggle={onToggle}
          />
        ))}
    </View>
  );
});

const SecondaryChip = memo(function SecondaryChip({
  value, label, emoji, isActive, disabled, accent, bgCard, borderLight, textColor, onToggle,
}: {
  value: MerchantCategory;
  label: string;
  emoji: string;
  isActive: boolean;
  disabled: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  onToggle: (v: MerchantCategory) => void;
}) {
  const handlePress = useCallback(() => onToggle(value), [value, onToggle]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        s.categoryChip,
        {
          backgroundColor: isActive ? `${accent}15` : bgCard,
          borderColor: isActive ? accent : borderLight,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
    >
      <Text style={{ fontSize: ms(13) }}>{emoji}</Text>
      <Text style={[s.categoryChipText, { color: isActive ? accent : textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {isActive && <Check size={ms(13)} color={accent} strokeWidth={2.5} />}
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Badges chips
// ──────────────────────────────────────────────────────────────
export interface BadgesChipsProps {
  selected: MerchantBadge[];
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  t: T;
  onToggle: (code: MerchantBadge) => void;
}
export const BadgesChips = memo(function BadgesChips({
  selected, accent, bgCard, borderLight, textColor, t, onToggle,
}: BadgesChipsProps) {
  return (
    <View style={s.categoryChipsRow}>
      {MERCHANT_BADGE_CODES.map((code) => (
        <BadgeChip
          key={code}
          code={code}
          label={t(`storePreview.badges.${code}` as never)}
          isActive={selected.includes(code)}
          disabled={!selected.includes(code) && selected.length >= 8}
          accent={accent}
          bgCard={bgCard}
          borderLight={borderLight}
          textColor={textColor}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
});

const BadgeChip = memo(function BadgeChip({
  code, label, isActive, disabled, accent, bgCard, borderLight, textColor, onToggle,
}: {
  code: MerchantBadge;
  label: string;
  isActive: boolean;
  disabled: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  onToggle: (c: MerchantBadge) => void;
}) {
  const handlePress = useCallback(() => onToggle(code), [code, onToggle]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        s.categoryChip,
        {
          backgroundColor: isActive ? `${accent}15` : bgCard,
          borderColor: isActive ? accent : borderLight,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[s.categoryChipText, { color: isActive ? accent : textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {isActive && <Check size={ms(13)} color={accent} strokeWidth={2.5} />}
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Tagline input — owns its own state so typing does NOT re-render
// the entire store-preview tree. Commits on blur and when initial
// value changes (i.e. fresh data from server).
// ──────────────────────────────────────────────────────────────
export interface TaglineInputProps {
  initialValue: string;
  placeholder: string;
  accessibilityLabel: string;
  textColor: string;
  textMuted: string;
  borderLight: string;
  bgCard: string;
  max?: number;
  onCommit: (value: string) => void;
}
export const TaglineInput = memo(function TaglineInput({
  initialValue, placeholder, accessibilityLabel,
  textColor, textMuted, borderLight, bgCard, max = 120, onCommit,
}: TaglineInputProps) {
  const [value, setValue] = useState(initialValue);
  // Resync when underlying merchant changes
  const lastInitialRef = React.useRef(initialValue);
  if (lastInitialRef.current !== initialValue) {
    lastInitialRef.current = initialValue;
    setValue(initialValue);
  }
  const handleChange = useCallback((v: string) => setValue(v.slice(0, max)), [max]);
  const handleBlur = useCallback(() => {
    if (value !== initialValue) onCommit(value);
  }, [value, initialValue, onCommit]);
  return (
    <View style={[s.taglineWrap, { borderColor: borderLight, backgroundColor: bgCard }]}>
      <TextInput
        value={value}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={textMuted}
        maxLength={max}
        multiline
        style={[s.taglineInput, { color: textColor }]}
        accessibilityLabel={accessibilityLabel}
      />
      <Text style={[s.taglineCounter, { color: textMuted }]}>
        {value.length}/{max}
      </Text>
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Hours editor — extracted because every TextInput keystroke
// previously re-rendered the whole store-preview tree (and the
// 43 icon tiles with it). Each day block is a memoized child.
// ──────────────────────────────────────────────────────────────
export interface HoursEditorProps {
  hours: OpeningHours;
  accent: string;
  bg: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  textMuted: string;
  t: T;
  onToggleClosed: (day: WeekDayKey, closed: boolean) => void;
  onAddSlot: (day: WeekDayKey) => void;
  onRemoveSlot: (day: WeekDayKey, idx: number) => void;
  onUpdateSlot: (day: WeekDayKey, idx: number, field: 'open' | 'close', value: string) => void;
}
export const HoursEditor = memo(function HoursEditor({
  hours, accent, bg, bgCard, borderLight, textColor, textMuted, t,
  onToggleClosed, onAddSlot, onRemoveSlot, onUpdateSlot,
}: HoursEditorProps) {
  return (
    <View style={[s.hoursContainer, { backgroundColor: bgCard, borderColor: borderLight }]}>
      {WEEK_DAYS.map((day, idx) => (
        <HoursDayBlock
          key={day}
          day={day}
          dayData={hours[day]}
          isFirst={idx === 0}
          accent={accent}
          bg={bg}
          borderLight={borderLight}
          textColor={textColor}
          textMuted={textMuted}
          t={t}
          onToggleClosed={onToggleClosed}
          onAddSlot={onAddSlot}
          onRemoveSlot={onRemoveSlot}
          onUpdateSlot={onUpdateSlot}
        />
      ))}
    </View>
  );
});

const HoursDayBlock = memo(function HoursDayBlock({
  day, dayData, isFirst, accent, bg, borderLight, textColor, textMuted, t,
  onToggleClosed, onAddSlot, onRemoveSlot, onUpdateSlot,
}: {
  day: WeekDayKey;
  dayData: OpeningHours[WeekDayKey];
  isFirst: boolean;
  accent: string;
  bg: string;
  borderLight: string;
  textColor: string;
  textMuted: string;
  t: T;
  onToggleClosed: (day: WeekDayKey, closed: boolean) => void;
  onAddSlot: (day: WeekDayKey) => void;
  onRemoveSlot: (day: WeekDayKey, idx: number) => void;
  onUpdateSlot: (day: WeekDayKey, idx: number, field: 'open' | 'close', value: string) => void;
}) {
  const isClosed = !!dayData?.closed;
  const slots = dayData?.slots ?? [];
  const handleToggle = useCallback(() => onToggleClosed(day, !isClosed), [day, isClosed, onToggleClosed]);
  const handleAdd = useCallback(() => onAddSlot(day), [day, onAddSlot]);
  return (
    <View style={[s.hoursDayBlock, !isFirst && { borderTopWidth: 1, borderTopColor: borderLight }]}>
      <View style={s.hoursDayHeader}>
        <Text style={[s.hoursDayLabel, { color: textColor }]}>{t(`storePreview.days.${day}` as never)}</Text>
        <TouchableOpacity
          onPress={handleToggle}
          style={[s.hoursToggle, { backgroundColor: isClosed ? '#ef444415' : `${accent}15`, borderColor: isClosed ? '#ef4444' : accent }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: !isClosed }}
        >
          <Text style={[s.hoursToggleText, { color: isClosed ? '#ef4444' : accent }]}>
            {isClosed ? t('storePreview.hoursClosed') : t('storePreview.hoursOpen')}
          </Text>
        </TouchableOpacity>
      </View>
      {!isClosed && (
        <View style={s.hoursSlots}>
          {slots.map((slot, sIdx) => (
            <HoursSlotRow
              key={sIdx}
              day={day}
              idx={sIdx}
              open={slot.open}
              close={slot.close}
              bg={bg}
              borderLight={borderLight}
              textColor={textColor}
              textMuted={textMuted}
              onUpdate={onUpdateSlot}
              onRemove={onRemoveSlot}
            />
          ))}
          {slots.length < 3 && (
            <TouchableOpacity
              onPress={handleAdd}
              style={[s.hoursAddBtn, { borderColor: accent }]}
            >
              <Plus size={ms(14)} color={accent} strokeWidth={2} />
              <Text style={[s.hoursAddText, { color: accent }]}>{t('storePreview.hoursAddSlot')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

const HoursSlotRow = memo(function HoursSlotRow({
  day, idx, open, close, bg, borderLight, textColor, textMuted, onUpdate, onRemove,
}: {
  day: WeekDayKey;
  idx: number;
  open: string;
  close: string;
  bg: string;
  borderLight: string;
  textColor: string;
  textMuted: string;
  onUpdate: (day: WeekDayKey, idx: number, field: 'open' | 'close', value: string) => void;
  onRemove: (day: WeekDayKey, idx: number) => void;
}) {
  // Local buffers so each keystroke only re-renders THIS row.
  const [openBuf, setOpenBuf] = useState(open);
  const [closeBuf, setCloseBuf] = useState(close);
  const lastOpen = React.useRef(open);
  const lastClose = React.useRef(close);
  if (lastOpen.current !== open) { lastOpen.current = open; setOpenBuf(open); }
  if (lastClose.current !== close) { lastClose.current = close; setCloseBuf(close); }
  const handleOpen = useCallback((v: string) => setOpenBuf(autoFormatTime(v)), []);
  const handleClose = useCallback((v: string) => setCloseBuf(autoFormatTime(v)), []);
  const commitOpen = useCallback(() => {
    if (openBuf !== open) onUpdate(day, idx, 'open', openBuf);
  }, [openBuf, open, onUpdate, day, idx]);
  const commitClose = useCallback(() => {
    if (closeBuf !== close) onUpdate(day, idx, 'close', closeBuf);
  }, [closeBuf, close, onUpdate, day, idx]);
  const handleRemove = useCallback(() => onRemove(day, idx), [day, idx, onRemove]);
  return (
    <View style={s.hoursSlotRow}>
      <TextInput
        value={openBuf}
        onChangeText={handleOpen}
        onBlur={commitOpen}
        placeholder="09:00"
        placeholderTextColor={textMuted}
        maxLength={5}
        keyboardType="numbers-and-punctuation"
        style={[s.hoursTimeInput, { color: textColor, borderColor: borderLight, backgroundColor: bg }]}
      />
      <Text style={[s.hoursTimeSep, { color: textMuted }]}>–</Text>
      <TextInput
        value={closeBuf}
        onChangeText={handleClose}
        onBlur={commitClose}
        placeholder="18:00"
        placeholderTextColor={textMuted}
        maxLength={5}
        keyboardType="numbers-and-punctuation"
        style={[s.hoursTimeInput, { color: textColor, borderColor: borderLight, backgroundColor: bg }]}
      />
      <TouchableOpacity onPress={handleRemove} style={s.hoursSlotRemove} hitSlop={8}>
        <Trash2 size={ms(16)} color="#ef4444" strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Gallery grid (up to 5 thumbnails + add tile)
// ──────────────────────────────────────────────────────────────
export interface GalleryGridProps {
  items: string[];
  max: number;
  tileSize: number;
  busyUrl: string | null;
  isUploading: boolean;
  isMutationPending: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  galleryCoverLabel: string;
  galleryAddLabel: string;
  galleryDeleteLabel: string;
  gallerySetCoverLabel: string;
  onAddPhotos: () => void;
  onRemove: (url: string) => void;
  onSetCover: (idx: number) => void;
  onMove: (from: number, to: number) => void;
}
export const GalleryGrid = memo(function GalleryGrid({
  items, max, tileSize, busyUrl, isUploading, isMutationPending,
  accent, bgCard, borderLight,
  galleryCoverLabel, galleryAddLabel, galleryDeleteLabel, gallerySetCoverLabel,
  onAddPhotos, onRemove, onSetCover, onMove,
}: GalleryGridProps) {
  return (
    <View style={s.galleryGrid}>
      {items.map((url, idx) => (
        <GalleryThumb
          key={`${url}_${idx}`}
          url={url}
          idx={idx}
          total={items.length}
          isBusy={busyUrl === url}
          isMutationPending={isMutationPending}
          accent={accent}
          bgCard={bgCard}
          borderLight={borderLight}
          tileSize={tileSize}
          galleryCoverLabel={galleryCoverLabel}
          galleryDeleteLabel={galleryDeleteLabel}
          gallerySetCoverLabel={gallerySetCoverLabel}
          onRemove={onRemove}
          onSetCover={onSetCover}
          onMove={onMove}
        />
      ))}
      {items.length < max && (
        <TouchableOpacity
          onPress={onAddPhotos}
          disabled={isUploading}
          style={[s.galleryAddBtn, { borderColor: accent, backgroundColor: `${accent}10`, width: tileSize, height: tileSize }]}
          accessibilityRole="button"
          accessibilityLabel={galleryAddLabel}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <>
              <View style={[s.galleryAddIconCircle, { backgroundColor: accent }]}>
                <Plus size={ms(18)} color="#fff" strokeWidth={2.5} />
              </View>
              <Text style={[s.galleryAddText, { color: accent }]} numberOfLines={2}>
                {galleryAddLabel}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

const GalleryThumb = memo(function GalleryThumb({
  url, idx, total, isBusy, isMutationPending, accent, bgCard, borderLight, tileSize,
  galleryCoverLabel, galleryDeleteLabel, gallerySetCoverLabel,
  onRemove, onSetCover, onMove,
}: {
  url: string;
  idx: number;
  total: number;
  isBusy: boolean;
  isMutationPending: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  tileSize: number;
  galleryCoverLabel: string;
  galleryDeleteLabel: string;
  gallerySetCoverLabel: string;
  onRemove: (url: string) => void;
  onSetCover: (idx: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const isCover = idx === 0;
  const isLast = idx === total - 1;
  const handleRemove = useCallback(() => onRemove(url), [url, onRemove]);
  const handleSetCover = useCallback(() => onSetCover(idx), [idx, onSetCover]);
  const handleLeft = useCallback(() => onMove(idx, idx - 1), [idx, onMove]);
  const handleRight = useCallback(() => onMove(idx, idx + 1), [idx, onMove]);
  return (
    <View
      style={[
        s.galleryThumbWrap,
        {
          width: tileSize,
          height: tileSize,
          borderColor: isCover ? accent : borderLight,
          backgroundColor: bgCard,
          borderWidth: isCover ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <ExpoImage source={resolveImageUrl(url)} style={s.galleryThumb} contentFit="cover" />
      <View style={s.galleryPosPill}>
        <Text style={s.galleryPosText}>{idx + 1}</Text>
      </View>
      {isCover && (
        <View style={[s.galleryCoverBadge, { backgroundColor: accent }]}>
          <Star size={ms(10)} color="#fff" strokeWidth={2.5} fill="#fff" />
          <Text style={s.galleryCoverText} numberOfLines={1}>{galleryCoverLabel}</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={handleRemove}
        disabled={isBusy || isMutationPending}
        style={s.galleryRemoveBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={galleryDeleteLabel}
      >
        <XIcon size={ms(14)} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
      <View style={s.galleryOrderRow}>
        {!isCover ? (
          <TouchableOpacity
            onPress={handleSetCover}
            disabled={isMutationPending}
            style={s.galleryOrderBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={gallerySetCoverLabel}
          >
            <Star size={ms(12)} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity
            onPress={handleLeft}
            disabled={idx === 0 || isMutationPending}
            style={[s.galleryOrderBtn, idx === 0 && { opacity: 0.3 }]}
            hitSlop={6}
          >
            <ChevronLeft size={ms(14)} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRight}
            disabled={isLast || isMutationPending}
            style={[s.galleryOrderBtn, isLast && { opacity: 0.3 }]}
            hitSlop={6}
          >
            <ChevronRight size={ms(14)} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
      {isBusy && (
        <View style={s.galleryBusyOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Card background color row (used in group 2)
// ──────────────────────────────────────────────────────────────
export interface CardColorRowProps {
  presets: readonly { hex: string; nameKey: string }[];
  selected: string | null;
  disabled: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  textMuted: string;
  noneLabel: string;
  t: T;
  onPick: (hex: string | null) => void;
}
export const CardColorRow = memo(function CardColorRow({
  presets, selected, disabled, accent, bgCard, borderLight, textMuted, noneLabel, t, onPick,
}: CardColorRowProps) {
  const handleClear = useCallback(() => onPick(null), [onPick]);
  return (
    <View style={s.cardColorRow}>
      <TouchableOpacity
        onPress={handleClear}
        disabled={disabled}
        style={[
          s.cardColorSwatch,
          {
            borderColor: selected === null ? accent : borderLight,
            backgroundColor: bgCard,
            opacity: disabled ? 0.4 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={noneLabel}
        accessibilityState={{ selected: selected === null }}
      >
        <XIcon size={ms(16)} color={textMuted} strokeWidth={2} />
      </TouchableOpacity>
      {presets.map(({ hex, nameKey }) => (
        <CardColorSwatch
          key={hex}
          hex={hex}
          isActive={selected?.toLowerCase() === hex.toLowerCase()}
          disabled={disabled}
          accent={accent}
          label={t(`storePreview.${nameKey}`)}
          onPick={onPick}
        />
      ))}
    </View>
  );
});

const CardColorSwatch = memo(function CardColorSwatch({
  hex, isActive, disabled, accent, label, onPick,
}: {
  hex: string;
  isActive: boolean;
  disabled: boolean;
  accent: string;
  label: string;
  onPick: (hex: string) => void;
}) {
  const handlePress = useCallback(() => onPick(hex), [hex, onPick]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[
        s.cardColorSwatch,
        {
          borderColor: isActive ? accent : 'transparent',
          backgroundColor: hex,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
    >
      {isActive ? <Check size={ms(14)} color="#fff" strokeWidth={3} /> : null}
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Card text color toggle
// ──────────────────────────────────────────────────────────────
export interface CardTextColorToggleProps {
  selected: 'LIGHT' | 'DARK';
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  lightLabel: string;
  darkLabel: string;
  onChange: (mode: 'LIGHT' | 'DARK') => void;
}
export const CardTextColorToggle = memo(function CardTextColorToggle({
  selected, accent, bgCard, borderLight, textColor, lightLabel, darkLabel, onChange,
}: CardTextColorToggleProps) {
  return (
    <View style={s.cardTextColorRow}>
      {(['LIGHT', 'DARK'] as const).map((mode) => {
        const active = selected === mode;
        const label = mode === 'LIGHT' ? lightLabel : darkLabel;
        return (
          <CardTextColorPill
            key={mode}
            mode={mode}
            label={label}
            isActive={active}
            accent={accent}
            bgCard={bgCard}
            borderLight={borderLight}
            textColor={textColor}
            onChange={onChange}
          />
        );
      })}
    </View>
  );
});

const CardTextColorPill = memo(function CardTextColorPill({
  mode, label, isActive, accent, bgCard, borderLight, textColor, onChange,
}: {
  mode: 'LIGHT' | 'DARK';
  label: string;
  isActive: boolean;
  accent: string;
  bgCard: string;
  borderLight: string;
  textColor: string;
  onChange: (m: 'LIGHT' | 'DARK') => void;
}) {
  const handlePress = useCallback(() => onChange(mode), [mode, onChange]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        s.cardTextColorPill,
        {
          borderColor: isActive ? accent : borderLight,
          backgroundColor: isActive ? `${accent}15` : bgCard,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <View
        style={[
          s.cardTextColorSwatch,
          {
            backgroundColor: mode === 'LIGHT' ? '#F9FAFB' : '#111827',
            borderColor: borderLight,
          },
        ]}
      />
      <Text style={[s.cardTextColorLabel, { color: isActive ? accent : textColor }]}>{label}</Text>
      {isActive ? <Check size={ms(14)} color={accent} strokeWidth={2.5} /> : null}
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Local styles (1:1 copy of the subset used by these subsections).
// Kept here so the components are self-contained.
// ──────────────────────────────────────────────────────────────
const ICON_GAP = 8;
const ICON_COLS = 6;
const ICON_TILE_SIZE = Math.floor(
  (Dimensions.get('window').width - 32 - (ICON_COLS - 1) * ICON_GAP) / ICON_COLS,
);

const s = StyleSheet.create({
  swatchGrid: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  swatch: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ICON_GAP,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  iconTile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  categoryChipText: { fontSize: ms(13), fontWeight: '600' },
  taglineWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  taglineInput: {
    fontSize: ms(15),
    minHeight: 56,
    textAlignVertical: 'top',
    padding: 0,
  },
  taglineCounter: { fontSize: ms(11), textAlign: 'right', marginTop: 4 },
  hoursContainer: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  hoursDayBlock: { paddingVertical: 12 },
  hoursDayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hoursDayLabel: { fontSize: ms(14), fontWeight: '700' },
  hoursToggle: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  hoursToggleText: { fontSize: ms(12), fontWeight: '700' },
  hoursSlots: { marginTop: 8, gap: 8 },
  hoursSlotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursTimeInput: {
    width: 70,
    fontSize: ms(14),
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hoursTimeSep: { fontSize: ms(14), fontWeight: '700' },
  hoursSlotRemove: { padding: 6, marginLeft: 'auto' },
  hoursAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  hoursAddText: { fontSize: ms(12), fontWeight: '700' },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  galleryThumbWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryPosPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryPosText: { color: '#fff', fontSize: ms(11), fontWeight: '700' },
  galleryCoverBadge: {
    position: 'absolute',
    top: 30,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  galleryCoverText: { color: '#fff', fontSize: ms(9), fontWeight: '800', letterSpacing: 0.3 },
  galleryBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryOrderRow: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  galleryOrderBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryAddBtn: {
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  galleryAddIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryAddText: { fontSize: ms(11), fontWeight: '700', textAlign: 'center' },
  cardColorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  cardColorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextColorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  cardTextColorPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  cardTextColorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTextColorLabel: { flex: 1, fontSize: ms(13), fontWeight: '700' },
});

// Suppress unused variable warning — kept for documentation/parity with parent.
void ICON_COLS;
