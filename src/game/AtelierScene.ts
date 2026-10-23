import * as THREE from 'three';
import { FoodFactory } from './food';
import { RUSH_WORLD_SPEED } from './events';
import type { FoodKind } from './recipes';
import type { AtelierStep } from '../atelierSlides';

export type AtelierVariant = 'normal' | 'frenzy' | 'trap' | 'shield';
export type AtelierFrame = { progress: number; hit: boolean; phase: string };
export interface AtelierSceneState {
  step: AtelierStep;
  paused: boolean;
  reducedMotion: boolean;
  action: number;
  variant: AtelierVariant;
}
type Fragment = { mesh: THREE.Mesh; velocity: THREE.Vector3; turn: number };
const TAU = Math.PI * 2;
const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Illustrations only: no inputs, scores, network calls or gameplay state are modified. */
export class AtelierScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-5, 5, 3.6, -3.6, 0.1, 40);
  private readonly factory = new FoodFactory();
  private readonly groups = new Map<AtelierStep, THREE.Group>();
  private readonly fragments: Fragment[] = [];
  private readonly fragmentMaterial = new THREE.MeshBasicMaterial({ color: '#ef7250' });
  private readonly bladeMaterial = new THREE.MeshBasicMaterial({
    color: '#ffe8bc',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  private readonly bladeGeometry = new THREE.BufferGeometry();
  private readonly bladeVertices = new Float32Array(18);
  private readonly blade: THREE.Mesh;
  private readonly pointer = new THREE.Group();
  private readonly shieldMaterial = new THREE.MeshBasicMaterial({
    color: '#9beeff',
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  private config: AtelierSceneState;
  private viewWidth = 10;
  private viewHeight = 7.2;
  private age = 0.75;
  private actionAge = Infinity;
  private explicitRemaining = 0;
  private fragmentAge = 1;
  private burstCycle = -1;
  private mixEnergy = 0;
  private mixAngle = 0.4;
  private mixProgress = 0;
  private disposed = false;
  private gestureFood?: THREE.Group;
  private flightFoods: THREE.Group[] = [];
  private sliceTomato?: THREE.Group;
  private sliceFish?: THREE.Group;
  private shield?: THREE.Group;
  private bowlFood?: THREE.Group;
  private whisk?: THREE.Group;
  private readonly report: AtelierFrame = { progress: 0.15, hit: false, phase: 'aim' };

  constructor(
    private readonly container: HTMLElement,
    initial: AtelierSceneState,
  ) {
    this.config = initial;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    Object.assign(this.renderer.domElement.style, {
      display: 'block',
      width: '100%',
      height: '100%',
    });
    container.appendChild(this.renderer.domElement);
    this.camera.position.z = 14;
    this.scene.add(new THREE.HemisphereLight('#fff6df', '#6c9e82', 2.5));
    const key = new THREE.DirectionalLight('#fff3d8', 3.5);
    key.position.set(-3, 7, 8);
    const fill = new THREE.DirectionalLight('#b9e7dc', 1.1);
    fill.position.set(5, 1, 5);
    this.scene.add(key, fill);
    this.bladeGeometry.setAttribute('position', new THREE.BufferAttribute(this.bladeVertices, 3));
    this.blade = new THREE.Mesh(this.bladeGeometry, this.bladeMaterial);
    this.blade.frustumCulled = false;
    this.blade.renderOrder = 10;
    this.scene.add(this.blade, this.pointer);
    const cursor = this.factory.ring('#ffe8bc', 0.15, 0.025);
    const dot = this.factory.sphere('#fff8df', [0.045, 0.045, 0.045]);
    this.pointer.add(cursor, dot);
    this.pointer.position.z = 3;
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(
        this.factory.geometry('atelier-fragment', () => new THREE.IcosahedronGeometry(1, 0)),
        this.fragmentMaterial,
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.fragments.push({ mesh, velocity: new THREE.Vector3(), turn: i % 2 ? -2 : 3 });
    }
    this.show(initial.step);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get animating(): boolean {
    return !this.config.paused && (!this.config.reducedMotion || this.explicitRemaining > 0);
  }

  configure(next: AtelierSceneState): void {
    const previous = this.config;
    this.config = next;
    if (next.step !== previous.step) {
      this.age = 0.75;
      this.actionAge = Infinity;
      this.explicitRemaining = 0;
      this.fragmentAge = 1;
      this.burstCycle = -1;
      this.mixEnergy = 0;
      this.mixProgress = 0;
      this.show(next.step);
    } else if (next.variant !== previous.variant && next.step === 'slice') {
      this.actionAge = Infinity;
      this.fragmentAge = 1;
      this.burstCycle = -1;
    }
    if (next.action !== previous.action && next.step === previous.step) this.action();
  }

  resize(width: number, height: number): void {
    width = Math.max(1, width);
    height = Math.max(1, height);
    const aspect = width / height;
    this.viewHeight = Math.max(7.2, 8.6 / aspect);
    this.viewWidth = this.viewHeight * aspect;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render(0);
  }

  frame(): AtelierFrame {
    return { ...this.report };
  }

  render(delta: number): void {
    if (this.disposed) return;
    const dt = this.animating ? Math.max(0, Math.min(0.06, delta)) : 0;
    this.explicitRemaining = Math.max(0, this.explicitRemaining - dt);
    this.actionAge += dt;
    this.age +=
      dt *
      (this.config.step === 'flight' && this.config.variant === 'frenzy' ? RUSH_WORLD_SPEED : 1);
    this.pointer.visible = this.config.step === 'gesture';
    this.blade.visible = false;
    this.report.hit = false;
    const group = this.groups.get(this.config.step)!;
    switch (this.config.step) {
      case 'gesture':
        this.drawGesture();
        break;
      case 'network':
        group.position.set(this.viewWidth * 0.29, -this.viewHeight * 0.32, 0);
        group.rotation.y = Math.sin(this.age * 0.4) * 0.06;
        this.report.phase = 'network';
        this.report.progress = (this.age % 5) / 5;
        break;
      case 'flight':
        this.drawFlight();
        break;
      case 'slice':
        this.drawSlice();
        break;
      case 'mix':
        this.drawMix(dt);
        break;
      case 'result':
        group.position.set(-this.viewWidth * 0.2, -0.95 + Math.sin(this.age * 0.8) * 0.055, 0);
        group.rotation.y = Math.sin(this.age * 0.38) * 0.09;
        this.report.phase = 'result';
        this.report.progress = Math.min(1, this.actionAge / 1.1);
        break;
    }
    this.animateFragments(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private action(): void {
    this.actionAge = 0;
    this.explicitRemaining = this.config.step === 'mix' ? 2 : 2.8;
    this.burstCycle = -1;
    if (this.config.step === 'gesture') this.age = 1.8;
    if (this.config.step === 'flight') this.age = 0.1;
    if (this.config.step === 'mix') {
      if (this.mixProgress === 1) {
        this.mixProgress = 0;
        this.mixEnergy = 0;
      }
      this.mixEnergy = Math.min(2, this.mixEnergy + 1.2);
    }
    if (this.config.step === 'result') this.burst(-this.viewWidth * 0.2, 1.1, '#ffd183');
  }

  private show(step: AtelierStep): void {
    if (!this.groups.has(step)) this.groups.set(step, this.build(step));
    for (const [name, group] of this.groups) group.visible = name === step;
  }

  private food(kind: FoodKind, scale = 1): THREE.Group {
    const object = this.factory.createFood(kind);
    const upright = ['fish', 'chili', 'flour', 'egg', 'strawberry', 'broccoli'].includes(kind);
    object.rotation.set(upright ? 0.1 : 1.05, -0.12, -0.06);
    object.scale.setScalar(scale);
    return object;
  }

  private build(step: AtelierStep): THREE.Group {
    const group = new THREE.Group();
    this.scene.add(group);
    if (step === 'gesture') {
      this.gestureFood = this.food('tomato', 1.95);
      group.add(this.gestureFood);
    } else if (step === 'network' || step === 'result') {
      group.add(this.factory.platter(), this.factory.burger());
      group.rotation.x = 0.24;
      group.scale.setScalar(step === 'result' ? 0.82 : 0.36);
    } else if (step === 'flight') {
      this.flightFoods = (['bread', 'tomato', 'lettuce', 'cheese'] as const).map((kind) => {
        const object = this.food(kind, 1.05);
        group.add(object);
        return object;
      });
    } else if (step === 'slice') {
      this.sliceTomato = this.food('tomato', 2.1);
      this.sliceFish = this.food('fish', 1.65);
      this.shield = new THREE.Group();
      const dome = new THREE.Mesh(
        this.factory.geometry('atelier-shield', () => new THREE.SphereGeometry(2.15, 28, 18)),
        this.shieldMaterial,
      );
      const star = this.factory.createFood('shield');
      star.scale.setScalar(0.55);
      star.position.set(1.8, 1.55, 0.4);
      this.shield.add(dome, star);
      group.add(this.sliceTomato, this.sliceFish, this.shield);
    } else {
      this.buildBowl(group);
    }
    return group;
  }

  private drawGesture(): void {
    const progress = (this.age % 5) / 5;
    const center = this.viewWidth * 0.22;
    const cycle = Math.floor(this.age / 5);
    const swing = Math.sin(progress * TAU);
    const afterHit = progress >= 0.5 && progress < 0.7;
    this.gestureFood!.position.set(center, 0.08 + Math.sin(this.age * 1.2) * 0.045, 0);
    this.gestureFood!.visible = !afterHit;
    this.gestureFood!.scale.setScalar(
      1.95 * (progress >= 0.7 ? 0.88 + ease((progress - 0.7) / 0.12) * 0.12 : 1),
    );
    this.pointer.position.set(center + swing * 1.65, swing * 0.6 + 0.08, 3);
    if (progress >= 0.42 && progress < 0.64) {
      const previous = Math.sin((progress - 0.065) * TAU);
      this.slash(
        center + previous * 1.65,
        previous * 0.6 + 0.08,
        this.pointer.position.x,
        this.pointer.position.y,
      );
    }
    if (afterHit && this.burstCycle !== cycle) {
      this.burstCycle = cycle;
      this.burst(center, 0.08, '#f1835b');
    }
    this.report.progress = progress;
    this.report.hit = progress >= 0.5 && progress < 0.64;
    this.report.phase =
      progress >= 0.42 && progress < 0.64
        ? 'slice'
        : progress >= 0.64 && progress < 0.86
          ? 'reset'
          : 'aim';
  }

  private drawFlight(): void {
    const spread = Math.min(3.05, this.viewWidth * 0.32);
    this.flightFoods.forEach((food, index) => {
      const p = (this.age / 3.7 + index * 0.24) % 1;
      const lane = (index / 3 - 0.5) * spread * 2;
      food.position.set(
        lane + Math.sin(p * Math.PI) * (index % 2 ? -0.4 : 0.4),
        -3.6 + 5.5 * 4 * p * (1 - p),
        (index % 2) * -0.3,
      );
      food.rotation.z = Math.sin(p * TAU + index) * 0.28;
      food.rotation.y = Math.sin(p * Math.PI + index) * 0.24;
    });
    this.report.progress = (this.age / 3.7) % 1;
    this.report.phase = this.config.variant === 'frenzy' ? 'frenzy' : 'flight';
  }

  private drawSlice(): void {
    const trap = this.config.variant === 'trap' || this.config.variant === 'shield';
    const shield = this.config.variant === 'shield';
    const active = this.actionAge < 1.45;
    const hit = active && this.actionAge >= 0.34;
    const foodVisible = !hit || this.actionAge > 1.1;
    this.sliceTomato!.visible = !trap && foodVisible;
    this.sliceFish!.visible = trap && foodVisible;
    this.shield!.visible = shield;
    this.shieldMaterial.opacity = shield && hit ? 0.2 : 0.1;
    this.shield!.scale.setScalar(
      shield && hit ? 1 + Math.sin(Math.min(1, (this.actionAge - 0.34) / 0.8) * Math.PI) * 0.07 : 1,
    );
    if (active && this.actionAge < 0.62) {
      const p = ease(this.actionAge / 0.6);
      const previous = ease((this.actionAge - 0.13) / 0.6);
      this.slash(-3 + previous * 6, -1.1 + previous * 2.2, -3 + p * 6, -1.1 + p * 2.2);
    }
    if (hit && this.burstCycle !== 1) {
      this.burstCycle = 1;
      this.burst(0, 0, shield ? '#a6edff' : trap ? '#ff9c8d' : '#f1835b');
    }
    this.report.progress = active ? Math.min(1, this.actionAge / 1.45) : 0;
    this.report.hit = active && this.actionAge >= 0.34 && this.actionAge < 1.1;
    this.report.phase = active ? 'slice' : 'idle';
  }

  private buildBowl(group: THREE.Group): void {
    group.rotation.x = 0.3;
    group.position.y = -1.25;
    group.scale.setScalar(0.9);
    const shell = this.factory.mesh(
      this.factory.geometry(
        'atelier-bowl',
        () => new THREE.SphereGeometry(2.02, 36, 20, 0, TAU, Math.PI / 2, Math.PI / 2),
      ),
      '#b7cbb9',
      0.32,
    );
    shell.scale.y = 0.72;
    shell.position.y = 1.64;
    const rim = this.factory.ring('#e9f0df', 2.02, 0.095);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.64;
    const contents = this.factory.cylinder('#e6b978', 1.74, 0.08);
    contents.position.y = 1.1;
    this.bowlFood = new THREE.Group();
    const ingredients = ['tomato', 'lettuce', 'cheese'] as const;
    for (let i = 0; i < 6; i++) {
      const food = this.factory.createFood(ingredients[i % 3]);
      const angle = (i / 6) * TAU;
      food.scale.setScalar(0.42);
      food.position.set(Math.cos(angle) * 1.05, 1.33, Math.sin(angle) * 1.05);
      food.rotation.set(0.2, angle, 0.1);
      this.bowlFood.add(food);
    }
    this.whisk = new THREE.Group();
    const handle = this.factory.cylinder('#a9794b', 0.11, 1.4);
    handle.position.y = 1;
    this.whisk.add(handle);
    for (let i = 0; i < 5; i++) {
      const wire = this.factory.ring('#dbe2d8', 0.4, 0.018);
      wire.scale.y *= 1.8;
      wire.rotation.y = (i * Math.PI) / 5;
      wire.position.y = -0.31;
      this.whisk.add(wire);
    }
    this.whisk.position.y = 1.55;
    group.add(this.factory.platter(), shell, rim, contents, this.bowlFood, this.whisk);
  }

  private drawMix(dt: number): void {
    this.mixProgress = Math.min(1, this.mixProgress + (Math.min(1, this.mixEnergy) * dt) / 4);
    this.mixEnergy = Math.max(0, this.mixEnergy - dt * 0.55);
    this.mixAngle += dt * (0.55 + this.mixEnergy * 7);
    this.bowlFood!.rotation.y = this.mixAngle;
    this.whisk!.position.x = Math.sin(this.mixAngle) * 0.55;
    this.whisk!.position.z = Math.cos(this.mixAngle) * 0.55;
    this.whisk!.rotation.set(
      Math.sin(this.mixAngle) * 0.2,
      -this.mixAngle,
      -0.24 + Math.cos(this.mixAngle) * 0.16,
    );
    this.report.progress = this.mixProgress;
    this.report.phase = this.mixEnergy > 0.1 ? 'stirring' : 'mix';
  }

  private slash(ax: number, ay: number, bx: number, by: number): void {
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 0.01) return;
    const nx = (-(by - ay) / length) * 0.055;
    const ny = ((bx - ax) / length) * 0.055;
    this.bladeVertices.set([
      ax,
      ay,
      3.2,
      bx + nx,
      by + ny,
      3.2,
      bx - nx,
      by - ny,
      3.2,
      ax,
      ay,
      3.2,
      bx - nx,
      by - ny,
      3.2,
      ax - nx * 0.1,
      ay - ny * 0.1,
      3.2,
    ]);
    this.bladeGeometry.attributes.position.needsUpdate = true;
    this.blade.visible = true;
  }

  private burst(x: number, y: number, color: string): void {
    this.fragmentAge = 0;
    this.fragmentMaterial.color.set(color);
    this.fragments.forEach(({ mesh, velocity }, index) => {
      const a = (index / this.fragments.length) * TAU;
      const speed = 1.8 + (index % 3) * 0.6;
      mesh.position.set(x, y, 1);
      mesh.rotation.set(index, index * 0.7, a);
      velocity.set(Math.cos(a) * speed, Math.sin(a) * speed + 0.45, ((index % 3) - 1) * 0.35);
      mesh.visible = true;
    });
  }

  private animateFragments(dt: number): void {
    this.fragmentAge += dt;
    for (const { mesh, velocity, turn } of this.fragments) {
      mesh.visible = this.fragmentAge < 0.8;
      if (!mesh.visible) continue;
      mesh.position.addScaledVector(velocity, dt);
      velocity.y -= dt * 2.6;
      mesh.rotation.z += turn * dt;
      mesh.scale.setScalar(0.085 * Math.max(0, 1 - this.fragmentAge / 0.8));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.clear();
    this.groups.clear();
    this.factory.dispose();
    this.fragmentMaterial.dispose();
    this.bladeMaterial.dispose();
    this.shieldMaterial.dispose();
    this.bladeGeometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
