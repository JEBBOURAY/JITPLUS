import type { useLanguage } from '@/contexts/LanguageContext';

export type TranslateFn = ReturnType<typeof useLanguage>['t'];
