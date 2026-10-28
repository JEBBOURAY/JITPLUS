import { createElement, forwardRef } from 'react';
import { Icon, type IconNode, type LucideIcon, type LucideProps } from 'lucide-react-native';

/**
 * Glyph elements with this fill are painted in the icon colour. Lucide never
 * sets `color` on the root <Svg>, so react-native-svg cannot resolve
 * `currentColor` by itself; the factory substitutes the real colour.
 */
export const ACCENT_FILL = 'currentColor';

/** Builds a Lucide-compatible icon (same props: size, color, strokeWidth…). */
export function createJitIcon(name: string, iconNode: IconNode): LucideIcon {
  const hasAccent = iconNode.some(([, attrs]) => attrs.fill === ACCENT_FILL);
  const JitIcon = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
    const fill = String(props.color ?? ACCENT_FILL);
    const node: IconNode = hasAccent
      ? iconNode.map(([tag, attrs]) => [tag, attrs.fill === ACCENT_FILL ? { ...attrs, fill } : attrs])
      : iconNode;
    return createElement(Icon, { ...props, ref, iconNode: node });
  });
  JitIcon.displayName = name;
  return JitIcon;
}
