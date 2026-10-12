import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { ms } from '@/utils/responsive';

const COLORS = ['#FBBF24', '#F59E0B', '#A78BFA', '#7C3AED', '#10B981', '#EC4899', '#FFFFFF'];
const PIECES = 26;

interface Piece {
  dx: number;
  dy: number;
  fall: number;
  spin: number;
  size: number;
  color: string;
  round: boolean;
  delay: number;
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    const angle = (i / PIECES) * Math.PI * 2 + Math.random() * 0.4;
    const power = ms(90) + Math.random() * ms(90);
    return {
      dx: Math.cos(angle) * power,
      dy: Math.sin(angle) * power * 0.8 - ms(40),
      fall: ms(120) + Math.random() * ms(80),
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
      size: ms(6) + Math.random() * ms(5),
      color: COLORS[i % COLORS.length],
      round: i % 3 === 0,
      delay: Math.random() * 120,
    };
  });
}

/** One-shot celebratory burst centred on its parent. */
export default React.memo(function ConfettiBurst({ play }: { play: boolean }) {
  const [pieces] = useState(makePieces);
  const [progress] = useState(() => pieces.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (!play) return;
    progress.forEach((p) => p.setValue(0));
    const anim = Animated.parallel(
      progress.map((p, i) =>
        Animated.timing(p, {
          toValue: 1,
          duration: 1500,
          delay: pieces[i].delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [play, progress, pieces]);

  if (!play) return null;

  return (
    <View pointerEvents="none" style={styles.root}>
      {pieces.map((piece, i) => {
        const p = progress[i];
        const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dx] });
        const translateY = p.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0, piece.dy, piece.dy + piece.fall],
        });
        const rotate = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${piece.spin}deg`] });
        const opacity = p.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                width: piece.size,
                height: piece.round ? piece.size : piece.size * 0.45,
                borderRadius: piece.round ? piece.size / 2 : 1,
                backgroundColor: piece.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
});
