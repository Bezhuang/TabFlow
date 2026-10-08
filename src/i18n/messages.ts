// 多语言文案表：zh 为源语言（键的权威定义），en 必须与之逐键对齐。
// 纯数据模块，不依赖 React，供 src/core/* 与 UI 层共用。

export type Lang = 'zh' | 'en';

export const zh = {
  // ---- 品牌与顶栏 ----
  'app.brandSub': 'Guitar Pro → 滚动动态谱视频',
  'app.langAria': '切换语言',
  'app.noScore': '未打开谱面',
  'app.fileChip': '{name} · {tracks} 轨道 · {bars} 小节',
  'app.openGp': '打开 GP 文件',
  'app.demo': '示例曲',
  'app.exportVideo': '导出视频',
  'app.githubTitle': 'GitHub 开源仓库（MPL-2.0）',
  'app.githubAria': 'GitHub 开源仓库',
  'app.playTitle': '空格键 播放/暂停',
  'app.renderingTip': '谱面渲染中…',
  'app.copyrightPrefix': '© 2026 Bezhuang · ',
  'app.copyrightSuffix': ' · MPL-2.0 开源',

  // ---- 空状态 ----
  'empty.title': '把 Guitar Pro 乐谱变成滚动的动态谱视频',
  'empty.desc1': '上传 .gp / .gp3 / .gp4 / .gp5 / .gpx 文件，生成一行横向滚动的动态谱；',
  'empty.desc2': '可导入你的演奏视频对齐同步，导出白色或透明背景的视频，直接叠加到剪辑软件里。',
  'empty.dropTitle': '点击选择或拖入 Guitar Pro 文件',
  'empty.dropFormats': '支持 .gp .gp3 .gp4 .gp5 .gpx（Guitar Pro 3 – 8）· 也可以拖入演奏视频用于同步',
  'empty.tryDemo': '先看看示例曲',
  'empty.loading': '解析中…',

  // ---- 音轨 ----
  'track.heading': '音轨',
  'track.percBadge': '鼓',
  'track.tip': '{name} · {notes} 个音符',
  'track.hint': '选择要显示的音轨（叠加到演奏视频通常只选主奏轨）。',

  // ---- 演奏视频同步 ----
  'video.heading': '演奏视频同步',
  'video.remove': '移除',
  'video.offsetLabel': '谱面偏移（早 + / 晚 −）',
  'video.reset': '归零',
  'video.sound': '视频声音',
  'video.muted': '预览静音',
  'video.unmuted': '预览有声',
  'video.soundTitle': '预览时播放视频声音',
  'video.syncHint':
    '播放时以视频为主时钟：视频走到哪，谱面滚到哪。调整偏移让音符对上你的演奏，导出的视频保持这个同步关系。',
  'video.import': '导入演奏视频（可选）',
  'video.importHint':
    '导入后：谱面跟随视频时间轴滚动，可微调偏移实现逐帧对齐；导出时可烧录画面与声音，或只导出透明背景的谱面图层。',

  // ---- 画面尺寸与缩放 ----
  'canvas.heading': '画面尺寸与缩放',
  'canvas.outputSize': '输出尺寸',
  'canvas.custom': '自定义…',
  'canvas.width': '宽',
  'canvas.height': '高',
  'canvas.zoom': '谱面缩放',
  'canvas.anchor': '播放头锁定位置',
  'canvas.vert': '垂直位置',
  'canvas.vertCenter': '居中',
  'canvas.vertUp': '偏上 {n}',
  'canvas.vertDown': '偏下 {n}',
  'canvas.preset1080p': '1080P 横屏 16:9',
  'canvas.preset720p': '720P 横屏 16:9',
  'canvas.presetPortrait': '竖屏 9:16（Shorts/Reels）',
  'canvas.presetSquare': '方形 1:1',

  // ---- 样式 ----
  'style.heading': '样式',
  'style.light': '白底黑谱',
  'style.dark': '黑底白谱',
  'style.transparent': '透明背景',
  'style.fgColor': '谱面颜色',
  'style.white': '白',
  'style.black': '黑',
  'style.blue': '蓝',
  'style.yellow': '黄',
  'style.bgColor': '背景颜色',
  'style.noBg': '无背景',
  'style.noBgTitle': '无背景：导出完全透明的视频',
  'style.bgOpacity': '背景不透明度',
  'style.bgOpacityHinted': '背景不透明度（叠加演奏视频时降低）',
  'style.opacity': '谱面不透明度',
  'style.notation': '记谱方式',
  'style.jianpu': '简谱',
  'style.standard': '五线谱',
  'style.tab': '六线谱',
  'style.grandStaffHint': '钢琴为左右手大谱表（高音谱 + 低音谱），固定五线谱记谱。',
  'style.percHint': '架子鼓使用标准鼓谱记谱（五线谱 + 鼓件符头）。',
  'style.alphaHint':
    '透明 / 半透明背景导出为带 Alpha 通道的 WebM（VP8），需使用 Chrome / Edge 浏览器。',

  // ---- 导出 ----
  'export.modalTitle': '导出视频',
  'export.outputSize': '输出尺寸',
  'export.fps': '帧率',
  'export.format': '格式',
  'export.burnVideo': '导出时烧录演奏视频画面',
  'export.includeAudio': '包含视频声音',
  'export.range': '导出范围',
  'export.full': '整曲',
  'export.custom': '自定义',
  'export.seconds': '秒',
  'export.alphaHint':
    '透明 / 半透明背景将以带 Alpha 通道的 WebM 导出，Premiere / Final Cut / DaVinci / 剪映均可直接叠加。',
  'export.realtimeHint': '导出为实时录制：时长与选区等长，请保持页面在前台。',
  'export.cancel': '取消',
  'export.start': '开始导出',
  'export.recording': '正在实时录制，请勿切换标签页…',
  'export.remaining': '预计剩余 {time}',
  'export.cancelExport': '取消导出',
  'export.doneText': '已导出并开始下载',
  'export.complete': '完成',
  'export.failed': '导出失败：{msg}',
  'export.close': '关闭',
  'export.retry': '重试',
  'export.recordingMsg': '正在实时录制…',
  'export.fileSuffix': '-滚动谱-',

  // ---- 导出编码格式（core/exporter 的 mime 标签） ----
  'mime.vp9': 'WebM · VP9（画质优先）',
  'mime.vp8': 'WebM · VP8（支持透明通道）',
  'mime.mp4': 'MP4 · H.264',
  'mime.webmDefault': 'WebM（默认）',

  // ---- 错误 ----
  'err.renderStrip': '谱面渲染失败：',
  'err.unsupportedFile':
    '不支持的文件类型：请拖入 Guitar Pro 文件（.gp/.gp3/.gp4/.gp5/.gpx）或视频文件',
  'err.parseGp': '无法解析该文件，请确认是 Guitar Pro 格式（.gp3 / .gp4 / .gp5 / .gpx / .gp）',
  'err.canvasContext': '无法创建画布上下文',
  'err.audioCapture': '音频采集不可用，仅录制画面',
  'err.mimeUnsupported': '当前浏览器不支持该录制格式: {err}',
  'err.recordFailed': '录制过程中出现错误',
  'err.renderBounds': '渲染 bounds 缺失',
  'err.renderEmpty': '谱面渲染结果为空（分片 0）',

  // ---- 图片替代文本 ----
  'img.mascot': '鲸鱼娘',

  // ---- 内置示例曲（写入谱面内容） ----
  'demo.title': '示例曲 · Am 五声音阶练习',
  'demo.artist': 'TabFlow Demo',
  'demo.fileName': '示例曲（内置）',
  'demo.trackGuitar': '吉他',
  'demo.trackBass': '贝斯',
  'demo.trackPiano': '钢琴',
  'demo.trackDrums': '架子鼓',

  // ---- 页面标题与 SEO meta ----
  'meta.title': 'TabFlow · 动态吉他谱视频生成器',
  'meta.desc':
    '把 Guitar Pro 乐谱转换为一行滚动的动态谱视频，可与演奏视频同步，支持白色/透明背景导出。',
  'meta.ogTitle': 'TabFlow · 把 Guitar Pro 乐谱变成滚动动态谱视频',
  'meta.ogDesc':
    '上传 Guitar Pro 文件生成横向滚动的动态谱视频，可与演奏视频同步，导出白色或透明背景，直接叠加到剪辑软件。纯前端、免安装、免费开源。',
  'meta.twitterDesc': 'Guitar Pro 乐谱 → 横向滚动动态谱视频，可与演奏视频同步，支持透明背景导出。',
};

