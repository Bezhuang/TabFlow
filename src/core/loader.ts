import { importer, Settings } from '@coderline/alphatab';
import type * as AT from '@coderline/alphatab';

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
    throw new Error(detail || '无法解析该文件，请确认是 Guitar Pro 格式（.gp3 / .gp4 / .gp5 / .gpx / .gp）');
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

/** 内置示例曲，无需上传文件即可体验完整流程。 */
export function loadDemoScore(): AT.model.Score {
  // 架子鼓基础节奏型（8 分音符：底鼓 1/3 拍、军鼓 2/4 拍、闭合踩镲铺满）
  const drumA =
    '(kickhit2 hihatclosed) hihatclosed (snarehit hihatclosed) hihatclosed (kickhit2 hihatclosed) hihatclosed (snarehit hihatclosed) hihatclosed |';
  const tex = [
    '\\title "示例曲 · Am 五声音阶练习"',
    '\\artist "TabFlow Demo"',
    '\\tempo 96',
    '.',
    '\\track "吉他"',
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
    '\\track "贝斯"',
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
    '\\track "钢琴"',
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
    '\\track "架子鼓"',
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
