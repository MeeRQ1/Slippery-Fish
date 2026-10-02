/**
 * Collects cleanup callbacks (listeners, timers, rAF loops, audio nodes) so a
 * screen or scene can release everything it created in one call.
 */
export class Disposer {
  private fns: Array<() => void> = [];
  private disposed = false;

  add(fn: () => void): void {
    if (this.disposed) {
      fn();
      return;
    }
    this.fns.push(fn);
  }

  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.add(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.add(() => window.clearTimeout(id));
    return id;
  }

  interval(fn: () => void, ms: number): number {
    const id = window.setInterval(fn, ms);
    this.add(() => window.clearInterval(id));
    return id;
  }

  /** requestAnimationFrame loop; callback receives dt in seconds (clamped). */
  frameLoop(fn: (dt: number, now: number) => void): void {
    let last = performance.now();
    let id = 0;
    const tick = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      fn(dt, now);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    this.add(() => cancelAnimationFrame(id));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const fns = this.fns.reverse();
    this.fns = [];
    for (const fn of fns) {
      try {
        fn();
      } catch (err) {
        console.warn('[Disposer] cleanup failed', err);
      }
    }
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}