export type MsgKey = keyof typeof zh;

export const en: Record<MsgKey, string> = {
  // ---- 品牌与顶栏 ----
  'app.brandSub': 'Guitar Pro → scrolling tab video',
  'app.langAria': 'Switch language',
  'app.noScore': 'No score loaded',
  'app.fileChip': '{name} · {tracks} tracks · {bars} bars',
  'app.openGp': 'Open GP file',
  'app.demo': 'Demo',
  'app.exportVideo': 'Export video',
  'app.githubTitle': 'GitHub repository (MPL-2.0)',
  'app.githubAria': 'GitHub repository',
  'app.playTitle': 'Space to play/pause',
  'app.renderingTip': 'Rendering the tab…',
  'app.copyrightPrefix': '© 2026 Bezhuang · ',
  'app.copyrightSuffix': ' · MPL-2.0 licensed',

  // ---- 空状态 ----
  'empty.title': 'Turn Guitar Pro scores into scrolling tab videos',
  'empty.desc1':
    'Upload a .gp / .gp3 / .gp4 / .gp5 / .gpx file to generate a single-line, horizontally scrolling tab;',
  'empty.desc2':
    'import your performance video to sync it, then export with a white or transparent background and drop it straight into your editor.',
  'empty.dropTitle': 'Click to choose or drop a Guitar Pro file',
  'empty.dropFormats':
    'Supports .gp .gp3 .gp4 .gp5 .gpx (Guitar Pro 3 – 8) · you can also drop a performance video to sync',
  'empty.tryDemo': 'Try the demo song',
  'empty.loading': 'Parsing…',

  // ---- 音轨 ----
  'track.heading': 'Tracks',
  'track.percBadge': '🥁',
  'track.tip': '{name} · {notes} notes',
  'track.hint':
    'Choose which track to display (when overlaying on your video, the lead track is usually enough).',

  // ---- 演奏视频同步 ----
  'video.heading': 'Performance video sync',
  'video.remove': 'Remove',
  'video.offsetLabel': 'Tab offset (early + / late −)',
  'video.reset': 'Reset',
  'video.sound': 'Video sound',
  'video.muted': 'Preview muted',
  'video.unmuted': 'Preview unmuted',
  'video.soundTitle': 'Play video audio while previewing',
  'video.syncHint':
    'The video is the master clock while playing: the tab scrolls wherever the video goes. Adjust the offset to line the notes up with your playing — the exported video keeps this sync.',
  'video.import': 'Import performance video (optional)',
  'video.importHint':
    'Once imported, the tab follows the video timeline; fine-tune the offset for frame-accurate alignment. On export you can burn in the picture and audio, or export just the transparent tab layer.',

  // ---- 画面尺寸与缩放 ----
  'canvas.heading': 'Frame size & zoom',
  'canvas.outputSize': 'Output size',
  'canvas.custom': 'Custom…',
  'canvas.width': 'W',
  'canvas.height': 'H',
  'canvas.zoom': 'Tab zoom',
  'canvas.anchor': 'Playhead lock position',
  'canvas.vert': 'Vertical position',
  'canvas.vertCenter': 'Centered',
  'canvas.vertUp': 'Up {n}',
  'canvas.vertDown': 'Down {n}',
  'canvas.preset1080p': '1080p landscape 16:9',
  'canvas.preset720p': '720p landscape 16:9',
  'canvas.presetPortrait': 'Portrait 9:16 (Shorts/Reels)',
  'canvas.presetSquare': 'Square 1:1',

  // ---- 样式 ----
  'style.heading': 'Style',
  'style.light': 'Light',
  'style.dark': 'Dark',
  'style.transparent': 'Transparent',
  'style.fgColor': 'Tab color',
  'style.white': 'White',
  'style.black': 'Black',
  'style.blue': 'Blue',
  'style.yellow': 'Yellow',
  'style.bgColor': 'Background color',
  'style.noBg': 'No background',
  'style.noBgTitle': 'No background: export a fully transparent video',
  'style.bgOpacity': 'Background opacity',
  'style.bgOpacityHinted': 'Background opacity (lower it when overlaying on video)',
  'style.opacity': 'Tab opacity',
  'style.notation': 'Notation',
  'style.jianpu': 'Numbered',
  'style.standard': 'Staff',
  'style.tab': 'Tablature',
  'style.grandStaffHint':
    'Piano uses a grand staff (treble + bass) and is fixed to standard notation.',
  'style.percHint': 'Drums use standard drum notation (staff with drum noteheads).',
  'style.alphaHint':
    'Transparent / semi-transparent backgrounds export as WebM (VP8) with an alpha channel — Chrome or Edge required.',

  // ---- 导出 ----
  'export.modalTitle': 'Export video',
  'export.outputSize': 'Output size',
  'export.fps': 'Frame rate',
  'export.format': 'Format',
  'export.burnVideo': 'Burn in the performance video',
  'export.includeAudio': 'Include video audio',
  'export.range': 'Export range',
  'export.full': 'Full song',
  'export.custom': 'Custom',
  'export.seconds': 'sec',
  'export.alphaHint':
    'Transparent / semi-transparent backgrounds export as WebM with an alpha channel, ready to overlay in Premiere / Final Cut / DaVinci / CapCut.',
  'export.realtimeHint':
    'Export records in real time: it takes as long as the selection, so keep this page in the foreground.',
  'export.cancel': 'Cancel',
  'export.start': 'Start export',
  'export.recording': 'Recording in real time — do not switch tabs…',
  'export.remaining': 'About {time} remaining',
  'export.cancelExport': 'Cancel export',
  'export.doneText': 'Exported — download started',
  'export.complete': 'Done',
  'export.failed': 'Export failed: {msg}',
  'export.close': 'Close',
  'export.retry': 'Retry',
  'export.recordingMsg': 'Recording in real time…',
  'export.fileSuffix': '-scrolling-tab-',

  // ---- 导出编码格式（core/exporter 的 mime 标签） ----
  'mime.vp9': 'WebM · VP9 (quality first)',
  'mime.vp8': 'WebM · VP8 (alpha channel)',
  'mime.mp4': 'MP4 · H.264',
  'mime.webmDefault': 'WebM (default)',

  // ---- 错误 ----
  'err.renderStrip': 'Failed to render the tab: ',
  'err.unsupportedFile':
    'Unsupported file type: drop a Guitar Pro file (.gp/.gp3/.gp4/.gp5/.gpx) or a video file',
  'err.parseGp':
    'Could not parse this file. Make sure it is a Guitar Pro format (.gp3 / .gp4 / .gp5 / .gpx / .gp)',
  'err.canvasContext': 'Could not create a canvas context',
  'err.audioCapture': 'Audio capture unavailable — recording video only',
  'err.mimeUnsupported': 'This browser does not support the selected recording format: {err}',
  'err.recordFailed': 'An error occurred while recording',
  'err.renderBounds': 'Render bounds missing',
  'err.renderEmpty': 'Tab rendering produced no output (partial 0)',

  // ---- 图片替代文本 ----
  'img.mascot': 'Whale girl',

  // ---- 内置示例曲（写入谱面内容） ----
  'demo.title': 'Demo · A minor pentatonic study',
  'demo.artist': 'TabFlow Demo',
  'demo.fileName': 'Demo (built-in)',
  'demo.trackGuitar': 'Guitar',
  'demo.trackBass': 'Bass',
  'demo.trackPiano': 'Piano',
  'demo.trackDrums': 'Drums',

  // ---- 页面标题与 SEO meta ----
  'meta.title': 'TabFlow · Dynamic guitar tab video generator',
  'meta.desc':
    'Convert Guitar Pro scores into a single-line scrolling tab video, sync it with your performance video, and export with a white or transparent background.',
  'meta.ogTitle': 'TabFlow · Turn Guitar Pro scores into scrolling tab videos',
  'meta.ogDesc':
    'Upload a Guitar Pro file to generate a horizontally scrolling tab video, sync it with your performance video, and export with a white or transparent background ready to overlay in your editor. Fully client-side, no install, free and open source.',
  'meta.twitterDesc':
    'Guitar Pro score → horizontally scrolling tab video, sync with your performance video, transparent background export.',
};

export const messages: Record<Lang, Record<MsgKey, string>> = { zh, en };
