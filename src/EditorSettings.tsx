import { t } from './locale.ts';
import { useState } from 'react';
import { defaultMapPalette, keyLabels, parsePalette, type ActionKey, type MapPalette, type Preferences } from './preferences.ts';
import type { Page } from './strategy.ts';
import { Modal } from './ui.tsx';
import LanguageSelect from './LanguageSelect.tsx';

export default function EditorSettings({ settings, palette, preferences, apply, close }: {
  settings: Page['settings']; palette?: MapPalette; preferences: Preferences;
  apply: (settings: Page['settings'], palette: MapPalette | undefined, allPages: boolean, defaults: Preferences) => void;
  close: () => void;
}) {
  const [agentSize, setAgentSize] = useState(settings.agentSize ?? 35);
  const [abilitySize, setAbilitySize] = useState(settings.abilitySize ?? 25);
  const [neutral, setNeutral] = useState(settings.useNeutralTeamColors === true);
  const [allPages, setAllPages] = useState(false);
  const [theme, setTheme] = useState(palette ?? defaultMapPalette);
  const [custom, setCustom] = useState(!!palette);
  const [prefs, setPrefs] = useState(preferences);
  const [profileName, setProfileName] = useState('');
  const [profileCode, setProfileCode] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [error, setError] = useState('');
  const [profileIndex, setProfileIndex] = useState(-1);

  function bind(key: ActionKey, value: string) {
    const letter = value.toLowerCase();
    if (!/^[a-z]?$/.test(letter)) return;
    const keys = { ...prefs.keys, [key]: letter || key };
    const active = (Object.keys(keyLabels) as ActionKey[]).map(id => keys[id] ?? id);
    if (new Set(active).size !== active.length) { setError(`${letter.toUpperCase()} 已被其他快捷键使用`); return; }
    setError('');
    setPrefs({ ...prefs, keys });
  }

  return <Modal title={t('战术与本机设置')} onClose={close} wide>
    <form onSubmit={event => {
      event.preventDefault();
      apply({ ...settings, agentSize, abilitySize, useNeutralTeamColors: neutral }, custom ? theme : undefined, allPages, prefs);
      close();
    }}>
      <h3>{t('当前战术')}</h3>
      <div className="dimension-fields">
        <label className="field">{t('英雄尺寸')}<input type="number" min="16" max="80" required value={agentSize}
          onChange={event => setAgentSize(Number(event.target.value))} /></label>
        <label className="field">{t('技能尺寸')}<input type="number" min="12" max="65" required value={abilitySize}
          onChange={event => setAbilitySize(Number(event.target.value))} /></label>
      </div>
      <label className="check-field"><input type="checkbox" checked={neutral} onChange={event => setNeutral(event.target.checked)} />{t('中性标记颜色')}</label>
      <label className="check-field"><input type="checkbox" checked={allPages} onChange={event => setAllPages(event.target.checked)} />{t('同步到战术所有页面')}</label>
      <label className="check-field"><input type="checkbox" checked={custom} onChange={event => setCustom(event.target.checked)} />{t('自定义战术地图颜色')}</label>
      {custom && <div className="settings-colors">
        {(Object.entries({ base: '底色', detail: '细节', highlight: '高亮' }) as [keyof MapPalette, string][]).map(([key, label]) =>
          <label className="field" key={key}>{label}<input type="color" value={theme[key]}
            onChange={event => setTheme({ ...theme, [key]: event.target.value })} /></label>)}
      </div>}
      <details>
        <summary>{t('地图主题档案')}</summary>
        <label className="field">{t('已保存的主题')}<select value={profileIndex} onChange={event => {
          const index = Number(event.target.value);
          setProfileIndex(index);
          const profile = prefs.profiles[index];
          if (profile) { setCustom(true); setTheme(profile.palette); setProfileName(profile.name); }
        }}>
          <option value="-1">{t('选择主题')}</option>{prefs.profiles.map((profile, index) => <option value={index} key={index}>{profile.name}</option>)}
        </select></label>
        <label className="field">{t('主题名称')}<input value={profileName} maxLength={80} onChange={event => setProfileName(event.target.value)} /></label>
        <div className="export-page-controls">
          <button className="button subtle" type="button" disabled={!profileName.trim()} onClick={() => {
            const profile = { name: profileName.trim(), palette: theme };
            setPrefs({ ...prefs, profiles: profileIndex < 0 ? [...prefs.profiles, profile] :
              prefs.profiles.map((row, index) => index === profileIndex ? profile : row) });
            if (profileIndex < 0) setProfileIndex(prefs.profiles.length);
          }}>{t('保存主题')}</button>
          <button className="button subtle" type="button" disabled={profileIndex < 0} onClick={() => {
            setPrefs({ ...prefs, profiles: prefs.profiles.filter((_, index) => index !== profileIndex) }); setProfileIndex(-1);
          }}>{t('删除主题')}</button>
          <button className="button subtle" type="button" onClick={() => setPrefs({ ...prefs, palette: theme })}>{t('设为新战术默认')}</button>
        </div>
        <label className="field">{t('主题颜色数据')}<textarea rows={2} value={profileCode} onChange={event => setProfileCode(event.target.value)} /></label>
        <div className="export-page-controls">
          <button className="button subtle" type="button" onClick={() => setProfileCode(JSON.stringify(theme))}>{t('生成颜色数据')}</button>
          <button className="button subtle" type="button" onClick={() => {
            try {
              const imported = parsePalette(JSON.parse(profileCode));
              if (!imported) throw new Error();
              setTheme(imported); setCustom(true); setError('');
            } catch { setError('颜色数据需要包含有效的底色、细节色和高亮色'); }
          }}>{t('读取颜色数据')}</button>
        </div>
      </details>
      <details>
        <summary>{t('本机诊断')}</summary>
        <p className="muted compact">{t('战术格式 112 · GitHub Pages')}</p>
        <p className="muted compact">{t('本机存储')}{' '} {typeof indexedDB !== 'undefined' ? t('可用') : t('不可用')} {' '}{t('· 离线缓存')}{' '} {navigator.serviceWorker?.controller ? '已启用' : '尚未启用'}</p>
        <button className="button subtle" type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(`Team Playbook · format 112\n${navigator.userAgent}\nOffline: ${!!navigator.serviceWorker?.controller}\nCanvas: ${innerWidth} × ${innerHeight}`);
            setError('已复制本机诊断信息');
          } catch { setError('无法访问剪贴板'); }
        }}>{t('复制诊断信息')}</button>
      </details>
      <h3>{t('本机偏好')}</h3>
      <LanguageSelect />
      <label className="check-field"><input type="checkbox" checked={prefs.autosave} onChange={event => setPrefs({ ...prefs, autosave: event.target.checked })} />{t('自动保存')}</label>
      <label className="field">{t('视野锥填充透明度')}<input type="range" min="0" max="70" value={prefs.coneOpacity}
        onChange={event => setPrefs({ ...prefs, coneOpacity: Number(event.target.value) })} /></label>
      <button className="button subtle" type="button" onClick={() => setPrefs({ ...prefs, agentSize, abilitySize, neutral })}>{t('把当前标记配置设为新战术默认')}</button>
      <details>
        <summary>{t('快捷键')}</summary>
        <label className="field">{t('搜索')}<input value={keySearch} onChange={event => setKeySearch(event.target.value)} /></label>
        <div className="settings-keys">
          {(Object.entries(keyLabels) as [ActionKey, string][]).filter(([key, label]) =>
            (t(label) + key + (prefs.keys[key] ?? '')).toLowerCase().includes(keySearch.toLowerCase())).map(([key, label]) =>
            <label className="field" key={key}>{t(label)}<select value={prefs.keys[key] ?? key} onChange={event => bind(key, event.target.value)}>
              {[...'abcdefghijklmnopqrstuvwxyz'].map(letter => <option key={letter} value={letter}>{letter.toUpperCase()}</option>)}
            </select></label>)}
        </div>
        <button className="button subtle" type="button" onClick={() => { setPrefs({ ...prefs, keys: {} }); setError(''); }}>{t('恢复默认快捷键')}</button>
      </details>
      {error && <p role="status" className="banner">{error}</p>}
      <div className="modal-actions"><button className="button primary" type="submit">{t('应用设置')}</button></div>
    </form>
  </Modal>;
}
