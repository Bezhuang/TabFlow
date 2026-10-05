export const TICKS_PER_QUARTER = 960;
export const TICKS_PER_BAR_UNIT = 3840; // 全音符

import type * as AT from '@coderline/alphatab';

export interface TempoSegment {
  startTick: number;
  endTick: number;
  bpm: number;
  startSec: number;
}

/** tick ↔ 秒 的换算（考虑速度变化）。 */
export class TempoMap {
  segments: TempoSegment[] = [];
  totalTicks = 0;
  totalSec = 0;

  constructor(score: AT.model.Score) {
    let bpm = score.tempo > 0 ? score.tempo : 120;
    let sec = 0;
    const bars = score.masterBars;
    for (let i = 0; i < bars.length; i++) {
      const mb = bars[i];
      const autos = mb.tempoAutomations ?? [];
      if (autos.length > 0) {
        bpm = autos[0].value > 0 ? autos[0].value : bpm;
      }
      const startTick = mb.start;
      const durTicks = mb.calculateDuration();
      this.segments.push({ startTick, endTick: startTick + durTicks, bpm, startSec: sec });
      sec += (durTicks / TICKS_PER_QUARTER) * (60 / bpm);
    }
    this.totalTicks = bars.length ? bars[bars.length - 1].start + bars[bars.length - 1].calculateDuration() : 0;
    this.totalSec = sec;
  }

  private segForTick(tick: number): TempoSegment {
    const segs = this.segments;
    if (segs.length === 0) return { startTick: 0, endTick: 0, bpm: 120, startSec: 0 };
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].startTick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return segs[lo];
  }

  tickToSec(tick: number): number {
    const seg = this.segForTick(tick);
    const t = Math.min(Math.max(tick, seg.startTick), seg.endTick);
    return seg.startSec + ((t - seg.startTick) / TICKS_PER_QUARTER) * (60 / seg.bpm);
  }

  secToTick(sec: number): number {
    const segs = this.segments;
    if (segs.length === 0) return 0;
    let seg = segs[segs.length - 1];
    for (const s of segs) {
      if (sec < s.startSec) break;
      seg = s;
    }
    return seg.startTick + (sec - seg.startSec) * (seg.bpm / 60) * TICKS_PER_QUARTER;
  }

  bpmAtTick(tick: number): number {
    return this.segForTick(tick).bpm;
  }
}
