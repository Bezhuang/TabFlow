// 语言 Context 与取值 Hook（不含组件，避免与 Provider 同文件导出而破坏 fast refresh）。
import { createContext, useContext } from 'react';
import type { Lang, MsgKey, Vars } from './translate';

export interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MsgKey, vars?: Vars) => string;
}

export const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 <I18nProvider> 内使用');
  return ctx;
}
