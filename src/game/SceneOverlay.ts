import type { ArenaKind, HitResult } from './events';

type MarkerKind =
  'good' | 'bad' | 'shield' | 'slow' | 'danger' | 'blocked' | 'focus' | 'heal' | 'full-health';
type HitFlash = { x: number; y: number; radius: number; kind: MarkerKind; age: number };

const COLORS: Record<MarkerKind, string> = {
  good: '#97f2b0',
  bad: '#ff8275',
  shield: '#a4f4ff',
  slow: '#8eeaff',
  danger: '#ff6662',
  blocked: '#d2ffff',
  focus: '#ffe39c',
  heal: '#ffb4ca',
  'full-health': '#e7cbd4',
};

function markerKind(kind: ArenaKind, target: boolean, result?: HitResult): MarkerKind {
  if (result === 'blocked') return 'blocked';
  if (result === 'heal' || result === 'full-health') return result;
  if (result === 'focus-start' || result === 'focus-cut') return 'focus';
  return kind === 'shield' || kind === 'slow' || kind === 'danger' ? kind : target ? 'good' : 'bad';
}

/** Brief impact rings and mixing guidance leave the 3D objects free of annotations. */
export class SceneOverlay {
  private readonly flashes: HitFlash[] = [];

  constructor(
    private readonly low: boolean,
    private readonly reduced: () => boolean,
  ) {}

  clear(): void {
    this.flashes.length = 0;
  }

  update(dt: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].age += dt;
      if (this.flashes[i].age > 0.55) this.flashes.splice(i, 1);
    }
  }

  hit(
    kind: ArenaKind,
    target: boolean,
    x: number,
    y: number,
    radius: number,
    result?: HitResult,
  ): void {
    if (this.flashes.length >= (this.low ? 6 : 12)) this.flashes.shift();
    this.flashes.push({ kind: markerKind(kind, target, result), x, y, radius, age: 0 });
  }

  drawShield(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    seconds: number,
    pulse: number,
    time: number,
  ): void {
    if (seconds <= 0 && pulse < 0.015) return;
    ctx.save();
    const beat = this.reduced() ? 0 : Math.sin(time * 2) * 0.035;
    ctx.globalAlpha = Math.max(0, Math.min(0.75, (seconds > 0 ? 0.12 : 0) + pulse * 0.4 + beat));
    ctx.strokeStyle = '#b8f7ff';
    ctx.lineWidth = pulse > 0.5 ? 3 : 1.5;
    ctx.beginPath();
    ctx.ellipse(width / 2, height * 1.02, width * 0.54, height * 0.97, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    const count = this.low ? 4 : 7;
    const size = Math.min(19, width * 0.027);
    for (let i = 0; i < count; i++) {
      const y = height * (0.24 + (i / count) * 0.65);
      for (let side = 0; side < 2; side++) {
        const x = side === 0 ? size + 10 : width - size - 10;
        ctx.beginPath();
        for (let corner = 0; corner < 6; corner++) {
          const angle = (corner * Math.PI) / 3;
          const px = x + Math.cos(angle) * size,
            py = y + Math.sin(angle) * size;
          if (corner === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawFeedback(ctx: CanvasRenderingContext2D): void {
    for (const flash of this.flashes) {
      const progress = flash.age / 0.55;
      const motion = this.reduced() ? 0 : progress;
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = COLORS[flash.kind];
      ctx.lineWidth = flash.kind === 'bad' || flash.kind === 'danger' ? 3 : 2;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, flash.radius * (0.6 + motion * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      if (flash.kind === 'heal') {
        ctx.globalAlpha = (1 - progress) * 0.55;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, flash.radius * (0.75 + motion * 1.25), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawMixing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    angle: number,
    color: string,
  ): void {
    const turn = this.reduced() ? 0 : angle * 0.12;
    const ry = radius * 0.5;
    for (let i = 0; i < 3; i++) {
      const start = turn + (i * Math.PI * 2) / 3;
      const end = start + Math.PI * 0.46;
      ctx.beginPath();
      ctx.ellipse(x, y, radius, ry, 0, start, end);
      ctx.strokeStyle = '#0a2925';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      const tipX = x + Math.cos(end) * radius;
      const tipY = y + Math.sin(end) * ry;
      const direction = Math.atan2(Math.cos(end) * ry, -Math.sin(end) * radius);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tipX + Math.cos(direction) * 8, tipY + Math.sin(direction) * 8);
      ctx.lineTo(tipX + Math.cos(direction + 2.5) * 9, tipY + Math.sin(direction + 2.5) * 9);
      ctx.lineTo(tipX + Math.cos(direction - 2.5) * 9, tipY + Math.sin(direction - 2.5) * 9);
      ctx.closePath();
      ctx.fill();
    }
  }

  dispose(): void {
    this.clear();
  }
}
