import { importer, Settings } from '@coderline/alphatab';
import type * as AT from '@coderline/alphatab';
import { t } from '../i18n/translate';

export interface TrackInfo {
  index: number;
  name: string;
  isPerc: boolean;
  /** 钢琴类大谱表（多谱表且无六线谱）：固定五线谱渲染 */
  grandStaff: boolean;
  noteCount: number;
}

function trackInfo(track: AT.model.Track): TrackInfo {
  const staff = track.staves[0];
  let noteCount = 0;
  for (const bar of staff?.bars ?? []) {
    for (const v of bar.voices) for (const b of v.beats) noteCount += b.notes.length;
  }
  const isPerc = track.isPercussion || staff?.isPercussion === true;
  return {
    index: track.index,
    name: track.name || `Track ${track.index + 1}`,
    isPerc,
    grandStaff: !isPerc && track.staves.length > 1 && !track.staves.some((s) => s.showTablature),
    noteCount,
  };
}

export function getTrackInfos(score: AT.model.Score): TrackInfo[] {
  return score.tracks.map(trackInfo);
}

/** 解析 Guitar Pro 文件（gp3/gp4/gp5/gpx/gp/gp8）。 */
export async function loadGpFile(file: File): Promise<AT.model.Score> {
  const buf = await file.arrayBuffer();
  const data = new Uint8Array(buf);
  let score: AT.model.Score;
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(data);
  } catch (err) {
    const diag = (err as { cause?: { parserDiagnostics?: { items?: { message: string }[] } } }).cause;
    const detail = diag?.parserDiagnostics?.items?.map((d) => d.message).join('; ');
    throw new Error(detail || t('err.parseGp'));
  }
  const clamped = hideOutOfRangePercussionNotes(score);
  if (clamped) {
    // 隐藏越界鼓音符后刷新派生数据（minNote/maxNote 等），保持一致
    try {
      score.finish(new Settings());
    } catch {
      /* 失败时保持既有派生数据 */
    }
  }
  ensureFinished(score);
  return score;
}

function ensureFinished(score: AT.model.Score): void {
  const b0 = score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0];
  if (b0 && b0.playbackStart === undefined) {
    score.finish(new Settings());
  }
}

// ---------------------------------------------------------------------------
// 鼓谱溢出保护
// staffLine 语义：0 = 五线谱最上线，每 +1 向下半格（线/间交替）。
// 上加一线 = -2，下加一线 = 10。超出该范围的鼓音符会画出延伸很远的加线
// （部分 GP6+ 文件的鼓表映射越界），按需求"不改渲染逻辑，越界不显示"。
// ---------------------------------------------------------------------------
const PERC_STAFF_LINE_MIN = -2;
const PERC_STAFF_LINE_MAX = 10;

/** 内置默认鼓表的 id → staffLine 映射（供 GP5 等仅有 GM 编号、无自带鼓表的文件兜底）。 */
let defaultPercStaffLines: Map<number, number> | null = null;
function getDefaultPercussionStaffLines(): Map<number, number> {
  if (!defaultPercStaffLines) {
    defaultPercStaffLines = new Map();
    try {
      const tex = [
        '\\tempo 100',
        '.',
        '\\track "P"',
        '\\instrument percussion',
        '\\articulation defaults',
        ':4',
        'kickhit2 snarehit hihatclosed lowtomhit |',
      ].join('\n');
      const tmp = importer.ScoreLoader.loadAlphaTex(tex);
      for (const a of tmp.tracks[0]?.percussionArticulations ?? []) {
        if (a && typeof a.id === 'number' && typeof a.staffLine === 'number' && !defaultPercStaffLines.has(a.id)) {
          defaultPercStaffLines.set(a.id, a.staffLine);
        }
      }
    } catch {
      /* 提取失败时兜底表为空（仅影响无法解析的音符判定） */
    }
  }
  return defaultPercStaffLines;
}

