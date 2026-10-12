/**
 * Memoized form controls of the "Ma boutique" section screens.
 *
 * Some screens mount many of them at once (~43 icon tiles, 7 hour blocks,
 * chip grids, a gallery). Each control is a `React.memo` child with
 * primitive / stable props so that editing one field only re-renders that
 * control, not its siblings. Theme and i18n are read from context, which
 * only changes on dark-mode / language switch.
 */
import { memo, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveImageUrl } from '@/utils/imageUrl';
import { MERCHANT_ICON_MAP, MERCHANT_ICON_SLUGS } from '@/utils/merchantIcons';
import { getCategoryOptions, CATEGORY_EMOJIS } from '@/constants/categories';
import {
  MERCHANT_BADGE_CODES,
  type MerchantBadge,
  type MerchantCategory,
  type OpeningHours,
} from '@/types';
import { fieldFill, PANEL_INSET, ui } from '@/components/stores/StoreUi';
import { WEEK_DAYS, type WeekDayKey } from '@/components/stores/brand';

export const MAX_SLOTS_PER_DAY = 3;

const CONTENT_WIDTH = Dimensions.get('window').width - PANEL_INSET;
const ICON_GAP = 8;
const ICON_COLS = 6;
const ICON_TILE_SIZE = Math.floor((CONTENT_WIDTH - (ICON_COLS - 1) * ICON_GAP) / ICON_COLS);
const GALLERY_GAP = 10;
const GALLERY_COLS = 3;
const GALLERY_TILE_SIZE = Math.floor((CONTENT_WIDTH - (GALLERY_COLS - 1) * GALLERY_GAP) / GALLERY_COLS);
// Sized so the card color row ("none" + 8 presets) fits on a single line.
const SWATCH_COLS = 9;
const SWATCH_SIZE = Math.min(40, Math.floor((CONTENT_WIDTH - (SWATCH_COLS - 1) * 4) / SWATCH_COLS));
const SWATCH_HIT = { top: 4, bottom: 4, left: 2, right: 2 };

