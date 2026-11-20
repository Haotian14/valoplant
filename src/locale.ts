import { useSyncExternalStore } from 'react';
import english from './english.json' with { type: 'json' };
import { pageName, type Page } from './strategy.ts';

export type Language = 'zh' | 'en' | 'system';
const storageKey = 'team-playbook-language';
const listeners = new Set<() => void>();

function initialLanguage(): Language {
  try {
    const language = localStorage.getItem(storageKey);
    if (language === 'en' || language === 'system') return language;
  } catch { /* Use the initial language if storage is unavailable. */ }
  return 'zh';
}

let language = initialLanguage();
export const languageTag = () => language === 'en' || language === 'system' &&
  !navigator.language.toLowerCase().startsWith('zh') ? 'en' : 'zh-CN';

export function t(message: string): string {
  return languageTag() === 'en' && Object.hasOwn(english, message) ? english[message as keyof typeof english] : message;
}

export function displayPageName(page: Page): string {
  const name = pageName(page);
  const automatic = page.isAutoNamed && name.match(/^第 (\d+) 页$/);
  return automatic && languageTag() === 'en' ? `Page ${automatic[1]}` : name;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('languagechange', listener);
  return () => { listeners.delete(listener); window.removeEventListener('languagechange', listener); };
}

export const useLanguage = () => useSyncExternalStore(subscribe, () => language + ':' + languageTag(), () => 'zh:zh-CN');
export const getLanguage = () => language;

export function setLanguage(next: Language) {
  language = next;
  try { localStorage.setItem(storageKey, next); } catch { /* Apply for this session. */ }
  listeners.forEach(listener => listener());
}
