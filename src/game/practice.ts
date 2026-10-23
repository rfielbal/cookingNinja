import type { InputMessage } from '../../shared/protocol';
import type { FoodKind, Recipe } from './recipes';

export type PracticePoint = { x: number; y: number };
export type PracticeSegment = { from: PracticePoint; to: PracticePoint };
export type PracticeFeedback = 'cut' | 'mistake' | 'avoided' | null;
export type PracticePhase = 'active' | 'feedback' | 'complete';
export type PracticeTarget = PracticePoint & {
  kind: FoodKind;
  radiusX: number;
  radiusY: number;
  visible: boolean;
};
export const PRACTICE_TRAP_SECONDS = 3.4;
const INPUT_MAX_AGE = 200;

/** A short, scoreless lesson. The target position is shared by rendering and collision. */
export class PracticeLesson {
  readonly foods: readonly FoodKind[];
  readonly target: PracticeTarget;
  step = 0;
  phase: PracticePhase = 'active';
  feedback: PracticeFeedback = null;
  revision = 0;
  trapElapsed = 0;
  enabled = false;
  private phaseElapsed = 0;
  private source: 'motion' | 'touch';
  private previous: (PracticePoint & { at: number }) | null = null;
  private freshInputRequired = true;

  constructor(recipe: Recipe, source: 'motion' | 'touch') {
    this.foods = [
      recipe.ingredients[0],
      recipe.ingredients[recipe.ingredients.length - 1],
      recipe.traps[0],
    ];
    this.source = source;
    this.target = {
      kind: this.foods[0],
      x: 0.38,
      y: 0.53,
      radiusX: 0.075,
      radiusY: 0.12,
      visible: true,
    };
  }

  get completed(): number {
    return this.phase === 'complete'
      ? 3
      : this.step + (this.phase === 'feedback' && this.feedback !== 'mistake' ? 1 : 0);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.resetGesture();
  }

  setSource(source: 'motion' | 'touch'): void {
    if (source === this.source) return;
    this.source = source;
    this.resetGesture();
  }

  resize(width: number, height: number): void {
    const radius = Math.max(34, Math.min(72, Math.min(width, height) * 0.125));
    this.target.radiusX = radius / Math.max(1, width);
    this.target.radiusY = radius / Math.max(1, height);
    this.resetGesture();
  }

  resetGesture(): void {
    this.previous = null;
    this.freshInputRequired = true;
  }

  tick(dt: number): void {
    if (!this.enabled || this.phase === 'complete' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    if (this.phase === 'feedback') {
      this.phaseElapsed += dt;
      if (this.phaseElapsed < (this.feedback === 'mistake' ? 1.1 : 0.7)) return;
      if (this.feedback !== 'mistake') this.step++;
      this.phase = this.step === 3 ? 'complete' : 'active';
      this.feedback = null;
      this.trapElapsed = 0;
      this.target.kind = this.foods[Math.min(this.step, 2)];
      this.target.visible = this.phase === 'active';
      this.target.x = this.step === 0 ? 0.38 : this.step === 1 ? 0.62 : -0.14;
      this.target.y = 0.53;
      this.resetGesture();
      this.revision++;
      return;
    }
    if (this.step !== 2) return;
    this.trapElapsed = Math.min(PRACTICE_TRAP_SECONDS, this.trapElapsed + dt);
    const progress = this.trapElapsed / PRACTICE_TRAP_SECONDS;
    this.target.x = -0.14 + progress * 1.28;
    this.target.y = 0.53 + Math.sin(progress * Math.PI) * 0.035;
    if (this.trapElapsed >= PRACTICE_TRAP_SECONDS) this.respond('avoided');
  }

  receive(
    packet: InputMessage,
    now: number,
  ): { segment: PracticeSegment | null; feedback: PracticeFeedback } {
    const empty = { segment: null, feedback: null };
    if (!this.enabled || this.phase !== 'active') return empty;
    if (
      (packet.source ?? 'motion') !== this.source ||
      !Number.isFinite(packet.x) ||
      !Number.isFinite(packet.y)
    ) {
      this.resetGesture();
      return empty;
    }
    const to = { x: packet.x, y: packet.y };
    const previous = this.previous;
    this.previous = { ...to, at: now };
    // A resumed session/next target starts from fresh input, never an old crossing.
    if (this.freshInputRequired) {
      this.freshInputRequired = false;
      return empty;
    }
    if (!packet.slash) return empty;
    const from =
      this.source === 'touch'
        ? Number.isFinite(packet.fromX) && Number.isFinite(packet.fromY)
          ? { x: packet.fromX!, y: packet.fromY! }
          : null
        : previous && now - previous.at >= 0 && now - previous.at < INPUT_MAX_AGE
          ? previous
          : null;
    if (!from || Math.hypot(to.x - from.x, to.y - from.y) < 0.0015) return empty;
    const segment = { from, to };
    if (!intersectsTarget(segment, this.target)) return { segment, feedback: null };
    const feedback = this.step === 2 ? 'mistake' : 'cut';
    this.respond(feedback);
    return { segment, feedback };
  }

  private respond(feedback: Exclude<PracticeFeedback, null>): void {
    this.feedback = feedback;
    this.phase = 'feedback';
    this.phaseElapsed = 0;
    this.target.visible = false;
    this.resetGesture();
    this.revision++;
  }
}

function intersectsTarget({ from, to }: PracticeSegment, target: PracticeTarget): boolean {
  const ax = (from.x - target.x) / target.radiusX;
  const ay = (from.y - target.y) / target.radiusY;
  const dx = (to.x - from.x) / target.radiusX;
  const dy = (to.y - from.y) / target.radiusY;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
  return (ax + dx * t) ** 2 + (ay + dy * t) ** 2 <= 1;
}
