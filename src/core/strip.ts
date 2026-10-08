import {
  Settings,
  LayoutMode,
  StaveProfile,
  Environment,
  rendering,
  model,
} from '@coderline/alphatab';
const Color = model.Color;
import bravuraWoff2 from '@coderline/alphatab/font/Bravura.woff2?url';
import { TempoMap } from './tempo';
import { t } from '../i18n/translate';

// Bravura 音乐字体随构建产物一起发布
const FONT_DIR = bravuraWoff2.slice(0, bravuraWoff2.lastIndexOf('/') + 1);

/** boundsLookup 的结构化类型（alphaTab 未直接导出该类型） */
interface BoundsRect {
  x: number;
  w: number;
}
interface BeatBoundsLike {
  realBounds: BoundsRect;
  beat: { playbackStart?: number };
}
interface BarBoundsLike {
  beats: BeatBoundsLike[];
}
interface MasterBarBoundsLike {
  index: number;
  realBounds: BoundsRect;
  bars: BarBoundsLike[];
}
interface StaffSystemBoundsLike {
  masterBars: MasterBarBoundsLike[];
}
interface BoundsLookupLike {
  staffSystems: StaffSystemBoundsLike[];
}

export type NotationMode = 'jianpu' | 'standard' | 'tab';

export interface StripOptions {
  scale: number;
  trackIndexes: number[];
  /** 记谱方式：简谱 / 五线谱 / 六线谱（钢琴大谱表与鼓轨固定五线谱） */
  notationMode: NotationMode;
  /** 谱面前景色（hex），null = alphaTab 默认黑 */
  fg: string | null;
}

export interface Sample {
  tick: number;
  x: number;
}

export interface PartialPiece {
  canvas: HTMLCanvasElement;
  /** 逻辑坐标（与 bounds 同单位） */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StripResult {
  /** 渲染分片（逻辑坐标），每帧只绘制可视区域内的分片，无画布尺寸限制 */
  partials: PartialPiece[];
  /** 逻辑总宽度（与 bounds 同单位） */
  width: number;
  height: number;
  /** 秒 → 条带 x（绝对坐标） */
  xOfTime: (t: number) => number;
  tempoMap: TempoMap;
  barRanges: { x: number; w: number }[];
  beatRanges: { x: number; w: number }[];
}

let fontPromise: Promise<string> | null = null;
/** 手动注册 Bravura 音乐字体（低层 ScoreRenderer 不走 BrowserUiFacade 的注册流程），返回字体家族名。 */
function ensureMusicFont(): Promise<string> {
  if (!fontPromise) {
    const familyName = 'TabFlowBravura';
    fontPromise = (async () => {
      const font = new FontFace(familyName, `url(${bravuraWoff2})`, { style: 'normal', weight: 'normal' });
      await font.load();
      document.fonts.add(font);
      return familyName;
    })();
  }
  return fontPromise;
}

let colorPatchDone = false;
/**
 * 修复 alphaTab Html5Canvas 的分片颜色缺陷：beginRender 为每个分片新建绘图上下文，
 * 但 color setter 在值未变化时短路，导致自定义前景色只作用于第一个分片，
 * 后续分片回退为上下文默认的黑色。此处重写 setter 强制应用到当前上下文。
 */
function patchHtml5CanvasColor(): void {
  if (colorPatchDone) return;
  colorPatchDone = true;
  try {
    const probe = Environment.getRenderEngineFactory('html5').createCanvas() as unknown as Record<string, unknown>;
    const proto = Object.getPrototypeOf(probe) as Record<string, PropertyDescriptor>;
    const desc = Object.getOwnPropertyDescriptor(proto, 'color');
    if (!desc || !desc.get || !desc.set) return;
    Object.defineProperty(proto, 'color', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(this: { _color?: unknown; _context?: CanvasRenderingContext2D | null }, value: { rgba: string }) {
        this._color = value;
        if (this._context) {
          this._context.strokeStyle = value.rgba;
          this._context.fillStyle = value.rgba;
        }
      },
    });
  } catch {
    /* 补丁失败时保持默认行为（黑色谱面） */
  }
}