function autoFormatTime(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export interface ColorPreset {
  hex: string;
  nameKey: string;
}

// ──────────────────────────────────────────────────────────────
// Brand color swatches
// ──────────────────────────────────────────────────────────────
export const PresetSwatches = memo(function PresetSwatches({
  presets, selected, onPick,
}: {
  presets: readonly ColorPreset[];
  selected: string;
  onPick: (hex: string) => void;
}) {
  const lower = selected.toLowerCase();
  return (
    <View style={s.swatchRow}>
      {presets.map(({ hex, nameKey }) => (
        <PresetSwatch key={hex} hex={hex} nameKey={nameKey} isActive={hex.toLowerCase() === lower} onPick={onPick} />
      ))}
    </View>
  );
});

const PresetSwatch = memo(function PresetSwatch({
  hex, nameKey, isActive, onPick,
}: {
  hex: string;
  nameKey: string;
  isActive: boolean;
  onPick: (hex: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const handlePress = useCallback(() => onPick(hex), [hex, onPick]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      hitSlop={SWATCH_HIT}
      style={[s.swatchRing, { borderColor: isActive ? hex : 'transparent' }]}
      accessibilityRole="radio"
      accessibilityLabel={t(`storePreview.${nameKey}`)}
      accessibilityState={{ selected: isActive }}
    >
      <View style={[s.swatch, { backgroundColor: hex, borderColor: theme.bgCard }]}>
        {isActive && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
      </View>
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Icon picker grid (43 lucide tiles — the heaviest child)
// ──────────────────────────────────────────────────────────────
export const IconGrid = memo(function IconGrid({
  selectedIcon, accent, onSelect,
}: {
  selectedIcon: string | null;
  accent: string;
  onSelect: (slug: string | null) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fill = fieldFill(theme);
  const handleClear = useCallback(() => onSelect(null), [onSelect]);
  const noneActive = !selectedIcon;
  return (
    <View style={s.iconGrid}>
      <TouchableOpacity
        onPress={handleClear}
        activeOpacity={0.85}
        style={[s.iconTile, { backgroundColor: noneActive ? `${accent}14` : fill, borderColor: noneActive ? accent : 'transparent' }]}
        accessibilityRole="radio"
        accessibilityLabel={t('storePreview.noIcon')}
        accessibilityState={{ selected: noneActive }}
      >
        <XIcon size={18} color={noneActive ? accent : theme.textMuted} strokeWidth={1.75} />
      </TouchableOpacity>
      {MERCHANT_ICON_SLUGS.map((slug) => (
        <IconTile key={slug} slug={slug} isActive={selectedIcon === slug} accent={accent} onSelect={onSelect} />
      ))}
    </View>
  );
});

const IconTile = memo(function IconTile({
  slug, isActive, accent, onSelect,
}: {
  slug: string;
  isActive: boolean;
  accent: string;
  onSelect: (slug: string) => void;
}) {
  const theme = useTheme();
  const Cmp = MERCHANT_ICON_MAP[slug];
  const handlePress = useCallback(() => onSelect(slug), [slug, onSelect]);
  if (!Cmp) return null;
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[s.iconTile, { backgroundColor: isActive ? `${accent}14` : fieldFill(theme), borderColor: isActive ? accent : 'transparent' }]}
      accessibilityRole="radio"
      accessibilityLabel={slug}
      accessibilityState={{ selected: isActive }}
    >
      <Cmp size={18} color={isActive ? accent : theme.textSecondary} strokeWidth={1.75} />
    </TouchableOpacity>
  );
});

// ──────────────────────────────────────────────────────────────
// Selectable chip (secondary categories, badges)
// ──────────────────────────────────────────────────────────────
function ChipInner<V extends string>({
  value, label, emoji, isActive, disabled, accent, onToggle,
}: {
  value: V;
  label: string;
  emoji?: string;
  isActive: boolean;
  disabled: boolean;
  accent: string;
  onToggle: (v: V) => void;
}) {
  const theme = useTheme();
  const handlePress = useCallback(() => onToggle(value), [value, onToggle]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        s.chip,
        {
          backgroundColor: isActive ? `${accent}14` : fieldFill(theme),
          borderColor: isActive ? accent : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: isActive, disabled }}
    >
      {emoji ? <Text style={s.chipEmoji}>{emoji}</Text> : null}
      <Text style={[s.chipText, { color: isActive ? accent : theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
      {isActive && <Check size={13} color={accent} strokeWidth={2.5} />}
    </TouchableOpacity>
  );
}
const Chip = memo(ChipInner) as typeof ChipInner;

export const PrimaryCategoryChips = memo(function PrimaryCategoryChips({
  selected, accent, onSelect,
}: {
  selected: MerchantCategory;
  accent: string;
  onSelect: (cat: MerchantCategory) => void;
}) {
  return (
    <View style={s.chipRow} accessibilityRole="radiogroup">
      {getCategoryOptions().map((opt) => (
        <Chip
          key={opt.value}
          value={opt.value}
          label={opt.label}
          emoji={CATEGORY_EMOJIS[opt.value] ?? '🏷️'}
          isActive={opt.value === selected}
          disabled={false}
          accent={accent}
          onToggle={onSelect}
        />
      ))}
    </View>
  );
});

export const SecondaryChips = memo(function SecondaryChips({
  primaryCategory, selected, max, accent, onToggle,
}: {
  primaryCategory: MerchantCategory | null | undefined;
  selected: MerchantCategory[];
  max: number;
  accent: string;
  onToggle: (cat: MerchantCategory) => void;
}) {
  const full = selected.length >= max;
  return (
    <View style={s.chipRow}>
      {getCategoryOptions()
        .filter((opt) => opt.value !== primaryCategory)
        .map((opt) => {
          const isActive = selected.includes(opt.value);
          return (
            <Chip
              key={opt.value}
              value={opt.value}
              label={opt.label}
              emoji={CATEGORY_EMOJIS[opt.value] ?? '🏷️'}
              isActive={isActive}
              disabled={!isActive && full}
              accent={accent}
              onToggle={onToggle}
            />
          );
        })}
    </View>
  );
});

export const BadgesChips = memo(function BadgesChips({
  selected, max, accent, onToggle,
}: {
  selected: MerchantBadge[];
  max: number;
  accent: string;
  onToggle: (code: MerchantBadge) => void;
}) {
  const { t } = useLanguage();
  const full = selected.length >= max;
  return (
    <View style={s.chipRow}>
      {MERCHANT_BADGE_CODES.map((code) => {
        const isActive = selected.includes(code);
        return (
          <Chip
            key={code}
            value={code}
            label={t(`storePreview.badges.${code}`)}
            isActive={isActive}
            disabled={!isActive && full}
            accent={accent}
            onToggle={onToggle}
          />
        );
      })}
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Opening hours editor — one memoized block per day.
// ──────────────────────────────────────────────────────────────
interface HoursHandlers {
  onToggleClosed: (day: WeekDayKey, closed: boolean) => void;
  onAddSlot: (day: WeekDayKey) => void;
  onRemoveSlot: (day: WeekDayKey, idx: number) => void;
  onUpdateSlot: (day: WeekDayKey, idx: number, field: 'open' | 'close', value: string) => void;
}

export const HoursEditor = memo(function HoursEditor({
  hours, accent, onToggleClosed, onAddSlot, onRemoveSlot, onUpdateSlot,
}: { hours: OpeningHours; accent: string } & HoursHandlers) {
  return (
    <View>
      {WEEK_DAYS.map((day, idx) => (
        <HoursDayBlock
          key={day}
          day={day}
          dayData={hours[day]}
          isFirst={idx === 0}
          accent={accent}
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
  day, dayData, isFirst, accent, onToggleClosed, onAddSlot, onRemoveSlot, onUpdateSlot,
}: {
  day: WeekDayKey;
  dayData: OpeningHours[WeekDayKey];
  isFirst: boolean;
  accent: string;
} & HoursHandlers) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isOpen = !dayData?.closed;
  const slots = dayData?.slots ?? [];
  const handleToggle = useCallback(() => onToggleClosed(day, isOpen), [day, isOpen, onToggleClosed]);
  const handleAdd = useCallback(() => onAddSlot(day), [day, onAddSlot]);
  const dayLabel = t(`storePreview.days.${day}`);
  return (
    <View style={[s.dayBlock, !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight }]}>
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.7}
        style={s.dayHeader}
        accessibilityRole="switch"
        accessibilityLabel={dayLabel}
        accessibilityState={{ checked: isOpen }}
      >
        <Text style={[ui.fieldLabel, s.dayLabel, { color: theme.text }]}>{dayLabel}</Text>
        <Text style={[ui.caption, { color: isOpen ? accent : theme.textMuted }]}>
          {isOpen ? t('storePreview.hoursOpen') : t('storePreview.hoursClosed')}
        </Text>
        <View style={[s.switchTrack, { backgroundColor: isOpen ? accent : theme.border }]}>
          <View style={[s.switchKnob, isOpen ? s.switchKnobOn : s.switchKnobOff]} />
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={s.slots}>
          {slots.map((slot, sIdx) => (
            <HoursSlotRow
              key={sIdx}
              day={day}
              idx={sIdx}
              open={slot.open}
              close={slot.close}
              onUpdate={onUpdateSlot}
              onRemove={onRemoveSlot}
            />
          ))}
          {slots.length < MAX_SLOTS_PER_DAY && (
            <TouchableOpacity onPress={handleAdd} style={s.addSlotBtn} hitSlop={6} accessibilityRole="button">
              <Plus size={14} color={accent} strokeWidth={2.4} />
              <Text style={[s.addSlotText, { color: accent }]}>{t('storePreview.hoursAddSlot')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

const HoursSlotRow = memo(function HoursSlotRow({
  day, idx, open, close, onUpdate, onRemove,
}: {
  day: WeekDayKey;
  idx: number;
  open: string;
  close: string;
  onUpdate: HoursHandlers['onUpdateSlot'];
  onRemove: HoursHandlers['onRemoveSlot'];
}) {
  const theme = useTheme();
  const fill = fieldFill(theme);
  const handleOpen = useCallback((v: string) => onUpdate(day, idx, 'open', autoFormatTime(v)), [day, idx, onUpdate]);
  const handleClose = useCallback((v: string) => onUpdate(day, idx, 'close', autoFormatTime(v)), [day, idx, onUpdate]);
  const handleRemove = useCallback(() => onRemove(day, idx), [day, idx, onRemove]);
  const inputStyle = [s.timeInput, { color: theme.text, backgroundColor: fill }];
  return (
    <View style={s.slotRow}>
      <TextInput
        value={open}
        onChangeText={handleOpen}
        placeholder="09:00"
        placeholderTextColor={theme.textMuted}
        maxLength={5}
        keyboardType="number-pad"
        style={inputStyle}
      />
      <Text style={[s.timeSep, { color: theme.textMuted }]}>–</Text>
      <TextInput
        value={close}
        onChangeText={handleClose}
        placeholder="18:00"
        placeholderTextColor={theme.textMuted}
        maxLength={5}
        keyboardType="number-pad"
        style={inputStyle}
      />
      <TouchableOpacity onPress={handleRemove} style={[s.slotRemove, { backgroundColor: fill }]} hitSlop={6} accessibilityRole="button">
        <XIcon size={14} color={theme.textMuted} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Gallery grid (thumbnails + add tile)
// ──────────────────────────────────────────────────────────────
interface GalleryHandlers {
  onRemove: (url: string) => void;
  onSetCover: (idx: number) => void;
  onMove: (from: number, to: number) => void;
}

export const GalleryGrid = memo(function GalleryGrid({
  items, max, busyUrl, isUploading, isMutationPending, accent, onAddPhotos, onRemove, onSetCover, onMove,
}: {
  items: string[];
  max: number;
  busyUrl: string | null;
  isUploading: boolean;
  isMutationPending: boolean;
  accent: string;
  onAddPhotos: () => void;
} & GalleryHandlers) {
  const { t } = useLanguage();
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
          onRemove={onRemove}
          onSetCover={onSetCover}
          onMove={onMove}
        />
      ))}
      {items.length < max && (
        <TouchableOpacity
          onPress={onAddPhotos}
          disabled={isUploading}
          activeOpacity={0.8}
          style={[s.galleryAdd, { borderColor: `${accent}66`, backgroundColor: `${accent}0D` }]}
          accessibilityRole="button"
          accessibilityLabel={t('storePreview.galleryAddPhoto')}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <>
              <View style={[s.galleryAddIcon, { backgroundColor: accent }]}>
                <Plus size={18} color="#fff" strokeWidth={2.5} />
              </View>
              <Text style={[s.galleryAddText, { color: accent }]} numberOfLines={2}>
                {t('storePreview.galleryAddPhoto')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

const GalleryThumb = memo(function GalleryThumb({
  url, idx, total, isBusy, isMutationPending, accent, onRemove, onSetCover, onMove,
}: {
  url: string;
  idx: number;
  total: number;
  isBusy: boolean;
  isMutationPending: boolean;
  accent: string;
} & GalleryHandlers) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isCover = idx === 0;
  const isLast = idx === total - 1;
  const handleRemove = useCallback(() => onRemove(url), [url, onRemove]);
  const handleSetCover = useCallback(() => onSetCover(idx), [idx, onSetCover]);
  const handleLeft = useCallback(() => onMove(idx, idx - 1), [idx, onMove]);
  const handleRight = useCallback(() => onMove(idx, idx + 1), [idx, onMove]);
  return (
    <View style={[s.thumb, { backgroundColor: fieldFill(theme), borderColor: isCover ? accent : 'transparent' }]}>
      <ExpoImage source={resolveImageUrl(url)} style={s.thumbImage} contentFit="cover" />
      {isCover ? (
        <View style={[s.coverBadge, { backgroundColor: accent }]}>
          <Star size={10} color="#fff" strokeWidth={2.5} fill="#fff" />
          <Text style={s.coverText} numberOfLines={1}>{t('storePreview.galleryCover')}</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={handleSetCover}
          disabled={isMutationPending}
          style={[s.overlayBtn, s.overlayTopLeft]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('storePreview.gallerySetCover')}
        >
          <Star size={12} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={handleRemove}
        disabled={isBusy || isMutationPending}
        style={[s.overlayBtn, s.overlayTopRight]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('storePreview.galleryDeleteTitle')}
      >
        <XIcon size={13} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
      {total > 1 && (
        <View style={s.orderRow}>
          <TouchableOpacity
            onPress={handleLeft}
            disabled={idx === 0 || isMutationPending}
            style={[s.overlayBtn, idx === 0 && s.overlayDisabled]}
            hitSlop={6}
          >
            <ChevronLeft size={14} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRight}
            disabled={isLast || isMutationPending}
            style={[s.overlayBtn, isLast && s.overlayDisabled]}
            hitSlop={6}
          >
            <ChevronRight size={14} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}
      {isBusy && (
        <View style={s.busyOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Loyalty card background color row
// ──────────────────────────────────────────────────────────────
export const CardColorRow = memo(function CardColorRow({
  presets, selected, disabled, accent, onPick,
}: {
  presets: readonly ColorPreset[];
  selected: string | null;
  disabled: boolean;
  accent: string;
  onPick: (hex: string | null) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const handleClear = useCallback(() => onPick(null), [onPick]);
  const noneActive = selected === null;
  return (
    <View style={[s.swatchRow, disabled && s.disabled]} pointerEvents={disabled ? 'none' : 'auto'}>
      <TouchableOpacity
        onPress={handleClear}
        hitSlop={SWATCH_HIT}
        style={[s.swatchRing, { borderColor: noneActive ? accent : 'transparent' }]}
        accessibilityRole="radio"
        accessibilityLabel={t('storePreview.cardColorNone')}
        accessibilityState={{ selected: noneActive, disabled }}
      >
        <View style={[s.swatch, { backgroundColor: fieldFill(theme), borderColor: theme.bgCard }]}>
          <XIcon size={15} color={theme.textMuted} strokeWidth={2} />
        </View>
      </TouchableOpacity>
      {presets.map(({ hex, nameKey }) => (
        <PresetSwatch
          key={hex}
          hex={hex}
          nameKey={nameKey}
          isActive={selected?.toLowerCase() === hex.toLowerCase()}
          onPick={onPick}
        />
      ))}
    </View>
  );
});

// ──────────────────────────────────────────────────────────────
// Loyalty card text color (light / dark)
// ──────────────────────────────────────────────────────────────
export const CardTextColorToggle = memo(function CardTextColorToggle({
  selected, onChange,
}: {
  selected: 'LIGHT' | 'DARK';
  onChange: (mode: 'LIGHT' | 'DARK') => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[s.segmented, { backgroundColor: fieldFill(theme) }]} accessibilityRole="radiogroup">
      {(['LIGHT', 'DARK'] as const).map((mode) => {
        const active = selected === mode;
        return (
          <TouchableOpacity
            key={mode}
            onPress={() => onChange(mode)}
            activeOpacity={0.8}
            style={[s.segment, active && [s.segmentActive, { backgroundColor: theme.bgCard }]]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <View style={[s.textSwatch, { backgroundColor: mode === 'LIGHT' ? '#F9FAFB' : '#111827', borderColor: theme.border }]} />
            <Text style={[s.segmentText, { color: active ? theme.primary : theme.textMuted }]} maxFontSizeMultiplier={1.2}>
              {mode === 'LIGHT' ? t('storePreview.cardTextColorLight') : t('storePreview.cardTextColorDark')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  disabled: { opacity: 0.4 },

  // Swatches (brand color + card background)
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  swatchRing: { width: SWATCH_SIZE, height: SWATCH_SIZE, borderRadius: SWATCH_SIZE / 2, borderWidth: 2, padding: 1.5 },
  swatch: { flex: 1, borderRadius: SWATCH_SIZE / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Icon grid
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: ICON_GAP },
  iconTile: { width: ICON_TILE_SIZE, height: ICON_TILE_SIZE, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },

  // Tagline

  // Hours
  dayBlock: { paddingVertical: 10 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  dayLabel: { flex: 1 },
  switchTrack: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchKnobOn: { alignSelf: 'flex-end' },
  switchKnobOff: { alignSelf: 'flex-start' },
  slots: { marginTop: 8, gap: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { width: 76, fontSize: 14, fontFamily: 'Lexend_600SemiBold', textAlign: 'center', paddingVertical: 8, borderRadius: 10 },
  timeSep: { fontSize: 14, fontFamily: 'Lexend_500Medium' },
  slotRemove: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  addSlotBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addSlotText: { fontSize: 12.5, fontFamily: 'Lexend_600SemiBold' },

  // Gallery
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GALLERY_GAP },
  thumb: { width: GALLERY_TILE_SIZE, height: GALLERY_TILE_SIZE, borderRadius: 14, overflow: 'hidden', borderWidth: 2 },
  thumbImage: { width: '100%', height: '100%' },
  coverBadge: { position: 'absolute', top: 5, left: 5, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, maxWidth: GALLERY_TILE_SIZE - 40 },
  coverText: { color: '#fff', fontSize: 9.5, fontFamily: 'Lexend_600SemiBold' },
  overlayBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center' },
  overlayTopLeft: { position: 'absolute', top: 5, left: 5 },
  overlayTopRight: { position: 'absolute', top: 5, right: 5 },
  overlayDisabled: { opacity: 0.3 },
  orderRow: { position: 'absolute', bottom: 5, left: 5, right: 5, flexDirection: 'row', justifyContent: 'space-between' },
  busyOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center' },
  galleryAdd: { width: GALLERY_TILE_SIZE, height: GALLERY_TILE_SIZE, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, gap: 6 },
  galleryAddIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  galleryAddText: { fontSize: 11.5, fontFamily: 'Lexend_600SemiBold', textAlign: 'center' },

  // Card text color
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 9 },
  segmentActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  segmentText: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },
  textSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
});
