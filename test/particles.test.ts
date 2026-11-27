import { describe, expect, it } from "vitest";
import {
  createParticles,
  LINK_DISTANCE,
  linkAlpha,
  particleCount,
  POINTER_RADIUS,
  stepParticles,
  wrap,
  type Particle,
} from "../src/lib/particles";

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function particle(over: Partial<Particle> = {}): Particle {
  return {
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    baseVx: 0,
    baseVy: 0,
    radius: 1,
    alpha: 0.3,
    phase: 0,
    ...over,
  };
}

describe("particleCount", () => {
  it("scales with area and is clamped", () => {
    expect(particleCount(100, 100)).toBe(24);
    expect(particleCount(1400, 800)).toBe(80);
    expect(particleCount(5000, 3000)).toBe(110);
  });
});

describe("createParticles", () => {
  it("places particles inside the area with matching resting drift", () => {
    const ps = createParticles(50, 800, 600, seeded(7));
    expect(ps).toHaveLength(50);
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(800);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(600);
      expect(p.vx).toBe(p.baseVx);
      expect(p.vy).toBe(p.baseVy);
    }
  });
});

describe("wrap", () => {
  it("wraps both directions", () => {
    expect(wrap(-10, 100)).toBe(90);
    expect(wrap(110, 100)).toBe(10);
    expect(wrap(50, 100)).toBe(50);
    expect(wrap(5, 0)).toBe(0);
  });
});

describe("stepParticles", () => {
  it("drifts at the resting velocity", () => {
    const p = particle({ vx: 10, vy: -10, baseVx: 10, baseVy: -10 });
    stepParticles([p], 0.05, 800, 600, null);
    expect(p.x).toBeCloseTo(100.5);
    expect(p.y).toBeCloseTo(99.5);
  });

  it("wraps across edges", () => {
    const p = particle({ x: 799.9, vx: 10, baseVx: 10 });
    stepParticles([p], 0.05, 800, 600, null);
    expect(p.x).toBeLessThan(1);
  });

  it("pushes particles away from a nearby pointer", () => {
    const p = particle();
    stepParticles([p], 0.016, 800, 600, { x: 90, y: 100 });
    expect(p.vx).toBeGreaterThan(0);
    expect(p.x).toBeGreaterThan(100);
  });

  it("ignores a pointer outside the radius", () => {
    const p = particle();
    stepParticles([p], 0.016, 800, 600, { x: 100 + POINTER_RADIUS + 1, y: 100 });
    expect(p.vx).toBe(0);
  });

  it("eases back towards the resting drift after a push", () => {
    const p = particle({ vx: 100, baseVx: 5 });
    for (let i = 0; i < 200; i++) stepParticles([p], 0.05, 800, 600, null);
    expect(p.vx).toBeCloseTo(5, 1);
  });

  it("clamps long frames so particles don't jump", () => {
    const p = particle({ vx: 10, baseVx: 10 });
    stepParticles([p], 5, 800, 600, null);
    expect(p.x).toBeCloseTo(100.5);
  });
});

describe("linkAlpha", () => {
  it("fades to zero at the link distance", () => {
    expect(linkAlpha(0)).toBeCloseTo(0.18);
    expect(linkAlpha(LINK_DISTANCE)).toBe(0);
    expect(linkAlpha(LINK_DISTANCE / 2)).toBeCloseTo(0.09);
  });
});
