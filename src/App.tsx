import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as AT from '@coderline/alphatab';
import { getTrackInfos, loadDemoScore, loadGpFile, type TrackInfo } from './core/loader';
import { renderStrip, type StripResult } from './core/strip';
import { resolveTheme, type ThemeMode } from './core/themes';
import { Engine } from './core/engine';
import {
  downloadBlob,
  ensureAudioGraph,
  exportVideo,
  setVideoMuted,
  supportedMimeTypes,
} from './core/exporter';
import './styles.css';

const SIZE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1080P 横屏 16:9', w: 1920, h: 1080 },
  { label: '720P 横屏 16:9', w: 1280, h: 720 },
  { label: '竖屏 9:16（Shorts/Reels）', w: 1080, h: 1920 },
  { label: '方形 1:1', w: 1080, h: 1080 },
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
  // ---- 谱面状态 ----
  const [score, setScore] = useState<AT.model.Score | null>(null);
  const [trackInfos, setTrackInfos] = useState<TrackInfo[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number>(0);
  const [fileName, setFileName] = useState('');
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
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [fgColor, setFgColor] = useState('#ffffff');
  const [opacity, setOpacity] = useState(100);
  const [bgOpacity, setBgOpacity] = useState(100);
  const [showJianpu, setShowJianpu] = useState(true);

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
  /** 需要 Alpha 通道：透明主题，或半透明背景且未烧录不透明视频 */
  const needsAlpha = transparent || (bgOpacity < 100 && !(hasVideo && burnVideo));

  // ---- 谱面条带（alphaTab 渲染） ----
  const [strip, setStrip] = useState<StripResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const stripRef = useRef<StripResult | null>(null);
  stripRef.current = strip;

  const duration = hasVideo ? videoDuration || 0 : strip?.tempoMap.totalSec ?? 0;

  // 每次渲染都刷新供 rAF 循环读取的快照
  const liveRef = useRef({
    W,
    H,
    themeMode,
    fgColor,
    opacity,
    bgOpacity,
    anchorPct,
    vertPct,
    offsetMs,
    hasVideo,
    burnVideo,
  });
  liveRef.current = { W, H, themeMode, fgColor, opacity, bgOpacity, anchorPct, vertPct, offsetMs, hasVideo, burnVideo };

  // 预览静音状态的即时镜像（供事件回调读取，避免闭包过期）
  const monitorMutedRef = useRef(false);
  monitorMutedRef.current = monitorMuted;

  // ---- 帧合成：背景 → 演奏视频 → 当前小节/拍高亮 → 谱面 → 播放头 ----
  // 滚动行为与 Guitar Pro 一致：播放头从左侧出发，走到锁定点后保持不动，谱面滚动。
  const composeFrame = useCallback((ctx: CanvasRenderingContext2D, masterTime: number, w: number, h: number) => {
    const L = liveRef.current;
    const st = stripRef.current;
    ctx.clearRect(0, 0, w, h);
    const theme = resolveTheme(L.themeMode, L.fgColor);
    // 不透明背景：作为画布底色（有视频时会被视频覆盖，保持原有行为）
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
  useEffect(() => {
    if (!score) {
      setStrip(null);
      return;
    }
    let cancelled = false;
    setRendering(true);
    renderStrip(score, { scale: zoomPct / 100, trackIndexes: [selectedTrack], jianpu: showJianpu, fg: stripFg })
      .then((r) => {
        if (!cancelled) setStrip(r);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            '谱面渲染失败：' +
              (err instanceof Error ? err.message + ' | ' + String(err.stack || '').slice(0, 260) : String(err)),
          );
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [score, selectedTrack, zoomPct, showJianpu, stripFg]);

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
  const applyScore = useCallback((sc: AT.model.Score, name: string) => {
    const infos = getTrackInfos(sc);
    // 默认选中第一条有内容的非鼓轨（与 Guitar Pro 默认显示第 1 轨一致）
    const first =
      infos.find((t) => !t.isPerc && t.noteCount > 0) ?? infos.find((t) => !t.isPerc) ?? infos[0];
    setScore(sc);
    setTrackInfos(infos);
    setSelectedTrack(first?.index ?? 0);
    setFileName(name);
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
    applyScore(sc, '示例曲（内置）');
  }, [applyScore]);

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
      else setError('不支持的文件类型：请拖入 Guitar Pro 文件（.gp/.gp3/.gp4/.gp5/.gpx）或视频文件');
    },
    [openGpFile, openVideoFile],
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
    const base = (fileName || 'tab').replace(/\.[^.]+$/, '');
    const ext = chosenMime.includes('mp4') ? 'mp4' : 'webm';
    const name = `${base}-滚动谱-${W}x${H}.${ext}`;
    setExportState({ phase: 'running', progress: 0, message: '正在实时录制…', resultSize: 0, resultName: name });
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
  }, [chosenMime, composeFrame, duration, fileName, fps, H, hasVideo, includeAudio, monitorMuted, rangeEnd, rangeMode, rangeStart, W]);

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
            <WhaleMascot size={26} bow />
          </span>
          TabFlow<span className="sub">Guitar Pro → 滚动动态谱视频</span>
        </div>
        <span className="file-chip">
          {score ? `${fileName} · ${score.tracks.length} 轨道 · ${score.masterBars.length} 小节` : '未打开谱面'}
        </span>
        <div className="spacer" />
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          打开 GP 文件
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
        <button className="btn ghost" onClick={loadDemo}>示例曲</button>
        <button className="btn primary" disabled={!hasScore || rendering} onClick={openExport}>导出视频</button>
      </header>

      {!hasScore ? (
        <div className="empty">
          <h1>把 Guitar Pro 乐谱变成滚动的动态谱视频</h1>
          <p>
            上传 .gp / .gp3 / .gp4 / .gp5 / .gpx 文件，生成一行横向滚动的动态谱；
            <br />
            可导入你的演奏视频对齐同步，导出白色或透明背景的视频，直接叠加到剪辑软件里。
          </p>
          <div className={`dropzone ${dragOver ? 'over' : ''}`} onClick={() => document.getElementById('gp-input')?.click()}>
            <div className="icon">
              <WhaleMascot size={84} bow sparkles />
            </div>
            <div>点击选择或拖入 Guitar Pro 文件</div>
            <div className="fmts">支持 .gp .gp3 .gp4 .gp5 .gpx（Guitar Pro 3 – 8）· 也可以拖入演奏视频用于同步</div>
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
            <button className="btn" onClick={loadDemo}>先看看示例曲</button>
          </div>
          {error && <div className="error-text">{error}</div>}
          {loading && <div className="hint">解析中…</div>}
        </div>
      ) : (
        <div className="main">
          <div className="stage">
            <div className={`canvas-frame ${needsAlpha ? 'transparent-bg' : ''}`}>
              <canvas ref={canvasRef} width={W} height={H} />
              {rendering && <div className="rendering-tip">谱面渲染中…</div>}
            </div>
            <div className="transport">
              <button className="play-btn" onClick={() => void togglePlay()} title="空格键 播放/暂停">
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
          </div>

          <aside className="sidebar">
            {/* 轨道 */}
            <div className="section">
              <h3>音轨</h3>
              <div className="card">
                <div className="tracks">
                  {trackInfos.map((t) => (
                    <button
                      key={t.index}
                      className={`track-chip ${selectedTrack === t.index ? 'on' : ''}`}
                      onClick={() => setSelectedTrack(t.index)}
                      title={`${t.name} · ${t.noteCount} 个音符`}
                    >
                      {t.name}
                      {t.isPerc && <span className="badge">鼓</span>}
                    </button>
                  ))}
                </div>
                <div className="hint">选择要显示的音轨（叠加到演奏视频通常只选主奏轨）。</div>
              </div>
            </div>

            {/* 演奏视频同步 */}
            <div className="section">
              <h3>演奏视频同步</h3>
              <div className="card">
                {hasVideo ? (
                  <>
                    <div className="row between">
                      <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🎬 {videoName}
                      </span>
                      <button className="btn small" onClick={removeVideo}>移除</button>
                    </div>
                    <label className="field" style={{ marginTop: 10 }}>
                      谱面偏移（早 + / 晚 −）<span className="val">{offsetMs} ms</span>
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
                      <button className="btn small nudge" onClick={() => setOffsetMs(0)}>归零</button>
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
                        title="预览时播放视频声音"
                      >
                        <span className="knob" />
                      </button>
                      <span className="switch-label">
                        视频声音
                        <span className="switch-state">{monitorMuted ? '预览静音' : '预览有声'}</span>
                      </span>
                    </div>
                    <div className="hint">
                      播放时以视频为主时钟：视频走到哪，谱面滚到哪。调整偏移让音符对上你的演奏，导出的视频保持这个同步关系。
                    </div>
                  </>
                ) : (
                  <>
                    <label className="btn" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                      导入演奏视频（可选）
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
                    <div className="hint">
                      导入后：谱面跟随视频时间轴滚动，可微调偏移实现逐帧对齐；导出时可烧录画面与声音，或只导出透明背景的谱面图层。
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 画面 */}
            <div className="section">
              <h3>画面尺寸与缩放</h3>
              <div className="card">
                <label className="field">
                  输出尺寸 <span className="val">{W}×{H}</span>
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
                        {p.label}（{p.w}×{p.h}）
                      </option>
                    ))}
                    <option value="custom">自定义…</option>
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
                      placeholder="宽"
                    />
                    <span style={{ color: 'var(--muted)' }}>×</span>
                    <input
                      type="number"
                      min={160}
                      max={3840}
                      value={customH}
                      onChange={(e) => setCustomH(parseInt(e.target.value || '0', 10))}
                      placeholder="高"
                    />
                  </div>
                )}
                <label className="field" style={{ marginTop: 10 }}>
                  谱面缩放 <span className="val">{zoomPct}%</span>
                  <input type="range" min={50} max={200} step={5} value={zoomPct} onChange={(e) => setZoomPct(parseInt(e.target.value, 10))} />
                </label>
                <label className="field">
                  播放头锁定位置 <span className="val">{anchorPct}%</span>
                  <input type="range" min={20} max={80} step={1} value={anchorPct} onChange={(e) => setAnchorPct(parseInt(e.target.value, 10))} />
                </label>
                <label className="field">
                  垂直位置 <span className="val">{vertPct === 50 ? '居中' : vertPct < 50 ? `偏上 ${50 - vertPct}` : `偏下 ${vertPct - 50}`}</span>
                  <input type="range" min={0} max={100} step={5} value={vertPct} onChange={(e) => setVertPct(parseInt(e.target.value, 10))} />
                </label>
              </div>
            </div>

            {/* 样式 */}
            <div className="section">
              <h3>样式</h3>
              <div className="card">
                <div className="seg">
                  <button className={!transparent && themeMode === 'light' ? 'on' : ''} onClick={() => setThemeMode('light')}>
                    白底黑谱
                  </button>
                  <button className={themeMode === 'dark' ? 'on' : ''} onClick={() => setThemeMode('dark')}>
                    黑底白谱
                  </button>
                  <button className={transparent ? 'on' : ''} onClick={() => setThemeMode('transparent')}>
                    透明背景
                  </button>
                </div>
                {transparent && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>谱面颜色</span>
                    <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} />
                    <button className="btn small" onClick={() => setFgColor('#ffffff')}>白</button>
                    <button className="btn small" onClick={() => setFgColor('#17191d')}>黑</button>
                  </div>
                )}
                {!transparent && (
                  <label className="field" style={{ marginTop: 10 }}>
                    背景不透明度（叠加演奏视频时降低）<span className="val">{bgOpacity}%</span>
                    <input type="range" min={0} max={100} step={5} value={bgOpacity} onChange={(e) => setBgOpacity(parseInt(e.target.value, 10))} />
                  </label>
                )}
                <label className="field" style={{ marginTop: 10 }}>
                  谱面不透明度 <span className="val">{opacity}%</span>
                  <input type="range" min={20} max={100} step={5} value={opacity} onChange={(e) => setOpacity(parseInt(e.target.value, 10))} />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={showJianpu} onChange={(e) => setShowJianpu(e.target.checked)} />
                  简谱行（否则显示五线谱）
                </label>
                {needsAlpha && <div className="hint">透明 / 半透明背景导出为带 Alpha 通道的 WebM（VP8），需使用 Chrome / Edge 浏览器。</div>}
              </div>
            </div>

            {error && <div className="error-text">{error}</div>}
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

