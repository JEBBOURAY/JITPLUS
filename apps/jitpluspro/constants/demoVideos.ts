import i18n from '@/i18n';

/** One short demo clip per JitPlus Pro page (see components/demo/DemoVideoButton). */
export type DemoId =
  | 'intro'
  | 'scanner'
  | 'carte'
  | 'cadeaux'
  | 'boutique'
  | 'affiche'
  | 'caisse'
  | 'offrir'
  | 'sansapp'
  | 'clients'
  | 'messages'
  | 'bonsplans'
  | 'roue'
  | 'gratter'
  | 'qrcolis'
  | 'equipe'
  | 'stats'
  | 'forfait';

const DEMO_VIDEO_BASE_URL =
  process.env.EXPO_PUBLIC_DEMO_VIDEO_BASE_URL ?? 'https://storage.googleapis.com/jitplus-uploads-prod/demo';

/** For now every language gets the Darija clips (demo/<id>.mp4). French clips are ready in
 *  docs/videos/demo-clips/fr: upload them to demo/fr/ and restore the per-language choice. */
export function demoVideoUrl(id: DemoId, _locale: string = i18n.locale): string {
  return `${DEMO_VIDEO_BASE_URL}/${id}.mp4`;
}