/** 解析鼓音符的实际渲染行（与 alphaTab 内部规则一致：先查轨道鼓表，再查内置默认表）。 */
function resolvePercussionStaffLine(track: AT.model.Track, articulationId: number): number | undefined {
  const table = track.percussionArticulations;
  if (table && articulationId >= 0 && articulationId < table.length) {
    const art = table[articulationId];
    if (art && typeof art.staffLine === 'number') return art.staffLine;
  }
  if (articulationId >= 0) {
    const line = getDefaultPercussionStaffLines().get(articulationId);
    if (typeof line === 'number') return line;
  }
  return undefined;
}

/** 移除超出"上加一线 ~ 下加一线"的鼓音符（不改动任何位置/映射，仅不显示），返回是否有改动。 */
function hideOutOfRangePercussionNotes(score: AT.model.Score): boolean {
  let changed = false;
  for (const track of score.tracks) {
    if (!track.isPercussion) continue;
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (beat.notes.length === 0) continue;
            const kept: AT.model.Note[] = [];
            for (const note of beat.notes) {
              const line = resolvePercussionStaffLine(track, note.percussionArticulation);
              if (typeof line === 'number' && line >= PERC_STAFF_LINE_MIN && line <= PERC_STAFF_LINE_MAX) {
                kept.push(note);
              } else {
                changed = true;
              }
            }
            if (kept.length !== beat.notes.length) {
              beat.notes.splice(0, beat.notes.length, ...kept);
            }
          }
        }
      }
    }
  }
  return changed;
}

