/** A relative tilt pointer, never an estimate of the phone's position in space. */
export type MotionSample = { x: number; y: number; slash: boolean; stir: number };
export type CalibrationStatus = {
  ready: boolean;
  progress: number;
  reason: 'missing' | 'stale' | 'moving' | 'collecting' | 'ready';
};
type Pose = { beta: number; gamma: number; time: number };
type SensorEvent = Pick<
  DeviceMotionEvent,
  'rotationRate' | 'acceleration' | 'accelerationIncludingGravity'
>;

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const angleDelta = (angle: number, previous: number) =>
  ((((angle - previous + 180) % 360) + 360) % 360) - 180;
const finiteAxis = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
// Subtracting the small neutral zone keeps the mapping continuous at its edge.
const neutral = (angle: number) => Math.sign(angle) * Math.max(0, Math.abs(angle) - 0.4);
const SENSOR_TIMEOUT_MS = 1200;
const CALIBRATION_WINDOW_MS = 360;
const FILTER_TAU_MS = 32;

export class MotionTracker {
  private anchor: Pick<Pose, 'beta' | 'gamma'> | null = null;
  private latest: Pose | null = null;
  private history: Pose[] = [];
  private lastSensorAt = -Infinity;
  private gravity = { x: 0, y: 0, z: 0 };
  private gravityInitialized = false;
  private lastMotionAt = -Infinity;
  private lastGyroscopeAt = -Infinity;
  private gyroPlanarVelocity = 0;
  private lastPlanarMoveAt = -Infinity;
  private orientationVelocity = 0;
  private cutting = false;
  private slashUntil = 0;
  private stir = 0;
  private stirTime = 0;
  private target = { x: 0.5, y: 0.5 };
  private pointer = { x: 0.5, y: 0.5 };
  sensitivity = 1;

  get hasOrientation() {
    return this.latest !== null;
  }

  /** Motion events also prove a stationary device is alive. Invalid/null events do not. */
  isFresh(time: number) {
    return (
      Number.isFinite(time) &&
      time >= this.lastSensorAt &&
      time - this.lastSensorAt <= SENSOR_TIMEOUT_MS
    );
  }

  calibrationStatus(time: number): CalibrationStatus {
    if (!this.latest) return { ready: false, progress: 0, reason: 'missing' };
    if (!this.isFresh(time) || time - this.latest.time > SENSOR_TIMEOUT_MS) {
      return { ready: false, progress: 0, reason: 'stale' };
    }
    const recent = this.history.filter((pose) => time - pose.time <= CALIBRATION_WINDOW_MS + 100);
    const first = recent[0];
    if (!first) return { ready: false, progress: 0, reason: 'collecting' };
    const spread = Math.max(
      ...recent.map((pose) =>
        Math.hypot(
          angleDelta(pose.beta, this.latest!.beta),
          angleDelta(pose.gamma, this.latest!.gamma),
        ),
      ),
    );
    if (spread > 1.25 || (time - this.lastGyroscopeAt < 150 && this.gyroPlanarVelocity > 12)) {
      return { ready: false, progress: 0, reason: 'moving' };
    }
    const span = recent[recent.length - 1]!.time - first.time;
    const progress = Math.min(clamp(span / CALIBRATION_WINDOW_MS), clamp(recent.length / 5));
    return { ready: progress >= 1, progress, reason: progress >= 1 ? 'ready' : 'collecting' };
  }

  beginCalibration() {
    this.anchor = null;
    // A return from the background may have a different pose. Old stable samples
    // must never satisfy a new request, even if they are only a few milliseconds old.
    this.latest = null;
    this.history = [];
    this.lastSensorAt = -Infinity;
    this.lastGyroscopeAt = -Infinity;
    this.lastPlanarMoveAt = -Infinity;
    this.orientationVelocity = 0;
    this.gyroPlanarVelocity = 0;
    this.cutting = false;
    this.slashUntil = 0;
    this.stir = 0;
  }

  calibrate(time: number) {
    if (!this.calibrationStatus(time).ready || !this.latest) return false;
    const poses = this.history.filter((pose) => time - pose.time <= CALIBRATION_WINDOW_MS + 100);
    const reference = this.latest;
    this.anchor = {
      beta:
        reference.beta +
        poses.reduce((sum, pose) => sum + angleDelta(pose.beta, reference.beta), 0) / poses.length,
      gamma:
        reference.gamma +
        poses.reduce((sum, pose) => sum + angleDelta(pose.gamma, reference.gamma), 0) /
          poses.length,
    };
    this.pointer = { x: 0.5, y: 0.5 };
    this.target = { ...this.pointer };
    this.lastPlanarMoveAt = -Infinity;
    this.cutting = false;
    this.slashUntil = 0;
    this.stir = 0;
    this.gravityInitialized = false;
    return true;
  }

