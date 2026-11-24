/** DOM overlay: menus, HUD, summary, archive, settings. Vanilla TypeScript. */
import type { SaveData, Settings } from '../core/save.ts';
import { GAME_TITLE, formatClock } from '../core/daily.ts';
import { LORE, PERKS, UNLOCKS, nextUnlock, unlockedIds } from '../gameplay/meta.ts';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface SummaryData {
  escaped: boolean;
  time: number;
  evidence: number;
  tiers: [number, number, number];
  depth: number;
  cause: string;
  missed: { name: string; thumb: string | null }[];
  photos: { name: string; thumb: string | null; ok: boolean }[];
  best: { evidence: number; time: number; depth: number } | null;
  banked: number;
  unlockedNow: string[];
  daily: string | null;
  canSaveTape: boolean;
}

export class UI {
  root = h('div', { class: 'ui' });
  screens = new Map<string, HTMLElement>();
  hud!: HTMLElement;
  private hudEls: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  fade = h('div', { class: 'fade' });

  constructor() {
    document.body.append(this.root, this.fade);
    for (const id of ['title', 'warning', 'settings', 'archive', 'pause', 'log', 'summary', 'replay', 'intro', 'loading']) {
      const s = h('div', { class: 'screen center', id });
      this.screens.set(id, s);
      this.root.append(s);
    }
    this.buildHud();
    // Keyboard navigation inside menus.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
      const scr = [...this.screens.values()].find((s) => s.classList.contains('on'));
      if (!scr) return;
      const items = [...scr.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const n = e.code === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[n]!.focus();
      e.preventDefault();
    });
  }

  show(id: string | null): void {
    for (const [k, s] of this.screens) s.classList.toggle('on', k === id);
    if (id) {
      const first = this.screens.get(id)!.querySelector<HTMLElement>('[data-autofocus], button:not([disabled])');
      first?.focus({ preventScroll: true });
    }
  }

  get current(): string | null {
    for (const [k, s] of this.screens) if (s.classList.contains('on')) return k;
    return null;
  }

  // ---------- Title ----------
  title(save: SaveData, cb: { start: () => void; daily: () => void; archive: () => void; settings: () => void }, dailyLabel: string): void {
    const s = this.screens.get('title')!;
    s.className = 'screen';
    s.id = 'title';
    const badge = unlockedIds(save.banked).has('badge') && save.daily.streak > 0 ? `<div class="small">Night shift badge: ${save.daily.streak} day streak</div>` : '';
    s.innerHTML = `<div>
      <div class="logo">${GAME_TITLE}</div>
      <div class="tag">Film what is wrong. Do not lower the camera.</div>
      <div class="menu">
        <button data-a="start" data-autofocus>Start shift</button>
        <button data-a="daily">Daily Shift ${esc(dailyLabel)}</button>
        <button data-a="archive">Archive</button>
        <button data-a="settings">Settings</button>
      </div>
      ${badge}
    </div>
    <div class="foot">Banked evidence ${save.banked} &middot; Tapes ${save.runs}<br/>Headphones recommended</div>`;
    s.querySelector('[data-a=start]')!.addEventListener('click', cb.start);
    s.querySelector('[data-a=daily]')!.addEventListener('click', cb.daily);
    s.querySelector('[data-a=archive]')!.addEventListener('click', cb.archive);
    s.querySelector('[data-a=settings]')!.addEventListener('click', cb.settings);
  }

  warning(onOk: () => void): void {
    const s = this.screens.get('warning')!;
    s.innerHTML = `<div class="card warn" role="dialog" aria-labelledby="warn-h">
      <h2 id="warn-h">Before you clock in</h2>
      <p>${GAME_TITLE} is a horror game. It contains unsettling themes, sudden loud sounds, and flickering light.</p>
      <p>Flicker is limited to a photosafe level by default, and you can remove it entirely in Settings with Reduce flicker. Calm mode removes the sudden rushes.</p>
      <p>Best with headphones. Audio starts when you continue.</p>
      <div class="row"><button data-autofocus>Continue</button></div>
    </div>`;
    s.querySelector('button')!.addEventListener('click', onOk);
  }

  // ---------- Settings ----------
  settings(st: Settings, onChange: (s: Settings) => void, onBack: () => void): void {
    const s = this.screens.get('settings')!;
    const range = (k: keyof Settings, min: number, max: number, step: number, label: string): string =>
      `<label for="s-${k}">${label}</label><input id="s-${k}" data-k="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${st[k] as number}">`;
    const check = (k: keyof Settings, label: string): string => `<label for="s-${k}">${label}</label><input id="s-${k}" data-k="${k}" type="checkbox" ${st[k] ? 'checked' : ''}>`;
    const select = (k: keyof Settings, label: string, opts: [string, string][]): string =>
      `<label for="s-${k}">${label}</label><select id="s-${k}" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${st[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    s.innerHTML = `<div class="card">
      <h2>Settings</h2>
      <div class="set">
        ${range('master', 0, 1, 0.05, 'Master volume')}
        ${range('ambience', 0, 1, 0.05, 'Ambience volume')}
        ${range('effects', 0, 1, 0.05, 'Effects volume')}
        ${range('sensitivity', 0.2, 3, 0.05, 'Mouse sensitivity')}
        ${check('invertY', 'Invert Y')}
        ${range('fov', 70, 100, 1, 'Field of view')}
        ${check('headBob', 'Head bob')}
        ${check('motionBlur', 'Motion blur')}
        ${check('soundCues', 'Visual sound indicators')}
        ${select('scare', 'Scare intensity', [
          ['full', 'Full'],
          ['reduced', 'Reduced'],
          ['calm', 'Calm (no rushes)'],
        ])}
        ${check('reduceFlicker', 'Reduce flicker (removes all flicker)')}
        ${select('quality', 'Quality', [
          ['auto', 'Auto'],
          ['low', 'Low'],
          ['medium', 'Medium'],
          ['high', 'High'],
        ])}
      </div>
      <div class="row"><button data-a="back">Back</button></div>
    </div>`;
    s.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof Settings;
        const next = { ...st } as Record<string, unknown>;
        if (inp instanceof HTMLInputElement && inp.type === 'checkbox') next[k] = inp.checked;
        else if (inp instanceof HTMLInputElement) next[k] = Number(inp.value);
        else next[k] = inp.value;
        st = next as unknown as Settings;
        onChange(st);
      });
    });
    s.querySelector('[data-a=back]')!.addEventListener('click', onBack);
  }

  // ---------- Archive ----------
  archive(save: SaveData, cb: { back: () => void; perk: (id: string | null) => void; filter: (n: number) => void }): void {
    const s = this.screens.get('archive')!;
    const have = unlockedIds(save.banked);
    const nu = nextUnlock(save.banked);
    const rows = UNLOCKS.map((u) => {
      const got = have.has(u.id);
      let action = '';
      if (got && u.kind === 'lore') action = `<button data-lore="${u.id}">Play</button>`;
      if (got && u.kind === 'filter') action = `<button data-filter="${u.detail}">${save.filter === Number(u.detail) ? 'On' : 'Use'}</button>`;
      return `<div class="unlock ${got ? '' : 'locked'}"><span>${u.cost}</span><span>${esc(u.name)}${u.kind === 'perk' || u.kind === 'badge' || u.kind === 'photo' ? `<br><span class="small">${esc(u.detail)}</span>` : ''}</span><span>${action}</span></div>`;
    }).join('');
    const perks = have.has('perks')
      ? `<h3 style="margin-top:18px">Perk slot</h3><div class="row">${PERKS.map((p) => `<button data-perk="${p.id}" title="${esc(p.detail)}">${save.perk === p.id ? '[x] ' : ''}${esc(p.name)}</button>`).join('')}<button data-perk="">None</button></div><p class="small">${esc(PERKS.find((p) => p.id === save.perk)?.detail ?? 'No perk equipped.')}</p>`
      : '';
    s.innerHTML = `<div class="card">
      <h2>Archive</h2>
      <p>Banked evidence: ${save.banked}. ${nu ? `Next: ${esc(nu.name)} at ${nu.cost}.` : 'Everything is unlocked.'} Unlocks arrive automatically as you bank evidence.</p>
      ${save.filter ? `<div class="row"><button data-filter="0">Filter off</button></div>` : ''}
      <div>${rows}</div>
      ${perks}
      <div class="lore" aria-live="polite"></div>
      <div class="row"><button data-a="back" data-autofocus>Back</button></div>
    </div>`;
    const lore = s.querySelector<HTMLElement>('.lore')!;
    let typing = 0;
    s.querySelectorAll<HTMLButtonElement>('[data-lore]').forEach((b) =>
      b.addEventListener('click', () => {
        const text = (LORE[b.dataset.lore!] ?? []).join('\n\n');
        window.clearInterval(typing);
        lore.textContent = '';
        let i = 0;
        typing = window.setInterval(() => {
          i += 2;
          lore.textContent = text.slice(0, i);
          if (i >= text.length) window.clearInterval(typing);
        }, 22);
      }),
    );
    s.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((b) => b.addEventListener('click', () => cb.perk(b.dataset.perk || null)));
    s.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => cb.filter(Number(b.dataset.filter))));
    s.querySelector('[data-a=back]')!.addEventListener('click', () => {
      window.clearInterval(typing);
      cb.back();
    });
  }

  // ---------- Pause ----------
  pause(sessionSeconds: number, cb: { resume: () => void; settings: () => void; abandon: () => void; photo: (() => void) | null }): void {
    const s = this.screens.get('pause')!;
    const t = Math.floor(sessionSeconds);
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    s.innerHTML = `<div class="card">
      <h2>Paused</h2>
      <p data-clock>You have been here for ${hh}:${mm}:${ss}</p>
      <div class="menu">
        <button data-a="resume" data-autofocus>Resume</button>
        <button data-a="settings">Settings</button>
        ${cb.photo ? '<button data-a="photo">Photo mode</button>' : ''}
        <button data-a="abandon">End this tape</button>
      </div>
      <p class="small" style="margin-top:14px">WASD move &middot; Mouse look &middot; Shift sprint &middot; Ctrl or C crouch &middot; Right mouse or Space raise camera &middot; Left click photo &middot; N night mode &middot; E interact &middot; Tab evidence log</p>
    </div>`;
    s.querySelector('[data-a=resume]')!.addEventListener('click', cb.resume);
    s.querySelector('[data-a=settings]')!.addEventListener('click', cb.settings);
    s.querySelector('[data-a=abandon]')!.addEventListener('click', cb.abandon);
    if (cb.photo) s.querySelector('[data-a=photo]')!.addEventListener('click', cb.photo);
  }

  updatePauseClock(sessionSeconds: number): void {
    const p = this.screens.get('pause')!.querySelector('[data-clock]');
    if (!p) return;
    const t = Math.floor(sessionSeconds);
    p.textContent = `You have been here for ${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }

  // ---------- Evidence log ----------
  log(photos: { name: string; thumb: string | null; ok: boolean }[], evidence: number, threshold: number): void {
    const s = this.screens.get('log')!;
    s.innerHTML = `<div class="card"><h2>Evidence log</h2><p>Evidence ${evidence} of ${threshold} needed to find the way down.</p>
      <div class="log">${photos.map((p) => `<figure>${p.thumb ? `<img src="${p.thumb}" alt="">` : ''}<figcaption>${p.ok ? esc(p.name) : 'Nothing wrong here'}</figcaption></figure>`).join('') || '<p>No photos yet.</p>'}</div>
      <p class="small">Release Tab to close.</p></div>`;
  }

  // ---------- Summary ----------
  summary(d: SummaryData, cb: { restart: () => void; title: () => void; share: (() => void) | null; tape: (() => void) | null }): void {
    const s = this.screens.get('summary')!;
    const best = d.best ? `${d.best.evidence} evidence, depth ${d.best.depth}, ${formatClock(d.best.time)}` : 'This is your first tape.';
    s.innerHTML = `<div class="card" style="max-width:760px">
      <h2>${d.escaped ? 'You found the way out' : 'Tape ends'}</h2>
      <p>${esc(d.cause)}</p>
      <div class="stats">
        <span>Time survived</span><span>${formatClock(d.time)}</span>
        <span>Evidence</span><span>${d.evidence} (obvious ${d.tiers[0]}, odd ${d.tiers[1]}, subtle ${d.tiers[2]})</span>
        <span>Depth</span><span>${d.depth}</span>
        <span>Best tape</span><span>${best}</span>
        <span>Banked total</span><span>${d.banked}</span>
      </div>
      ${d.unlockedNow.length ? `<p style="color:var(--accent)">Unlocked: ${d.unlockedNow.map(esc).join(', ')}</p>` : ''}
      ${d.photos.length ? `<h3>Your photos</h3><div class="log">${d.photos.map((p) => `<figure>${p.thumb ? `<img src="${p.thumb}" alt="">` : ''}<figcaption>${p.ok ? esc(p.name) : 'False photo'}</figcaption></figure>`).join('')}</div>` : ''}
      ${d.missed.length ? `<h3>You walked past</h3><div class="log">${d.missed.map((p) => `<figure>${p.thumb ? `<img class="blur" src="${p.thumb}" alt="">` : ''}<figcaption>Something was wrong here</figcaption></figure>`).join('')}</div>` : ''}
      ${d.daily ? `<p class="small" data-share>${esc(d.daily)}</p>` : ''}
      <div class="row">
        <button data-a="restart" data-autofocus>New tape (R)</button>
        ${cb.share ? '<button data-a="share">Copy share text</button>' : ''}
        ${cb.tape ? '<button data-a="tape">Save tape</button>' : '<span class="small">Tape export is not supported in this browser.</span>'}
        <button data-a="title">Title</button>
      </div>
    </div>`;
    s.querySelector('[data-a=restart]')!.addEventListener('click', cb.restart);
    s.querySelector('[data-a=title]')!.addEventListener('click', cb.title);
    if (cb.share) s.querySelector('[data-a=share]')!.addEventListener('click', cb.share);
    if (cb.tape) s.querySelector('[data-a=tape]')!.addEventListener('click', cb.tape);
  }

  // ---------- Replay overlay ----------
  replay(label: string, cb: { skip: () => void; tape: (() => void) | null }): void {
    const s = this.screens.get('replay')!;
    s.className = 'screen';
    s.id = 'replay';
    s.innerHTML = `<div class="tl">CAM 04 &middot; ${esc(label)}</div><div class="tr" data-ts></div><div class="bl">PLAY &#9654; &middot; TAPE 0042</div>
      <div class="br"><button data-a="skip" data-autofocus>Continue</button>${cb.tape ? '<button data-a="tape">Save tape</button>' : ''}</div>`;
    s.querySelector('[data-a=skip]')!.addEventListener('click', cb.skip);
    if (cb.tape) s.querySelector('[data-a=tape]')!.addEventListener('click', cb.tape);
  }

  replayStamp(text: string): void {
    const e = this.screens.get('replay')!.querySelector('[data-ts]');
    if (e) e.textContent = text;
  }

  intro(skippable: boolean): void {
    const s = this.screens.get('intro')!;
    s.className = 'screen';
    s.id = 'intro';
    s.innerHTML = skippable ? '<div class="intro-hint">Press any key to skip</div>' : '';
  }

  // ---------- HUD ----------
  private buildHud(): void {
    this.hud = h('div', { id: 'hud' });
    this.hud.innerHTML = `
      <div class="reticle"></div>
      <div class="vf"><div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="rec"><i></i>REC</div><div class="tc">00:00:00</div><div class="mode">AUTO</div><div class="focus"></div>
        <div class="bat"><span class="bt">--</span><div class="cell"><b></b></div></div>
      </div>
      <div class="naked"></div>
      <div class="stamina"><b></b></div>
      <div class="prompt"></div>
      <div class="toast"></div>
      <div class="thumbs"></div>
      <div class="subs"></div>`;
    this.root.append(this.hud);
    for (const k of ['vf', 'rec', 'tc', 'mode', 'focus', 'bat', 'bt', 'naked', 'stamina', 'prompt', 'toast', 'thumbs', 'subs', 'reticle']) this.hudEls[k] = this.hud.querySelector(`.${k}`)!;
    this.hudEls.cell = this.hud.querySelector('.cell b')!;
    this.hudEls.stb = this.hud.querySelector('.stamina b')!;
  }

  hudOn(on: boolean): void {
    this.hud.classList.toggle('on', on);
  }

  hudUpdate(s: { raised: boolean; battery: number; batterySeconds: number; time: number; night: boolean; focus: boolean; evidence: number; threshold: number; stamina: number; prompt: string; level: string; recBlink: boolean; exitOpen: boolean }): void {
    const e = this.hudEls;
    e.vf!.classList.toggle('on', s.raised);
    e.reticle!.style.display = s.raised ? 'none' : 'block';
    e.naked!.style.opacity = s.raised ? '0' : '1';
    const t = Math.floor(s.time);
    e.tc!.textContent = `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    (e.rec!.querySelector('i') as HTMLElement).style.visibility = s.recBlink ? 'visible' : 'hidden';
    e.mode!.textContent = s.night ? 'NIGHT  IR' : 'AUTO';
    e.focus!.classList.toggle('ok', s.focus);
    e.cell!.style.width = `${Math.max(0, Math.min(1, s.battery)) * 56}px`;
    const m = Math.floor(s.batterySeconds / 60);
    const sec = Math.floor(s.batterySeconds % 60);
    e.bt!.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    e.bat!.classList.toggle('low', s.battery < 0.2);
    e.naked!.innerHTML = `${esc(s.level)}<br>Evidence ${s.evidence} / ${s.threshold}${s.exitOpen ? '<br>Something opened nearby' : ''}<br>Battery ${Math.round(s.battery * 100)}%`;
    e.stamina!.style.opacity = s.stamina < 0.99 ? '1' : '0';
    e.stb!.style.width = `${s.stamina * 100}%`;
    e.prompt!.textContent = s.prompt;
  }

  toast(text: string, seconds = 2.6): void {
    const t = this.hudEls.toast!;
    t.textContent = text;
    t.classList.add('on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), seconds * 1000);
  }

  thumb(src: string | null, ok: boolean): void {
    if (!src) return;
    const img = h('img', { src, class: ok ? '' : 'bad', alt: '' });
    const box = this.hudEls.thumbs!;
    box.prepend(img);
    while (box.children.length > 3) box.lastChild!.remove();
    window.setTimeout(() => img.remove(), 4500);
  }

  sub(text: string, dir: number | null): void {
    const box = this.hudEls.subs!;
    const arrow = dir === null ? '' : dir < -0.35 ? '< ' : dir > 0.35 ? '' : '';
    const tail = dir !== null && dir > 0.35 ? ' >' : '';
    const sp = h('span', {}, `${arrow}${text}${tail}`);
    box.append(sp);
    while (box.children.length > 3) box.firstChild!.remove();
    window.setTimeout(() => sp.remove(), 2800);
  }

  clearHudTransient(): void {
    this.hudEls.thumbs!.innerHTML = '';
    this.hudEls.subs!.innerHTML = '';
    this.hudEls.toast!.classList.remove('on');
  }

  setFade(on: boolean, ms = 600): void {
    this.fade.style.transitionDuration = `${ms}ms`;
    this.fade.classList.toggle('on', on);
  }
}
