/** Game orchestrator: modes, fixed-step simulation, streaming, rendering, UI and test hooks. */
import * as THREE from 'three';
import { audio } from './audio/engine.ts';
import { flicker } from './core/flicker.ts';
import { Input } from './core/input.ts';
import { Rng, hashString, normaliseSeed } from './core/rng.ts';
import { DEFAULT_SETTINGS, loadSave, writeSave, type SaveData, type Settings } from './core/save.ts';
import { dailyNumber, dailySeed, shareString, utcDateString } from './core/daily.ts';
import { ANOMALY_BY_ID, TIER_EVIDENCE, placeAnomaly } from './anomalies/registry.ts';
import { detect, project, type CamPose } from './gameplay/detect.ts';
import { Occupant } from './gameplay/occupant.ts';
import { BATTERY_SECONDS, Player, readPad } from './gameplay/player.ts';
import { ReplayBuffer, REPLAY_PLAY_S, type Frame } from './gameplay/replay.ts';
import { PERKS, UNLOCKS, unlockedIds } from './gameplay/meta.ts';
import { buildChunkView, type ChunkView } from './render/chunkMesh.ts';
import { buildExitDoor, buildNote, buildOccupant, buildStandIn, OCC_LAYER } from './render/entities.ts';
import { applyBiome, BIOMES, materialsFor, shared } from './render/materials.ts';
import { buildOffice, OFFICE_CEIL, type OfficeScene } from './render/office.ts';
import { Post } from './render/post.ts';
import { UI } from './ui/ui.ts';
import { EVIDENCE_THRESHOLD, wallSpots } from './world/content.ts';
import { CELL, CHUNK_M, type AnomalyInstance, type WorldChunk } from './world/types.ts';
import { World } from './world/world.ts';
import { cellFree } from './world/content.ts';
import { Bot } from './debug/bot.ts';

export type Mode = 'boot' | 'title' | 'intro' | 'play' | 'pause' | 'dying' | 'replay' | 'summary' | 'transition' | 'victory';

const DT = 1 / 60;
const LEVEL_NAMES = ['After Hours', 'Chlorine', 'P4'];

interface PhotoRec {
  name: string;
  thumb: string | null;
  ok: boolean;
}

interface RunState {
  seed: number;
  daily: boolean;
  level: number;
  time: number;
  levelTime: number;
  evidence: number;
  levelEvidence: number;
  tiers: [number, number, number];
  photos: PhotoRec[];
  photographed: Set<string>;
  seen: Map<string, number>;
  missed: { name: string; thumb: string | null; uid: string }[];
  taken: Set<string>;
  doubt: number;
  exit: { x: number; z: number; rot: number; group: THREE.Group } | null;
  exitChime: number;
  cause: string;
  escaped: boolean;
  occPhotographed: boolean;
  noOccupant: boolean;
  forcedRaise: number;
  photoCooldown: number;
  deathAt: Date | null;
  noteShown: boolean;
}

export interface StartOptions {
  seed?: number;
  level?: number;
  daily?: boolean;
  noOccupant?: boolean;
  skipIntro?: boolean;
  occupantDelay?: number;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly officeScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly cctv: THREE.PerspectiveCamera;
  readonly post: Post;
  readonly ui = new UI();
  readonly input: Input;
  save: SaveData;
  mode: Mode = 'boot';
  world: World | null = null;
  views = new Map<string, ChunkView>();
  buildQueue: [number, number][] = [];
  player = new Player();
  occupant: Occupant | null = null;
  occMesh: THREE.Group;
  standIn: THREE.Group;
  replayBuf = new ReplayBuffer();
  run: RunState | null = null;
  office: OfficeScene | null = null;
  officeAnomaly = false;
  testMode: boolean;
  simTime = 0;
  sessionStart = performance.now();
  /** Continuous play time in seconds, for the 90-minute note. */
  playSeconds = 0;
  private acc = 0;
  private last = performance.now();
  private seedOverride: number | null = null;
  private timeOverride: number | null = null;
  private flash = 0;
  private flickerPulse = 0;
  private flickerNext = 2;
  private flickerRng = Rng.from(31337);
  private modeT = 0;
  private replayFrames: Frame[] = [];
  private replayT = 0;
  private replayLabel = '';
  private afterReplay: (() => void) | null = null;
  private pendingThumbs: ((url: string) => void)[] = [];
  private frameTimes: number[] = [];
  private recorder: { rec: MediaRecorder; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; chunks: Blob[] } | null = null;
  private lastTapeFrames: Frame[] = [];
  private noteMesh: THREE.Mesh | null = null;
  private hiddenAt = 0;
  hiddenFor = 0;
  private photoMode = false;
  private logOpen = false;
  private batteryWarned = false;
  errors: string[] = [];
  bot: Bot | null = null;

