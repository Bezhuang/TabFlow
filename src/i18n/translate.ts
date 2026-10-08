// 翻译核心：纯逻辑、不依赖 React，因此 src/core/* 也可以直接取用当前语言文案。
import { messages, type Lang, type MsgKey } from './messages';

export type { Lang, MsgKey };

const STORAGE_KEY = 'tabflow.lang';

export type Vars = Record<string, string | number>;

function isLang(v: unknown): v is Lang {
  return v === 'zh' || v === 'en';
}

/** 语言优先级：用户上次手动选择（localStorage）→ 浏览器语言（zh* 为中文，其余英文）。 */
export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* 隐私模式 / 禁用存储：回退到浏览器语言 */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function persistLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 隐私模式 / 禁用存储：本次会话内仍然生效 */
  }
}

export function translate(lang: Lang, key: MsgKey, vars?: Vars): string {
  let out: string = messages[lang][key] ?? messages.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

// ---- 模块级当前语言：供非 React 代码（core/loader、core/exporter）同步读取 ----
let currentLang: Lang = detectLang();

export function getActiveLang(): Lang {
  return currentLang;
}

export function setActiveLang(lang: Lang): void {
  currentLang = lang;
}

/** 以「当前语言」翻译，用于 React 组件之外（事件回调、核心模块、错误信息）。 */
export function t(key: MsgKey, vars?: Vars): string {
  return translate(currentLang, key, vars);
}
