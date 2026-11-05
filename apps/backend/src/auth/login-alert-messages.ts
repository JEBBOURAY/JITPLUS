import { type AppLang, pickAppLang } from '../common/utils/app-lang';

/** Who signed in, as seen by the owner receiving the security alert. */
export type LoginActor =
  | { kind: 'owner'; provider?: 'Google' | 'Apple' }
  | { kind: 'member'; name: string };

export type LoginLang = AppLang;

export const toLoginLang = pickAppLang;

interface LoginMessages {
  title: string;
  /** Subject of the sentence, also used as the "who" of the email. */
  owner: string;
  member: (name: string) => string;
  via: (provider: string) => string;
  sentence: (who: string, via: string, device?: string) => string;
  outro: string;
}

/** Push / inbox texts of the "new sign-in" security alert. */
export const LOGIN_MESSAGES: Record<LoginLang, LoginMessages> = {
  fr: {
    title: 'Nouvelle connexion à votre compte',
    owner: 'Le propriétaire',
    member: (name) => `${name} (équipe)`,
    via: (provider) => ` avec ${provider}`,
    sentence: (who, via, device) =>
      `${who} s'est connecté${via} sur un nouvel appareil${device ? ` : ${device}` : ''}`,
    outro: '. Ce n\'est pas vous ? Déconnectez l\'appareil depuis Sécurité.',
  },
  en: {
    title: 'New sign-in to your account',
    owner: 'The owner',
    member: (name) => `${name} (team)`,
    via: (provider) => ` with ${provider}`,
    sentence: (who, via, device) =>
      `${who} signed in${via} on a new device${device ? `: ${device}` : ''}`,
    outro: '. Not you? Sign the device out from Security.',
  },
  ar: {
    title: 'دخول جديد للحساب ديالك',
    owner: 'المالك',
    member: (name) => `${name} (الفريق)`,
    via: (provider) => ` عبر ${provider}`,
    sentence: (who, via, device) =>
      `${who} دخل${via} من جهاز جديد${device ? `: ${device}` : ''}`,
    outro: '. ماشي نتا؟ خرّج الجهاز من الأمان.',
  },
};
