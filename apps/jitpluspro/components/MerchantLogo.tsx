import { useState, memo } from 'react';
import { Image as RNImage, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { resolveImageUrl } from '@/utils/imageUrl';

/** Merchant logo with automatic fallback to the JitPlus Pro logo on load error. */
const MerchantLogo = memo(function MerchantLogo({
  logoUrl,
  style,
}: {
  logoUrl?: string | null;
  style: StyleProp<ImageStyle>;
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
      />
    );
  }
  return <RNImage source={require('@/assets/images/jitplusprologo.png')} style={style} resizeMode="contain" />;
});

export default MerchantLogo;
