/**
 * Touch controls: a floating virtual joystick (left zone) and a held SPRINT
 * button (right zone). Each uses its own pointer id with pointer capture, so
 * steering and sprinting work simultaneously with two thumbs. Cancels and
 * lost captures always release. Scrolling is prevented only on these zones.
 */
import { Disposer } from '../../core/disposer';
import type { InputManager } from '../../input/inputManager';
import { h } from '../dom';

export class TouchControls {
  readonly el: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private sprintBtn: HTMLElement;
  private joyPointer: number | null = null;
  private sprintPointer: number | null = null;
  private ox = 0;
  private oy = 0;
  private readonly radius = 56;
  private d = new Disposer();

  constructor(private input: InputManager, swapSides: boolean, private onAnyTouch: () => void) {
    this.knob = h('div', { class: 'joy-knob' });
    this.base = h('div', { class: 'joy-base' }, this.knob);
    const joyZone = h('div', { class: `joy-zone ${swapSides ? 'right' : 'left'}` }, this.base);
    this.sprintBtn = h('div', { class: 'sprint-btn', attrs: { role: 'button', 'aria-label': 'Sprint (hold)' } },
      h('span', { class: 'sprint-ico', text: '⚡' }), h('span', { class: 'sprint-txt', text: 'SPRINT' }));
    const sprintZone = h('div', { class: `sprint-zone ${swapSides ? 'left' : 'right'}` }, this.sprintBtn);
    this.el = h('div', { class: 'touch-controls' }, joyZone, sprintZone);

    const opt = { passive: false } as AddEventListenerOptions;
    this.d.listen(joyZone, 'pointerdown', (e) => this.joyDown(e, joyZone), opt);
    this.d.listen(joyZone, 'pointermove', (e) => this.joyMove(e), opt);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.d.listen(joyZone, t, (e) => this.joyUp(e));
    this.d.listen(this.sprintBtn, 'pointerdown', (e) => this.sprintDown(e), opt);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.d.listen(this.sprintBtn, t, (e) => this.sprintUp(e));
    this.d.listen(this.el, 'contextmenu', (e) => e.preventDefault());
  }

  private joyDown(e: PointerEvent, zone: HTMLElement): void {
    if (this.joyPointer !== null) return;
    e.preventDefault();
    this.onAnyTouch();
    this.joyPointer = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    // Floating joystick: centre wherever the thumb lands (clamped inside the zone).
    this.ox = Math.min(r.right - this.radius, Math.max(r.left + this.radius, e.clientX));
    this.oy = Math.min(r.bottom - this.radius, Math.max(r.top + this.radius, e.clientY));
    this.base.style.left = `${this.ox - r.left}px`;
    this.base.style.top = `${this.oy - r.top}px`;
    this.base.classList.add('active');
    this.joyMove(e);
  }

  private joyMove(e: PointerEvent): void {
    if (e.pointerId !== this.joyPointer) return;
    e.preventDefault();
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const l = Math.hypot(dx, dy);
    if (l > this.radius) { dx *= this.radius / l; dy *= this.radius / l; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Small dead zone, then full analogue range (reaches max speed before the rim).
    const mag = Math.min(1, Math.max(0, (l - 6) / (this.radius * 0.8 - 6)));
    const ang = Math.atan2(dy, dx);
    this.input.setJoystick(l > 6 ? Math.cos(ang) * mag : 0, l > 6 ? Math.sin(ang) * mag : 0);
  }

  private joyUp(e: PointerEvent): void {
    if (e.pointerId !== this.joyPointer) return;
    this.joyPointer = null;
    this.knob.style.transform = '';
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
    this.input.setJoystick(0, 0);
  }

  private sprintDown(e: PointerEvent): void {
    if (this.sprintPointer !== null) return;
    e.preventDefault();
    this.onAnyTouch();
    this.sprintPointer = e.pointerId;
    this.sprintBtn.setPointerCapture(e.pointerId);
    this.sprintBtn.classList.add('held');
    this.input.setTouchSprint(true);
  }

  private sprintUp(e: PointerEvent): void {
    if (e.pointerId !== this.sprintPointer) return;
    this.sprintPointer = null;
    this.sprintBtn.classList.remove('held');
    this.input.setTouchSprint(false);
  }

  /** Visual availability of sprint (dims when exhausted). */
  setSprintAvailable(available: boolean, low: boolean): void {
    this.sprintBtn.classList.toggle('unavailable', !available);
    this.sprintBtn.classList.toggle('low', available && low);
  }

  releaseAll(): void {
    this.joyPointer = null;
    this.sprintPointer = null;
    this.knob.style.transform = '';
    this.base.classList.remove('active');
    this.sprintBtn.classList.remove('held');
    this.input.setJoystick(0, 0);
    this.input.setTouchSprint(false);
  }

  destroy(): void {
    this.releaseAll();
    this.d.dispose();
    this.el.remove();
  }
}