/** alphaTex 字符串字面量：转义双引号，避免本地化文案里的引号破坏谱面语法。 */
function texStr(s: string): string {
  return s.replace(/"/g, "'");
}

/** 内置示例曲，无需上传文件即可体验完整流程。 */
export function loadDemoScore(): AT.model.Score {
  // 架子鼓基础节奏型（8 分音符：底鼓 1/3 拍、军鼓 2/4 拍、闭合踩镲铺满）
  const drumA =
    '(kickhit2 hihatclosed) hihatclosed (snarehit hihatclosed) hihatclosed (kickhit2 hihatclosed) hihatclosed (snarehit hihatclosed) hihatclosed |';
  const tex = [
    `\\title "${texStr(t('demo.title'))}"`,
    `\\artist "${texStr(t('demo.artist'))}"`,
    '\\tempo 96',
    '.',
    `\\track "${texStr(t('demo.trackGuitar'))}"`,
    '\\tuning E3 A3 D4 G4 B3 E4',
    ':8',
    '0.1 3.1 5.1 7.1 5.1 3.1 0.1 3.1 |',
    '5.1 7.1 8.1 7.1 5.1 3.1 5.1 3.1 |',
    '0.1 3.1 5.1 7.1 5.1 3.1 0.1 3.1 |',
    '7.1 8.1 10.1 8.1 7.1 5.1 3.1 0.1 |',
    ':4',
    '0.5 0.5 5.4 5.4 |',
    '7.4 7.4 5.4 3.4 |',
    '0.5 0.5 5.4 5.4 |',
    '8.4 7.4 5.4 3.4 |',
    '\\tempo 112',
    ':8',
    '0.1 3.1 5.1 7.1 5.1 3.1 0.1 3.1 |',
    '5.1 7.1 8.1 7.1 5.1 3.1 5.1 3.1 |',
    '10.1 8.1 7.1 5.1 8.1 7.1 5.1 3.1 |',
    '7.1 5.1 3.1 0.1 r 0.1 3.1 5.1 |',
    ':4',
    '0.5 3.5 5.4 7.4 |',
    '8.4 7.4 5.4 3.4 |',
    '0.5 r 0.5 3.5 |',
    '5.4 r 0.1 r |',
    `\\track "${texStr(t('demo.trackBass'))}"`,
    '\\tuning E1 A1 D2 G2',
    ':8',
    '0.4 0.4 0.4 0.4 0.4 0.4 3.4 3.4 |',
    '0.4 0.4 0.4 0.4 3.4 3.4 5.4 5.4 |',
    '0.4 0.4 0.4 0.4 0.4 0.4 3.4 3.4 |',
    '0.4 0.4 0.4 0.4 3.4 3.4 5.4 5.4 |',
    ':4',
    '0.4 0.4 0.3 0.3 |',
    '3.4 3.4 0.4 0.4 |',
    '0.4 0.4 0.3 0.3 |',
    '0.4 0.4 3.4 5.4 |',
    ':8',
    '0.4 0.4 0.4 0.4 0.4 0.4 3.4 3.4 |',
    '0.4 0.4 0.4 0.4 3.4 3.4 5.4 5.4 |',
    '0.4 0.4 0.4 0.4 0.4 0.4 3.4 3.4 |',
    '0.4 0.4 0.4 0.4 3.4 3.4 5.4 5.4 |',
    ':4',
    '0.4 0.4 0.3 0.3 |',
    '3.4 3.4 0.4 0.4 |',
    '0.4 r 0.4 0.3 |',
    '0.4 r 0.4 r |',
    `\\track "${texStr(t('demo.trackPiano'))}"`,
    '\\tuning piano',
    '\\clef G2',
    ':2',
    '(A3 C4 E4) (A3 C4 E4) |',
    '(C4 E4 G4) (C4 E4 G4) |',
    '(D4 F4 A4) (D4 F4 A4) |',
    '(E4 G4 B4) (E4 G4 B4) |',
    ':4',
    '(A3 C4 E4) (A3 C4 E4) (A3 C4 E4) (A3 C4 E4) |',
    '(C4 E4 G4) (C4 E4 G4) (C4 E4 G4) (C4 E4 G4) |',
    '(D4 F4 A4) (D4 F4 A4) (D4 F4 A4) (D4 F4 A4) |',
    '(E4 G4 B4) (E4 G4 B4) (E4 G4 B4) (E4 G4 B4) |',
    ':8',
    'A3 C4 E4 A4 E4 C4 A3 C4 |',
    'C4 E4 G4 C5 G4 E4 C4 E4 |',
    'D4 F4 A4 D5 A4 F4 D4 F4 |',
    'E4 G4 B4 E5 B4 G4 E4 G4 |',
    'A3 C4 E4 A4 E4 C4 A3 C4 |',
    'C4 E4 G4 C5 G4 E4 C4 E4 |',
    'D4 F4 A4 D5 A4 F4 D4 F4 |',
    'E4 G4 B4 E5 G4 E4 C4 A3 |',
    '\\staff',
    '\\tuning piano',
    '\\clef F4',
    ':2',
    'A2 A2 |',
    'C3 C3 |',
    'D3 D3 |',
    'E3 E3 |',
    'A2 E3 |',
    'C3 G3 |',
    'D3 A3 |',
    'E3 B3 |',
    ':4',
    'A2 E3 A2 E3 |',
    'C3 G3 C3 G3 |',
    'D3 A3 D3 A3 |',
    'E3 B3 E3 B3 |',
    'A2 E3 A2 E3 |',
    'C3 G3 C3 G3 |',
    'D3 A3 D3 A3 |',
    'E3 B3 A3 E3 |',
    `\\track "${texStr(t('demo.trackDrums'))}"`,
    '\\instrument percussion',
    '\\articulation defaults',
    ':8',
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    drumA,
    '(kickhit2 hihatclosed) hihatclosed snarehit snarehit (kickhit2 hihatclosed) hihatclosed snarehit snarehit |',
    '(kickhit2 hihatclosed) hihatclosed (snarehit hihatclosed) hihatclosed (snarehit hihatclosed) (snarehit crashhighhit) (kickhit2 crashhighhit) r |',
  ].join('\n');
  const score = importer.ScoreLoader.loadAlphaTex(tex);
  ensureFinished(score);
  return score;
}