/* ---------------- 鲸鱼娘吉祥物 ---------------- */
function WhaleMascot({
  size = 24,
  bow = false,
  sparkles = false,
}: {
  size?: number;
  bow?: boolean;
  sparkles?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {sparkles && (
        <g fill="#9db8ff">
          <path d="M11 6l1.5 3.2L15.8 11l-3.3 1.8L11 16l-1.5-3.2L6.2 11l3.3-1.8z" opacity=".9" />
          <path d="M53 4l1.2 2.6 2.6 1.2-2.6 1.2L53 11.6l-1.2-2.6-2.6-1.2 2.6-1.2z" opacity=".65" />
        </g>
      )}
      {/* 尾鳍 */}
      <path d="M52 30.5l9.5-6.5-2.2 8z" fill="#3f5cf0" />
      <path d="M52 41.5l9.5 6.5-2.2-8z" fill="#3f5cf0" />
      {/* 身体 */}
      <path d="M6 36c0-13 11-22 25-22 12 0 21 6 24 14 1 3 1 6 0 9-3 8-12 14-24 14C17 51 6 47 6 36z" fill="#4d6bfe" />
      {/* 肚皮 */}
      <path d="M12 43c4 5 11 8 19 8 9 0 16-3 20-8-5 2-12 3.5-20 3.5S17 45 12 43z" fill="#fff" opacity=".92" />
      {/* 眼睛 */}
      <circle cx="23" cy="32" r="3" fill="#1b2438" />
      <circle cx="24.2" cy="31" r="1" fill="#fff" />
      {/* 腮红 */}
      <ellipse cx="16.5" cy="38.5" rx="3.2" ry="2" fill="#ffc2d1" opacity=".85" />
      {/* 微笑 */}
      <path d="M26.5 39.5c1.6 1.8 4.4 1.8 6 0" stroke="#1b2438" strokeWidth="1.6" strokeLinecap="round" />
      {/* 喷水 */}
      <path d="M29 9c0-2.6 2.4-3.4 3.4-1.6M33.6 7.4c.6-2.4 3.4-2.6 3.8-.4" stroke="#9db8ff" strokeWidth="2.2" strokeLinecap="round" />
      {/* 蝴蝶结 */}
      {bow && (
        <g transform="translate(42 15)">
          <path d="M0 0l-6.5-3.6v7.2L0 0z" fill="#7aa2ff" />
          <path d="M0 0l6.5-3.6v7.2L0 0z" fill="#7aa2ff" />
          <circle cx="0" cy="0" r="1.9" fill="#3f5cf0" />
        </g>
      )}
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
  mimes: { mime: string; label: string }[];
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
  const running = p.state.phase === 'running';
  const span = p.rangeMode === 'full' ? p.duration : p.rangeEnd - p.rangeStart;
  const remain = Math.max(0, span * (1 - p.state.progress));
  return (
    <div className="modal-mask" onClick={running ? undefined : p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>导出视频</h2>

        {p.state.phase === 'idle' && (
          <>
            <div className="card" style={{ background: 'var(--bg)' }}>
              <div className="row between">
                <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>输出尺寸</span>
                <span style={{ fontSize: 13 }}>
                  {p.W} × {p.H} · {p.fps}fps
                </span>
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                帧率
                <select value={p.fps} onChange={(e) => p.setFps(parseInt(e.target.value, 10))}>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </label>
              <label className="field" style={{ marginTop: 10 }}>
                格式
                <select value={p.mimeIdx} onChange={(e) => p.setMimeIdx(parseInt(e.target.value, 10))}>
                  {p.mimes.map((m, i) => (
                    <option key={m.mime} value={i}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {p.hasVideo && (
                <>
                  <label className="check-row" style={{ marginTop: 10 }}>
                    <input type="checkbox" checked={p.burnVideo} onChange={(e) => p.setBurnVideo(e.target.checked)} />
                    导出时烧录演奏视频画面
                  </label>
                  <label className={`check-row ${p.burnVideo ? '' : 'disabled'}`}>
                    <input
                      type="checkbox"
                      disabled={!p.burnVideo}
                      checked={p.includeAudio}
                      onChange={(e) => p.setIncludeAudio(e.target.checked)}
                    />
                    包含视频声音
                  </label>
                </>
              )}
              <label className="field" style={{ marginTop: 10 }}>
                导出范围
                <div className="seg" style={{ marginTop: 6 }}>
                  <button className={p.rangeMode === 'full' ? 'on' : ''} onClick={() => p.setRangeMode('full')}>
                    整曲
                  </button>
                  <button className={p.rangeMode === 'custom' ? 'on' : ''} onClick={() => p.setRangeMode('custom')}>
                    自定义
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
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>秒</span>
                </div>
              )}
            </div>
            {p.transparent && (
              <div className="hint">透明 / 半透明背景将以带 Alpha 通道的 WebM 导出，Premiere / Final Cut / DaVinci / 剪映均可直接叠加。</div>
            )}
            <div className="hint">导出为实时录制：时长与选区等长，请保持页面在前台。</div>
            <div className="actions">
              <button className="btn" onClick={p.onClose}>取消</button>
              <button className="btn primary" disabled={!p.canExport} onClick={p.onStart}>
                开始导出
              </button>
            </div>
          </>
        )}

        {running && (
          <>
            <div className="progress-sub">
              <span className="rec-dot" />
              正在实时录制，请勿切换标签页…
            </div>
            <div className="progress">
              <div style={{ width: `${Math.round(p.state.progress * 100)}%` }} />
            </div>
            <div className="progress-num">{Math.round(p.state.progress * 100)}%</div>
            <div className="progress-sub">预计剩余 {fmtTime(remain)}</div>
            <div className="actions">
              <button className="btn" onClick={p.onCancel}>取消导出</button>
            </div>
          </>
        )}

        {p.state.phase === 'done' && (
          <div className="done-box">
            <div className="big">✅</div>
            <p>
              已导出并开始下载
              <br />
              <b>{p.state.resultName}</b>
              <br />
              {(p.state.resultSize / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={p.onClose}>完成</button>
            </div>
          </div>
        )}

        {p.state.phase === 'error' && (
          <>
            <div className="error-text">导出失败：{p.state.message}</div>
            <div className="actions">
              <button className="btn" onClick={p.onClose}>关闭</button>
              <button className="btn primary" onClick={p.onStart}>重试</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
