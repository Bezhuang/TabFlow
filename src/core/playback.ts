import { model } from '@coderline/alphatab';
import { TICKS_PER_QUARTER, type TempoMap } from './tempo';

type MasterBar = model.MasterBar;
type RepeatGroup = model.RepeatGroup;

/** 与 alphaTab model.Direction 同源的跳转记号枚举 */
const D = model.Direction;

export interface PlaybackStep {
  /** 对应 score.masterBars 的下标：决定播放头取哪个小节的 x 坐标 */
  barIndex: number;
  /** 累计起始秒 */
  startSec: number;
  durSec: number;
}

export interface PlaybackOrder {
  /** 实际演奏顺序（已剔除本次不发声的跳房子小节） */
  steps: PlaybackStep[];
  /** 含反复的总演奏时长（秒） */
  totalSec: number;
  /** 播放顺序是否不同于线性顺序（用于界面提示） */
  hasRepeats: boolean;
  /** 时间 → 所在演奏步与步内进度 0..1 */
  stepAtSec: (t: number) => { step: number; frac: number };
}

/** 一次反复进行中的状态（对应 alphaTab 内部 Repeat）。 */
interface RepeatFrame {
  group: RepeatGroup;
  opening: MasterBar;
  closings: MasterBar[];
  iterations: number[];
  closingIndex: number;
}

function frameFor(group: RepeatGroup, opening: MasterBar): RepeatFrame {
  // alphaTab 会就地排序 closings，这里排副本以免改动模型
  const closings = [...group.closings].sort((a, b) => a.index - b.index);
  return { group, opening, closings, iterations: closings.map(() => 0), closingIndex: 0 };
}

/**
 * 计算谱面的实际演奏顺序，覆盖反复记号、跳房子（多次结尾）以及
 * D.C. / D.S. / Coda / Fine 跳转。
 *
 * 算法逐句复刻 alphaTab 内部的 MidiPlaybackController（该实现未进入公开 API，
 * 因此此处用公开的 MasterBar/RepeatGroup 字段重写），语义与 alphaTab 播放一致。
 * 谱面本身仍按 Guitar Pro 风格线性排版，只有播放头位置按本顺序前后跳。
 */
