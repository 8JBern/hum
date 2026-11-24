/**
 * Touch controls (P2-07): left half of the screen is a move stick, right half drags to look,
 * plus buttons for the camcorder, photo, interact and pause. Shown only after the first touch.
 */
import type { Input } from './input.ts';

export function installTouch(input: Input, root: HTMLElement): void {
  const ui = document.createElement('div');
  ui.id = 'touch';
  ui.innerHTML = `
    <div class="stick"><div class="knob"></div></div>
    <button data-t="raise">CAM</button>
    <button data-t="photo">SNAP</button>
    <button data-t="use">USE</button>
    <button data-t="night">IR</button>
    <button data-t="pause">II</button>`;
  root.append(ui);
  const stick = ui.querySelector('.stick') as HTMLElement;
  const knob = ui.querySelector('.knob') as HTMLElement;
  let moveId: number | null = null;
  let lookId: number | null = null;
  let mx = 0;
  let my = 0;
  let lx = 0;
  let ly = 0;

  const on = (): void => {
    if (!document.body.classList.contains('touch')) document.body.classList.add('touch');
  };

  input.el.addEventListener(
    'touchstart',
    (e) => {
      on();
      input.onAnyKey('Touch');
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth / 2 && moveId === null) {
          moveId = t.identifier;
          mx = t.clientX;
          my = t.clientY;
          stick.style.left = `${mx - 60}px`;
          stick.style.top = `${my - 60}px`;
          stick.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    },
    { passive: false },
  );
  input.el.addEventListener(
    'touchmove',
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveId) {
          const dx = Math.max(-1, Math.min(1, (t.clientX - mx) / 50));
          const dy = Math.max(-1, Math.min(1, (t.clientY - my) / 50));
          input.touchMove = { forward: -dy, strafe: dx };
          knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
        } else if (t.identifier === lookId && document.body.dataset.mode === 'play') {
          input.mouseDX += (t.clientX - lx) * 1.6;
          input.mouseDY += (t.clientY - ly) * 1.6;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    },
    { passive: false },
  );
  const end = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === moveId) {
        moveId = null;
        input.touchMove = null;
        knob.style.transform = '';
        stick.classList.remove('on');
      } else if (t.identifier === lookId) lookId = null;
    }
  };
  input.el.addEventListener('touchend', end);
  input.el.addEventListener('touchcancel', end);

  const press = (code: string): void => {
    input.pressed.add(code);
    input.onAnyKey(code);
  };
  for (const b of Array.from(ui.querySelectorAll('button'))) {
    b.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = b.dataset.t;
        if (t === 'raise') {
          input.touchRaise = !input.touchRaise;
          b.classList.toggle('on', input.touchRaise);
        } else if (t === 'photo') input.onTouchAction('photo');
        else if (t === 'use') press('KeyE');
        else if (t === 'night') press('KeyN');
        else if (t === 'pause') input.onTouchAction('pause');
      },
      { passive: false },
    );
  }
}
