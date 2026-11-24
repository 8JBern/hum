/** Keyboard, mouse and pointer lock. Tests can drive `virtual` instead. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  rmb = false;
  lmbPressed = false;
  locked = false;
  virtual: Partial<{ forward: number; strafe: number; sprint: boolean; crouch: boolean; raise: boolean; yawRate: number }> | null = null;
  onUnlock: () => void = () => {};
  onAnyKey: (code: string) => void = () => {};
  /** Touch stick, camcorder toggle and button actions (P2-07). */
  touchMove: { forward: number; strafe: number } | null = null;
  touchRaise = false;
  onTouchAction: (a: 'photo' | 'pause') => void = () => {};

  constructor(readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.onAnyKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.rmb = false;
      this.resetTouch();
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.rmb = true;
      if (e.button === 0) this.lmbPressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rmb = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (was && !this.locked) this.onUnlock();
    });
  }

  /** Drop touch stick and camcorder toggle state (new run, title, blur). */
  resetTouch(): void {
    this.touchMove = null;
    this.touchRaise = false;
    document.querySelectorAll('#touch button.on').forEach((b) => b.classList.remove('on'));
  }

  lock(): void {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* not available (tests, iframes) */
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Was any of these keys pressed since the last consume? */
  hit(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame(): void {
    this.pressed.clear();
    this.lmbPressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
