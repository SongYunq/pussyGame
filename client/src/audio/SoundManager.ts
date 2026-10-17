/**
 * 炸金花专属 Web Audio API 纯代码拟真音效引擎
 * 无需加载任何外部 mp3/wav 文件，零延迟、零网络依赖、原生支持静音切换
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // 从 localStorage 读取静音配置
    this.isMuted = localStorage.getItem('zjh_sound_muted') === 'true';
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('zjh_sound_muted', String(this.isMuted));
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * 1. 发牌声 (轻柔短促的卡牌摩擦白噪声)
   */
  public playDealCard() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * 0.08; // 80ms
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.Q.setValueAtTime(3, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
    } catch {
      // 忽略自动播放策略限制
    }
  }

  /**
   * 2. 翻牌声 (清脆高音翻折微响)
   */
  public playFlipCard() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.09);
    } catch {
      // 忽略
    }
  }

  /**
   * 3. 筹码撞击声 (金属/陶瓷双频叮当脆响)
   */
  public playChip() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      [1800, 2600].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq + (Math.random() * 80 - 40), this.ctx.currentTime);

        const startTime = this.ctx.currentTime + idx * 0.02;
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.07);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.08);
      });
    } catch {
      // 忽略
    }
  }

  /**
   * 3.5 成摞筹码堆叠与推入音效（加注越多，筹码碰撞层次越丰富）
   */
  public playChipStack(chipCount = 8) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const clinkSteps = Math.min(6, Math.max(2, Math.floor(chipCount / 5)));
      for (let i = 0; i < clinkSteps; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        const baseFreq = 1750 + i * 140 + (Math.random() * 60 - 30);
        const startTime = this.ctx.currentTime + i * 0.038;

        osc.frequency.setValueAtTime(baseFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, startTime + 0.05);

        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.065);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.07);
      }
    } catch {
      // 忽略
    }
  }

  /**
   * 4. 比牌 PK 碰撞对决声 (低频轰鸣与重击)
   */
  public playPKClash() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      // 低频轰鸣
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);

      // 短促爆炸白噪音
      const bufferSize = this.ctx.sampleRate * 0.2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

      noise.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start();
    } catch {
      // 忽略
    }
  }

  /**
   * 5. All-in 震撼全场音效 (深沉雷鸣与强烈心跳)
   */
  public playAllIn() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      // 双心跳脉冲 (顿-顿)
      [0, 0.2].forEach((offset) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, this.ctx.currentTime + offset);
        osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + offset + 0.15);

        gain.gain.setValueAtTime(0.6, this.ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + offset + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + offset);
        osc.stop(this.ctx.currentTime + offset + 0.2);
      });
    } catch {
      // 忽略
    }
  }

  /**
   * 6. 终局胜利欢呼音效 (大三和弦清脆金币滚落琶音)
   */
  public playWin() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      // C大调大三和弦琶音: C5(523), E5(659), G5(784), C6(1046)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const startTime = this.ctx.currentTime + idx * 0.08;
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    } catch {
      // 忽略
    }
  }
}

export const sound = new SoundManager();
