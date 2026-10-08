import { t, type MsgKey } from '../i18n/translate';

export interface MimeCandidate {
  mime: string;
  /** 中文兜底标签（保留原有字段与语义，未使用 i18n 的调用方不受影响） */
  label: string;
  /** i18n 键：UI 应以 t(labelKey) 显示；未提供时回退到 label */
  labelKey?: MsgKey;
  alpha: boolean;
  audio: boolean;
}

export function supportedMimeTypes(): MimeCandidate[] {
  const all: MimeCandidate[] = [
    {
      mime: 'video/webm;codecs=vp9,opus',
      label: 'WebM · VP9（画质优先）',
      labelKey: 'mime.vp9',
      alpha: false,
      audio: true,
    },
    {
      mime: 'video/webm;codecs=vp8,opus',
      label: 'WebM · VP8（支持透明通道）',
      labelKey: 'mime.vp8',
      alpha: true,
      audio: true,
    },
    {
      mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      label: 'MP4 · H.264',
      labelKey: 'mime.mp4',
      alpha: false,
      audio: true,
    },
    { mime: 'video/webm', label: 'WebM（默认）', labelKey: 'mime.webmDefault', alpha: false, audio: true },
  ];
  return all.filter((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime));
}

// ---- 演奏视频音频图（预览可听 / 导出可录），每个 video 元素只建一次 ----
interface AudioGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}
const audioGraphs = new WeakMap<HTMLVideoElement, AudioGraph>();

export function ensureAudioGraph(video: HTMLVideoElement, startMuted = false): AudioGraph {
  let g = audioGraphs.get(video);
  if (!g) {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(video);
    const gain = ctx.createGain();
    gain.gain.value = startMuted ? 0 : 1;
    source.connect(gain);
    gain.connect(ctx.destination);
    // 接入音频图后一律由增益控制监听音量：元素静音位会同时掐掉导出采集的音轨
    video.muted = false;
    g = { ctx, source, gain };
    audioGraphs.set(video, g);
  }
  if (g.ctx.state === 'suspended') void g.ctx.resume();
  return g;
}

export function setVideoMuted(video: HTMLVideoElement, muted: boolean): void {
  const g = audioGraphs.get(video);
  if (g) {
    // 已接入音频图：只动增益，并确保元素静音位始终为关（否则"取消静音"后将永久无声）
    video.muted = false;
    if (!muted && g.ctx.state === 'suspended') void g.ctx.resume();
    g.gain.gain.value = muted ? 0 : 1;
  } else {
    video.muted = muted;
  }
}

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  mimeType: string;
  /** 绘制一帧：bg → 视频 → 谱面，由调用方组合 */
  drawFrame: (ctx: CanvasRenderingContext2D, masterTime: number) => void;
  video: HTMLVideoElement | null;
  includeVideoAudio: boolean;
  /** 预览当前的静音状态（仅影响监听音量，不影响导出音轨） */
  previewMuted?: boolean;
  rangeStart: number;
  rangeEnd: number;
  onProgress: (progress: number, time: number) => void;
  shouldCancel: () => boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 实时录制导出：以演奏视频（或内部时钟）为主时钟，逐帧绘制到离屏画布，
 * 通过 canvas.captureStream + MediaRecorder 生成视频文件。
 */
export function exportVideo(opts: ExportOptions): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = opts.width;
    canvas.height = opts.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      reject(new Error(t('err.canvasContext')));
      return;
    }

    const stream = canvas.captureStream(opts.fps);
    let audioGraph: AudioGraph | null = null;
    if (opts.video && opts.includeVideoAudio) {
      try {
        audioGraph = ensureAudioGraph(opts.video, opts.previewMuted ?? false);
        const dest = audioGraph.ctx.createMediaStreamDestination();
        audioGraph.source.connect(dest);
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
      } catch (err) {
        console.warn(t('err.audioCapture'), err);
      }
    }

    const bitrate = clamp(Math.round(opts.width * opts.height * opts.fps * 0.12), 2_000_000, 40_000_000);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: opts.mimeType,
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: 192_000,
      });
    } catch (err) {
      reject(new Error(t('err.mimeUnsupported', { err: String(err) })));
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error(t('err.recordFailed')));
    };
    recorder.onstop = () => {
      cleanup();
      if (opts.shouldCancel()) {
        reject(new Error('cancelled'));
        return;
      }
      resolve(new Blob(chunks, { type: opts.mimeType.split(';')[0] }));
    };

    const video = opts.video;
    let rafId = 0;
    let wallStart = 0;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      if (video) {
        video.pause();
      }
      stream.getTracks().forEach((t) => t.stop());
    };

    const finish = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };

    const tick = () => {
      const t = video ? video.currentTime : opts.rangeStart + (performance.now() - wallStart) / 1000;
      opts.drawFrame(ctx, t);
      const p = clamp((t - opts.rangeStart) / Math.max(0.001, opts.rangeEnd - opts.rangeStart), 0, 1);
      opts.onProgress(p, t);
      if (opts.shouldCancel() || t >= opts.rangeEnd - 0.001 || (video && video.ended)) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    const start = async () => {
      if (video) {
        video.pause();
        if (Math.abs(video.currentTime - opts.rangeStart) > 0.02) {
          await seekVideo(video, opts.rangeStart);
        }
      }
      // 先画一帧再开始，避免首帧空白
      opts.drawFrame(ctx, opts.rangeStart);
      recorder.start(500);
      if (video) {
        await video.play();
      } else {
        wallStart = performance.now();
      }
      rafId = requestAnimationFrame(tick);
    };

    start().catch((err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

export function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.005) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    setTimeout(done, 2000);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
