import { Store } from 'lucide-react-native';
import type { MerchantCategory } from '@/types';
import { CATEGORY_ICONS } from '@/constants/categories';
import { icon } from '@/constants/design';
import { palette } from '@/contexts/ThemeContext';

interface MerchantCategoryIconProps {
  category: MerchantCategory;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function MerchantCategoryIcon({
  category,
  size = 24,
  color = palette.violet,
  strokeWidth = icon.stroke,
}: MerchantCategoryIconProps) {
  const IconComponent = CATEGORY_ICONS[category] ?? Store;
  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
}