  orientation(beta: number, gamma: number, time: number, screenAngle = 0) {
    if (![beta, gamma, time, screenAngle].every(Number.isFinite)) return;
    if (this.latest && time <= this.latest.time) return;
    const previous = this.latest;
    const elapsed = previous ? time - previous.time : 0;
    this.latest = { beta, gamma, time };
    this.lastSensorAt = Math.max(this.lastSensorAt, time);
    this.history.push(this.latest);
    this.history = this.history.filter((pose) => time - pose.time <= 700).slice(-100);
    if (!this.anchor) return;
    const horizontal = neutral(angleDelta(gamma, this.anchor.gamma));
    const vertical = neutral(angleDelta(beta, this.anchor.beta));
    const radians = (screenAngle * Math.PI) / 180;
    const x = horizontal * Math.cos(radians) + vertical * Math.sin(radians);
    const y = vertical * Math.cos(radians) - horizontal * Math.sin(radians);
    const target = {
      x: clamp(0.5 + (x * this.sensitivity) / 64),
      y: clamp(0.5 + (y * this.sensitivity) / 64),
    };
    const travel = Math.hypot(target.x - this.target.x, target.y - this.target.y);
    this.target = target;
    // The same time constant gives the same response on 30, 60 and 120 Hz sensors.
    const blend = 1 - Math.exp(-Math.min(elapsed, 120) / FILTER_TAU_MS);
    this.pointer.x += (target.x - this.pointer.x) * blend;
    this.pointer.y += (target.y - this.pointer.y) * blend;
    this.orientationVelocity =
      previous && elapsed > 4 && elapsed < 250
        ? Math.hypot(angleDelta(beta, previous.beta), angleDelta(gamma, previous.gamma)) /
          (elapsed / 1000)
        : 0;
    if (travel > 0.0018 && this.orientationVelocity > 25) this.lastPlanarMoveAt = time;
    const velocity =
      time - this.lastGyroscopeAt <= 250 ? this.gyroPlanarVelocity : this.orientationVelocity;
    this.updateCut(time, velocity);
    if (time - this.lastGyroscopeAt > 250) this.registerStir(clamp((velocity - 20) / 160), time);
  }

  motion(event: SensorEvent, time: number) {
    if (!Number.isFinite(time) || time <= this.lastMotionAt) return;
    const {
      rotationRate: rate,
      acceleration: direct,
      accelerationIncludingGravity: withGravity,
    } = event;
    const hasRate = !!rate && [rate.alpha, rate.beta, rate.gamma].some(finite);
    const hasPlanarRate = !!rate && finite(rate.beta) && finite(rate.gamma);
    const hasAcceleration = !!direct && [direct.x, direct.y, direct.z].some(finite);
    const hasGravity = !!withGravity && [withGravity.x, withGravity.y, withGravity.z].some(finite);
    if (!hasRate && !hasAcceleration && !hasGravity) return;
    const dt = Number.isFinite(this.lastMotionAt) ? time - this.lastMotionAt : 16;
    this.lastMotionAt = time;
    this.lastSensorAt = Math.max(this.lastSensorAt, time);
    if (hasPlanarRate) {
      this.lastGyroscopeAt = time;
      // Only the axes used by the tilt pointer may activate the blade.
      this.gyroPlanarVelocity = Math.hypot(finiteAxis(rate?.beta), finiteAxis(rate?.gamma));
    }
    if (!this.anchor) {
      // Some browsers publish orientation only when it changes. Repeated zero-rate
      // gyro samples can confirm that a recently received pose stayed still.
      if (
        this.latest &&
        time - this.latest.time <= SENSOR_TIMEOUT_MS &&
        hasPlanarRate &&
        this.gyroPlanarVelocity < 4
      ) {
        this.history.push({ ...this.latest, time });
        this.history = this.history.filter((pose) => time - pose.time <= 700).slice(-100);
      }
      return;
    }
    if (hasPlanarRate) this.updateCut(time, this.gyroPlanarVelocity);
    const velocity = Math.hypot(
      finiteAxis(rate?.alpha),
      finiteAxis(rate?.beta),
      finiteAxis(rate?.gamma),
    );
    let acceleration = hasAcceleration
      ? Math.hypot(finiteAxis(direct?.x), finiteAxis(direct?.y), finiteAxis(direct?.z))
      : 0;
    if (!hasAcceleration && hasGravity && withGravity) {
      const sample = {
        x: finiteAxis(withGravity.x),
        y: finiteAxis(withGravity.y),
        z: finiteAxis(withGravity.z),
      };
      if (!this.gravityInitialized) {
        this.gravity = sample;
        this.gravityInitialized = true;
      }
      const blend = 1 - Math.exp(-Math.min(dt, 100) / 150);
      this.gravity.x += (sample.x - this.gravity.x) * blend;
      this.gravity.y += (sample.y - this.gravity.y) * blend;
      this.gravity.z += (sample.z - this.gravity.z) * blend;
      acceleration = Math.hypot(
        sample.x - this.gravity.x,
        sample.y - this.gravity.y,
        sample.z - this.gravity.z,
      );
    }
    this.registerStir(
      Math.max(clamp((acceleration - 0.6) / 9), clamp((velocity - 20) / 160)),
      time,
    );
  }

  private updateCut(time: number, velocity: number) {
    const movingPointer = time - this.lastPlanarMoveAt < 70;
    if (!movingPointer || velocity < 40) this.cutting = false;
    else if (velocity >= 85) this.cutting = true;
    if (this.cutting && movingPointer) this.slashUntil = time + 85;
  }

  private registerStir(value: number, time: number) {
    this.stir = Math.max(value, this.stir * Math.exp(-Math.max(0, time - this.stirTime) / 150));
    this.stirTime = time;
  }

  sample(time: number): MotionSample {
    return {
      ...this.pointer,
      slash: this.isFresh(time) && time < this.slashUntil,
      stir: this.isFresh(time) ? this.stir * Math.exp(-Math.max(0, time - this.stirTime) / 150) : 0,
    };
  }
}
