import { useEffect, useRef } from "react";
import {
  createParticles,
  LINK_DISTANCE,
  linkAlpha,
  particleCount,
  POINTER_RADIUS,
  stepParticles,
  type Particle,
  type Pointer,
} from "../../lib/particles";

const PARTICLE_RGB = "205, 214, 244";
const LINK_RGB = "137, 180, 250";

/**
 * Drifting, twinkling particles behind the welcome screen. They're pushed away
 * from the mouse and joined by faint lines when close, including to the cursor.
 * With "reduce motion" on (System Settings on macOS, Windows' animation effects
 * setting) the field is drawn once and stays still.
 */
export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let pointer: Pointer | null = null;
    let frame = 0;
    let last = performance.now();

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const alpha = linkAlpha(Math.hypot(a.x - b.x, a.y - b.y));
          if (alpha <= 0) continue;
          ctx.strokeStyle = `rgba(${LINK_RGB}, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (pointer) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          const alpha = linkAlpha((d / (POINTER_RADIUS * 1.4)) * LINK_DISTANCE, 0.35);
          if (alpha > 0) {
            ctx.strokeStyle = `rgba(${LINK_RGB}, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }
      for (const p of particles) {
        const twinkle = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(time / 900 + p.phase);
        ctx.fillStyle = `rgba(${PARTICLE_RGB}, ${p.alpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prevW = width;
      const prevH = height;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = particleCount(width, height);
      if (particles.length === 0 || prevW === 0 || prevH === 0) {
        particles = createParticles(target, width, height);
      } else {
        // Keep existing particles where they are (scaled), top up or trim to the new density.
        for (const p of particles) {
          p.x = (p.x / prevW) * width;
          p.y = (p.y / prevH) * height;
        }
        if (particles.length < target) {
          particles.push(...createParticles(target - particles.length, width, height));
        } else {
          particles.length = target;
        }
      }
      if (reducedMotion) draw(0);
    };

    const tick = (now: number) => {
      stepParticles(particles, (now - last) / 1000, width, height, pointer);
      last = now;
      draw(now);
      frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointer = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? { x, y } : null;
    };
    const clearPointer = () => {
      pointer = null;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    if (!reducedMotion) {
      window.addEventListener("pointermove", onPointerMove);
      document.documentElement.addEventListener("pointerleave", clearPointer);
      window.addEventListener("blur", clearPointer);
      frame = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", clearPointer);
      window.removeEventListener("blur", clearPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />;
}
