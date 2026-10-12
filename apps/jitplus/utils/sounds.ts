import type { AudioPlayer } from 'expo-audio';

// expo-audio is a native module: loaded lazily so an OTA update reaching a
// binary built before it was added just stays silent instead of crashing.
let Audio: typeof import('expo-audio') | null = null;
try {
  Audio = require('expo-audio');
} catch {
  // Native module not present in this binary — sounds are disabled
}

const SOURCES = {
  stamp: require('@/assets/sounds/stamp.wav'),
  reward: require('@/assets/sounds/reward.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let audioModeSet = false;

function getPlayer(name: SoundName): AudioPlayer | null {
  if (!Audio) return null;
  if (!audioModeSet) {
    audioModeSet = true;
    // Respect the iOS silent switch and never interrupt the user's music.
    Audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }
  let player = players[name];
  if (!player) {
    player = Audio.createAudioPlayer(SOURCES[name]);
    player.volume = 0.8;
    players[name] = player;
  }
  return player;
}

/** Load sounds ahead of time so the first play has no decoding delay. */
export function preloadSounds(...names: SoundName[]): void {
  try { names.forEach(getPlayer); } catch { /* non-fatal */ }
}

/** Fire-and-forget short UI sound. Never throws. */
export function playSound(name: SoundName): void {
  try {
    const player = getPlayer(name);
    if (!player) return;
    if (player.currentTime > 0) {
      player.seekTo(0).catch(() => {}).then(() => player.play());
    } else {
      player.play();
    }
  } catch { /* non-fatal */ }
}
