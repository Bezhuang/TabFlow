/** 播放时钟：有演奏视频时以视频为主时钟，否则使用内部时钟。 */
export class Engine {
  private video: HTMLVideoElement | null = null;
  private playing = false;
  private wallStart = 0;
  private pos = 0;
  onPlayingChange?: (playing: boolean) => void;

  setVideo(v: HTMLVideoElement | null): void {
    if (this.video === v) return;
    this.pause();
    this.video = v;
  }

  get hasVideo(): boolean {
    return !!this.video;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.video) {
      try {
        await this.video.play();
      } catch {
        /* 自动播放被拦截等情况 */
      }
    } else {
      this.wallStart = performance.now();
    }
    this.playing = true;
    this.onPlayingChange?.(true);
  }

  pause(): void {
    if (!this.playing) return;
    if (this.video) this.video.pause();
    else this.pos = this.getTime();
    this.playing = false;
    this.onPlayingChange?.(false);
  }

  async toggle(): Promise<void> {
    if (this.playing) this.pause();
    else await this.play();
  }

  seek(t: number): void {
    if (this.video) this.video.currentTime = t;
    else this.pos = t;
  }

  getTime(): number {
    if (this.video) return this.video.currentTime;
    return this.playing ? this.pos + (performance.now() - this.wallStart) / 1000 : this.pos;
  }

  isPlaying(): boolean {
    return this.playing;
  }
}
