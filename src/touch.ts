import { clamp, type MotionSample } from './motion';

export interface TouchSample extends MotionSample {
  fromX?: number;
  fromY?: number;
}

type Segment = { fromX: number; fromY: number; x: number; y: number; distance: number; at: number };
const MIN_DISTANCE = 0.003;
const MAX_AGE = 150;

/** Collect gestures independently from rendering and the bounded network clock. */
export class TouchTracker {
  pointerId: number | null = null;
  private x = 0.5;
  private y = 0.5;
  private at = 0;
  private energy = 0;
  private cutAt = -Infinity;
  private pending: Segment[] = [];
  private segment: Segment | null = null;

  begin(pointerId: number, x: number, y: number, time: number) {
    if (this.pointerId !== null || !this.valid(x, y, time)) return false;
    this.pointerId = pointerId;
    this.x = clamp(x);
    this.y = clamp(y);
    this.at = time;
    this.energy = 0;
    this.cutAt = -Infinity;
    this.segment = null;
    return true;
  }

  move(pointerId: number, x: number, y: number, time: number) {
    if (pointerId !== this.pointerId || !this.valid(x, y, time)) return;
    x = clamp(x);
    y = clamp(y);
    const distance = Math.hypot(x - this.x, y - this.y);
    if (distance === 0) return;
    // Never turn an old, unsent segment into a delayed cut after a transport stall.
    if (this.segment && time - this.segment.at > MAX_AGE) {
      this.pending = this.pending.filter((item) => item !== this.segment);
      this.segment = null;
    }
    if (!this.segment) {
      this.segment = { fromX: this.x, fromY: this.y, x, y, distance: 0, at: time };
      this.pending.push(this.segment);
      if (this.pending.length > 4) this.pending.shift();
    }
    this.segment.x = x;
    this.segment.y = y;
    this.segment.distance += distance;
    this.segment.at = time;
    if (this.segment.distance >= MIN_DISTANCE) this.cutAt = time;
    this.energy = clamp(distance / Math.max((time - this.at) / 1000, 0.008) / 2);
    this.x = x;
    this.y = y;
    this.at = time;
  }

  end(pointerId: number, x: number, y: number, time: number) {
    if (pointerId !== this.pointerId) return;
    this.move(pointerId, x, y, time);
    this.pointerId = null;
    this.segment = null;
    // Preserve the final segment until the next send, even for a sub-frame flick.
  }

  /** A layout/continuous phase change is not a lifted finger. Discard old motion only. */
  rebase(x: number, y: number, time: number) {
    if (!this.valid(x, y, time)) return;
    this.x = clamp(x);
    this.y = clamp(y);
    this.at = time;
    this.pending = [];
    this.segment = null;
    this.cutAt = -Infinity;
    this.energy = 0;
  }

  cancel(pointerId?: number) {
    if (pointerId !== undefined && pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.pending = [];
    this.segment = null;
    this.cutAt = -Infinity;
    this.energy = 0;
  }

  reset() {
    this.cancel();
    this.x = this.y = 0.5;
    this.at = 0;
  }

  visual(time: number): MotionSample {
    return {
      x: this.x,
      y: this.y,
      slash: time - this.cutAt < 100,
      stir: this.energy * Math.exp(-Math.max(0, time - this.at) / 150),
    };
  }

  take(time: number): TouchSample {
    this.pending = this.pending.filter((item) => {
      const keep = time - item.at <= MAX_AGE;
      if (!keep && item === this.segment) this.segment = null;
      return keep;
    });
    const index = this.pending.findIndex((item) => item.distance >= MIN_DISTANCE);
    const next = this.visual(time);
    if (index === -1) return { ...next, slash: false };
    const segment = this.pending.splice(index, 1)[0];
    if (segment === this.segment) this.segment = null;
    return {
      x: segment.x,
      y: segment.y,
      fromX: segment.fromX,
      fromY: segment.fromY,
      slash: true,
      stir: next.stir,
    };
  }

  private valid(x: number, y: number, time: number) {
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(time);
  }
}
