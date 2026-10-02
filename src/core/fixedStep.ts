/**
 * Fixed-timestep accumulator with bounded catch-up.
 *
 * Physics always advances in identical `step` increments regardless of the
 * monitor refresh rate. If the browser stalls (tab switch, GC hitch), at most
 * `maxStepsPerFrame` steps run and the remaining backlog is discarded instead
 * of fast-forwarding the world. `alpha` is the interpolation factor between the
 * previous and current simulation states for smooth rendering.
 */
export class FixedStepper {
  private accumulator = 0;
  alpha = 0;

  constructor(
    readonly step: number,
    private readonly maxStepsPerFrame: number,
  ) {}

  /** Returns the number of fixed steps to run this frame. */
  advance(frameSeconds: number): number {
    // Ignore absurd deltas outright (e.g. resuming after the tab was hidden).
    const dt = Math.min(Math.max(frameSeconds, 0), 0.25);
    this.accumulator += dt;
    let steps = Math.floor(this.accumulator / this.step);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.accumulator = 0; // drop backlog: never "fast-forward" the player
    } else {
      this.accumulator -= steps * this.step;
    }
    this.alpha = this.accumulator / this.step;
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
