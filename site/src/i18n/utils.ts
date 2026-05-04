import en from './en.json';
import zh from './zh.json';

const dicts: Record<string, typeof en> = { en, zh };

export function useTranslations(locale: string) {
  return dicts[locale] || dicts.en;
}