export function buildPlaybackOrder(score: model.Score, tempoMap: TempoMap): PlaybackOrder {
  const bars = score.masterBars;
  const n = bars.length;
  const durSecOf = (bar: MasterBar): number => {
    const bpm = tempoMap.bpmAtTick(bar.start);
    return (bar.calculateDuration() / TICKS_PER_QUARTER) * (60 / (bpm > 0 ? bpm : 120));
  };

  const steps: PlaybackStep[] = [];
  let totalSec = 0;
  let index = 0;
  /** 0 正常播放 / 1 已跳转(D.C.、D.S.) / 2 找 Coda / 3 找双 Coda / 4 找 Fine */
  let state = 0;
  const repeatStack: RepeatFrame[] = [];
  const groupsOnStack = new Set<RepeatGroup>();
  let previousAlternateEndings = 0;

  const hasDir = (bar: MasterBar | undefined, dir: model.Direction): boolean => {
    const s = bar?.directions;
    return !!s && s.has(dir);
  };
  const findForwards = (toFind: model.Direction, from: number): number => {
    for (let i = from; i < n; i++) if (hasDir(bars[i], toFind)) return i;
    return -1;
  };
  const findBackwards = (toFind: model.Direction, from: number): number => {
    for (let i = from; i >= 0; i--) if (hasDir(bars[i], toFind)) return i;
    return -1;
  };
  const findTarget = (toFind: model.Direction, from: number, backwardsFirst: boolean): number => {
    const first = backwardsFirst ? findBackwards(toFind, from) : findForwards(toFind, from);
    if (first !== -1) return first;
    return backwardsFirst ? findForwards(toFind, from) : findBackwards(toFind, from);
  };
  const resetRepeats = (): void => {
    groupsOnStack.clear();
    previousAlternateEndings = 0;
    repeatStack.length = 0;
  };
  const handleDaCapo = (dir: model.Direction, newState: number): boolean => {
    if (!hasDir(bars[index], dir)) return false;
    index = 0;
    state = newState;
    resetRepeats();
    return true;
  };
  const handleDalSegno = (dir: model.Direction, newState: number, target: model.Direction): boolean => {
    if (!hasDir(bars[index], dir)) return false;
    const t = findTarget(target, index, true);
    if (t === -1) return false;
    index = t;
    state = newState;
    resetRepeats();
    return true;
  };
  const handleDaCoda = (dir: model.Direction, target: model.Direction): boolean => {
    if (!hasDir(bars[index], dir)) return false;
    const t = findTarget(target, index, false);
    if (t === -1) {
      index++;
      return true;
    }
    index = t;
    state = 0;
    return true;
  };

  const moveNext = (): void => {
    const bar = bars[index];
    if (!bar) {
      index++;
      return;
    }
    const dirs = bar.directions;
    const hasDirections = !!dirs && dirs.size > 0;

    if (state !== 0) {
      if (!hasDirections) {
        index++;
        return;
      }
      if (state === 1) {
        index++;
        return;
      }
      if (state === 2) {
        if (handleDaCoda(D.JumpDaCoda, D.TargetCoda)) return;
        index++;
        return;
      }
      if (state === 3) {
        if (handleDaCoda(D.JumpDaDoubleCoda, D.TargetDoubleCoda)) return;
        index++;
        return;
      }
      // state === 4：走到 Fine 即结束
      if (dirs.has(D.TargetFine)) {
        index = n;
        return;
      }
      index++;
      return;
    }

    if (hasDirections) {
      if (
        handleDaCapo(D.JumpDaCapo, 1) ||
        handleDaCapo(D.JumpDaCapoAlCoda, 2) ||
        handleDaCapo(D.JumpDaCapoAlDoubleCoda, 3) ||
        handleDaCapo(D.JumpDaCapoAlFine, 4)
      ) {
        return;
      }
      if (
        handleDalSegno(D.JumpDalSegno, 1, D.TargetSegno) ||
        handleDalSegno(D.JumpDalSegnoAlCoda, 2, D.TargetSegno) ||
        handleDalSegno(D.JumpDalSegnoAlDoubleCoda, 3, D.TargetSegno) ||
        handleDalSegno(D.JumpDalSegnoAlFine, 4, D.TargetSegno)
      ) {
        return;
      }
      if (
        handleDalSegno(D.JumpDalSegnoSegno, 1, D.TargetSegnoSegno) ||
        handleDalSegno(D.JumpDalSegnoSegnoAlCoda, 2, D.TargetSegnoSegno) ||
        handleDalSegno(D.JumpDalSegnoSegnoAlDoubleCoda, 3, D.TargetSegnoSegno) ||
        handleDalSegno(D.JumpDalSegnoSegnoAlFine, 4, D.TargetSegnoSegno)
      ) {
        return;
      }
    }

    // 普通反复：跳到反复开头 / 换下一个结尾 / 结束该反复
    const repeatCount = bar.repeatCount - 1;
    if (repeatStack.length > 0 && repeatCount > 0) {
      const frame = repeatStack[repeatStack.length - 1];
      if (frame.iterations[frame.closingIndex] < repeatCount) {
        index = frame.opening.index;
        frame.iterations[frame.closingIndex]++;
        for (let i = 0; i < frame.closingIndex; i++) frame.iterations[i] = 0;
        frame.closingIndex = 0;
        previousAlternateEndings = 0;
      } else if (frame.closingIndex < frame.closings.length - 1) {
        frame.closingIndex++;
        index++;
      } else {
        repeatStack.pop();
        groupsOnStack.delete(frame.group);
        index++;
      }
    } else {
      index++;
    }
  };

  // 护栏：畸形谱面（跳转成环等）不应让应用卡死，超限则回退线性顺序
  const maxSteps = Math.max(n * 32 + 256, 512);
  let truncated = false;
  try {
    while (index < n && index >= 0) {
      if (steps.length >= maxSteps) {
        truncated = true;
        break;
      }
      const bar = bars[index];
      if (!bar) break;

      let shouldPlay = true;
      if (state === 0) {
        let alternateEndings = bar.alternateEndings;
        if (alternateEndings === 0) alternateEndings = previousAlternateEndings;
        const group = bar.repeatGroup as RepeatGroup | undefined;
        if (group && group.opening === bar && group.isClosed && !groupsOnStack.has(group)) {
          repeatStack.push(frameFor(group, bar));
          groupsOnStack.add(group);
          previousAlternateEndings = 0;
          alternateEndings = bar.alternateEndings;
        }
        if (repeatStack.length === 0 || alternateEndings === 0) {
          shouldPlay = true;
        } else {
          const frame = repeatStack[repeatStack.length - 1];
          const iteration = frame.iterations[frame.closingIndex] ?? 0;
          previousAlternateEndings = alternateEndings;
          shouldPlay = (alternateEndings & (1 << iteration)) !== 0;
        }
      }

      if (shouldPlay) {
        const durSec = durSecOf(bar);
        steps.push({ barIndex: index, startSec: totalSec, durSec });
        totalSec += durSec;
      }
      moveNext();
    }
  } catch (err) {
    console.warn('playback order failed, falling back to linear', err);
    truncated = true;
  }

  if (truncated || steps.length === 0) {
    // 回退：与改造前一致的线性顺序
    steps.length = 0;
    totalSec = 0;
    for (let i = 0; i < n; i++) {
      const durSec = durSecOf(bars[i]);
      steps.push({ barIndex: i, startSec: totalSec, durSec });
      totalSec += durSec;
    }
  }

  const hasRepeats = steps.length !== n || Math.abs(totalSec - tempoMap.totalSec) > 0.01;

  const stepAtSec = (t: number): { step: number; frac: number } => {
    if (steps.length === 0) return { step: 0, frac: 0 };
    if (t <= 0) return { step: 0, frac: 0 };
    if (t >= totalSec) return { step: steps.length - 1, frac: 1 };
    let lo = 0;
    let hi = steps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (steps[mid].startSec <= t) lo = mid;
      else hi = mid - 1;
    }
    const s = steps[lo];
    const frac = s.durSec > 0 ? Math.min(1, Math.max(0, (t - s.startSec) / s.durSec)) : 0;
    return { step: lo, frac };
  };

  return { steps, totalSec, hasRepeats, stepAtSec };
}
