import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as AT from '@coderline/alphatab';
import { getTrackInfos, loadDemoScore, loadGpFile, type TrackInfo } from './core/loader';
import { renderStrip, type StripResult, type NotationMode } from './core/strip';
import { resolveTheme, type ThemeMode } from './core/themes';
import { Engine } from './core/engine';
import {
  downloadBlob,
  ensureAudioGraph,
  exportVideo,
  setVideoMuted,
  supportedMimeTypes,
} from './core/exporter';
import type { MimeCandidate } from './core/exporter';
import { useI18n } from './i18n/context';
import type { Lang, MsgKey } from './i18n/messages';
// 非响应式翻译：用于不适合因语言切换而重跑的位置（如谱面渲染副作用）
import { setActiveLang, t as tActive } from './i18n/translate';
import './styles.css';

const SIZE_PRESETS: { labelKey: MsgKey; w: number; h: number }[] = [
  { labelKey: 'canvas.preset1080p', w: 1920, h: 1080 },
  { labelKey: 'canvas.preset720p', w: 1280, h: 720 },
  { labelKey: 'canvas.presetPortrait', w: 1080, h: 1920 },
  { labelKey: 'canvas.presetSquare', w: 1080, h: 1080 },
];

function fmtTime(t: number): string {
  if (!isFinite(t) || isNaN(t)) return '--:--';
  const sign = t < 0 ? '-' : '';
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = Math.floor(a % 60);
  const cs = Math.floor((a * 100) % 100);
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

interface ExportState {
  phase: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  resultSize: number;
  resultName: string;
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  // ---- 谱面状态 ----
  const [score, setScore] = useState<AT.model.Score | null>(null);
  const [trackInfos, setTrackInfos] = useState<TrackInfo[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number>(0);
  const [fileName, setFileName] = useState('');
  /** 当前谱面是否为内置示例曲：其文件名是合成的展示文案，需随语言实时变化 */
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ---- 演奏视频 ----
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoName, setVideoName] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [offsetMs, setOffsetMs] = useState(0);
  const [monitorMuted, setMonitorMuted] = useState(false);

  // ---- 画面参数 ----
  const [sizePreset, setSizePreset] = useState('1920x1080');
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [zoomPct, setZoomPct] = useState(100);
  const [anchorPct, setAnchorPct] = useState(49);
  const [vertPct, setVertPct] = useState(50);
  const [notationMode, setNotationMode] = useState<NotationMode>('jianpu');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [fgColor, setFgColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(100);
  const [bgOpacity, setBgOpacity] = useState(100);

  // ---- 导出参数 ----
  const [exportOpen, setExportOpen] = useState(false);
  const [fps, setFps] = useState(30);
  const [mimeIdx, setMimeIdx] = useState(0);
  const [burnVideo, setBurnVideo] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [rangeMode, setRangeMode] = useState<'full' | 'custom'>('full');
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [exportState, setExportState] = useState<ExportState>({
    phase: 'idle',
    progress: 0,
    message: '',
    resultSize: 0,
    resultName: '',
  });
  const cancelExportRef = useRef(false);

  // ---- 播放 ----
  const engineRef = useRef<Engine>(new Engine());
  const [playing, setPlaying] = useState(false);
  const [timeDisplay, setTimeDisplay] = useState(0);
  const scrubRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isCustom = sizePreset === 'custom';
  const W = isCustom
    ? Math.max(160, Math.round(customW / 2) * 2)
    : (SIZE_PRESETS.find((p) => `${p.w}x${p.h}` === sizePreset)?.w ?? 1920);
  const H = isCustom
    ? Math.max(160, Math.round(customH / 2) * 2)
    : (SIZE_PRESETS.find((p) => `${p.w}x${p.h}` === sizePreset)?.h ?? 1080);

  const mimes = useMemo(() => supportedMimeTypes(), []);
  const transparent = themeMode === 'transparent';
  const alphaMimes = useMemo(() => mimes.filter((m) => m.alpha), [mimes]);
  const opaqueMimes = useMemo(() => mimes.filter((m) => !m.alpha), [mimes]);
  /** 是否存在可见背景：白/黑主题固定有；透明主题取决于是否选了背景色 */
  const hasBg = themeMode !== 'transparent' || !!bgColor;
  /** 需要 Alpha 通道导出：无背景 / 半透明背景（且未烧录不透明视频） */
  const needsAlpha = !hasBg || (bgOpacity < 100 && !(hasVideo && burnVideo));

  // ---- 谱面条带（alphaTab 渲染） ----
  const [strip, setStrip] = useState<StripResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const stripRef = useRef<StripResult | null>(null);
  stripRef.current = strip;

  const duration = hasVideo ? videoDuration || 0 : strip?.playback.totalSec ?? 0;

  /** 谱面是否含反复 / 跳房子等记号（播放顺序不再是线性直读） */
  const hasRepeats = strip?.playback.hasRepeats ?? false;

  /** 展示用文件名：上传文件用真实文件名，内置示例曲随语言实时切换 */
  const displayFileName = isDemo ? t('demo.fileName') : fileName;

  // 每次渲染都刷新供 rAF 循环读取的快照
  const liveRef = useRef({
    W,
    H,
    themeMode,
    fgColor,
    bgColor,
    opacity,
    bgOpacity,
    anchorPct,
    vertPct,
    offsetMs,
    hasVideo,
    burnVideo,
  });
  liveRef.current = { W, H, themeMode, fgColor, bgColor, opacity, bgOpacity, anchorPct, vertPct, offsetMs, hasVideo, burnVideo };

  // 预览静音状态的即时镜像（供事件回调读取，避免闭包过期）
  const monitorMutedRef = useRef(false);
  monitorMutedRef.current = monitorMuted;

  // ---- 帧合成：背景 → 演奏视频 → 当前小节/拍高亮 → 谱面 → 播放头 ----
  // 滚动行为与 Guitar Pro 一致：播放头从左侧出发，走到锁定点后保持不动，谱面滚动。
  const composeFrame = useCallback((ctx: CanvasRenderingContext2D, masterTime: number, w: number, h: number) => {
    const L = liveRef.current;
    const st = stripRef.current;
    ctx.clearRect(0, 0, w, h);
    const theme = resolveTheme(L.themeMode, L.fgColor, L.bgColor);
    // 背景：100% 时铺满整帧；半透明时只作为谱面条带的衬底（叠在视频上）
    if (theme.bg && L.bgOpacity >= 100) {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const video = videoRef.current;
    if (L.hasVideo && L.burnVideo && video && video.readyState >= 2) {
      drawVideoCover(ctx, video, w, h);
    }
    if (!st) return;
    const fit = Math.min(3, Math.max(0.05, (h * 0.97) / Math.max(1, st.height)));
    // 谱面条带在画面中的位置与高度（衬底与播放头都与它同高，而不是全屏）
    const bandH = st.height * fit;
    const bandTop = (h - bandH) * (L.vertPct / 100);
    // 半透明背景：只覆盖谱面条带，叠加在视频之上作为衬底（导出为带 Alpha 的底）
    if (theme.bg && L.bgOpacity < 100) {
      ctx.globalAlpha = L.bgOpacity / 100;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, bandTop, w, bandH);
      ctx.globalAlpha = 1;
    }
    const tabTime = masterTime + (L.hasVideo ? L.offsetMs / 1000 : 0);
    const x = st.xOfTime(tabTime);
    const anchor = Math.min(x + 12, (w / fit) * (L.anchorPct / 100));
    const scrollLeft = x - anchor;
    const layerAlpha = L.opacity / 100;
    ctx.save();
    ctx.translate(0, bandTop);
    ctx.scale(fit, fit);
    ctx.translate(-scrollLeft, 0);
    ctx.globalAlpha = layerAlpha;
    // 当前小节 / 当前拍高亮（画在谱面下面）
    for (const r of st.barRanges) {
      if (x >= r.x && x < r.x + r.w) {
        ctx.fillStyle = theme.wash;
        ctx.fillRect(r.x, 0, r.w, st.height);
        break;
      }
    }
    for (const r of st.beatRanges) {
      if (x >= r.x && x < r.x + r.w) {
        ctx.fillStyle = theme.beatBand;
        ctx.fillRect(r.x, 0, r.w, st.height);
        break;
      }
    }
    // 谱面：只绘制可视区域内的渲染分片（分片自带逻辑坐标，无画布尺寸限制）
    const viewL = scrollLeft - 50;
    const viewR = scrollLeft + w / fit + 50;
    for (const p of st.partials) {
      if (p.x + p.width < viewL || p.x > viewR) continue;
      ctx.drawImage(p.canvas, p.x, p.y, p.width, p.height);
    }
    ctx.restore();
    // 播放头（屏幕坐标，与谱面条带同高，不随不透明度变化）
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(anchor * fit, bandTop + 2);
    ctx.lineTo(anchor * fit, bandTop + bandH - 2);
    ctx.stroke();
    ctx.restore();
  }, []);

  // ---- 预览渲染循环 ----
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const loop = () => {
      const eng = engineRef.current;
      const canvas = canvasRef.current;
      const L = liveRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (ctx) composeFrame(ctx, eng.getTime(), L.W, L.H);
      }
      if (L.hasVideo && videoRef.current?.ended && eng.isPlaying()) {
        eng.pause();
      }
      frame++;
      if (frame % 5 === 0) {
        setTimeDisplay(eng.getTime());
        if (scrubRef.current) scrubRef.current.value = String(eng.getTime());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [composeFrame]);

  // ---- 谱面条带渲染 ----
  const stripFg = themeMode === 'light' ? null : themeMode === 'dark' ? '#f2f4f7' : fgColor;
  // 钢琴大谱表 / 鼓轨固定五线谱
  const selInfo = trackInfos.find((t) => t.index === selectedTrack);
  const notationLocked = !!selInfo && (selInfo.isPerc || selInfo.grandStaff);
  const effectiveNotationMode: NotationMode = notationLocked ? 'standard' : notationMode;
  useEffect(() => {
    if (!score) {
      setStrip(null);
      return;
    }
    let cancelled = false;
    setRendering(true);
    renderStrip(score, { scale: zoomPct / 100, trackIndexes: [selectedTrack], notationMode: effectiveNotationMode, fg: stripFg })
      .then((r) => {
        if (!cancelled) setStrip(r);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            tActive('err.renderStrip') +
              (err instanceof Error ? err.message + ' | ' + String(err.stack || '').slice(0, 260) : String(err)),
          );
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [score, selectedTrack, zoomPct, effectiveNotationMode, stripFg]);

  // ---- 播放状态同步 ----
  useEffect(() => {
    const eng = engineRef.current;
    eng.onPlayingChange = (p) => setPlaying(p);
    return () => {
      eng.onPlayingChange = undefined;
    };
  }, []);

  // ---- 静音控制 ----
  useEffect(() => {
    if (videoRef.current) setVideoMuted(videoRef.current, monitorMuted);
  }, [monitorMuted, hasVideo]);

  // ---- 空格键播放/暂停 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- 载入 GP 文件 ----
  const applyScore = useCallback((sc: AT.model.Score, name: string, demo = false) => {
    const infos = getTrackInfos(sc);
    // 默认选中第一条有内容的非鼓轨（与 Guitar Pro 默认显示第 1 轨一致）
    const first =
      infos.find((t) => !t.isPerc && t.noteCount > 0) ?? infos.find((t) => !t.isPerc) ?? infos[0];
    setScore(sc);
    setTrackInfos(infos);
    setSelectedTrack(first?.index ?? 0);
    setFileName(name);
    setIsDemo(demo);
    setError('');
  }, []);

  const openGpFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError('');
      try {
        const sc = await loadGpFile(file);
        applyScore(sc, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [applyScore],
  );

  const loadDemo = useCallback(() => {
    const sc = loadDemoScore();
    // 示例曲没有真实文件名，展示名由 displayFileName 按当前语言派生
    applyScore(sc, '', true);
  }, [applyScore]);

  /**
   * 切换语言。内置示例曲的轨道名会被解析进谱面并绘制到画布上，必须按新语言重新生成；
   * 由于非 React 翻译器（core 与事件回调用的 t）读的是模块单例，这里先切单例再重建，
   * 否则示例曲会用旧语言生成。上传的谱面维持原样（其轨道名来自文件本身）。
   */
  const switchLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      setActiveLang(next);
      setLang(next);
      if (isDemo) applyScore(loadDemoScore(), '', true);
    },
    [applyScore, isDemo, lang, setLang],
  );

  // ---- 载入演奏视频 ----
  const openVideoFile = useCallback(
    (file: File) => {
      const video = videoRef.current;
      if (!video) return;
      if (video.src) URL.revokeObjectURL(video.src);
      video.preload = 'auto'; // 立即缓冲并解码首帧，导入后无需播放即可显示画面
      video.src = URL.createObjectURL(file);
      video.load();
      const onReady = () => {
        // 首帧解码完成即刷新预览（rAF 循环随后也会持续绘制）
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d', { alpha: true });
          if (ctx) composeFrame(ctx, engineRef.current.getTime(), liveRef.current.W, liveRef.current.H);
        }
      };
      video.addEventListener('loadeddata', onReady, { once: true });
      setVideoName(file.name);
      setHasVideo(true);
      setOffsetMs(0);
      engineRef.current.setVideo(video);
      engineRef.current.pause();
    },
    [composeFrame],
  );

  const removeVideo = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      if (video.src) URL.revokeObjectURL(video.src);
      video.removeAttribute('src');
    }
    engineRef.current.setVideo(null);
    engineRef.current.pause();
    setHasVideo(false);
    setVideoName('');
    setVideoDuration(0);
    setOffsetMs(0);
  }, []);

  const togglePlay = useCallback(async () => {
    const eng = engineRef.current;
    if (eng.isPlaying()) {
      eng.pause();
      return;
    }
    const video = videoRef.current;
    if (video) {
      // 建图时按当前静音状态初始化增益，避免"先静音后播放"时的一声漏音
      ensureAudioGraph(video, monitorMutedRef.current);
      setVideoMuted(video, monitorMutedRef.current);
    }
    await eng.play();
  }, []);

  const seekTo = useCallback((t: number) => {
    const eng = engineRef.current;
    if (eng.isPlaying()) eng.pause();
    eng.seek(t);
    setTimeDisplay(eng.getTime());
    if (scrubRef.current) scrubRef.current.value = String(eng.getTime());
  }, []);

  // ---- 拖放 ----
  const [dragOver, setDragOver] = useState(false);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (/\.(gp|gp3|gp4|gp5|gpx)$/i.test(file.name)) void openGpFile(file);
      else if (file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(file.name)) openVideoFile(file);
      else setError(t('err.unsupportedFile'));
    },
    [openGpFile, openVideoFile, t],
  );

  // ---- 导出 ----
  const openExport = useCallback(() => {
    setRangeStart(0);
    setRangeEnd(Number(duration.toFixed(2)));
    setRangeMode('full');
    setExportState({ phase: 'idle', progress: 0, message: '', resultSize: 0, resultName: '' });
    setExportOpen(true);
  }, [duration]);

  const chosenMime = useMemo(() => {
    if (needsAlpha) return alphaMimes[Math.min(mimeIdx, alphaMimes.length - 1)]?.mime ?? 'video/webm;codecs=vp8,opus';
    return opaqueMimes[Math.min(mimeIdx, Math.max(0, opaqueMimes.length - 1))]?.mime ?? 'video/webm;codecs=vp9,opus';
  }, [needsAlpha, alphaMimes, opaqueMimes, mimeIdx]);

  const startExport = useCallback(async () => {
    const eng = engineRef.current;
    eng.pause();
    cancelExportRef.current = false;
    const s = rangeMode === 'full' ? 0 : rangeStart;
    const e = rangeMode === 'full' ? duration : rangeEnd;
    const base = (displayFileName || 'tab').replace(/\.[^.]+$/, '');
    const ext = chosenMime.includes('mp4') ? 'mp4' : 'webm';
    const name = `${base}${t('export.fileSuffix')}${W}x${H}.${ext}`;
    setExportState({ phase: 'running', progress: 0, message: t('export.recordingMsg'), resultSize: 0, resultName: name });
    try {
      const blob = await exportVideo({
        width: W,
        height: H,
        fps,
        mimeType: chosenMime,
        drawFrame: (ctx, t) => composeFrame(ctx, t, W, H),
        video: hasVideo ? videoRef.current : null,
        includeVideoAudio: hasVideo && includeAudio,
        previewMuted: monitorMuted,
        rangeStart: s,
        rangeEnd: e,
        onProgress: (p) => {
          setExportState((prev) => (prev.phase === 'running' ? { ...prev, progress: p } : prev));
        },
        shouldCancel: () => cancelExportRef.current,
      });
      downloadBlob(blob, name);
      setExportState((prev) => ({ ...prev, phase: 'done', progress: 1, resultSize: blob.size }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'cancelled') {
        setExportState({ phase: 'idle', progress: 0, message: '', resultSize: 0, resultName: '' });
      } else {
        setExportState((prev) => ({ ...prev, phase: 'error', message: msg }));
      }
    }
  }, [chosenMime, composeFrame, displayFileName, duration, fps, H, hasVideo, includeAudio, monitorMuted, rangeEnd, rangeMode, rangeStart, t, W]);

  const hasScore = !!score;

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="logo">
          <span className="whale">
            <img src="./whalegirl-head.png" width={30} height={30} alt="TabFlow" />
          </span>
          TabFlow<span className="sub">{t('app.brandSub')}</span>
        </div>
        <span className="file-chip">
          {score
            ? t('app.fileChip', { name: displayFileName, tracks: score.tracks.length, bars: score.masterBars.length })
            : t('app.noScore')}
        </span>
        <div className="spacer" />
        <div className="seg lang-switch" role="group" aria-label={t('app.langAria')}>
          <button className={lang === 'zh' ? 'on' : ''} onClick={() => switchLang('zh')} aria-pressed={lang === 'zh'}>
            中文
          </button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => switchLang('en')} aria-pressed={lang === 'en'}>
            EN
          </button>
        </div>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          {t('app.openGp')}
          <input
            type="file"
            accept=".gp,.gp3,.gp4,.gp5,.gpx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openGpFile(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <button className="btn ghost" onClick={loadDemo}>{t('app.demo')}</button>
        <button className="btn primary" disabled={!hasScore || rendering} onClick={openExport}>{t('app.exportVideo')}</button>
        <a
          className="btn ghost icon-btn"
          href="https://github.com/Bezhuang/tabflow"
          target="_blank"
          rel="noreferrer"
          title={t('app.githubTitle')}
          aria-label={t('app.githubAria')}
        >
          <GithubIcon />
        </a>
      </header>

      {!hasScore ? (
        <div className="empty">
          <h1>{t('empty.title')}</h1>
          <p>
            {t('empty.desc1')}
            <br />
            {t('empty.desc2')}
          </p>
          <div className={`dropzone ${dragOver ? 'over' : ''}`} onClick={() => document.getElementById('gp-input')?.click()}>
            <div className="icon">
              <img src="./whalegirl.png" width={150} height={150} alt={t('img.mascot')} />
            </div>
            <div>{t('empty.dropTitle')}</div>
            <div className="fmts">{t('empty.dropFormats')}</div>
            <input
              id="gp-input"
              type="file"
              accept=".gp,.gp3,.gp4,.gp5,.gpx"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void openGpFile(f);
                e.currentTarget.value = '';
              }}
            />
          </div>
          <div className="empty-actions">
            <button className="btn" onClick={loadDemo}>{t('empty.tryDemo')}</button>
          </div>
          <div className="copyright">
            {t('app.copyrightPrefix')}
            <a href="https://github.com/Bezhuang/tabflow" target="_blank" rel="noreferrer">
              GitHub
            </a>
            {t('app.copyrightSuffix')}
          </div>
          {error && <div className="error-text">{error}</div>}
          {loading && <div className="hint">{t('empty.loading')}</div>}
        </div>
      ) : (
        <div className="main">
          <div className="stage">
            <div className={`canvas-frame ${needsAlpha ? 'transparent-bg' : ''}`}>
              <canvas ref={canvasRef} width={W} height={H} />
              {rendering && <div className="rendering-tip">{t('app.renderingTip')}</div>}
            </div>
            <div className="transport">
              <button className="play-btn" onClick={() => void togglePlay()} title={t('app.playTitle')} aria-label={t('app.playTitle')}>
                {playing ? '❚❚' : '▶'}
              </button>
              <span className="time">
                {fmtTime(timeDisplay)} / {fmtTime(duration)}
              </span>
              <input
                ref={scrubRef}
                className="scrubber"
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.01}
                defaultValue={0}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
              />
            </div>
            {hasRepeats && <div className="repeat-hint">{t('playback.hint')}</div>}
          </div>

          <aside className="sidebar">
            {/* 轨道 */}
            <div className="section">
              <h3>{t('track.heading')}</h3>
              <div className="card">
                <div className="tracks">
                  {trackInfos.map((tk) => (
                    <button
                      key={tk.index}
                      className={`track-chip ${selectedTrack === tk.index ? 'on' : ''}`}
                      onClick={() => setSelectedTrack(tk.index)}
                      title={t('track.tip', { name: tk.name, notes: tk.noteCount })}
                    >
                      {tk.name}
                    </button>
                  ))}
                </div>
                <div className="hint">{t('track.hint')}</div>
              </div>
            </div>

            {/* 演奏视频同步 */}
            <div className="section">
              <h3>{t('video.heading')}</h3>
              <div className="card">
                {hasVideo ? (
                  <>
                    <div className="row between">
                      <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🎬 {videoName}
                      </span>
                      <button className="btn small" onClick={removeVideo}>{t('video.remove')}</button>
                    </div>
                    <label className="field" style={{ marginTop: 10 }}>
                      {t('video.offsetLabel')}<span className="val">{offsetMs} ms</span>
                      <input
                        type="range"
                        min={-5000}
                        max={5000}
                        step={10}
                        value={offsetMs}
                        onChange={(e) => setOffsetMs(parseInt(e.target.value, 10))}
                      />
                    </label>
                    <div className="sync-row">
                      <button className="btn small nudge" onClick={() => setOffsetMs((v) => v - 50)}>−50</button>
                      <button className="btn small nudge" onClick={() => setOffsetMs((v) => v - 10)}>−10</button>
                      <button className="btn small nudge" onClick={() => setOffsetMs(0)}>{t('video.reset')}</button>
                      <button className="btn small nudge" onClick={() => setOffsetMs((v) => v + 10)}>+10</button>
                      <button className="btn small nudge" onClick={() => setOffsetMs((v) => v + 50)}>+50</button>
                    </div>
                    <div className="switch-row">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!monitorMuted}
                        className={`switch ${monitorMuted ? '' : 'on'}`}
                        onClick={() => setMonitorMuted((v) => !v)}
                        title={t('video.soundTitle')}
                      >
                        <span className="knob" />
                      </button>
                      <span className="switch-label">
                        {t('video.sound')}
                        <span className="switch-state">{monitorMuted ? t('video.muted') : t('video.unmuted')}</span>
                      </span>
                    </div>
                    <div className="hint">{t('video.syncHint')}</div>
                  </>
                ) : (
                  <>
                    <label className="btn" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                      {t('video.import')}
                      <input
                        type="file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) openVideoFile(f);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <div className="hint">{t('video.importHint')}</div>
                  </>
                )}
              </div>
            </div>

            {/* 画面 */}
            <div className="section">
              <h3>{t('canvas.heading')}</h3>
              <div className="card">
                <label className="field">
                  {t('canvas.outputSize')} <span className="val">{W}×{H}</span>
                  <select
                    value={sizePreset}
                    onChange={(e) => {
                      setSizePreset(e.target.value);
                      const p = SIZE_PRESETS.find((x) => `${x.w}x${x.h}` === e.target.value);
                      if (p) {
                        setCustomW(p.w);
                        setCustomH(p.h);
                      }
                    }}
                  >
                    {SIZE_PRESETS.map((p) => (
                      <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                        {t(p.labelKey)}（{p.w}×{p.h}）
                      </option>
                    ))}
                    <option value="custom">{t('canvas.custom')}</option>
                  </select>
                </label>
                {isCustom && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      type="number"
                      min={160}
                      max={3840}
                      value={customW}
                      onChange={(e) => setCustomW(parseInt(e.target.value || '0', 10))}
                      placeholder={t('canvas.width')}
                    />
                    <span style={{ color: 'var(--muted)' }}>×</span>
                    <input
                      type="number"
                      min={160}
                      max={3840}
                      value={customH}
                      onChange={(e) => setCustomH(parseInt(e.target.value || '0', 10))}
                      placeholder={t('canvas.height')}
                    />
                  </div>
                )}
                <label className="field" style={{ marginTop: 10 }}>
                  {t('canvas.zoom')} <span className="val">{zoomPct}%</span>
                  <input type="range" min={50} max={200} step={5} value={zoomPct} onChange={(e) => setZoomPct(parseInt(e.target.value, 10))} />
                </label>
                <label className="field">
                  {t('canvas.anchor')} <span className="val">{anchorPct}%</span>
                  <input type="range" min={20} max={80} step={1} value={anchorPct} onChange={(e) => setAnchorPct(parseInt(e.target.value, 10))} />
                </label>
                <label className="field">
                  {t('canvas.vert')}{' '}
                  <span className="val">
                    {vertPct === 50
                      ? t('canvas.vertCenter')
                      : vertPct < 50
                        ? t('canvas.vertUp', { n: 50 - vertPct })
                        : t('canvas.vertDown', { n: vertPct - 50 })}
                  </span>
                  <input type="range" min={0} max={100} step={5} value={vertPct} onChange={(e) => setVertPct(parseInt(e.target.value, 10))} />
                </label>
              </div>
            </div>

            {/* 样式 */}
            <div className="section">
              <h3>{t('style.heading')}</h3>
              <div className="card">
                <div className="seg">
                  <button className={!transparent && themeMode === 'light' ? 'on' : ''} onClick={() => setThemeMode('light')}>
                    {t('style.light')}
                  </button>
                  <button className={themeMode === 'dark' ? 'on' : ''} onClick={() => setThemeMode('dark')}>
                    {t('style.dark')}
                  </button>
                  <button className={transparent ? 'on' : ''} onClick={() => setThemeMode('transparent')}>
                    {t('style.transparent')}
                  </button>
                </div>
                {transparent && (
                  <>
                    <div className="row color-row" style={{ marginTop: 10 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t('style.fgColor')}</span>
                      <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} />
                      <button className="btn small" onClick={() => setFgColor('#ffffff')}>{t('style.white')}</button>
                      <button className="btn small" onClick={() => setFgColor('#17191d')}>{t('style.black')}</button>
                      <button className="btn small" onClick={() => setFgColor('#4d6bfe')}>{t('style.blue')}</button>
                      <button className="btn small" onClick={() => setFgColor('#ffb020')}>{t('style.yellow')}</button>
                    </div>
                    <div className="row color-row" style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t('style.bgColor')}</span>
                      <input type="color" value={bgColor ?? '#10131a'} onChange={(e) => setBgColor(e.target.value)} />
                      <button
                        className="btn small"
                        onClick={() => setBgColor(null)}
                        title={t('style.noBgTitle')}
                      >
                        {t('style.noBg')}
                      </button>
                    </div>
                    {bgColor && (
                      <label className="field" style={{ marginTop: 8 }}>
                        {t('style.bgOpacity')} <span className="val">{bgOpacity}%</span>
                        <input type="range" min={0} max={100} step={5} value={bgOpacity} onChange={(e) => setBgOpacity(parseInt(e.target.value, 10))} />
                      </label>
                    )}
                  </>
                )}
                {!transparent && (
                  <label className="field" style={{ marginTop: 10 }}>
                    {t('style.bgOpacityHinted')}<span className="val">{bgOpacity}%</span>
                    <input type="range" min={0} max={100} step={5} value={bgOpacity} onChange={(e) => setBgOpacity(parseInt(e.target.value, 10))} />
                  </label>
                )}
                <label className="field" style={{ marginTop: 10 }}>
                  {t('style.opacity')} <span className="val">{opacity}%</span>
                  <input type="range" min={20} max={100} step={5} value={opacity} onChange={(e) => setOpacity(parseInt(e.target.value, 10))} />
                </label>
                <label className="field" style={{ marginTop: 10 }}>
                  {t('style.notation')}
                  <div className="seg" style={{ marginTop: 6 }}>
                    <button
                      disabled={notationLocked}
                      className={effectiveNotationMode === 'jianpu' ? 'on' : ''}
                      onClick={() => setNotationMode('jianpu')}
                    >
                      {t('style.jianpu')}
                    </button>
                    <button
                      disabled={notationLocked}
                      className={effectiveNotationMode === 'standard' ? 'on' : ''}
                      onClick={() => setNotationMode('standard')}
                    >
                      {t('style.standard')}
                    </button>
                    <button
                      disabled={notationLocked}
                      className={effectiveNotationMode === 'tab' ? 'on' : ''}
                      onClick={() => setNotationMode('tab')}
                    >
                      {t('style.tab')}
                    </button>
                  </div>
                </label>
                {selInfo?.grandStaff && <div className="hint">{t('style.grandStaffHint')}</div>}
                {selInfo?.isPerc && <div className="hint">{t('style.percHint')}</div>}
                {needsAlpha && <div className="hint">{t('style.alphaHint')}</div>}
              </div>
            </div>

            {error && <div className="error-text">{error}</div>}

            <div className="copyright">
              {t('app.copyrightPrefix')}
              <a href="https://github.com/Bezhuang/tabflow" target="_blank" rel="noreferrer">
                GitHub
              </a>
              {t('app.copyrightSuffix')}
            </div>
          </aside>
        </div>
      )}
      {exportOpen && (
        <ExportModal
          state={exportState}
          W={W}
          H={H}
          fps={fps}
          setFps={setFps}
          mimes={needsAlpha ? alphaMimes : opaqueMimes}
          mimeIdx={mimeIdx}
          setMimeIdx={setMimeIdx}
          transparent={needsAlpha}
          hasVideo={hasVideo}
          burnVideo={burnVideo}
          setBurnVideo={setBurnVideo}
          includeAudio={includeAudio}
          setIncludeAudio={setIncludeAudio}
          rangeMode={rangeMode}
          setRangeMode={setRangeMode}
          rangeStart={rangeStart}
          setRangeStart={setRangeStart}
          rangeEnd={rangeEnd}
          setRangeEnd={setRangeEnd}
          duration={duration}
          canExport={hasScore && !rendering && exportState.phase !== 'running'}
          onClose={() => setExportOpen(false)}
          onStart={() => void startExport()}
          onCancel={() => {
            cancelExportRef.current = true;
          }}
        />
      )}

      {/* 隐藏的演奏视频元素（作为主时钟与画面源；离屏而非 display:none，确保首帧会被解码） */}
      <video
        ref={videoRef}
        preload="auto"
        playsInline
        style={{ position: 'fixed', left: -8, top: -8, width: 2, height: 2, opacity: 0, pointerEvents: 'none' }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (!isFinite(v.duration) || isNaN(v.duration)) {
            // 流式录制产生的 webm 时长未知：跳到远处让浏览器计算
            const onSeeked = () => {
              v.removeEventListener('seeked', onSeeked);
              setVideoDuration(isFinite(v.duration) ? v.duration || 0 : 0);
              v.currentTime = 0;
            };
            v.addEventListener('seeked', onSeeked);
            v.currentTime = 1e7;
          } else {
            setVideoDuration(v.duration || 0);
          }
        }}
      />
    </div>
  );
}

function drawVideoCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number): void {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/* ---------------- GitHub 图标 ---------------- */
function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/* ---------------- 导出弹窗 ---------------- */
interface ExportModalProps {
  state: ExportState;
  W: number;
  H: number;
  fps: number;
  setFps: (v: number) => void;
  mimes: MimeCandidate[];
  mimeIdx: number;
  setMimeIdx: (v: number) => void;
  transparent: boolean;
  hasVideo: boolean;
  burnVideo: boolean;
  setBurnVideo: (v: boolean) => void;
  includeAudio: boolean;
  setIncludeAudio: (v: boolean) => void;
  rangeMode: 'full' | 'custom';
  setRangeMode: (v: 'full' | 'custom') => void;
  rangeStart: number;
  setRangeStart: (v: number) => void;
  rangeEnd: number;
  setRangeEnd: (v: number) => void;
  duration: number;
  canExport: boolean;
  onClose: () => void;
  onStart: () => void;
  onCancel: () => void;
}

function ExportModal(p: ExportModalProps) {
  const { t } = useI18n();
  const running = p.state.phase === 'running';
  const span = p.rangeMode === 'full' ? p.duration : p.rangeEnd - p.rangeStart;
  const remain = Math.max(0, span * (1 - p.state.progress));
  return (
    <div className="modal-mask" onClick={running ? undefined : p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('export.modalTitle')}</h2>

        {p.state.phase === 'idle' && (
          <>
            <div className="card" style={{ background: 'var(--bg)' }}>
              <div className="row between">
                <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{t('export.outputSize')}</span>
                <span style={{ fontSize: 13 }}>
                  {p.W} × {p.H} · {p.fps}fps
                </span>
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                {t('export.fps')}
                <select value={p.fps} onChange={(e) => p.setFps(parseInt(e.target.value, 10))}>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </label>
              <label className="field" style={{ marginTop: 10 }}>
                {t('export.format')}
                <select value={p.mimeIdx} onChange={(e) => p.setMimeIdx(parseInt(e.target.value, 10))}>
                  {p.mimes.map((m, i) => (
                    <option key={m.mime} value={i}>
                      {m.labelKey ? t(m.labelKey) : m.label}
                    </option>
                  ))}
                </select>
              </label>
              {p.hasVideo && (
                <>
                  <label className="check-row" style={{ marginTop: 10 }}>
                    <input type="checkbox" checked={p.burnVideo} onChange={(e) => p.setBurnVideo(e.target.checked)} />
                    {t('export.burnVideo')}
                  </label>
                  <label className={`check-row ${p.burnVideo ? '' : 'disabled'}`}>
                    <input
                      type="checkbox"
                      disabled={!p.burnVideo}
                      checked={p.includeAudio}
                      onChange={(e) => p.setIncludeAudio(e.target.checked)}
                    />
                    {t('export.includeAudio')}
                  </label>
                </>
              )}
              <label className="field" style={{ marginTop: 10 }}>
                {t('export.range')}
                <div className="seg" style={{ marginTop: 6 }}>
                  <button className={p.rangeMode === 'full' ? 'on' : ''} onClick={() => p.setRangeMode('full')}>
                    {t('export.full')}
                  </button>
                  <button className={p.rangeMode === 'custom' ? 'on' : ''} onClick={() => p.setRangeMode('custom')}>
                    {t('export.custom')}
                  </button>
                </div>
              </label>
              {p.rangeMode === 'custom' && (
                <div className="row" style={{ marginTop: 8 }}>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    max={p.duration}
                    value={p.rangeStart}
                    onChange={(e) => p.setRangeStart(parseFloat(e.target.value || '0'))}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    max={p.duration}
                    value={p.rangeEnd}
                    onChange={(e) => p.setRangeEnd(parseFloat(e.target.value || '0'))}
                  />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('export.seconds')}</span>
                </div>
              )}
            </div>
            {p.transparent && (
              <div className="hint">{t('export.alphaHint')}</div>
            )}
            <div className="hint">{t('export.realtimeHint')}</div>
            <div className="actions">
              <button className="btn" onClick={p.onClose}>{t('export.cancel')}</button>
              <button className="btn primary" disabled={!p.canExport} onClick={p.onStart}>
                {t('export.start')}
              </button>
            </div>
          </>
        )}

        {running && (
          <>
            <div className="progress-sub">
              <span className="rec-dot" />
              {t('export.recording')}
            </div>
            <div className="progress">
              <div style={{ width: `${Math.round(p.state.progress * 100)}%` }} />
            </div>
            <div className="progress-num">{Math.round(p.state.progress * 100)}%</div>
            <div className="progress-sub">{t('export.remaining', { time: fmtTime(remain) })}</div>
            <div className="actions">
              <button className="btn" onClick={p.onCancel}>{t('export.cancelExport')}</button>
            </div>
          </>
        )}

        {p.state.phase === 'done' && (
          <div className="done-box">
            <div className="big">✅</div>
            <p>
              {t('export.doneText')}
              <br />
              <b>{p.state.resultName}</b>
              <br />
              {(p.state.resultSize / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={p.onClose}>{t('export.complete')}</button>
            </div>
          </div>
        )}

        {p.state.phase === 'error' && (
          <>
            <div className="error-text">{t('export.failed', { msg: p.state.message })}</div>
            <div className="actions">
              <button className="btn" onClick={p.onClose}>{t('export.close')}</button>
              <button className="btn primary" onClick={p.onStart}>{t('export.retry')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
