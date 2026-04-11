import { useState, memo } from 'react';
import { Image as RNImage, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { resolveImageUrl } from '@/utils/imageUrl';

const FALLBACK_LOGO = require('@/assets/images/jitpluslogo.png');

/** Merchant logo with automatic fallback to the JitPlus logo on load error. */
const MerchantLogo = memo(function MerchantLogo({
  logoUrl,
  style,
  merchantName,
}: {
  logoUrl?: string | null;
  style: StyleProp<ImageStyle>;
  merchantName?: string;
}) {
  const [error, setError] = useState(false);
  if (logoUrl && !error) {
    return (
      <Image
        source={resolveImageUrl(logoUrl)}
        style={style}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={logoUrl}
        onError={() => setError(true)}
        accessibilityLabel={merchantName || 'Merchant logo'}
      />
    );
  }
  return <RNImage source={FALLBACK_LOGO} style={style} resizeMode="contain" accessibilityLabel="JitPlus logo" />;
});

export default MerchantLogo;
