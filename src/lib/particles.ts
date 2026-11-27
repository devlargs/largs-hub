/**
 * Pure simulation for the welcome screen's particle field. The canvas component
 * (`components/welcome/ParticleField.tsx`) owns drawing and the animation loop;
 * everything here is deterministic given `rand`, so it is unit-tested.
 */

export interface Particle {
  x: number;
  y: number;
  /** Current velocity, px per second. */
  vx: number;
  vy: number;
  /** Resting drift velocity the particle eases back to after being pushed. */
  baseVx: number;
  baseVy: number;
  radius: number;
  alpha: number;
  /** Twinkle phase offset, radians. */
  phase: number;
}

export interface Pointer {
  x: number;
  y: number;
}

/** Radius around the pointer inside which particles get pushed away, px. */
export const POINTER_RADIUS = 120;
/** Max distance at which two particles are joined by a line, px. */
export const LINK_DISTANCE = 110;

const PUSH_STRENGTH = 900;
const EASE_RATE = 1.5;
const MAX_SPEED = 160;

/** One particle per ~14k px², clamped so tiny and huge windows both look right. */
export function particleCount(width: number, height: number): number {
  return Math.max(24, Math.min(110, Math.round((width * height) / 14000)));
}

export function createParticles(
  count: number,
  width: number,
  height: number,
  rand: () => number = Math.random,
): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const speed = 4 + rand() * 12;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    return {
      x: rand() * width,
      y: rand() * height,
      vx,
      vy,
      baseVx: vx,
      baseVy: vy,
      radius: 0.6 + rand() * 1.2,
      alpha: 0.15 + rand() * 0.35,
      phase: rand() * Math.PI * 2,
    };
  });
}

/** Wraps a coordinate into [0, size), so a particle leaving one edge enters the opposite one. */
export function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  return ((value % size) + size) % size;
}

/**
 * Advances every particle by `dt` seconds, in place: pointer repulsion, easing
 * back to the resting drift, a speed cap, and wrap-around at the edges.
 */
export function stepParticles(
  particles: Particle[],
  dt: number,
  width: number,
  height: number,
  pointer: Pointer | null,
): void {
  // A long frame (tab in the background, a breakpoint) shouldn't teleport particles.
  const t = Math.min(Math.max(dt, 0), 0.05);
  const ease = Math.min(1, EASE_RATE * t);
  for (const p of particles) {
    if (pointer) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < POINTER_RADIUS) {
        const force = (1 - dist / POINTER_RADIUS) * PUSH_STRENGTH * t;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }
    }
    p.vx += (p.baseVx - p.vx) * ease;
    p.vy += (p.baseVy - p.vy) * ease;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > MAX_SPEED) {
      p.vx = (p.vx / speed) * MAX_SPEED;
      p.vy = (p.vy / speed) * MAX_SPEED;
    }
    p.x = wrap(p.x + p.vx * t, width);
    p.y = wrap(p.y + p.vy * t, height);
  }
}

/** Opacity of a link line between two points: 0 at `LINK_DISTANCE`, up to `max` when touching. */
export function linkAlpha(distance: number, max = 0.18): number {
  if (distance >= LINK_DISTANCE) return 0;
  return (1 - distance / LINK_DISTANCE) * max;
}
