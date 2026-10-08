# TabFlow · 把吉他谱变成会滚动的视频

**中文** · [English](#english)

**一句话介绍**：上传一份 Guitar Pro 吉他谱，它会变成一条"跟着音乐滚动"的动态谱视频——可以直接叠在你的演奏画面上，发到 B 站、YouTube、抖音、小红书。

![TabFlow 界面](docs/screenshot.png)

不需要懂剪辑、不需要装任何软件，全程在浏览器里点几下就完成。

- **在线使用**：<https://tabflow.bezhuang.cn/>
- **开源仓库**：<https://github.com/Bezhuang/tabflow>

## 什么情况下你会用到它

- 你录了一段吉他 **翻弹 / 演奏视频**，想让观众看到"弹到哪、谱子滚到哪"
- 你在做 **吉他 / 钢琴 / 鼓教学**，想让学员看清每一句怎么弹（简谱、五线谱、六线谱任选）
- 你不想在剪辑软件里一帧一帧对字幕，只想要一个**能直接用的视频文件**

## 它是怎么工作的

1. **读懂吉他谱**——拖入 Guitar Pro 的谱面文件（`.gp3 / .gp4 / .gp5 / .gpx / .gp`，即 Guitar Pro 3–8 的格式）。吉他、贝斯、钢琴、架子鼓都能正确显示。
2. **变成滚动谱**——谱面变成一行从右往左滚动的长条：正在弹的小节会浅蓝色高亮，播放头像一条竖线一样"走"到你设定的位置后停住，谱子自己向前滚。
3. **和你的演奏对上**——把你的演奏视频拖进来，谱子就跟着视频的时间轴走；如果快了或慢了，用 ±10 毫秒的微调按钮对到你满意为止；预览时可以随时开关视频声音。
4. **导出成视频**——尺寸、背景、配色全部实时可调（见下面两节）。

## 记谱方式与音轨

- 右侧「音轨」点一下就切换要显示的音轨（一次显示一条）。叠加到演奏视频上时，通常只选你要弹的那条主奏轨。
- **记谱方式三选**：**简谱 / 五线谱 / 六线谱**。简谱与五线谱模式下会同时保留六线谱行方便对照；六线谱模式则只显示六线谱。
- 特殊轨自动适配：**钢琴**使用左右手大谱表（高音谱 + 低音谱，五线谱记谱）；**架子鼓**使用标准鼓谱（鼓件专用符头；超出上加一线 ~ 下加一线范围的越界音符自动不显示，避免谱面溢出）。

## 背景与配色

- **白底黑谱 / 黑底白谱**：整帧纯色背景，适合直接发布；把"背景不透明度"调低后会变成与谱子等高的半透明条带，可以直接叠在演奏画面上当"衬底"。
- **透明背景**（用于叠加到剪辑软件，可用 Chrome / Edge 导出）：
  - **谱面颜色任意调**：取色器任选，或用白 / 黑 / 蓝 / 黄快捷色；
  - **背景颜色任意调**：取色器任选，或点「无背景」得到完全透明的谱面图层；
  - **背景不透明度 0–100%**：100% 时背景铺满整帧；低于 100% 时只保留与谱子等高的半透明衬底，让演奏画面透出来（数字越小越透）。
- **谱面不透明度**可单独调节，控制谱面本身的浓淡。
- 导出时透明 / 半透明背景会自动选择**带 Alpha 通道的 WebM**（VP8），剪映 / Premiere / Final Cut / DaVinci 拖进去即可直接叠加。

## 画面尺寸与缩放

- 输出尺寸：1080P 横屏 16:9 / 720P / 竖屏 9:16（Shorts / Reels）/ 方形 1:1 / 自定义宽高；
- 谱面缩放、播放头锁定位置、垂直位置（居中 / 偏上 / 偏下）实时可调，全部所见即所得；
- 导出支持 30 / 60 fps，整曲或自定义时间区间，可勾选"烧录演奏视频画面"并带上视频原声，一步导出合成好的成品。

## 三步上手

1. **打开网页** → 点「示例曲」先看效果（内置吉他 / 贝斯 / 钢琴 / 架子鼓四轨示例），或直接拖入自己的 Guitar Pro 文件
2. **导入演奏视频**（可选）→ 播放并微调，让谱子和你的演奏对齐
3. **点「导出视频」** → 选好尺寸与背景 → 等进度条走完，视频自动下载

> 小提示：导出**透明背景**请使用 Chrome 或 Edge 浏览器。
> 所有处理都在你自己的浏览器里完成，乐谱和视频**不会上传到任何服务器**。

## 常见问题

**Q：我没有买 Guitar Pro 软件，能用吗？**
可以。这里只需要 `.gp` 系列的谱面文件本身，很多谱站都能下载到。

**Q：一次能显示几条音轨？**
一次显示一条，右侧「音轨」里点一下就切换。

**Q：谱子的大小、位置、颜色不合适？**
右侧面板里可以实时调整：输出尺寸、谱面缩放、播放头锁定位置、垂直位置、背景颜色与不透明度、谱面不透明度、记谱方式……全部所见即所得。

**Q：段落、速度记号、拨弦方向会显示吗？**
会。谱面按 Guitar Pro 的风格渲染：段落标题、♩=速度、拍号、拨弦方向（Π/V）、击勾弦弧线等都会忠实呈现。

**Q：透明背景导出的视频能直接用吗？**
能。导出的是带 Alpha 通道的 WebM，在剪映 / Premiere / Final Cut / DaVinci 里作为"叠加图层"放在你的演奏视频上方即可，不需要再抠像。

## 开发者信息

纯前端应用（React + TypeScript + Vite），构建产物是静态文件，可直接部署到任何静态托管服务。

- 谱面解析与排版：[alphaTab](https://github.com/CoderLine/alphaTab)（MPL-2.0），音乐符号使用 Bravura 字体
- 视频导出：Canvas 合成 + MediaRecorder 实时录制（白底 / 透明 WebM、可选 MP4，可混入视频原声）

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

**部署**：仓库自带 GitHub Actions 工作流，push 到 `main` 自动构建发布（线上站点使用自定义域名 `tabflow.bezhuang.cn`，由 `public/CNAME` 保持）；也可以直接导入 Vercel（框架选 Vite，构建命令 `npm run build`，输出目录 `dist`）。

**已知限制**：反复 / 跳房子记号按直线顺序滚动（不展开反复段落）；导出为实时录制，录制时长与选区等长，期间请保持页面在前台；鼓谱中映射到上下加一线之外的音符不显示。

## 开源协议

本项目基于 [MPL-2.0](LICENSE) 协议开源，与所依赖的 alphaTab 保持一致。

谱面解析与渲染能力来自 [alphaTab](https://github.com/CoderLine/alphaTab)，感谢原作者 Daniel Kuschny 及所有贡献者。

---

## English

**TabFlow** · Turn guitar tabs into a scrolling video

**In one sentence**: upload a Guitar Pro score and it becomes a scrolling tab video that follows the music — ready to overlay on your own performance footage and share on YouTube, Bilibili, TikTok or Instagram.

The app has a full English UI. Switch with the **中文 / EN** toggle in the top bar; your choice is remembered, and first-time visitors get the language their browser asks for.

- **Live app**: <https://tabflow.bezhuang.cn/>
- **Repository**: <https://github.com/Bezhuang/tabflow>

No editing skills and no software install needed — everything happens in the browser in a few clicks.

### When you'd want this

- You recorded a **cover / performance video** and want viewers to see "what's being played, where the tab is"
- You teach **guitar / piano / drums** and want students to follow every phrase (numbered notation, staff or tablature)
- You don't want to sync captions frame by frame in a video editor — you just want a **file you can use**

### How it works

1. **Read the score** — drop in a Guitar Pro file (`.gp3 / .gp4 / .gp5 / .gpx / .gp`, i.e. Guitar Pro 3–8). Guitar, bass, piano and drums all render correctly.
2. **Turn it into a scrolling tab** — the score becomes a single long line scrolling right to left: the bar being played is highlighted in light blue, and the playhead walks to your chosen position and then holds while the score scrolls itself.
3. **Sync it with your playing** — drop in your performance video and the tab follows the video timeline; if it runs early or late, nudge it with the ±10 ms buttons, and toggle the video audio on or off while previewing.
4. **Export a video** — size, background and colors are all adjustable live (see the next sections).

### Notation and tracks

- Click a track under **Tracks** to switch which one is shown (one at a time). When overlaying on your video, you usually want just the lead track you're playing.
- **Three notation modes**: **numbered / staff / tablature**. Numbered and staff modes keep the tablature line alongside for reference; tablature mode shows only the tab.
- Special tracks adapt automatically: **piano** uses a grand staff (treble + bass, standard notation); **drums** use standard drum notation — notes mapped outside the staff range are hidden instead of drawing a runaway ledger line.

### Background and colors

- **Light / dark**: a solid background filling the frame, ready to publish as-is. Lower *background opacity* and it becomes a semi-transparent band exactly as tall as the tab, which you can overlay as a backing plate on your footage.
- **Transparent background** (for overlaying in an editor; export with Chrome or Edge):
  - **Tab color** — any color via the picker, or the white / black / blue / yellow shortcuts;
  - **Background color** — any color via the picker, or *No background* for a fully transparent tab layer;
  - **Background opacity 0–100%** — at 100% the background fills the frame; below 100% only a semi-transparent band the height of the tab remains, letting your footage show through (lower = more transparent).
- **Tab opacity** is adjustable on its own, controlling how strong the tab itself looks.
- On export, transparent / semi-transparent backgrounds automatically use **WebM with an alpha channel** (VP8), ready to drop into CapCut / Premiere / Final Cut / DaVinci.

### Frame size and zoom

- Output size: 1080p landscape 16:9 / 720p / portrait 9:16 (Shorts / Reels) / square 1:1 / custom width and height;
- Tab zoom, playhead lock position and vertical position (centered / up / down) are all live and WYSIWYG;
- Export at 30 or 60 fps, the full song or a custom time range, optionally burning in the performance video with its original audio — one step to a finished video.

### Three steps

1. **Open the page** → click **Demo** to see it working (a built-in four-track demo: guitar / bass / piano / drums), or drag in your own Guitar Pro file
2. **Import your performance video** (optional) → play and fine-tune until the tab lines up with your playing
3. **Click Export video** → pick size and background → wait for the progress bar and the video downloads automatically

> Tip: use Chrome or Edge to export a **transparent** background.
> Everything runs in your own browser — your scores and videos are **never uploaded to any server**.

### FAQ

**Q: I don't own Guitar Pro. Can I still use this?**
Yes. Only the `.gp` score file itself is needed, and plenty of tab sites offer those.

**Q: How many tracks can be shown at once?**
One at a time — click a track under **Tracks** to switch.

**Q: The tab's size, position or color isn't right?**
Everything is adjustable live in the side panel: output size, tab zoom, playhead lock position, vertical position, background color and opacity, tab opacity, notation… all WYSIWYG.

**Q: Are sections, tempo marks and picking directions shown?**
Yes. The score is rendered in Guitar Pro's own style: section titles, ♩=tempo, time signatures, picking directions (Π/V), hammer-on and pull-off slurs, and so on.

**Q: Can the transparent-background video be used directly?**
Yes. It exports WebM with an alpha channel — place it as an overlay layer above your performance video in CapCut / Premiere / Final Cut / DaVinci, no keying required.

### For developers

A pure front-end app (React + TypeScript + Vite); the build output is static files and can be deployed to any static host.

- Score parsing and engraving: [alphaTab](https://github.com/CoderLine/alphaTab) (MPL-2.0), with the Bravura music font
- Video export: Canvas compositing + MediaRecorder real-time capture (opaque / transparent WebM, optional MP4, can mix in the video's original audio)

```bash
npm install
npm run dev      # local development
npm run build    # build to dist/
npm run preview  # preview the build
```

**Internationalization**: UI copy lives in `src/i18n/messages.ts` (Chinese / English), with the non-React translator in `src/i18n/translate.ts` and the provider in `src/i18n/provider.tsx`. The mobile layout is a set of `@media` rules at the end of `src/styles.css`.

**Deployment**: the repo ships a GitHub Actions workflow that builds and publishes on every push to `main` (the live site uses the custom domain `tabflow.bezhuang.cn`, kept by `public/CNAME`); you can also import it into Vercel directly (framework Vite, build command `npm run build`, output directory `dist`).

**Known limitations**: repeats / jump barlines scroll in linear order (repeat sections aren't expanded); export is a real-time recording, so it takes as long as the selection — keep the page in the foreground; drum notes mapped outside the staff range aren't shown.

### License

Released under [MPL-2.0](LICENSE), matching the alphaTab dependency.

Score parsing and rendering come from [alphaTab](https://github.com/CoderLine/alphaTab) — thanks to Daniel Kuschny and all contributors.