  constructor(container: HTMLElement) {
    this.testMode = new URLSearchParams(location.search).has('test');
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.info.autoReset = false;
    container.append(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 120);
    this.camera.rotation.order = 'YXZ';
    this.cctv = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 120);
    this.cctv.layers.enable(OCC_LAYER);
    this.scene.background = new THREE.Color(0x0c0b07);
    this.officeScene.background = new THREE.Color(0x05060a);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.input = new Input(this.renderer.domElement);
    this.save = loadSave();
    const mats = materialsFor(0);
    this.occMesh = buildOccupant(mats);
    this.occMesh.visible = false;
    this.scene.add(this.occMesh);
    this.standIn = buildStandIn(mats);
    this.standIn.visible = false;
    this.scene.add(this.standIn);
    this.applySettings(this.save.settings);
    audio.onCue = (text, dir) => {
      if (this.save.settings.soundCues && (this.mode === 'play' || this.mode === 'dying')) this.ui.sub(text, dir);
    };
    this.input.onUnlock = () => {
      if (this.mode === 'play' && !this.testMode) this.pause();
    };
    this.input.onAnyKey = (code) => this.onKey(code);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      if (this.mode === 'play' && !this.testMode) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = performance.now();
        if (this.mode === 'play' && !this.testMode) this.pause();
      } else if (this.hiddenAt && performance.now() - this.hiddenAt > 5000) {
        this.hiddenFor = (performance.now() - this.hiddenAt) / 1000;
      }
    });
    this.renderer.domElement.addEventListener('click', () => {
      audio.unlock();
      if (this.mode === 'play' && !this.input.locked && !this.testMode) this.input.lock();
    });
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.mode === 'play' && this.player.raised) this.snapPhoto();
    });
    this.resize();
    this.goTitle();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- Settings ----------
  applySettings(s: Settings): void {
    this.save.settings = { ...DEFAULT_SETTINGS, ...s };
    audio.volumes = { master: s.master, ambience: s.ambience, effects: s.effects };
    audio.applyVolumes();
    flicker.reduceFlicker = s.reduceFlicker;
    this.post.blur.enabled = s.motionBlur;
    const q = s.quality === 'auto' ? 'medium' : s.quality;
    this.post.setQuality(q);
    if (s.quality === 'low') this.post.scale = 0.7;
    else if (s.quality === 'medium') this.post.scale = 0.85;
    else if (s.quality === 'high') this.post.scale = 1;
    this.resize();
  }

  persist(): void {
    writeSave(this.save);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cctv.aspect = w / h;
    this.cctv.updateProjectionMatrix();
    this.post.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  }

  // ---------- Title, warning, intro ----------
  goTitle(): void {
    this.mode = 'title';
    this.modeT = 0;
    this.ui.hudOn(false);
    this.disposeWorld();
    this.input.unlock();
    this.setupOffice(this.save.escapes > 0);
    const d = new Date();
    this.ui.title(
      this.save,
      {
        start: () => this.beginFromTitle({}),
        daily: () => this.beginFromTitle({ daily: true }),
        archive: () => this.openArchive(),
        settings: () => this.openSettings(() => this.goTitle()),
      },
      `#${String(dailyNumber(d)).padStart(4, '0')}`,
    );
    if (!this.save.seenWarning) {
      this.ui.warning(() => {
        audio.unlock();
        this.save.seenWarning = true;
        this.persist();
        this.ui.show('title');
      });
      this.ui.show('warning');
    } else this.ui.show('title');
  }

  private setupOffice(anomaly: boolean): void {
    if (this.office && this.officeAnomaly === anomaly) return;
    if (this.office) {
      this.officeScene.remove(this.office.group);
      this.office.dispose();
    }
    this.office = buildOffice(anomaly);
    this.officeAnomaly = anomaly;
    this.officeScene.add(this.office.group);
  }

  openSettings(back: () => void): void {
    this.ui.settings(this.save.settings, (s) => {
      this.applySettings(s);
      this.persist();
    }, back);
    this.ui.show('settings');
  }

  openArchive(): void {
    this.ui.archive(this.save, {
      back: () => this.goTitle(),
      perk: (id) => {
        this.save.perk = id;
        this.persist();
        this.openArchive();
      },
      filter: (n) => {
        this.save.filter = n;
        this.persist();
        this.openArchive();
      },
    });
    this.ui.show('archive');
  }

  beginFromTitle(o: StartOptions): void {
    audio.unlock();
    if (!this.testMode) this.input.lock();
    if (o.skipIntro) {
      this.startRun(o);
      return;
    }
    this.mode = 'intro';
    this.modeT = 0;
    this.setupOffice(false);
    this.ui.intro(this.save.seenIntro);
    this.ui.show('intro');
    this.pendingStart = o;
  }
  private pendingStart: StartOptions = {};

  // ---------- Runs ----------
  startRun(o: StartOptions = {}): void {
    const t0 = performance.now();
    this.disposeWorld();
    const daily = !!o.daily;
    const seed = o.seed !== undefined ? normaliseSeed(o.seed) : daily ? dailySeed(new Date()) : this.seedOverride ?? normaliseSeed(hashString(`run-${Date.now()}-${this.save.runs}`));
    this.run = {
      seed,
      daily,
      level: o.level ?? 0,
      time: 0,
      levelTime: 0,
      evidence: 0,
      levelEvidence: 0,
      tiers: [0, 0, 0],
      photos: [],
      photographed: new Set(),
      seen: new Map(),
      missed: [],
      taken: new Set(),
      doubt: 0,
      exit: null,
      exitChime: 0,
      cause: '',
      escaped: false,
      occPhotographed: false,
      noOccupant: !!o.noOccupant,
      forcedRaise: o.skipIntro ? 0 : 1.4,
      photoCooldown: 0,
      deathAt: null,
      noteShown: false,
    };
    this.enterLevel(this.run.level, o.occupantDelay);
    this.mode = 'play';
    this.modeT = 0;
    this.ui.show(null);
    this.ui.hudOn(true);
    this.ui.clearHudTransient();
    this.ui.setFade(false, 300);
    audio.resumeHum();
    this.lastStartMs = performance.now() - t0;
  }
  lastStartMs = 0;

  private enterLevel(level: number, occupantDelay?: number): void {
    const run = this.run!;
    this.disposeWorld();
    run.level = level;
    run.levelTime = 0;
    run.levelEvidence = 0;
    run.exit = null;
    this.world = new World(run.seed, level);
    const origin = this.world.chunk(0, 0);
    applyBiome(level, origin.ceil, run.seed);
    audio.setReverb(level === 1 ? 0.7 : 0.22);
    const sp = origin.spawn!;
    const p = this.player;
    const perk = this.save.perk;
    const keepBattery = level > 0 ? p.battery : 1;
    Object.assign(p, new Player());
    p.x = sp.x;
    p.z = sp.z;
    p.yaw = sp.yaw;
    p.battery = keepBattery;
    p.capacity = perk === 'battery' ? 1.1 : 1;
    p.quiet = perk === 'quiet';
    p.wading = level === 1;
    this.occupant = new Occupant(this.world, Rng.from(run.seed, level, 7), occupantDelay ?? (level === 0 ? 55 : 25));
    this.replayBuf.clear();
    this.stream(true);
  }

  private disposeWorld(): void {
    for (const v of this.views.values()) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.views.clear();
    this.buildQueue = [];
    audio.stopAllLoops();
    if (this.run?.exit) {
      this.scene.remove(this.run.exit.group);
      this.run.exit = null;
    }
    if (this.noteMesh) {
      this.scene.remove(this.noteMesh);
      this.noteMesh = null;
    }
    this.world = null;
  }

  /** Keep the 3 x 3 chunks around the player built; dispose the rest. */
  private stream(sync = false): void {
    if (!this.world || !this.run) return;
    const pcx = Math.floor(this.player.x / CHUNK_M);
    const pcz = Math.floor(this.player.z / CHUNK_M);
    const want = new Set<string>();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) want.add(this.world.key(pcx + dx, pcz + dz));
    for (const [k, v] of this.views) {
      if (!want.has(k)) {
        this.scene.remove(v.group);
        v.dispose();
        this.views.delete(k);
        const wc = this.world.chunks.get(k);
        if (wc) for (const a of wc.anomalies) audio.stopLoop(a.uid);
      }
    }
    // Evict far chunk data so memory stays bounded.
    for (const [k, c] of this.world.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > 3) this.world.chunks.delete(k);
    }
    const order: [number, number][] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) order.push([pcx + dx, pcz + dz]);
    order.sort((a, b) => Math.abs(a[0] - pcx) + Math.abs(a[1] - pcz) - (Math.abs(b[0] - pcx) + Math.abs(b[1] - pcz)));
    for (const [cx, cz] of order) {
      const k = this.world.key(cx, cz);
      if (this.views.has(k) || this.buildQueue.some(([x, z]) => x === cx && z === cz)) continue;
      this.buildQueue.push([cx, cz]);
    }
    if (sync) while (this.buildQueue.length) this.buildOne();
  }

  private buildOne(): void {
    const next = this.buildQueue.shift();
    if (!next || !this.world || !this.run) return;
    const [cx, cz] = next;
    const k = this.world.key(cx, cz);
    if (this.views.has(k)) return;
    const pcx = Math.floor(this.player.x / CHUNK_M);
    const pcz = Math.floor(this.player.z / CHUNK_M);
    if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > 1) return;
    const wc = this.world.chunk(cx, cz);
    const view = buildChunkView(wc, materialsFor(this.run.level), this.run.seed, this.run.level);
    for (const id of this.run.taken) {
      const m = view.pickups.get(id);
      if (m) {
        view.group.remove(m);
        view.pickups.delete(id);
      }
    }
    this.views.set(k, view);
    this.scene.add(view.group);
    for (const a of wc.anomalies) if (a.type === 'phone-ringing') audio.startLoop(a.uid, 'ring', a.x, 0.1, a.z);
  }

  // ---------- Input ----------
  private onKey(code: string): void {
    audio.unlock();
    if (this.mode === 'intro' && this.save.seenIntro && this.modeT > 0.3) {
      this.finishIntro();
      return;
    }
    if ((this.mode === 'summary' || this.mode === 'replay') && code === 'KeyR') {
      this.stopRecording(false);
      this.startRun({ ...(this.run ? { daily: this.run.daily } : {}), skipIntro: true });
      return;
    }
    if (this.mode === 'replay' && (code === 'Enter' || code === 'Escape')) {
      this.endReplay();
      return;
    }
    if (this.mode === 'pause' && code === 'KeyP' && this.photoMode) {
      this.photoMode = false;
      this.ui.show('pause');
      return;
    }
    if (this.mode === 'play' && code === 'KeyN' && this.player.raised) this.player.night = !this.player.night;
    if (this.mode === 'play' && code === 'Escape' && this.testMode) this.pause();
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.input.unlock();
    const photo = unlockedIds(this.save.banked).has('photo')
      ? () => {
          this.photoMode = true;
          this.ui.show(null);
          this.ui.hudOn(false);
        }
      : null;
    this.ui.pause((performance.now() - this.sessionStart) / 1000, {
      resume: () => this.resume(),
      settings: () => this.openSettings(() => this.pause2()),
      abandon: () => {
        this.mode = 'play';
        this.endRun('You stopped recording.', false);
      },
      photo,
    });
    this.ui.show('pause');
  }

  /** Back from settings to the pause menu. */
  private pause2(): void {
    this.mode = 'play';
    this.pause();
  }

  resume(): void {
    if (this.mode !== 'pause') return;
    this.mode = 'play';
    this.photoMode = false;
    this.ui.show(null);
    this.ui.hudOn(true);
    if (!this.testMode) this.input.lock();
    this.last = performance.now();
  }

  // ---------- Frame loop ----------
  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.trackFrameTime(dt);
    if (!this.testMode) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 8) {
        this.step();
        this.acc -= DT;
        n++;
      }
      if (n === 8) this.acc = 0;
    }
    if (this.mode === 'pause') this.ui.updatePauseClock((now - this.sessionStart) / 1000);
    if (this.mode === 'pause' && this.photoMode) {
      // Photo mode: mouse look only, time frozen.
      this.player.yaw -= this.input.mouseDX * 0.002;
      this.player.pitch = Math.max(-1.3, Math.min(1.3, this.player.pitch - this.input.mouseDY * 0.002));
      this.input.endFrame();
    }
    this.buildOne();
    this.draw();
  }

  private trackFrameTime(dt: number): void {
    if (this.testMode || this.save.settings.quality !== 'auto' || this.mode !== 'play') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    const before = this.post.scale;
    if (avg > 0.0185) this.post.scale = Math.max(0.6, this.post.scale - 0.1);
    else if (avg < 0.0125) this.post.scale = Math.min(1, this.post.scale + 0.05);
    if (before !== this.post.scale) this.resize();
  }

  /** One fixed 60 Hz simulation step. */
  step(): void {
    this.simTime += DT;
    this.modeT += DT;
    shared.uTime.value = this.simTime;
    this.flash = Math.max(0, this.flash - DT * 5);
    this.updateFlicker();
    switch (this.mode) {
      case 'play':
        this.stepPlay();
        break;
      case 'intro':
        if (this.modeT > 17.5) this.finishIntro();
        break;
      case 'dying':
        if (this.modeT > 1.1) this.startReplay(this.run!.cause.startsWith('Caught') ? 'INCIDENT' : 'EXIT', () => this.showSummary());
        break;
      case 'replay':
        this.replayT += DT;
        if (this.recorder && this.replayT > this.replayDuration()) this.stopRecording(true);
        else if (this.replayT > this.replayDuration() + 1) this.replayT = 0;
        break;
      case 'transition':
        if (this.modeT > 1.4) {
          this.ui.setFade(false, 700);
          this.mode = 'play';
          this.modeT = 0;
          this.ui.toast(`LEVEL ${this.run!.level === 1 ? 'B' : 'C'}  ${LEVEL_NAMES[this.run!.level]!.toUpperCase()}`, 3.5);
        }
        break;
      case 'victory':
        if (this.modeT > 7) {
          this.ui.setFade(true, 400);
          this.mode = 'dying';
          this.modeT = 0.5;
        }
        break;
    }
    this.input.endFrame();
  }

  private updateFlicker(): void {
    const t = this.simTime;
    this.flickerPulse = Math.max(0, this.flickerPulse - DT * 18);
    if (t > this.flickerNext) {
      const near = this.occupant && this.mode === 'play' ? Math.max(0, 1 - this.occupant.dist / 14) : 0;
      this.flickerNext = t + this.flickerRng.range(0.08, near > 0.2 ? 0.6 : 3.5);
      if (flicker.request('small', t)) this.flickerPulse = 1;
    }
    shared.uFlickerPulse.value = flicker.reduceFlicker ? 0 : this.flickerPulse > 0.5 ? 1 : 0;
  }

  private stepPlay(): void {
    const run = this.run!;
    const world = this.world!;
    const p = this.player;
    const s = this.save.settings;
    run.time += DT;
    run.levelTime += DT;
    this.playSeconds += DT;
    run.photoCooldown = Math.max(0, run.photoCooldown - DT);
    run.doubt = Math.max(0, run.doubt - DT);
    const intent = p.intent(this.input, s);
    if (run.forcedRaise > 0) {
      run.forcedRaise -= DT;
      intent.raise = true;
    }
    if (this.raiseOverride !== null) intent.raise = this.raiseOverride;
    const wasRaised = p.raised;
    p.update(DT, intent, world, s);
    if (p.raised !== wasRaised) audio.raise(p.raised);
    if (p.raised && p.battery < 0.15 && !this.batteryWarned) {
      this.batteryWarned = true;
      audio.lowBattery();
      this.ui.toast('BATTERY LOW');
    }
    if (p.battery >= 0.15) this.batteryWarned = false;
    if (intent.raise && p.battery <= 0) this.ui.toast('NO BATTERY', 1);
    if (p.stepped) audio.footstep(run.level === 1 ? 'water' : 'carpet', (p.sprinting ? 1 : p.crouching ? 0.35 : 0.6) * (p.quiet ? 0.6 : 1));
    if (this.input.lmbPressed && p.raised && !this.testMode) {
      /* handled by the mousedown listener */
    }
    if (this.input.hit('KeyE')) this.interact();
    const pad = readPad();
    if (pad) {
      if (pad.rt && !this.padPrev.rt && p.raised) this.snapPhoto();
      if (pad.a && !this.padPrev.a) this.interact();
      if (pad.y && !this.padPrev.y && p.raised) p.night = !p.night;
      if (pad.start && !this.padPrev.start) this.pause();
      this.padPrev = pad;
    }
    // Evidence log on Tab (hold).
    const tab = this.input.down('Tab');
    if (tab && !this.logOpen) {
      this.ui.log(run.photos, run.levelEvidence, EVIDENCE_THRESHOLD[run.level] ?? 10);
      this.ui.show('log');
      this.logOpen = true;
    } else if (!tab && this.logOpen) {
      this.ui.show(null);
      this.logOpen = false;
    }

    // Pickups: auto within reach.
    for (const v of this.views.values()) {
      for (const [id, m] of v.pickups) {
        if (Math.hypot(m.position.x - p.x, m.position.z - p.z) < 0.75) this.takePickup(id, m, v);
      }
    }
    this.stream();

    // Occupant.
    const occ = this.occupant!;
    const pose = this.camPose();
    let observed = false;
    if (!run.noOccupant) {
      if (occ.active && p.raised && p.battery > 0) {
        const pr = project(pose, occ.x, 1.25, occ.z);
        if (pr && Math.abs(pr.nx) < 1.0 && Math.abs(pr.ny) < 1.2 && pr.depth < 40 && world.segmentClear(p.x, p.eye, p.z, occ.x, 1.25, occ.z)) observed = true;
      }
      const calm = s.scare === 'calm';
      const res = occ.update(
        DT,
        { px: p.x, pz: p.z, observed, calm, reduced: s.scare === 'reduced', doubt: run.doubt, runTime: run.levelTime, exitOpen: !!run.exit, noise: p.noise },
        (x, z) => this.inView(x, 1.2, z),
      );
      if (occ.stepped && occ.dist < 16) {
        audio.occupantStep(occ.x, 0.1, occ.z, Math.max(0.2, 1 - occ.dist / 16));
        if (occ.dist < 12) audio.cue('occstep', '[wet footsteps on carpet]', this.panOf(occ.x, occ.z), 3);
      }
      if (res === 'caught') this.die('Caught by the Occupant.');
    }
    const dist = occ.active && !run.noOccupant ? occ.dist : 99;
    const closeness = Math.max(0, Math.min(1, 1 - dist / 18));
    audio.setHum(closeness, this.panOf(occ.x, occ.z), world.silentAt(p.x, p.z), p.raised);
    shared.uOcc.value.set(occ.x, 0, occ.z, occ.active && !run.noOccupant ? Math.max(0, Math.min(0.85, (14 - dist) / 10)) : 0);
    if (closeness > 0.55 && this.mode === 'play') audio.cue('lights', '[the lights dim]', null, 8);

    // Missed anomalies: seen with the naked eye or lens for a while, never photographed.
    if (Math.floor(run.time * 4) !== Math.floor((run.time - DT) * 4)) this.trackSeen(pose);

    // Exit.
    const threshold = EVIDENCE_THRESHOLD[run.level] ?? 10;
    if (!run.exit && run.levelEvidence >= threshold) this.manifestExit();
    if (run.exit) {
      run.exitChime -= DT;
      if (run.exitChime <= 0) {
        run.exitChime = 6;
        audio.exitChime(run.exit.x, 1.5, run.exit.z);
        audio.cue('exit', '[a soft chime somewhere]', this.panOf(run.exit.x, run.exit.z), 5);
      }
    }

    // 90 minutes of continuous play: a polite note. Never blocks play.
    if (!run.noteShown && this.playSeconds > 90 * 60) this.placeNote();

    this.replayBuf.tick(DT, {
      t: run.time,
      px: p.x,
      py: p.eye,
      pz: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      ox: occ.x,
      oz: occ.z,
      oa: occ.active && !run.noOccupant ? 1 : 0,
      raised: p.raised ? 1 : 0,
      flash: this.flash > 0.3 ? 1 : 0,
    });
  }
  raiseOverride: boolean | null = null;
  private padPrev: { rt: boolean; a: boolean; y: boolean; start: boolean } = { rt: false, a: false, y: false, start: false };

  private panOf(x: number, z: number): number {
    const p = this.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    return (dx * -Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / l;
  }

  camPose(): CamPose {
    const p = this.player;
    return { x: p.x, y: p.eye + p.bob, z: p.z, yaw: p.yaw, pitch: p.pitch, fov: this.lensFov(), aspect: this.camera.aspect };
  }

  private lensFov(): number {
    const naked = this.save.settings.fov;
    const lens = 55 + (this.save.perk === 'wide' ? 8 : 0);
    return naked + (lens - naked) * this.player.raiseT;
  }

  /** Is a world point inside the player's current view (naked-eye frustum) with line of sight? */
  inView(x: number, y: number, z: number): boolean {
    const pr = project({ ...this.camPose(), fov: this.save.settings.fov }, x, y, z);
    if (!pr || Math.abs(pr.nx) > 1.1 || Math.abs(pr.ny) > 1.1) return false;
    return this.world!.segmentClear(this.player.x, this.player.eye, this.player.z, x, y, z);
  }

  private trackSeen(pose: CamPose): void {
    const run = this.run!;
    const world = this.world!;
    for (const a of world.anomalies()) {
      if (run.photographed.has(a.uid) || run.missed.some((m) => m.uid === a.uid)) continue;
      const r = detect({ ...pose, fov: this.save.settings.fov }, a, true, (...q) => world.segmentClear(...q));
      if (r.ok && r.depth < 9) {
        const t = (run.seen.get(a.uid) ?? 0) + 0.25;
        run.seen.set(a.uid, t);
        if (t >= 1.0 && run.missed.length < 8) {
          const entry = { name: a.name, thumb: null as string | null, uid: a.uid };
          run.missed.push(entry);
          this.pendingThumbs.push((url) => (entry.thumb = url));
        }
      }
    }
  }

  private takePickup(id: string, m: THREE.Mesh, v: ChunkView): void {
    const run = this.run!;
    if (run.taken.has(id)) return;
    run.taken.add(id);
    v.group.remove(m);
    v.pickups.delete(id);
    this.player.battery = Math.min(1, this.player.battery + 0.35);
    audio.pickup();
    this.ui.toast('BATTERY  +35%');
  }

  interact(): void {
    const run = this.run;
    if (!run || this.mode !== 'play') return;
    const p = this.player;
    if (run.exit) {
      const d = Math.hypot(run.exit.x - p.x, run.exit.z - p.z);
      if (d < 2.0) {
        this.useExit();
        return;
      }
    }
    for (const v of this.views.values()) {
      for (const [id, m] of v.pickups) if (Math.hypot(m.position.x - p.x, m.position.z - p.z) < 1.6) this.takePickup(id, m, v);
    }
  }

  // ---------- Photos ----------
  snapPhoto(): { ok: boolean; name: string | null; reason: string } {
    const run = this.run;
    const p = this.player;
    if (!run || this.mode !== 'play' || !p.raised || run.photoCooldown > 0) return { ok: false, name: null, reason: 'unavailable' };
    run.photoCooldown = 0.6;
    const world = this.world!;
    const pose = this.camPose();
    p.battery = Math.max(0, p.battery - 0.004);
    // Photo flash, photosafe: large flashes go through the scheduler; otherwise a soft fade.
    this.flash = flicker.request('large', this.simTime) ? 0.55 : 0.12;
    audio.shutter();
    let best: AnomalyInstance | null = null;
    let bestDepth = 1e9;
    let inFrame = false;
    let failReason = '';
    for (const a of world.anomalies()) {
      if (run.photographed.has(a.uid)) continue;
      const r = detect(pose, a, p.inFocus, (...q) => world.segmentClear(...q));
      if (r.ok && r.depth < bestDepth) {
        best = a;
        bestDepth = r.depth;
      } else if (r.reason === 'focus' || r.reason === 'range') {
        inFrame = true;
        failReason = r.reason === 'focus' ? 'OUT OF FOCUS' : 'TOO FAR';
      }
    }
    // Photographing the Occupant itself counts once per level.
    const occ = this.occupant!;
    if (!best && occ.active && !run.noOccupant && !run.occPhotographed) {
      const pr = project(pose, occ.x, 1.3, occ.z);
      if (pr && Math.abs(pr.nx) < 0.9 && Math.abs(pr.ny) < 0.9 && pr.depth < 14 && world.segmentClear(pose.x, pose.y, pose.z, occ.x, 1.3, occ.z)) {
        run.occPhotographed = true;
        this.award(2, 'The Occupant', null);
        return { ok: true, name: 'The Occupant', reason: 'ok' };
      }
    }
    if (best) {
      run.photographed.add(best.uid);
      this.award(TIER_EVIDENCE[best.tier], best.name, best.tier);
      audio.goodPhoto(best.tier);
      return { ok: true, name: best.name, reason: 'ok' };
    }
    if (inFrame) {
      this.ui.toast(failReason, 1.4);
      const rec: PhotoRec = { name: failReason, thumb: null, ok: false };
      this.pendingThumbs.push((u) => (rec.thumb = u));
      return { ok: false, name: null, reason: failReason };
    }
    // False photo: extra battery and Doubt.
    p.battery = Math.max(0, p.battery - 0.03);
    run.doubt = 8;
    audio.falsePhoto();
    this.ui.toast('NOTHING WRONG HERE', 1.6);
    const rec: PhotoRec = { name: 'False photo', thumb: null, ok: false };
    run.photos.push(rec);
    this.pendingThumbs.push((u) => {
      rec.thumb = u;
      this.ui.thumb(u, false);
    });
    return { ok: false, name: null, reason: 'false' };
  }

  private award(n: number, name: string, tier: 1 | 2 | 3 | null): void {
    const run = this.run!;
    run.evidence += n;
    run.levelEvidence += n;
    if (tier) run.tiers[tier - 1]! += 1;
    const rec: PhotoRec = { name, thumb: null, ok: true };
    run.photos.push(rec);
    this.pendingThumbs.push((u) => {
      rec.thumb = u;
      this.ui.thumb(u, true);
    });
    const threshold = EVIDENCE_THRESHOLD[run.level] ?? 10;
    this.ui.toast(`EVIDENCE +${n}   ${Math.min(run.levelEvidence, threshold)} / ${threshold}`, 1.8);
  }

  // ---------- Exit ----------
  private manifestExit(): void {
    const run = this.run!;
    const world = this.world!;
    const p = this.player;
    const rng = Rng.from(run.seed, run.level, Math.floor(run.levelTime));
    const cands: { x: number; z: number; rot: number; nx: number; nz: number; d: number }[] = [];
    for (const wc of world.chunks.values()) {
      if (!this.views.has(world.key(wc.cx, wc.cz))) continue;
      for (const room of wc.rooms) {
        for (const s of wallSpots(wc, room)) {
          const d = Math.hypot(s.x - p.x, s.z - p.z);
          if (d < 9 || d > 26) continue;
          cands.push({ x: s.x, z: s.z, rot: s.rot, nx: s.nx, nz: s.nz, d });
        }
      }
    }
    rng.shuffle(cands);
    let pick = null as (typeof cands)[number] | null;
    for (const c of cands.slice(0, 60)) {
      if (this.inView(c.x + c.nx * 0.3, 1.2, c.z + c.nz * 0.3)) continue;
      const path = world.path(p.x, p.z, c.x + c.nx * 0.8, c.z + c.nz * 0.8, 3000);
      if (path && path.length >= 4 && path.length <= 22) {
        pick = c;
        break;
      }
    }
    if (!pick) pick = cands[0] ?? null;
    if (!pick) return;
    const g = buildExitDoor(materialsFor(run.level));
    g.position.set(pick.x + pick.nx * 0.005, 0, pick.z + pick.nz * 0.005);
    g.rotation.y = pick.rot;
    this.scene.add(g);
    run.exit = { x: pick.x + pick.nx * 0.4, z: pick.z + pick.nz * 0.4, rot: pick.rot, group: g };
    run.exitChime = 0.5;
    this.ui.toast('SOMETHING OPENED NEARBY', 3.5);
  }

  private useExit(): void {
    const run = this.run!;
    audio.fall();
    if (run.level === 0) {
      this.mode = 'transition';
      this.modeT = 0;
      this.ui.setFade(true, 500);
      window.setTimeout(() => {
        if (!this.run || this.mode !== 'transition') return;
        this.enterLevel(1);
      }, this.testMode ? 0 : 600);
      if (this.testMode) this.enterLevel(1);
      return;
    }
    // Escaping Level B ends the run in victory: back in the office, which is not quite right.
    run.escaped = true;
    run.cause = 'You walked back into the office. One thing in it is wrong now, and you know what to do about that.';
    this.lastTapeFrames = this.replayBuf.tail(REPLAY_PLAY_S);
    this.save.escapes += 1;
    this.mode = 'victory';
    this.modeT = 0;
    this.setupOffice(true);
    this.ui.hudOn(true);
  }

  // ---------- Death and replay ----------
  die(cause: string): void {
    const run = this.run;
    if (!run || this.mode !== 'play') return;
    run.cause = cause;
    run.deathAt = new Date(this.now());
    this.lastTapeFrames = this.replayBuf.tail(REPLAY_PLAY_S);
    this.mode = 'dying';
    this.modeT = 0;
    audio.death();
    this.ui.hudOn(false);
    if (this.logOpen) {
      this.ui.show(null);
      this.logOpen = false;
    }
  }

  private replayDuration(): number {
    const f = this.replayFrames;
    return f.length ? f[f.length - 1]!.t - f[0]!.t : 0;
  }

  private startReplay(label: string, after: () => void): void {
    this.replayFrames = this.lastTapeFrames.length ? this.lastTapeFrames : this.replayBuf.tail(REPLAY_PLAY_S);
    this.replayT = 0;
    this.replayLabel = label;
    this.afterReplay = after;
    this.mode = 'replay';
    this.modeT = 0;
    this.ui.setFade(false, 200);
    this.placeCctv();
    this.ui.replay(label, { skip: () => this.endReplay(), tape: this.tapeSupported() ? () => this.saveTape() : null });
    this.ui.show('replay');
    audio.replayHiss(true);
    if (this.run) this.save.lastTape = ReplayBuffer.encode(this.replayFrames);
  }

  private endReplay(): void {
    if (this.mode !== 'replay') return;
    this.stopRecording(false);
    audio.replayHiss(false);
    const after = this.afterReplay;
    this.afterReplay = null;
    after?.();
  }

  /** Ceiling-mounted CCTV near the event, with line of sight. */
  private placeCctv(): void {
    const f = this.replayFrames;
    const last = f[f.length - 1];
    if (!last || !this.world) {
      this.cctv.position.set(this.player.x, 2.4, this.player.z);
      return;
    }
    const world = this.world;
    const ceil = world.chunk(Math.floor(last.px / CHUNK_M), Math.floor(last.pz / CHUNK_M)).ceil;
    let best: [number, number] | null = null;
    let bestD = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [5.5, 4.5, 3.5, 2.5]) {
        const x = last.px + Math.cos(a) * r;
        const z = last.pz + Math.sin(a) * r;
        if (!world.segmentClear(x, ceil - 0.3, z, last.px, 1.2, last.pz)) continue;
        // Stay away from walls: test small offsets.
        const ok = world.segmentClear(x - 0.3, ceil - 0.3, z, x + 0.3, ceil - 0.3, z) && world.segmentClear(x, ceil - 0.3, z - 0.3, x, ceil - 0.3, z + 0.3);
        if (ok && r > bestD) {
          bestD = r;
          best = [x, z];
        }
        if (ok) break;
      }
    }
    const [cx, cz] = best ?? [last.px + 1, last.pz + 1];
    this.cctv.position.set(cx, ceil - 0.25, cz);
    this.cctv.lookAt(last.px, 1.0, last.pz);
  }

  private showSummary(): void {
    const run = this.run!;
    this.mode = 'summary';
    this.modeT = 0;
    this.ui.hudOn(false);
    this.input.unlock();
    // Bank and record.
    const before = unlockedIds(this.save.banked);
    this.save.banked += run.evidence;
    this.save.runs += 1;
    const rec = { evidence: run.evidence, depth: run.level + 1, time: run.time, escaped: run.escaped };
    const prevBest = this.save.best;
    if (!prevBest || rec.evidence > prevBest.evidence || (rec.evidence === prevBest.evidence && rec.time > prevBest.time)) this.save.best = rec;
    let share: string | null = null;
    if (run.daily) {
      const d = new Date();
      const date = utcDateString(d);
      if (this.save.daily.date !== date) {
        const yesterday = utcDateString(new Date(d.getTime() - 86400000));
        this.save.daily.streak = this.save.daily.lastDate === yesterday ? this.save.daily.streak + 1 : 1;
        this.save.daily.lastDate = date;
        this.save.daily.date = date;
        this.save.daily.best = null;
      }
      const db = this.save.daily.best;
      if (!db || rec.evidence > db.evidence) this.save.daily.best = rec;
      share = shareString(d, rec.depth, run.evidence, run.time, run.photos.map((p) => p.ok));
    }
    const after = unlockedIds(this.save.banked);
    const unlockedNow = UNLOCKS.filter((u) => after.has(u.id) && !before.has(u.id)).map((u) => u.name);
    this.persist();
    const missed = run.missed.filter((m) => !run.photographed.has(m.uid));
    this.ui.summary(
      {
        escaped: run.escaped,
        time: run.time,
        evidence: run.evidence,
        tiers: run.tiers,
        depth: run.level + 1,
        cause: run.cause,
        missed,
        photos: run.photos,
        best: prevBest,
        banked: this.save.banked,
        unlockedNow,
        daily: share,
        canSaveTape: this.tapeSupported(),
      },
      {
        restart: () => this.startRun({ daily: run.daily, skipIntro: true }),
        title: () => this.goTitle(),
        share: share
          ? () => {
              void navigator.clipboard?.writeText(share!).catch(() => {});
            }
          : null,
        tape: this.tapeSupported() ? () => this.saveTape() : null,
      },
    );
    this.ui.show('summary');
    this.lastShare = share;
  }
  lastShare: string | null = null;

  private endRun(cause: string, escaped: boolean): void {
    const run = this.run!;
    run.cause = cause;
    run.escaped = escaped;
    this.lastTapeFrames = this.replayBuf.tail(REPLAY_PLAY_S);
    this.ui.show(null);
    this.showSummary();
  }

  // ---------- Tape export ----------
  tapeSupported(): boolean {
    try {
      return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!this.tapeMime();
    } catch {
      return false;
    }
  }

  private tapeMime(): string | null {
    for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  saveTape(): void {
    if (!this.tapeSupported() || this.recorder || !this.lastTapeFrames.length) return;
    try {
      const src = this.renderer.domElement;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 960 / src.width);
      canvas.width = Math.round(src.width * scale);
      canvas.height = Math.round(src.height * scale);
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: this.tapeMime()!, videoBitsPerSecond: 2_500_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `fifty-hertz-tape-${Date.now()}.webm`;
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      };
      this.recorder = { rec, canvas, ctx, chunks };
      const wasSummary = this.mode === 'summary';
      if (wasSummary) {
        this.startReplay(this.replayLabel || 'INCIDENT', () => this.ui.show('summary'));
        this.afterReplay = () => {
          this.mode = 'summary';
          this.ui.show('summary');
        };
      }
      this.replayT = 0;
      rec.start(250);
    } catch {
      this.recorder = null;
    }
  }

  private stopRecording(finished: boolean): void {
    if (!this.recorder) return;
    try {
      this.recorder.rec.stop();
    } catch {
      /* ignore */
    }
    this.recorder = null;
    if (finished) this.endReplay();
  }

  // ---------- Misc ----------
  private placeNote(): void {
    const run = this.run!;
    const world = this.world!;
    const p = this.player;
    for (const wc of world.chunks.values()) {
      for (const room of wc.rooms) {
        for (const s of wallSpots(wc, room)) {
          const d = Math.hypot(s.x - p.x, s.z - p.z);
          if (d < 5 || d > 12 || this.inView(s.x, 1.4, s.z)) continue;
          const m = buildNote(materialsFor(run.level), 4);
          m.position.set(s.x + s.nx * 0.01, 1.4, s.z + s.nz * 0.01);
          m.rotation.y = s.rot;
          this.scene.add(m);
          this.noteMesh = m;
          run.noteShown = true;
          return;
        }
      }
    }
  }

  private finishIntro(): void {
    if (this.mode !== 'intro') return;
    this.save.seenIntro = true;
    this.persist();
    this.ui.setFade(true, 150);
    this.startRun(this.pendingStart);
  }

  now(): number {
    return this.timeOverride ?? Date.now();
  }

  // ---------- Rendering ----------
  private draw(): void {
    const r = this.renderer;
    r.info.reset();
    const tape = this.post;
    const d = new Date(this.now());
    shared.uClock.value = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    tape.u('uTime').value = this.simTime;
    tape.u('uFlash').value = this.flash;
    tape.u('uFilter').value = this.save.filter;
    let scene: THREE.Scene = this.scene;
    let cam: THREE.Camera = this.camera;
    tape.u('uCam').value = 0;
    tape.u('uNight').value = 0;
    tape.u('uReplay').value = 0;
    tape.u('uTear').value = 0;
    tape.u('uStatic').value = 0;
    tape.u('uFade').value = 0;
    shared.uNight.value = 0;
    shared.uLightScale.value = 1;
    this.camera.layers.disable(OCC_LAYER);
    this.standIn.visible = false;

    if (this.mode === 'title' || this.mode === 'intro' || this.mode === 'victory' || this.mode === 'boot' || (this.mode === 'dying' && this.run?.escaped)) {
      scene = this.officeScene;
      applyBiome(9, OFFICE_CEIL, 0);
      this.officeCamera();
      if (this.mode === 'victory') {
        tape.u('uCam').value = 1;
        this.ui.hudUpdate({ ...this.hudState(), raised: true });
      }
    } else if (this.run) {
      applyBiome(this.run.level, this.world?.ceil ?? 2.7, this.run.seed);
      if (this.mode === 'replay') {
        cam = this.cctv;
        this.drawReplay();
        tape.u('uReplay').value = 1;
      } else {
        this.playerCamera();
        const p = this.player;
        tape.u('uCam').value = p.raiseT > 0.5 ? 1 : 0;
        if (p.raised) this.camera.layers.enable(OCC_LAYER);
        if (p.night && p.raised) {
          tape.u('uNight').value = 1;
          shared.uNight.value = 1;
        }
        if (this.mode === 'dying') {
          tape.u('uTear').value = Math.min(1, this.modeT * 2);
          tape.u('uStatic').value = Math.max(0, (this.modeT - 0.35) * 1.6);
          this.camera.layers.enable(OCC_LAYER);
        }
        if (this.mode === 'transition') tape.u('uFade').value = Math.min(1, this.modeT * 2);
        this.updateDynamic();
        this.updateOccMesh();
        if (this.mode === 'play' || this.mode === 'pause') this.ui.hudUpdate(this.hudState());
      }
    }
    shared.uCamPos.value.copy((cam as THREE.PerspectiveCamera).position);
    (cam as THREE.PerspectiveCamera).getWorldDirection(shared.uCamDir.value);
    this.post.setCamera(cam, scene);
    this.post.draw();
    if (this.pendingThumbs.length) {
      const url = this.captureThumb();
      for (const f of this.pendingThumbs) f(url);
      this.pendingThumbs = [];
    }
    if (this.recorder) this.compositeTape();
    const p = this.player;
    const f = this.camera.getWorldDirection(new THREE.Vector3());
    audio.listener(p.x, p.eye, p.z, f.x, f.y, f.z);
  }

  private hudState(): Parameters<UI['hudUpdate']>[0] {
    const p = this.player;
    const run = this.run;
    const drainRate = (p.night ? 3 : 1) / (BATTERY_SECONDS * p.capacity);
    return {
      raised: p.raiseT > 0.5,
      battery: p.battery,
      batterySeconds: p.battery / drainRate,
      time: run?.time ?? 0,
      night: p.night,
      focus: p.inFocus,
      evidence: run?.levelEvidence ?? 0,
      threshold: EVIDENCE_THRESHOLD[run?.level ?? 0] ?? 10,
      stamina: p.stamina,
      prompt: this.promptText(),
      level: `LEVEL ${['A', 'B', 'C'][run?.level ?? 0]}  ${LEVEL_NAMES[run?.level ?? 0]!.toUpperCase()}`,
      recBlink: Math.floor(this.simTime * 1.6) % 2 === 0,
      exitOpen: !!run?.exit,
    };
  }

  private promptText(): string {
    const run = this.run;
    if (!run || this.mode !== 'play') return '';
    const p = this.player;
    if (run.exit && Math.hypot(run.exit.x - p.x, run.exit.z - p.z) < 2.0) return run.level === 0 ? 'E  GO THROUGH' : 'E  GO HOME';
    for (const v of this.views.values()) for (const m of v.pickups.values()) if (Math.hypot(m.position.x - p.x, m.position.z - p.z) < 1.6) return 'E  TAKE BATTERY';
    return '';
  }

  private playerCamera(): void {
    const p = this.player;
    const cam = this.camera;
    cam.position.set(p.x, p.eye + p.bob, p.z);
    cam.rotation.set(p.pitch, p.yaw + Math.PI, 0, 'YXZ');
    // Micro-shake synced to footsteps.
    if (this.save.settings.headBob) cam.rotation.z = Math.sin(p.bobPhase) * 0.004 * Math.min(1, p.speed / 2);
    const fov = this.lensFov();
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  private officeCamera(): void {
    const cam = this.camera;
    const t = this.modeT;
    cam.fov = 70;
    cam.updateProjectionMatrix();
    if (this.mode === 'intro') {
      this.introCamera(t);
      return;
    }
    if (this.mode === 'victory') {
      cam.position.set(10.6, 1.62, 3.6);
      cam.rotation.set(0.08 + Math.sin(t * 0.7) * 0.01, -Math.PI / 2 + Math.PI + 0.35 + Math.sin(t * 0.4) * 0.03, 0, 'YXZ');
      return;
    }
    // Title: slow drift through the office at night.
    const a = this.simTime * 0.05 + (this.testMode ? 0 : performance.now() / 20000);
    cam.position.set(6 + Math.sin(a) * 1.6, 1.55, 4 + Math.cos(a * 0.7) * 0.8);
    cam.rotation.set(-0.02, -Math.PI / 2 + Math.PI + Math.sin(a * 0.6) * 0.5, 0, 'YXZ');
  }

  /** Noclip intro: walk, lean on the wall, the wall flickers, fall through. About 17 seconds. */
  private introCamera(t: number): void {
    const cam = this.camera;
    const wall = this.office!.leanWall;
    let x = 2;
    let y = 1.62;
    let yaw = Math.PI / 2;
    let roll = 0;
    let pitch = 0;
    if (t < 7) {
      const k = t / 7;
      x = 2 + k * 8.6;
      y += Math.sin(t * 7.2) * 0.025;
      yaw = Math.PI / 2 + Math.sin(t * 0.6) * 0.12;
    } else if (t < 9.5) {
      const k = (t - 7) / 2.5;
      x = 10.6 + k * 0.7;
      pitch = -0.25 * k;
    } else if (t < 12) {
      x = 11.3;
      roll = -0.12;
      pitch = -0.25;
      y = 1.5;
    } else if (t < 14) {
      x = 11.3 + (t - 12) * 0.2;
      roll = -0.12;
      pitch = -0.25;
      y = 1.5;
    } else {
      const k = Math.min(1, (t - 14) / 2);
      x = 11.7 + k * 1.2;
      y = 1.5 - k * k * 4;
      pitch = -0.25 - k * 1.1;
      roll = -0.12 - k * 0.6;
    }
    // The wall flickers before you fall through (small-area flicker via the scheduler).
    if (t > 11 && t < 14.5) {
      if (this.flickerPulse > 0.5 || flicker.reduceFlicker) wall.visible = flicker.reduceFlicker ? t < 13.5 : false;
      else wall.visible = true;
      if (!flicker.reduceFlicker && this.flickerRng.next() < 0.25 && flicker.request('small', this.simTime)) this.flickerPulse = 1;
    } else wall.visible = t < 14.5;
    if (t > 14 && t < 14.05) audio.fall();
    if (t > 15.5) this.post.u('uFade').value = Math.min(1, (t - 15.5) / 1.2);
    cam.position.set(x, y, 4);
    cam.rotation.set(pitch, yaw + Math.PI, roll, 'YXZ');
  }

  private drawReplay(): void {
    const f = this.replayFrames;
    if (!f.length) return;
    const t0 = f[0]!.t;
    const t = Math.min(this.replayT, this.replayDuration());
    let i = 0;
    while (i < f.length - 1 && f[i + 1]!.t - t0 <= t) i++;
    const a = f[i]!;
    const b = f[Math.min(i + 1, f.length - 1)]!;
    const k = b.t > a.t ? Math.min(1, (t - (a.t - t0)) / (b.t - a.t)) : 0;
    const L = (u: number, v: number): number => u + (v - u) * k;
    this.standIn.visible = true;
    this.standIn.position.set(L(a.px, b.px), 0, L(a.pz, b.pz));
    this.standIn.rotation.y = a.yaw;
    this.occMesh.visible = a.oa === 1;
    this.occMesh.position.set(L(a.ox, b.ox), 0, L(a.oz, b.oz));
    this.occMesh.lookAt(this.standIn.position.x, 0, this.standIn.position.z);
    // The CCTV camera tracks slowly.
    const target = new THREE.Vector3(this.standIn.position.x, 1.0, this.standIn.position.z);
    const q0 = this.cctv.quaternion.clone();
    this.cctv.lookAt(target);
    this.cctv.quaternion.slerpQuaternions(q0, this.cctv.quaternion, 0.08);
    const when = new Date((this.run?.deathAt?.getTime() ?? this.now()) - (this.replayDuration() - t) * 1000);
    const mon = when.toLocaleString('en-AU', { month: 'short' }).toUpperCase();
    const stamp = `${mon} ${String(when.getDate()).padStart(2, '0')} ${when.getFullYear()}  ${when.toLocaleTimeString('en-AU', { hour12: false })}`;
    this.ui.replayStamp(stamp);
    this.replayStampText = stamp;
    if (a.flash) this.post.u('uFlash').value = Math.max(this.post.u('uFlash').value, 0.25);
    this.post.u('uStatic').value = t > this.replayDuration() - 0.4 ? 0.8 : 0;
  }
  private replayStampText = '';

  private compositeTape(): void {
    const r = this.recorder!;
    const { ctx, canvas } = r;
    ctx.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
    ctx.font = `${Math.round(canvas.height / 24)}px monospace`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(`CAM 04  ${this.replayLabel}`, 24, 40);
    ctx.fillText('TAPE 0042', 24, canvas.height - 24);
    const w = ctx.measureText(this.replayStampText).width;
    ctx.fillText(this.replayStampText, canvas.width - w - 24, 40);
  }

  private updateDynamic(): void {
    const p = this.player;
    for (const v of this.views.values()) {
      for (const d of v.dynamic) {
        if (d.kind === 'breathe') {
          const s = 1 + Math.sin(this.simTime * 1.25) * 0.035;
          d.mesh.scale.set(1 + (s - 1) * 0.6, s, 1 + (s - 1) * 0.6);
        } else if (d.kind === 'ring') {
          d.mesh.rotation.z = Math.sin(this.simTime * 60) * (this.simTime % 3 < 1 ? 0.04 : 0);
        } else if (d.kind === 'face') {
          // Turns to face you, but only while you are not looking at it.
          if (!this.inView(d.x, 0.5, d.z)) d.mesh.rotation.y = Math.atan2(p.x - d.x, p.z - d.z);
        }
      }
    }
  }

  private updateOccMesh(): void {
    const occ = this.occupant;
    const run = this.run;
    const on = !!occ && occ.active && !!run && !run.noOccupant;
    this.occMesh.visible = on;
    if (!on) return;
    this.occMesh.position.set(occ!.x, 0, occ!.z);
    const p = this.player;
    this.occMesh.rotation.y = Math.atan2(p.x - occ!.x, p.z - occ!.z);
    const m = (this.occMesh.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    m.uniforms.uGlitch!.value = occ!.moving ? 0.6 : 0.1;
    m.uniforms.uNightOcc!.value = p.night ? 1 : 0;
  }

  private captureThumb(): string {
    try {
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 108;
      c.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0, 192, 108);
      return c.toDataURL('image/jpeg', 0.72);
    } catch {
      return '';
    }
  }

  // ---------- Test hooks ----------
  installHooks(): void {
    const g = this;
    const hooks = {
      setSeed(n: number) {
        g.seedOverride = normaliseSeed(n);
      },
      startRun(o: StartOptions = {}) {
        audio.unlock();
        if (o.skipIntro === false) g.beginFromTitle(o);
        else g.startRun({ ...o, skipIntro: true });
        g.draw();
        return g.lastStartMs;
      },
      beginIntro() {
        g.beginFromTitle({});
      },
      step(frames: number) {
        for (let i = 0; i < frames; i++) g.step();
        while (g.buildQueue.length) g.buildOne();
        g.draw();
        return g.getState();
      },
      render() {
        g.draw();
      },
      teleport(x: number, z: number, yaw?: number) {
        g.player.x = x;
        g.player.z = z;
        if (yaw !== undefined) g.player.yaw = yaw;
        g.stream(true);
        g.draw();
      },
      aimAt(x: number, y: number, z: number) {
        const p = g.player;
        p.yaw = Math.atan2(x - p.x, z - p.z);
        p.pitch = Math.atan2(y - p.eye, Math.hypot(x - p.x, z - p.z));
      },
      raiseCamera(on: boolean) {
        g.raiseOverride = on;
      },
      setInput(v: Input['virtual']) {
        g.input.virtual = v;
      },
      snapPhoto() {
        g.run && (g.run.photoCooldown = 0);
        return g.snapPhoto();
      },
      interact() {
        g.interact();
      },
      getState() {
        return g.getState();
      },
      getRendererInfo() {
        const i = g.renderer.info;
        return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, chunks: g.views.size, chunkData: g.world?.chunks.size ?? 0 };
      },
      forceAnomaly(typeId: string) {
        return g.forceAnomaly(typeId);
      },
      killPlayer() {
        g.die('Caught by the Occupant.');
      },
      setTime(iso: string | null) {
        g.timeOverride = iso ? new Date(iso).getTime() : null;
      },
      forceOccupant(x: number, z: number, state?: string) {
        g.occupant?.forceAt(x, z, (state as never) ?? 'stalking');
      },
      forceEvidence(n: number) {
        if (!g.run) return;
        g.run.evidence += n;
        g.run.levelEvidence += n;
      },
      path(x: number, z: number) {
        return g.world?.path(g.player.x, g.player.z, x, z, 6000) ?? null;
      },
      skip() {
        if (g.mode === 'replay') g.endReplay();
        else if (g.mode === 'intro') g.finishIntro();
      },
      pressKey(code: string) {
        g.onKey(code);
      },
      mode() {
        return g.mode;
      },
      settings(s: Partial<Settings>) {
        g.applySettings({ ...g.save.settings, ...s });
        g.persist();
      },
      uniforms() {
        return { flickerPulse: shared.uFlickerPulse.value, flash: g.flash };
      },
      goTitle() {
        g.goTitle();
      },
      share() {
        return g.lastShare;
      },
      errors() {
        return g.errors;
      },
      bot(frames: number) {
        const bot = (g.bot ??= new Bot());
        for (let i = 0; i < frames; i++) {
          bot.tick(g);
          g.step();
        }
        while (g.buildQueue.length) g.buildOne();
        g.draw();
        return { mode: g.mode, level: g.run?.level ?? -1, evidence: g.run?.levelEvidence ?? 0, exit: !!g.run?.exit, log: bot.log.slice(-5), x: g.player.x, z: g.player.z };
      },
    };
    (window as unknown as { __HUM__: typeof hooks }).__HUM__ = hooks;
  }

  getState(): Record<string, unknown> {
    const p = this.player;
    const run = this.run;
    const occ = this.occupant;
    const anomalies: { uid: string; type: string; tier: number; x: number; y: number; z: number; inView: boolean; photographed: boolean }[] = [];
    if (this.world && run) {
      const pose = this.camPose();
      for (const a of this.world.anomalies()) {
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d > 40) continue;
        const r = detect(pose, a, true, (...q) => this.world!.segmentClear(...q));
        anomalies.push({ uid: a.uid, type: a.type, tier: a.tier, x: a.x, y: a.y, z: a.z, inView: r.ok, photographed: run.photographed.has(a.uid) });
      }
    }
    return {
      mode: this.mode,
      player: { x: p.x, z: p.z, eye: p.eye, yaw: p.yaw, pitch: p.pitch, raised: p.raised, night: p.night, stamina: p.stamina, inFocus: p.inFocus },
      battery: p.battery,
      evidence: run?.evidence ?? 0,
      levelEvidence: run?.levelEvidence ?? 0,
      threshold: EVIDENCE_THRESHOLD[run?.level ?? 0] ?? 10,
      level: run?.level ?? -1,
      time: run?.time ?? 0,
      seed: run?.seed ?? 0,
      occupant: occ ? { x: occ.x, z: occ.z, state: occ.state, active: occ.active, frozen: occ.frozen, distance: occ.active ? occ.dist : null } : null,
      occupantDistance: occ?.active ? occ.dist : null,
      anomaliesInView: anomalies.filter((a) => a.inView).map((a) => a.type),
      anomalies,
      exit: run?.exit ? { x: run.exit.x, z: run.exit.z } : null,
      photos: run?.photos.map((x) => ({ name: x.name, ok: x.ok })) ?? [],
      flash: this.flash,
      escaped: run?.escaped ?? false,
      banked: this.save.banked,
      replayFrames: this.replayFrames.length,
    };
  }

  forceAnomaly(typeId: string): AnomalyInstance | null {
    const t = ANOMALY_BY_ID.get(typeId);
    if (!t || !this.world || !this.run) return null;
    const p = this.player;
    const cx = Math.floor(p.x / CHUNK_M);
    const cz = Math.floor(p.z / CHUNK_M);
    const wc: WorldChunk = this.world.chunk(cx, cz);
    const lx = Math.floor((p.x - wc.ox) / CELL);
    const lz = Math.floor((p.z - wc.oz) / CELL);
    const roomId = wc.roomOf[lz * 16 + lx]!;
    const room = wc.rooms[roomId]!;
    const f = { wc, rng: Rng.from(this.run.seed, 555, wc.anomalies.length), reserved: new Uint8Array(256), used: new Uint8Array(256) };
    void cellFree;
    const inst = placeAnomaly(f, room, t, `forced:${wc.anomalies.length}`, this.run.level, f.rng);
    const k = this.world.key(cx, cz);
    const v = this.views.get(k);
    if (v) {
      this.scene.remove(v.group);
      v.dispose();
      this.views.delete(k);
    }
    this.buildQueue.unshift([cx, cz]);
    this.buildOne();
    return inst;
  }
}

export { BIOMES, PERKS };