interface RenderOnceResult {
  partials: PartialPiece[];
  totalWidth: number;
  totalHeight: number;
  bounds: BoundsLookupLike;
}

function renderOnce(score: model.Score, trackIndexes: number[], settings: Settings): Promise<RenderOnceResult> {
  return new Promise<RenderOnceResult>((resolve, reject) => {
    const renderer = new rendering.ScoreRenderer(settings);
    // 低层渲染器没有容器元素，需显式给出宽度，否则 alphaTab 以 width=0（元素不可见）为由跳过渲染
    renderer.width = 20000;
    let settled = false;
    // html5 引擎按分片交付 canvas 元素（renderFinished.renderResult 恒为 null）。
    // firstMasterBarIndex === -1 的是 "rendered by alphaTab" 注记分片，不进视频成品（署名保留在 README 中）。
    const partials: PartialPiece[] = [];
    renderer.partialRenderFinished.on((args) => {
      const el = args.renderResult as HTMLCanvasElement | null;
      if (el && el.tagName === 'CANVAS' && args.firstMasterBarIndex !== -1) {
        partials.push({ canvas: el, x: args.x, y: args.y, width: args.width, height: args.height });
      }
    });
    renderer.error.on((err: Error) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    renderer.renderFinished.on((args) => {
      if (settled) return;
      settled = true;
      if (!renderer.boundsLookup) {
        reject(new Error(t('err.renderBounds')));
        return;
      }
      resolve({
        partials,
        totalWidth: args.totalWidth,
        totalHeight: args.totalHeight,
        bounds: renderer.boundsLookup as unknown as BoundsLookupLike,
      });
    });
    try {
      renderer.renderScore(score, trackIndexes);
    } catch (err) {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

let numberedPatchDone = false;
/**
 * 修复 alphaTab 简谱渲染器（NumberedBarRenderer）的上游缺陷：
 * 其 shouldPaintBeamingHelper 恒返回 true，使"纯休止符符杠组"
 * （如 16 分休止符恰好落在符杠分组边界而独立成组）进入需要读取音符的
 * 溢出计算分支；这类组没有音符（highestNoteInHelper === null）→ 渲染崩溃
 * （Cannot read properties of null (reading 'beat')）。
 * 这里在计算前剔除无音符的符杠组，效果等同标准谱渲染器
 * （shouldPaintBeamingHelper 返回 !isRestBeamHelper）的行为。
 */
function patchNumberedRenderer(): void {
  if (numberedPatchDone) return;
  numberedPatchDone = true;
  try {
    interface FactoryLike {
      staffId: string;
      create(renderer: unknown, bar: unknown): unknown;
    }
    const factories = (Environment as unknown as { defaultRenderers?: FactoryLike[] }).defaultRenderers;
    const factory = factories?.find((f) => f.staffId === 'numbered');
    if (!factory) return;
    const origCreate = factory.create.bind(factory);
    factory.create = (renderer: unknown, bar: unknown) => {
      const inst = origCreate(renderer, bar) as {
        calculateBeamingOverflows?: (top: number, bottom: number) => void;
        helpers?: { beamHelpers?: unknown[][] };
      };
      const origCalc = inst.calculateBeamingOverflows;
      if (typeof origCalc === 'function') {
        inst.calculateBeamingOverflows = function (this: typeof inst, top: number, bottom: number) {
          pruneNoteLessBeamHelpers(this.helpers?.beamHelpers);
          return origCalc.call(this, top, bottom);
        };
      }
      return inst;
    };
  } catch {
    /* 补丁失败时保持默认行为（个别文件可能复现上游缺陷） */
  }
}

/** 剔除没有任何音符的符杠组（含 tuplet 的休止组保留：上游对其有安全分支）。 */
function pruneNoteLessBeamHelpers(beamHelpers: unknown[][] | undefined): void {
  if (!beamHelpers) return;
  try {
    for (const list of beamHelpers) {
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i] as {
          highestNoteInHelper?: unknown;
          lowestNoteInHelper?: unknown;
          hasTuplet?: boolean;
          isRestBeamHelper?: boolean;
        };
        const hasNotes = !!(h?.highestNoteInHelper || h?.lowestNoteInHelper);
        if (!hasNotes && !(h?.hasTuplet && h?.isRestBeamHelper)) list.splice(i, 1);
      }
    }
  } catch {
    /* 结构不符时跳过 */
  }
}

/**
 * 使用 alphaTab 渲染引擎把谱面渲染为一条横向长条（Horizontal 布局），
 * 并根据 boundsLookup 建立 时间 ↔ x 坐标 映射用于滚动同步。
 * 渲染结果以分片交付（不拼接），绘制时按可视区域挑选分片，因此不受浏览器画布尺寸限制。
 */
export async function renderStrip(score: model.Score, opts: StripOptions): Promise<StripResult> {
  patchHtml5CanvasColor();
  patchNumberedRenderer();
  const familyName = await ensureMusicFont();

  // 记谱方式（直接改 staff 显示标记）
  // - 鼓轨：固定标准鼓谱（五线谱记谱，绝不能切成简谱，否则渲染错误）
  // - 钢琴大谱表（多谱表且无六线谱）：固定五线谱
  // - 单谱表弦乐器：按 简谱 / 五线谱 / 六线谱 切换
  for (const ti of opts.trackIndexes) {
    const track = score.tracks[ti];
    if (!track) continue;
    const grandStaff = track.staves.length > 1 && !track.staves.some((s) => s.showTablature);
    for (const staff of track.staves) {
      if (track.isPercussion || staff.isPercussion || grandStaff) {
        staff.showNumbered = false;
        staff.showStandardNotation = true;
        staff.showTablature = false;
      } else if (track.staves.length > 1) {
        // 多谱表弦乐器（如 GP5 的 标准谱+六线谱 双谱表）
        if (staff.index === 0) {
          staff.showNumbered = opts.notationMode === 'jianpu';
          staff.showStandardNotation = opts.notationMode === 'standard';
          staff.showTablature = opts.notationMode === 'tab';
        } else {
          // 第二谱表是六线谱：六线谱模式下隐藏，避免重复
          staff.showNumbered = false;
          staff.showStandardNotation = false;
          staff.showTablature = opts.notationMode !== 'tab';
        }
      } else {
        // 单谱表：简谱/五线谱模式下六线谱行仍保留（GP 风格），六线谱模式只留六线谱
        staff.showNumbered = opts.notationMode === 'jianpu';
        staff.showStandardNotation = opts.notationMode === 'standard';
        staff.showTablature = true;
      }
    }
  }

  const settings = new Settings();
  settings.core.engine = 'html5';
  settings.core.fontDirectory = FONT_DIR;
  settings.core.enableLazyLoading = false; // 立即渲染全部分片，禁用视口懒加载
  settings.display.layoutMode = LayoutMode.Horizontal;
  settings.display.scale = opts.scale;
  settings.display.staveProfile = StaveProfile.Default;
  // smuflFontFamilyName 为内部字段（未出现在类型声明中），低层渲染需手动指定
  (settings.display.resources as unknown as { smuflFontFamilyName?: string }).smuflFontFamilyName = familyName;
  // 深色 / 透明背景的前景色覆盖
  if (opts.fg) {
    const m = opts.fg.replace('#', '');
    const rgb = m.length === 3 ? m.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
    const color = new Color(rgb[0] || 0, rgb[1] || 0, rgb[2] || 0, 255);
    const res = settings.display.resources;
    res.mainGlyphColor = color;
    res.secondaryGlyphColor = color;
    res.staffLineColor = color;
    res.barSeparatorColor = color;
    res.barNumberColor = color;
    res.scoreInfoColor = color;
  }

  const render = await renderOnce(score, opts.trackIndexes, settings);
  if (render.partials.length === 0) {
    throw new Error(t('err.renderEmpty'));
  }
  const { totalWidth, bounds } = render;
  // 有效高度：取分片覆盖范围（水印等注记分片已被过滤）
  let totalHeight = 0;
  for (const p of render.partials) totalHeight = Math.max(totalHeight, p.y + p.height);
  if (totalHeight <= 0) totalHeight = render.totalHeight;

  const tempoMap = new TempoMap(score);

  // tick → x 采样：小节起点 + 第一条轨道的每个 beat（绝对坐标，与画布像素一致）。
  // 用 findMasterBarByIndex（内部 _masterBarLookup）——横排布局的 staffSystems 不含小节数据。
  interface MBB {
    index: number;
    realBounds: { x: number; w: number };
    bars?: { beats?: { realBounds: { x: number }; beat: { playbackStart?: number } }[] }[];
  }
  const lookup = bounds as unknown as {
    staffSystems?: { masterBars?: MBB[] }[];
    findMasterBarByIndex?: (i: number) => MBB | null;
  };
  const getMasterBarBounds = (i: number): MBB | null => {
    if (typeof lookup.findMasterBarByIndex === 'function') {
      const b = lookup.findMasterBarByIndex(i);
      if (b) return b;
    }
    for (const sys of lookup.staffSystems ?? []) {
      const found = (sys.masterBars ?? []).find((m) => m.index === i);
      if (found) return found;
    }
    return null;
  };

  const samples: Sample[] = [];
  const barRanges: { x: number; w: number }[] = [];
  const beatRanges: { x: number; w: number }[] = [];
  for (let i = 0; i < score.masterBars.length; i++) {
    const mb = score.masterBars[i];
    const mbb = getMasterBarBounds(i);
    if (!mbb) continue;
    samples.push({ tick: mb.start, x: mbb.realBounds.x });
    barRanges.push({ x: mbb.realBounds.x, w: mbb.realBounds.w });
    const barBounds = mbb.bars?.[0];
    if (barBounds?.beats) {
      const xs = barBounds.beats.map((bb) => bb.realBounds.x);
      for (let j = 0; j < barBounds.beats.length; j++) {
        const beat = barBounds.beats[j].beat;
        samples.push({ tick: mb.start + (beat.playbackStart ?? 0), x: xs[j] });
        beatRanges.push({ x: xs[j], w: (j + 1 < xs.length ? xs[j + 1] : xs[j] + 40) - xs[j] });
      }
    }
  }
  samples.sort((a, b) => a.tick - b.tick);
  const deduped: Sample[] = [];
  for (const s of samples) {
    if (deduped.length === 0 || s.tick - deduped[deduped.length - 1].tick >= 1) deduped.push(s);
  }

  const xOfTime = (t: number): number => {
    if (deduped.length === 0) return 0;
    const tick = tempoMap.secToTick(t);
    if (tick <= deduped[0].tick) return deduped[0].x;
    if (tick >= deduped[deduped.length - 1].tick) return deduped[deduped.length - 1].x;
    let lo = 0;
    let hi = deduped.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (deduped[mid].tick <= tick) lo = mid;
      else hi = mid;
    }
    const a = deduped[lo];
    const b = deduped[hi];
    const f = (tick - a.tick) / Math.max(1, b.tick - a.tick);
    return a.x + (b.x - a.x) * f;
  };

  return {
    partials: render.partials,
    width: totalWidth,
    height: totalHeight,
    xOfTime,
    tempoMap,
    barRanges,
    beatRanges,
  };
}
