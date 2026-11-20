import { getLanguage, setLanguage, t, type Language } from './locale.ts';

export default function LanguageSelect({ inline = false }: { inline?: boolean }) {
  return <label className={inline ? 'select-wrap language-select' : 'field'}>
    {!inline && t('语言')}
    <select aria-label={t('语言')} value={getLanguage()} onChange={event => setLanguage(event.target.value as Language)}>
      <option value="zh">简体中文</option><option value="en">English</option><option value="system">{t('跟随系统')}</option>
    </select>
  </label>;
}
