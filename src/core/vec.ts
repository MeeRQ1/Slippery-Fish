/** Minimal 2D vector helpers on plain objects (allocation-light). */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const dist = (a: Vec2, b: Vec2): number => len(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const dot = (ax: number, ay: number, bx: number, by: number): number => ax * bx + ay * by;
