// 语言 Provider：持有当前语言状态，并把它同步到模块单例、localStorage 与 DOM（<html lang> + SEO meta）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { I18nContext, type I18nValue } from './context';
import { detectLang, persistLang, setActiveLang, translate, type Lang, type MsgKey, type Vars } from './translate';

function setMeta(selector: string, content: string): void {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

/** 同步 <html lang>、标题与 SEO meta（index.html 中的中文为静态默认值，这里按当前语言覆盖）。 */
function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = translate(lang, 'meta.title');
  setMeta('meta[name="description"]', translate(lang, 'meta.desc'));
  setMeta('meta[property="og:title"]', translate(lang, 'meta.ogTitle'));
  setMeta('meta[property="og:description"]', translate(lang, 'meta.ogDesc'));
  setMeta('meta[property="og:locale"]', lang === 'zh' ? 'zh_CN' : 'en_US');
  setMeta('meta[name="twitter:title"]', translate(lang, 'meta.ogTitle'));
  setMeta('meta[name="twitter:description"]', translate(lang, 'meta.twitterDesc'));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  useEffect(() => {
    setActiveLang(lang);
    persistLang(lang);
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const t = useCallback((key: MsgKey, vars?: Vars) => translate(lang, key, vars), [lang]);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
