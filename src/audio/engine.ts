/**
 * Procedural audio. Web Audio only, no files. Created on the first user gesture.
 * The hum is a 50 Hz mains bed: 100 Hz ballast buzz plus harmonics, and a detuned partner whose
 * beating rate, pitch drop and stereo position follow the Occupant. Players learn to listen.
 */
import { Rng } from '../core/rng.ts';

export type CueFn = (text: string, dir: number | null) => void;

interface Spatial {
  panner: PannerNode;
  gain: GainNode;
  stop: () => void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private amb!: GainNode;
  private fx!: GainNode;
  private wet!: GainNode;
  private reverb!: ConvolverNode;
  private humGain!: GainNode;
  private humOsc: OscillatorNode[] = [];
  private beatOsc!: OscillatorNode;
  private beatGain!: GainNode;
  private humPan!: StereoPannerNode;
  private hissGain!: GainNode;
  private hvacGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rng = Rng.from(4242);
  private loops = new Map<string, Spatial>();
  volumes = { master: 0.8, ambience: 0.8, effects: 0.9 };
  onCue: CueFn = () => {};
  private lastCue = new Map<string, number>();

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture handler. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.amb = ctx.createGain();
    this.fx = ctx.createGain();
    this.amb.connect(this.master);
    this.fx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.5);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.25;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolumes();
    this.buildHum();
    this.buildBeds();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.amb.gain.setTargetAtTime(this.volumes.ambience, t, 0.05);
    this.fx.gain.setTargetAtTime(this.volumes.effects, t, 0.05);
  }

  setReverb(mix: number): void {
    if (!this.ctx) return;
    this.wet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.3);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.rng.next() * 2 - 1;
    return b;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (this.rng.next() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  private buildHum(): void {
    const ctx = this.ctx!;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humPan = ctx.createStereoPanner();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.humGain.connect(lp);
    lp.connect(this.humPan);
    this.humPan.connect(this.amb);
    const parts: [OscillatorType, number, number][] = [
      ['sine', 50, 0.18],
      ['sawtooth', 100, 0.05],
      ['sine', 100, 0.16],
      ['sine', 200, 0.05],
      ['sine', 300, 0.03],
      ['triangle', 400, 0.012],
    ];
    for (const [type, f, g] of parts) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg);
      gg.connect(this.humGain);
      o.start();
      this.humOsc.push(o);
    }
    // Beating partner: interference grows as the Occupant approaches.
    this.beatOsc = ctx.createOscillator();
    this.beatOsc.type = 'sine';
    this.beatOsc.frequency.value = 100.5;
    this.beatGain = ctx.createGain();
    this.beatGain.gain.value = 0;
    this.beatOsc.connect(this.beatGain);
    this.beatGain.connect(this.humGain);
    this.beatOsc.start();
    this.humGain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  }

  private buildBeds(): void {
    const ctx = this.ctx!;
    // Distant HVAC: low-passed noise.
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    this.hvacGain = ctx.createGain();
    this.hvacGain.gain.value = 0.12;
    n.connect(lp);
    lp.connect(this.hvacGain);
    this.hvacGain.connect(this.amb);
    n.start();
    // Tape hiss in the camcorder view.
    const h = ctx.createBufferSource();
    h.buffer = this.noiseBuf;
    h.loop = true;
    h.playbackRate.value = 0.97;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    h.connect(hp);
    hp.connect(this.hissGain);
    this.hissGain.connect(this.fx);
    h.start();
  }

  /**
   * Drive the hum from the Occupant. closeness: 0 far, 1 touching. pan: -1 left to 1 right.
   */
  setHum(closeness: number, pan: number, silent: boolean, raised: boolean, deadAir = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.max(0, Math.min(1, closeness));
    const drop = 1 - 0.07 * k;
    this.humOsc.forEach((o, i) => {
      const base = [50, 100, 100, 200, 300, 400][i]!;
      o.frequency.setTargetAtTime(base * drop, t, 0.4);
    });
    this.beatOsc.frequency.setTargetAtTime(100 * drop + 0.4 + k * 7, t, 0.3);
    this.beatGain.gain.setTargetAtTime(0.02 + k * 0.32, t, 0.3);
    this.humPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan * (0.2 + k * 0.7))), t, 0.25);
    const target = deadAir ? 0 : silent ? 0 : 0.5 + k * 0.25;
    this.humGain.gain.setTargetAtTime(target, t, silent ? 0.25 : 0.6);
    this.hvacGain.gain.setTargetAtTime(deadAir || silent ? 0 : 0.12, t, 0.5);
    this.hissGain.gain.setTargetAtTime(raised ? 0.035 : 0, t, 0.08);
    if (k > 0.45) this.cue('hum', '[the hum deepens]', pan, 6);
  }

  cue(key: string, text: string, dir: number | null, every = 4): void {
    const now = performance.now() / 1000;
    if ((this.lastCue.get(key) ?? -99) + every > now) return;
    this.lastCue.set(key, now);
    this.onCue(text, dir);
  }

  private burst(dest: AudioNode, dur: number, filter: BiquadFilterType, freq: number, q: number, gain: number, when = 0, rate = 1): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, this.rng.next() * 1.5);
    s.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(surface: 'carpet' | 'water' | 'tile', loudness: number): void {
    if (!this.ready) return;
    const send = this.ctx!.createGain();
    send.gain.value = 1;
    send.connect(this.fx);
    send.connect(this.reverb);
    const l = loudness;
    if (surface === 'carpet') {
      this.burst(send, 0.13, 'bandpass', 380 + this.rng.next() * 120, 0.9, 0.22 * l);
      this.burst(send, 0.08, 'lowpass', 140, 0.7, 0.3 * l, 0.01);
      this.burst(send, 0.05, 'highpass', 2500, 0.5, 0.02 * l, 0.02);
    } else if (surface === 'water') {
      this.burst(send, 0.22, 'bandpass', 900 + this.rng.next() * 500, 1.2, 0.3 * l);
      this.burst(send, 0.3, 'bandpass', 1800 + this.rng.next() * 600, 2, 0.14 * l, 0.06);
      this.burst(send, 0.1, 'lowpass', 200, 0.7, 0.25 * l);
    } else {
      this.burst(send, 0.06, 'bandpass', 1500, 1.5, 0.15 * l);
    }
    setTimeout(() => send.disconnect(), 800);
  }

  shutter(): void {
    if (!this.ready) return;
    this.burst(this.fx, 0.03, 'highpass', 3000, 0.7, 0.4);
    this.burst(this.fx, 0.05, 'bandpass', 1800, 3, 0.35, 0.07);
    this.tone(this.fx, 'square', 2400, 2300, 0.05, 0.03, 0.0);
    this.cue('shutter', '[shutter]', null, 0.5);
  }

  falsePhoto(): void {
    if (!this.ready) return;
    this.tone(this.fx, 'sawtooth', 120, 90, 0.35, 0.08);
    this.tone(this.fx, 'sawtooth', 127, 94, 0.35, 0.06);
  }

  goodPhoto(tier: number): void {
    if (!this.ready) return;
    const base = 520;
    for (let i = 0; i < tier; i++) this.tone(this.fx, 'sine', base * (1 + i * 0.25), base * (1 + i * 0.25), 0.25, 0.05, 0.12 + i * 0.07);
  }

  pickup(): void {
    if (!this.ready) return;
    this.tone(this.fx, 'sine', 660, 990, 0.18, 0.08);
    this.tone(this.fx, 'sine', 990, 990, 0.3, 0.05, 0.1);
  }

  raise(up: boolean): void {
    if (!this.ready) return;
    this.burst(this.fx, 0.05, 'bandpass', up ? 1200 : 900, 2, 0.12);
    if (up) this.tone(this.fx, 'sine', 3200, 3200, 0.06, 0.015, 0.08);
  }

  lowBattery(): void {
    if (!this.ready) return;
    this.tone(this.fx, 'square', 1800, 1800, 0.06, 0.03);
    this.tone(this.fx, 'square', 1800, 1800, 0.06, 0.03, 0.12);
  }

  /** Low, wet carpet sound from a world position. */
  occupantStep(x: number, y: number, z: number, intensity: number): void {
    if (!this.ready) return;
    const p = this.spatialNode(x, y, z);
    this.burst(p, 0.45, 'lowpass', 220, 1.5, 0.5 * intensity);
    this.burst(p, 0.25, 'bandpass', 600, 3, 0.12 * intensity, 0.08, 0.6);
    setTimeout(() => p.disconnect(), 1500);
  }

  exitChime(x: number, y: number, z: number): void {
    if (!this.ready) return;
    const p = this.spatialNode(x, y, z);
    this.tone(p, 'sine', 392, 392, 1.6, 0.12);
    this.tone(p, 'sine', 587, 587, 1.6, 0.08, 0.25);
    setTimeout(() => p.disconnect(), 2500);
  }

  private spatialNode(x: number, y: number, z: number): PannerNode {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.rolloffFactor = 1.2;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(this.fx);
    p.connect(this.reverb);
    return p;
  }

  /** Looping spatial sources (ringing phones). */
  startLoop(id: string, kind: 'ring' | 'gurgle', x: number, y: number, z: number): void {
    if (!this.ready || this.loops.has(id)) return;
    const ctx = this.ctx!;
    const panner = this.spatialNode(x, y, z);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(panner);
    const nodes: AudioScheduledSourceNode[] = [];
    if (kind === 'ring') {
      for (const f of [440, 480]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        o.connect(g);
        g.connect(gain);
        o.start();
        nodes.push(o);
      }
      // Cadence: 0.4 on, 0.2 off, 0.4 on, 2 off.
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 20;
      const lg = ctx.createGain();
      lg.gain.value = 0.3;
      lfo.connect(lg);
      lg.connect(gain.gain);
      lfo.start();
      nodes.push(lfo);
      const t0 = ctx.currentTime;
      for (let k = 0; k < 400; k++) {
        const t = t0 + k * 3;
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.setValueAtTime(0, t + 0.4);
        gain.gain.setValueAtTime(0.6, t + 0.6);
        gain.gain.setValueAtTime(0, t + 1.0);
      }
    }
    const stop = (): void => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      gain.disconnect();
      panner.disconnect();
    };
    this.loops.set(id, { panner, gain, stop });
  }

  stopLoop(id: string): void {
    const l = this.loops.get(id);
    if (l) {
      l.stop();
      this.loops.delete(id);
    }
  }

  stopAllLoops(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id);
  }

  listener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.02);
      l.positionY.setTargetAtTime(y, t, 0.02);
      l.positionZ.setTargetAtTime(z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /** The tape ends: hum cuts to hiss. */
  death(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.humGain.gain.cancelScheduledValues(t);
    this.humGain.gain.setValueAtTime(0.9, t);
    this.humGain.gain.linearRampToValueAtTime(0, t + 0.08);
    this.hissGain.gain.cancelScheduledValues(t);
    this.hissGain.gain.setValueAtTime(0.25, t + 0.08);
    this.hissGain.gain.linearRampToValueAtTime(0.04, t + 2.5);
    this.burst(this.fx, 0.6, 'lowpass', 120, 1, 0.9);
    this.tone(this.fx, 'sawtooth', 90, 30, 0.7, 0.2);
    this.stopAllLoops();
  }

  /** Short transition whoosh when falling into a new level. */
  fall(): void {
    if (!this.ready) return;
    this.burst(this.fx, 1.6, 'bandpass', 500, 0.6, 0.35, 0, 0.5);
    this.tone(this.fx, 'sine', 80, 40, 1.8, 0.25);
  }

  replayHiss(on: boolean): void {
    if (!this.ctx) return;
    this.hissGain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.2);
  }

  resumeHum(): void {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.8);
  }
}

export const audio = new AudioEngine();
