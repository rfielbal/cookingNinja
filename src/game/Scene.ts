import * as THREE from 'three';
import { BLADES, DEFAULT_BLADE, type BladeId } from '../../shared/blades';
import { FoodFactory, FOOD_COLORS, type RecipeKind } from './food';
import {
  ACTIVE_LIFETIME,
  isSpecialKind,
  type ArenaEvent,
  type ArenaKind,
  type FocusState,
  type HitResult,
} from './events';
import { SceneOverlay } from './SceneOverlay';

type Point = { x: number; y: number };
type SceneMode = 'hero' | 'playing' | 'mixing' | 'result';
type SceneOptions = {
  quality?: 'high' | 'low';
  onHit?: (id: string, kind: ArenaKind) => HitResult | null;
  onSlash?: (strength: number) => void;
};
type RareEffect = {
  object: THREE.Group;
  aura: THREE.Sprite;
  rays: THREE.Group;
  age: number;
  trailClock: number;
  entered: boolean;
  revealAge: number;
};
type Ingredient = {
  id: string;
  kind: ArenaKind;
  target: boolean;
  object: THREE.Group;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  shinyMaterials?: THREE.MeshStandardMaterial[];
  sparkles?: THREE.Object3D;
  rare?: RareEffect;
  candy?: THREE.Object3D;
};
type FocusVisual = {
  id: string;
  origin: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  age: number;
  kick: number;
  cuts: number;
};
type Particle = {
  object: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: number;
  age: number;
  life: number;
  scale: number;
  gravity?: number;
  rare?: boolean;
};
type Stroke = { from: Point; to: Point; life: number };
type Floater = { object: THREE.Group; origin: THREE.Vector3; phase: number; speed: number };
type AmbientMark = {
  object: THREE.Object3D;
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  recipe?: RecipeKind;
};
type InkSpark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
};

/** The visual layer owns no game rules. All positions received by slash/pointer are 0…1. */
export class KitchenScene {
  private readonly container: HTMLElement;
  private readonly options: SceneOptions;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
  private readonly factory = new FoodFactory();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly overlay: HTMLCanvasElement;
  private readonly ink: CanvasRenderingContext2D | null;
  private readonly guidance: SceneOverlay;
  private readonly display = new THREE.Group();
  private readonly arena = new THREE.Group();
  private readonly effects = new THREE.Group();
  private readonly atmosphere = new THREE.Group();
  private readonly ambientMarks: AmbientMark[] = [];
  private readonly ambientMaterials: THREE.Material[] = [];
  private readonly bladeMaterials = new Map<BladeId, THREE.MeshBasicMaterial>();
  private readonly rareMaterials: THREE.Material[] = [];
  private rareTexture: THREE.CanvasTexture | null = null;
  private rareAuraMaterial: THREE.SpriteMaterial | null = null;
  private rareRayMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly rareSparkMaterial = new THREE.MeshBasicMaterial({
    color: '#fff0b7',
    toneMapped: false,
  });
  private readonly healMaterial = new THREE.MeshBasicMaterial({
    color: '#ff9fbb',
    toneMapped: false,
  });
  private readonly inkSparks: InkSpark[] = [];
  private readonly viewDirection = new THREE.Vector3();
  private readonly ambientPulseMaterial = new THREE.MeshBasicMaterial({
    color: '#ffb45f',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private ambientPulse!: THREE.Mesh;
  private ambientDust!: THREE.Points;
  private ambientWarm!: THREE.LineBasicMaterial;
  private ambientSage!: THREE.LineBasicMaterial;
  private readonly themePrimary = new THREE.Color();
  private readonly themeSecondary = new THREE.Color();
  private readonly focusTarget = new THREE.Vector3();
  private readonly focusVeilMaterial = new THREE.MeshBasicMaterial({
    color: '#021521',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly focusVeil = new THREE.Mesh(
    this.factory.geometry('focus-veil', () => new THREE.PlaneGeometry(1, 1)),
    this.focusVeilMaterial,
  );
  private eventStreaks!: THREE.LineSegments;
  private readonly eventStreakMaterial = new THREE.LineBasicMaterial({
    color: '#ffca6e',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly bowl = new THREE.Group();
  private readonly whisk = new THREE.Group();
  private readonly bowlIngredients = new THREE.Group();
  private readonly foods = new Map<string, Ingredient>();
  private readonly particles: Particle[] = [];
  private readonly strokes: Stroke[] = [];
  private readonly floaters: Floater[] = [];
  private readonly observer: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly projected = new THREE.Vector3();
  private readonly pointer = { x: 0.5, y: 0.5, active: false, seenAt: -Infinity };
  private mode: SceneMode = 'hero';
  private recipe: RecipeKind = 'burger';
  private width = 1;
  private height = 1;
  private frame = 0;
  private time = 0;
  private last = 0;
  private lastDraw = 0;
  private paused = false;
  private disposed = false;
  private stirEnergy = 0;
  private stirAngle = 0;
  private blade = BLADES.find((blade) => blade.id === DEFAULT_BLADE) ?? BLADES[0];
  private bladeAngle = -Math.PI / 4;
  private lastSparkAt = -Infinity;
  private lastSlashAt = -Infinity;
  private transitionAge = 2;
  private resultWon = false;
  private celebrated = false;
  private event: ArenaEvent = 'normal';
  private worldSpeed = 1;
  private focus: FocusVisual | null = null;
  private readonly focusStroke = { id: '', distance: 0, x: 0, y: 0, at: -Infinity };
  private shieldSeconds = 0;
  private shieldPulse = 0;
  private viewHeight = 10;
  private ownsPosition = false;
  private readonly originalPosition: string;
  private readonly shadowTexture: THREE.CanvasTexture;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;

  constructor(container: HTMLElement, options: SceneOptions = {}) {
    this.container = container;
    this.options = options;
    this.guidance = new SceneOverlay(options.quality === 'low', () => this.reducedMotion.matches);
    this.originalPosition = container.style.position;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
      this.ownsPosition = true;
    }
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.quality !== 'low',
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, options.quality === 'low' ? 1.25 : 1.75),
    );
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = options.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    Object.assign(this.renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.classList.add('kitchen-canvas');
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('canvas');
    Object.assign(this.overlay.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    this.overlay.setAttribute('aria-hidden', 'true');
    container.appendChild(this.overlay);
    this.ink = this.overlay.getContext('2d');

    const ambient = new THREE.HemisphereLight('#fff8e9', '#b3a583', 2.7);
    const key = new THREE.DirectionalLight('#fff0d5', 4.3);
    key.position.set(-4, 8, 6);
    key.castShadow = options.quality !== 'low';
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 4;
    const fill = new THREE.DirectionalLight('#f5ffd5', 1.4);
    fill.position.set(5, 3, -3);
    this.scene.add(
      ambient,
      key,
      fill,
      this.atmosphere,
      this.display,
      this.arena,
      this.effects,
      this.bowl,
      this.focusVeil,
    );
    this.focusVeil.visible = false;
    this.focusVeil.renderOrder = 2;

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(64, 64, 6, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(72,62,34,0.27)');
      gradient.addColorStop(0.45, 'rgba(72,62,34,0.15)');
      gradient.addColorStop(1, 'rgba(72,62,34,0)');
      shadowContext.fillStyle = gradient;
      shadowContext.fillRect(0, 0, 128, 128);
    }
    this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      depthWrite: false,
    });
    this.buildDisplay();
    this.buildBowl();
    this.buildAtmosphere();
    this.bowl.visible = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }

  setMode(mode: SceneMode): void {
    this.mode = mode;
    this.foods.forEach((food) => this.removeFood(food));
    this.focus = null;
    this.resetFocusStroke();
    this.lastSlashAt = -Infinity;
    this.focusVeil.visible = false;
    this.shieldSeconds = this.shieldPulse = 0;
    this.particles.forEach((particle) => this.effects.remove(particle.object));
    this.particles.length = 0;
    this.strokes.length = 0;
    this.inkSparks.length = 0;
    this.guidance.clear();
    this.pointer.active = false;
    this.pointer.seenAt = -Infinity;
    this.stirEnergy = 0;
    this.event = 'normal';
    this.worldSpeed = 1;
    this.transitionAge = 0;
    this.celebrated = false;
    if (mode === 'hero') this.resultWon = false;
    this.display.position.y = 0;
    this.display.rotation.y = 0;
    this.display.scale.setScalar(1);
    this.bowl.position.y = 0;
    this.bowl.rotation.y = 0;
    this.bowl.scale.setScalar(1);
    this.display.visible = mode === 'hero' || mode === 'result';
    this.arena.visible = mode === 'playing';
    // No receiving floor exists in flight: avoid a second shadow pass for every ingredient.
    this.renderer.shadowMap.enabled = this.options.quality !== 'low' && mode !== 'playing';
    this.bowl.visible = mode === 'mixing';
    this.atmosphere.visible = mode !== 'hero';
    this.applyAtmospherePalette();
    if (mode === 'result') this.buildDisplay();
    this.configureCamera();
    if (mode === 'result' && this.resultWon) this.celebrate();
  }

  setBlade(id: BladeId): void {
    this.blade = BLADES.find((blade) => blade.id === id) ?? BLADES[0];
    this.applyAtmospherePalette();
  }

  /** Only airborne objects use this clock; UI, blade feedback and mixing stay in real time. */
  setEvent(event: ArenaEvent, worldSpeed: number): void {
    this.worldSpeed = Number.isFinite(worldSpeed) ? THREE.MathUtils.clamp(worldSpeed, 0, 3) : 1;
    if (this.event === event) return;
    this.event = event;
    this.applyAtmospherePalette();
  }

  setShield(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    if (seconds > 0 && this.shieldSeconds <= 0) this.shieldPulse = 1;
    this.shieldSeconds = Math.max(0, seconds);
  }

  setFocus(focus: FocusState | null): void {
    if (this.disposed) return;
    if (!focus) {
      if (!this.focus) return;
      const food = this.foods.get(this.focus.id);
      if (food) {
        if (!this.reducedMotion.matches) this.burst(food, 0.7, 0.7, 'focus-cut');
        this.removeFood(food);
      }
      this.focus = null;
      this.resetFocusStroke();
      this.focusVeil.visible = false;
      return;
    }
    if (this.mode !== 'playing') return;
    const food = this.foods.get(focus.id);
    if (!food) return;
    if (this.focus?.id !== focus.id) this.beginFocus(food);
    if (this.focus && focus.cuts !== this.focus.cuts) {
      this.focus.kick = 1;
      this.focus.cuts = focus.cuts;
    }
  }

  private beginFocus(food: Ingredient): void {
    if (this.focus?.id === food.id) return;
    this.resetFocusStroke();
    this.focus = {
      id: food.id,
      origin: food.object.position.clone(),
      rotation: food.object.rotation.clone(),
      scale: food.object.scale.x,
      age: 0,
      kick: 0,
      cuts: 0,
    };
    this.focusVeil.visible = true;
    this.focusVeilMaterial.opacity = this.reducedMotion.matches ? 0.68 : 0;
    this.strokes.length = 0;
    this.inkSparks.length = 0;
    this.layoutFocus();
  }

  private layoutFocus(): void {
    this.camera.getWorldDirection(this.viewDirection);
    this.focusVeil.position.copy(this.camera.position).addScaledVector(this.viewDirection, 13);
    this.focusVeil.quaternion.copy(this.camera.quaternion);
    this.focusVeil.scale.set(
      ((this.viewHeight * this.width) / this.height) * 1.02,
      this.viewHeight * 1.02,
      1,
    );
    this.focusTarget.copy(this.camera.position).addScaledVector(this.viewDirection, 10);
    this.focusTarget.y -= this.viewHeight * 0.025;
    // Resize remains responsive while the animation clock is paused.
    this.updateFocus(0);
  }

  private updateFocus(dt: number): void {
    const focus = this.focus;
    if (!focus) return;
    focus.age += dt;
    focus.kick *= Math.exp(-dt * 13);
    const food = this.foods.get(focus.id);
    if (!food) return;
    const progress = this.reducedMotion.matches ? 1 : Math.min(1, focus.age / 0.28);
    const entry = 1 - (1 - progress) ** 3;
    const width = (this.viewHeight * this.width) / this.height;
    const zoom = Math.min(2.45, Math.max(1.25, width / 2.5));
    const kick = this.reducedMotion.matches ? 0 : focus.kick;
    food.object.position.lerpVectors(focus.origin, this.focusTarget, entry);
    food.object.scale.setScalar(focus.scale * (1 + (zoom - 1) * entry) * (1 + kick * 0.045));
    food.object.rotation.set(
      focus.rotation.x,
      focus.rotation.y + kick * 0.12,
      focus.rotation.z - kick * 0.1,
    );
    this.focusVeilMaterial.opacity = entry * 0.68;
  }

  private removeFood(food: Ingredient): void {
    this.arena.remove(food.object);
    if (food.rare) this.effects.remove(food.rare.object);
    this.foods.delete(food.id);
    food.shinyMaterials?.forEach((material) => material.dispose());
  }

  private createRareEffect(): RareEffect {
    if (!this.rareTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        glow.addColorStop(0, 'rgba(255,255,255,0.95)');
        glow.addColorStop(0.25, 'rgba(255,255,255,0.8)');
        glow.addColorStop(0.55, 'rgba(255,255,255,0.3)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 128, 128);
      }
      this.rareTexture = new THREE.CanvasTexture(canvas);
      this.rareAuraMaterial = new THREE.SpriteMaterial({
        map: this.rareTexture,
        color: '#ffbd48',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.rareRayMaterial = new THREE.MeshBasicMaterial({
        map: this.rareTexture,
        color: '#ffe9a3',
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      this.rareMaterials.push(this.rareAuraMaterial, this.rareRayMaterial);
    }
    const object = new THREE.Group();
    object.name = 'rare-radiance';
    object.visible = false;
    const aura = new THREE.Sprite(this.rareAuraMaterial!);
    aura.renderOrder = 3;
    aura.scale.setScalar(3.8);
    const rays = new THREE.Group();
    const count = this.options.quality === 'low' ? 4 : 8;
    const plane = this.factory.geometry('rare-ray', () => new THREE.PlaneGeometry(1, 1));
    for (let i = 0; i < count; i++) {
      const ray = new THREE.Mesh(plane, this.rareRayMaterial!);
      const angle = (i * Math.PI * 2) / count;
      ray.position.set(Math.sin(angle) * 1.22, Math.cos(angle) * 1.22, -0.02);
      ray.rotation.z = -angle;
      ray.scale.set(i % 2 ? 0.1 : 0.16, i % 2 ? 1.2 : 1.65, 1);
      ray.renderOrder = 3;
      rays.add(ray);
    }
    object.add(aura, rays);
    this.effects.add(object);
    return { object, aura, rays, age: 0, trailClock: 0, entered: false, revealAge: 0 };
  }

  private updateRareEffect(food: Ingredient, dt: number): void {
    const rare = food.rare;
    if (!rare) return;
    rare.age += dt;
    this.camera.getWorldDirection(this.viewDirection);
    rare.object.position
      .copy(food.object.position)
      .addScaledVector(this.viewDirection, food.object.scale.x * 0.42);
    rare.object.quaternion.copy(this.camera.quaternion);
    rare.object.scale.setScalar(food.object.scale.x);
    rare.object.visible = true;
    if (!rare.entered && food.object.position.y > -this.viewHeight * 0.44) {
      rare.entered = true;
      if (!this.reducedMotion.matches) {
        this.emitRareParticles(food, this.options.quality === 'low' ? 7 : 12, true);
      }
    }
    if (rare.entered) rare.revealAge += dt;
    const reduced = this.reducedMotion.matches;
    const pulse = reduced ? 1 : 1 + Math.sin(rare.age * 1.8) * 0.055;
    const arrival = reduced || !rare.entered ? 0 : Math.exp(-rare.revealAge * 5) * 0.35;
    rare.aura.scale.setScalar((this.focus ? 3.4 : 3.8) * (pulse + arrival));
    rare.rays.rotation.z = reduced ? 0 : rare.age * 0.22;
    rare.rays.scale.setScalar(pulse + arrival * 0.6);
    if (!reduced && rare.entered && !this.focus) {
      rare.trailClock += dt;
      const interval = this.options.quality === 'low' ? 0.14 : 0.075;
      if (rare.trailClock >= interval) {
        rare.trailClock %= interval;
        this.emitRareParticles(food, 1, false);
      }
    }
  }

  private emitRareParticles(food: Ingredient, count: number, reveal: boolean): void {
    const low = this.options.quality === 'low';
    const totalLimit = low ? 55 : 90;
    const rareLimit = low ? 14 : 30;
    let live = 0;
    for (const particle of this.particles) if (particle.rare) live++;
    const geometry = this.factory.geometry('rare-spark', () => new THREE.OctahedronGeometry(1, 0));
    for (
      let i = 0;
      i < count && live < rareLimit && this.particles.length < totalLimit;
      i++, live++
    ) {
      const object = new THREE.Mesh(geometry, this.rareSparkMaterial);
      const angle = Math.random() * Math.PI * 2;
      const distance = reveal ? 0.4 : 0.2 + Math.random() * 0.45;
      object.position.copy(food.object.position);
      object.position.x += Math.cos(angle) * distance;
      object.position.y += Math.sin(angle) * distance;
      object.position.z += 0.3;
      const scale = reveal ? 0.07 + Math.random() * 0.06 : 0.045 + Math.random() * 0.045;
      object.scale.setScalar(scale);
      this.effects.add(object);
      this.particles.push({
        object,
        age: 0,
        life: reveal ? 0.65 : 0.75,
        scale,
        rare: true,
        gravity: reveal ? 1.2 : -0.2,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (reveal ? 3 : 0.25),
          Math.sin(angle) * (reveal ? 3 : 0.25),
          0.2,
        ),
        spin: (Math.random() - 0.5) * 3,
      });
    }
  }

  private resetFocusStroke(): void {
    this.focusStroke.id = '';
    this.focusStroke.distance = 0;
    this.focusStroke.at = -Infinity;
  }

  /** Count real travel inside the fruit, independently from pointer/network sampling frequency. */
  private trackFocusStroke(
    id: string,
    from: Point,
    to: Point,
    distance: number,
    endsInside: boolean,
    now: number,
  ): boolean {
    const stroke = this.focusStroke;
    if (
      stroke.id !== id ||
      now - stroke.at > 150 ||
      Math.hypot(from.x - stroke.x, from.y - stroke.y) > 0.012
    )
      this.resetFocusStroke();
    stroke.id = id;
    // No bank of old travel: a rejected cooldown attempt retains at most one moving cut.
    stroke.distance = Math.min(0.025, stroke.distance + distance);
    stroke.x = to.x;
    stroke.y = to.y;
    stroke.at = now;
    const ready = distance > 1e-8 && stroke.distance + 1e-9 >= 0.025;
    if (!endsInside) this.resetFocusStroke();
    return ready;
  }

  /** Call before setMode('result'); ordinary failed attempts never trigger confetti. */
  setOutcome(won: boolean): void {
    this.resultWon = won;
    if (won && this.mode === 'result' && !this.celebrated) this.celebrate();
  }

  setRecipe(recipe: RecipeKind): void {
    if (this.recipe === recipe) return;
    this.recipe = recipe;
    this.buildDisplay();
    this.populateBowl();
    this.applyAtmospherePalette();
    this.updateAtmosphere();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.last = 0;
    if (paused) {
      this.pointer.active = false;
      this.resetFocusStroke();
      this.lastSlashAt = -Infinity;
    }
  }

  spawn(id: string, kind: ArenaKind, isTarget: boolean, shiny = false): void {
    if (this.disposed || this.mode !== 'playing' || this.foods.has(id) || this.foods.size >= 32)
      return;
    const object = this.factory.createFood(kind);
    const aspect = this.width / this.height;
    const xLimit = Math.max(1.3, this.viewHeight * aspect * 0.5 - 1.1);
    const x = (Math.random() * 2 - 1) * xLimit * 0.85;
    object.position.set(x, -this.viewHeight * 0.59, (Math.random() - 0.5) * 1.8);
    const upright =
      isSpecialKind(kind) ||
      kind === 'fish' ||
      kind === 'chili' ||
      kind === 'flour' ||
      kind === 'egg' ||
      kind === 'strawberry' ||
      kind === 'broccoli';
    // Show each family's recognizable face, with enough tilt to retain its volume.
    object.rotation.set(
      upright ? 0.12 + (Math.random() - 0.5) * 0.12 : 0.9 + Math.random() * 0.2,
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.3,
    );
    object.scale.setScalar(1.05 + Math.random() * 0.12);
    const food: Ingredient = {
      id,
      kind,
      target: isTarget,
      object,
      age: 0,
      velocity: new THREE.Vector3(
        -x * 0.16 + (Math.random() - 0.5) * 0.65,
        8.4 + Math.random() * 0.7,
        0,
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * (upright ? 0.08 : 0.14),
        (Math.random() - 0.5) * 0.24,
        (Math.random() - 0.5) * 0.28,
      ),
    };
    if (shiny && isTarget && !isSpecialKind(kind)) {
      food.shinyMaterials = this.factory.makeShiny(object, this.options.quality === 'low');
      food.sparkles = object.getObjectByName('shiny-sparkles');
      food.sparkles?.traverse((node) => {
        if (node instanceof THREE.Mesh) node.material = this.rareSparkMaterial;
      });
      food.rare = this.createRareEffect();
    }
    if (kind === 'heart') food.candy = object.getObjectByName('heart-candy');
    this.foods.set(id, food);
    this.arena.add(object);
  }

  slash(from: Point, to: Point): void {
    if (this.disposed || this.paused || this.mode !== 'playing') return;
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return;
    const clamp = (p: Point): Point => ({
      x: THREE.MathUtils.clamp(p.x, 0, 1),
      y: THREE.MathUtils.clamp(p.y, 0, 1),
    });
    const a = clamp(from);
    const b = clamp(to);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < (this.focus ? 1e-6 : 0.0015)) return;
    let hit = false;
    // Pixel-space collision stays circular even when the viewport is very wide.
    const ax = a.x * this.width;
    const ay = a.y * this.height;
    const dx = (b.x - a.x) * this.width;
    const dy = (b.y - a.y) * this.height;
    const lengthSq = dx * dx + dy * dy;
    this.bladeAngle = Math.atan2(dy, dx);
    const matches: Ingredient[] = [];
    let touchesFocus = false;
    this.scene.updateMatrixWorld();
    for (const food of this.foods.values()) {
      if (this.focus && food.id !== this.focus.id) continue;
      this.projected.copy(food.object.position).project(this.camera);
      const x = (this.projected.x * 0.5 + 0.5) * this.width;
      const y = (-this.projected.y * 0.5 + 0.5) * this.height;
      const projectedT = ((x - ax) * dx + (y - ay) * dy) / lengthSq;
      const t = THREE.MathUtils.clamp(projectedT, 0, 1);
      const radius = ((0.78 * food.object.scale.x) / this.viewHeight) * this.height;
      if ((x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2 > radius ** 2) continue;
      if (this.focus) {
        touchesFocus = true;
        // Clip travel to the circle: movement before entering the fruit must not earn cuts.
        const perpendicularSq = Math.max(
          0,
          (x - ax) ** 2 + (y - ay) ** 2 - projectedT ** 2 * lengthSq,
        );
        const halfSpan = Math.sqrt(Math.max(0, radius ** 2 - perpendicularSq) / lengthSq);
        const enter = Math.max(0, projectedT - halfSpan);
        const exit = Math.min(1, projectedT + halfSpan);
        const endsInside = (x - ax - dx) ** 2 + (y - ay - dy) ** 2 <= radius ** 2;
        if (
          !this.trackFocusStroke(
            food.id,
            a,
            b,
            distance * Math.max(0, exit - enter),
            endsInside,
            performance.now(),
          )
        )
          continue;
      }
      matches.push(food);
    }
    if (this.focus && !touchesFocus) this.resetFocusStroke();
    for (const food of matches) {
      if (!this.foods.has(food.id)) continue;
      const result = this.options.onHit?.(food.id, food.kind);
      // The host may finish or pause the game synchronously inside the callback.
      if (this.disposed || this.paused || this.mode !== 'playing') break;
      if (!result || !this.foods.has(food.id)) continue;
      if (result === 'focus-start') this.beginFocus(food);
      if (result === 'focus-cut' && this.focus) {
        this.focus.kick = 1;
        this.resetFocusStroke();
      }
      if (result === 'blocked') this.shieldPulse = 1.5;
      this.projected.copy(food.object.position).project(this.camera);
      this.guidance.hit(
        food.kind,
        food.target,
        (this.projected.x * 0.5 + 0.5) * this.width,
        (-this.projected.y * 0.5 + 0.5) * this.height,
        ((0.78 * food.object.scale.x) / this.viewHeight) * this.height,
        result,
      );
      this.burst(food, dx / Math.sqrt(lengthSq), dy / Math.sqrt(lengthSq), result);
      if (result !== 'focus-start' && result !== 'focus-cut') this.removeFood(food);
      hit = true;
      if (result === 'focus-start') break;
    }
    if (this.disposed || this.paused || this.mode !== 'playing') return;
    this.strokes.push({ from: a, to: b, life: 1 });
    if (this.strokes.length > (this.options.quality === 'low' ? 16 : 24)) this.strokes.shift();
    this.sparkSlash(b, dx, dy, hit);
    const slashAt = performance.now();
    const elapsed = slashAt - this.lastSlashAt;
    const sampleSeconds = elapsed > 0 && elapsed < 250 ? Math.max(1 / 300, elapsed / 1000) : 0.034;
    this.lastSlashAt = slashAt;
    this.options.onSlash?.(THREE.MathUtils.clamp(distance / sampleSeconds / 2, 0.08, 1));
  }

  setPointer(x: number, y: number, active: boolean): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pointer.x = THREE.MathUtils.clamp(x, 0, 1);
    this.pointer.y = THREE.MathUtils.clamp(y, 0, 1);
    this.pointer.active = active;
    if (!active) this.resetFocusStroke();
    this.pointer.seenAt = performance.now();
  }

  stir(amount: number): void {
    if (this.mode !== 'mixing' || this.paused || !Number.isFinite(amount)) return;
    this.stirEnergy = Math.min(14, this.stirEnergy + Math.max(0, amount) * 0.65);
  }

  resize(): void {
    if (this.disposed) return;
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      this.options.quality === 'low' ? 1.25 : 1.75,
    );
    this.overlay.width = Math.round(this.width * ratio);
    this.overlay.height = Math.round(this.height * ratio);
    this.ink?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.configureCamera();
  }

  private configureCamera(): void {
    const aspect = this.width / this.height;
    if (this.mode === 'playing') {
      this.viewHeight = 10;
      this.camera.position.set(0, 0.4, 16);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.viewHeight = Math.max(7.6, 8.4 / aspect);
      this.camera.position.set(7, 6.2, 10);
      this.camera.lookAt(0, 1.02, 0);
    }
    this.camera.left = (-this.viewHeight * aspect) / 2;
    this.camera.right = (this.viewHeight * aspect) / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.layoutAtmosphere();
    this.layoutFocus();
  }

  private buildAtmosphere(): void {
    const warm = new THREE.LineBasicMaterial({
      color: '#f4bc78',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      toneMapped: false,
    });
    const sage = new THREE.LineBasicMaterial({
      color: '#b2d9ab',
      transparent: true,
      opacity: 0.105,
      depthWrite: false,
      toneMapped: false,
    });
    this.ambientWarm = warm;
    this.ambientSage = sage;
    this.ambientMaterials.push(warm, sage);
    const ringGeometry = this.factory.geometry('ambient-ring', () => {
      const count = this.options.quality === 'low' ? 40 : 80;
      const points = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      });
      return new THREE.BufferGeometry().setFromPoints(points);
    });
    // Thin circles and botanical line drawings live behind the game, never in its hit map.
    const leafGeometry = this.factory.geometry('ambient-leaf', () => {
      const points: number[] = [];
      const segment = (ax: number, ay: number, bx: number, by: number) => {
        points.push(ax, ay, 0, bx, by, 0);
      };
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        const b = ((i + 1) / 30) * Math.PI * 2;
        segment(Math.sin(a) * 0.4, Math.cos(a), Math.sin(b) * 0.4, Math.cos(b));
      }
      segment(0, -1.18, 0, 0.95);
      for (let i = 0; i < 4; i++) {
        const y = -0.6 + i * 0.35;
        segment(0, y, 0.34, y + 0.23);
        segment(0, y, -0.34, y + 0.23);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      return geometry;
    });
    const whiskGeometry = this.factory.geometry('ambient-whisk', () => {
      const points: number[] = [0, -0.95, 0, 0, 0.05, 0, -0.08, -0.95, 0, 0.08, -0.95, 0];
      for (const width of [0.18, 0.36]) {
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const b = ((i + 1) / 32) * Math.PI * 2;
          points.push(
            Math.sin(a) * width,
            0.45 + Math.cos(a) * 0.55,
            0,
            Math.sin(b) * width,
            0.45 + Math.cos(b) * 0.55,
            0,
          );
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      return geometry;
    });
    const recipeGeometry = (kind: 'grill' | 'sun' | 'chocolate' | 'sugar') =>
      this.factory.geometry(`ambient-${kind}`, () => {
        const points: number[] = [];
        const line = (ax: number, ay: number, bx: number, by: number) =>
          points.push(ax, ay, 0, bx, by, 0);
        if (kind === 'grill' || kind === 'chocolate') {
          line(-0.7, -1, 0.7, -1);
          line(0.7, -1, 0.7, 1);
          line(0.7, 1, -0.7, 1);
          line(-0.7, 1, -0.7, -1);
          if (kind === 'grill') {
            for (let i = 0; i < 5; i++) line(-0.46 + i * 0.23, -0.85, -0.46 + i * 0.23, 0.85);
            line(-0.35, -1, -0.45, -1.35);
            line(0.35, -1, 0.45, -1.35);
          } else {
            line(0, -1, 0, 1);
            line(-0.7, -0.33, 0.7, -0.33);
            line(-0.7, 0.33, 0.7, 0.33);
          }
        } else if (kind === 'sun') {
          for (let i = 0; i < 32; i++) {
            const a = (i / 32) * Math.PI * 2,
              b = ((i + 1) / 32) * Math.PI * 2;
            line(Math.cos(a) * 0.6, Math.sin(a) * 0.6, Math.cos(b) * 0.6, Math.sin(b) * 0.6);
          }
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            line(Math.cos(a) * 0.78, Math.sin(a) * 0.78, Math.cos(a), Math.sin(a));
          }
        } else {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2,
              b = ((i + 1) / 8) * Math.PI * 2;
            const ra = i % 2 ? 0.23 : 1,
              rb = i % 2 ? 1 : 0.23;
            line(Math.cos(a) * ra, Math.sin(a) * ra, Math.cos(b) * rb, Math.sin(b) * rb);
          }
        }
        return new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(points, 3),
        );
      });
    const geometries: Record<string, THREE.BufferGeometry> = {
      ring: ringGeometry,
      leaf: leafGeometry,
      whisk: whiskGeometry,
      grill: recipeGeometry('grill'),
      sun: recipeGeometry('sun'),
      chocolate: recipeGeometry('chocolate'),
      sugar: recipeGeometry('sugar'),
    };
    const specs: { kind: string; x: number; y: number; size: number; recipe?: RecipeKind }[] = [
      { kind: 'ring', x: -0.5, y: 0.02, size: 0.34 },
      { kind: 'ring', x: 0.49, y: -0.06, size: 0.3 },
      { kind: 'whisk', x: 0.39, y: -0.27, size: 0.08 },
      { kind: 'grill', x: -0.4, y: -0.02, size: 0.1, recipe: 'burger' },
      { kind: 'leaf', x: 0.39, y: 0.28, size: 0.045, recipe: 'burger' },
      { kind: 'sun', x: -0.39, y: 0.22, size: 0.1, recipe: 'tacos' },
      { kind: 'leaf', x: 0.4, y: 0.27, size: 0.05, recipe: 'tacos' },
      { kind: 'chocolate', x: -0.4, y: 0.07, size: 0.09, recipe: 'cake' },
      { kind: 'sugar', x: 0.4, y: 0.24, size: 0.045, recipe: 'cake' },
      { kind: 'sugar', x: -0.36, y: -0.27, size: 0.025, recipe: 'cake' },
    ];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (this.options.quality === 'low' && spec.size < 0.055) continue;
      const object =
        spec.kind === 'ring'
          ? new THREE.LineLoop(ringGeometry, i % 2 ? warm : sage)
          : new THREE.LineSegments(geometries[spec.kind], spec.kind === 'leaf' ? sage : warm);
      object.renderOrder = -20;
      this.atmosphere.add(object);
      this.ambientMarks.push({ object, ...spec, phase: i * 1.7, speed: i % 2 ? -0.035 : 0.025 });
    }
    const dustCount = this.options.quality === 'low' ? 14 : 38;
    const dustGeometry = this.factory.geometry('ambient-dust', () => {
      const positions = new Float32Array(dustCount * 3);
      const colors = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        const color = new THREE.Color(i % 3 ? '#e3bd80' : '#b3d6a6');
        color.toArray(colors, i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    const dustMaterial = new THREE.PointsMaterial({
      size: this.options.quality === 'low' ? 1.4 : 2.1,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.3,
      vertexColors: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.ambientMaterials.push(dustMaterial);
    this.ambientDust = new THREE.Points(dustGeometry, dustMaterial);
    this.ambientDust.frustumCulled = false;
    this.ambientDust.renderOrder = -20;
    this.atmosphere.add(this.ambientDust);
    const streakCount = this.options.quality === 'low' ? 7 : 14;
    const streakGeometry = this.factory.geometry('event-streaks', () =>
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(streakCount * 18), 3),
      ),
    );
    this.eventStreaks = new THREE.LineSegments(streakGeometry, this.eventStreakMaterial);
    this.eventStreaks.frustumCulled = false;
    this.eventStreaks.renderOrder = -18;
    this.atmosphere.add(this.eventStreaks);
    this.ambientPulse = new THREE.Mesh(
      this.factory.geometry('ambient-pulse', () => new THREE.RingGeometry(0.97, 1, 64)),
      this.ambientPulseMaterial,
    );
    this.ambientPulse.position.z = 0.04;
    this.ambientPulse.renderOrder = -19;
    this.atmosphere.add(this.ambientPulse);
    this.atmosphere.visible = false;
    this.applyAtmospherePalette();
  }

  private applyAtmospherePalette(): void {
    if (!this.ambientWarm) return;
    const slow = this.event === 'slow';
    const rush = this.event === 'rush';
    const focus = this.event === 'focus';
    this.themePrimary.set(
      slow
        ? '#8eeaff'
        : rush
          ? '#ffdb74'
          : this.recipe === 'cake'
            ? '#f2bfa7'
            : this.recipe === 'tacos'
              ? '#ffc867'
              : '#f5ad6f',
    );
    this.themeSecondary.set(
      slow ? '#d6faff' : rush ? '#ffe9a7' : this.recipe === 'cake' ? '#fff2df' : '#b2d9ab',
    );
    this.ambientWarm.color.copy(this.themePrimary);
    this.ambientSage.color.copy(this.themeSecondary);
    this.ambientWarm.opacity = focus ? 0.025 : rush ? 0.25 : slow ? 0.21 : 0.12;
    this.ambientSage.opacity = focus ? 0.025 : rush ? 0.19 : slow ? 0.17 : 0.105;
    this.eventStreakMaterial.color.set(slow ? '#adefff' : '#ffd586');
    this.eventStreakMaterial.opacity = this.reducedMotion.matches ? 0.15 : slow ? 0.38 : 0.43;
    this.ambientPulseMaterial.color.set(slow ? '#8eeaff' : rush ? '#ffdb74' : this.blade.color);
    const colors = this.ambientDust.geometry.getAttribute('color');
    (this.ambientDust.material as THREE.PointsMaterial).size =
      (this.options.quality === 'low' ? 1.5 : 2.1) *
      (rush ? 1.6 : slow ? 1.3 : this.recipe === 'tacos' ? 1.3 : 1);
    (this.ambientDust.material as THREE.PointsMaterial).opacity = focus
      ? 0.08
      : rush
        ? 0.7
        : slow
          ? 0.55
          : 0.3;
    for (let i = 0; i < colors.count; i++) {
      const color = i % 3 ? this.themePrimary : this.themeSecondary;
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  private layoutAtmosphere(): void {
    if (!this.ambientDust) return;
    this.camera.getWorldDirection(this.viewDirection);
    this.atmosphere.position.copy(this.camera.position).addScaledVector(this.viewDirection, 24);
    this.atmosphere.quaternion.copy(this.camera.quaternion);
    this.updateAtmosphere();
  }

  private updateAtmosphere(): void {
    const width = (this.viewHeight * this.width) / this.height;
    const time = this.reducedMotion.matches ? 0 : this.time;
    for (const mark of this.ambientMarks) {
      mark.object.visible = !mark.recipe || mark.recipe === this.recipe;
      if (!mark.object.visible) continue;
      mark.object.position.set(
        mark.x * width + Math.sin(time * 0.15 + mark.phase) * 0.075,
        mark.y * this.viewHeight + Math.sin(time * 0.25 + mark.phase) * 0.1,
        0,
      );
      mark.object.rotation.z =
        (mark.recipe ? Math.sin(mark.phase) * 0.25 : mark.phase) +
        Math.sin(time * mark.speed) * (mark.recipe ? 0.14 : 1);
      mark.object.scale.setScalar(mark.size * this.viewHeight);
    }
    const positions = this.ambientDust.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      // Keep recipe dust at the edges so it cannot be mistaken for a moving target.
      const lane = (i * 0.618033) % 1;
      const x = (i % 2 ? 0.84 : 0.025) + lane * 0.13 + Math.sin(time * 0.3 + i) * 0.008;
      const direction = this.recipe === 'burger' ? 1 : -1;
      const speed =
        this.event === 'slow'
          ? 0.007
          : this.event === 'rush'
            ? 0.04
            : this.recipe === 'burger'
              ? 0.024
              : 0.012;
      const y = (((i * 0.381966 + time * direction * (speed + (i % 3) * 0.0015)) % 1) + 1) % 1;
      positions.setXYZ(i, (x - 0.5) * width, (y - 0.5) * this.viewHeight, 0.1);
    }
    positions.needsUpdate = true;
    this.eventStreaks.visible = this.event === 'rush' || this.event === 'slow';
    if (this.eventStreaks.visible) {
      const streaks = this.eventStreaks.geometry.getAttribute('position');
      const rush = this.event === 'rush';
      const count = streaks.count / 6;
      for (let i = 0; i < count; i++) {
        const lane = (i * 0.618033) % 1;
        const x = ((i % 2 ? 0.84 : 0.025) + lane * 0.13 - 0.5) * width;
        const y =
          (((((i * 0.381966 + time * (rush ? 0.48 : -0.018)) % 1) + 1) % 1) - 0.5) *
          this.viewHeight;
        for (let j = 0; j < 3; j++) {
          const index = i * 6 + j * 2;
          if (rush) {
            const offset = j * 0.055;
            streaks.setXYZ(index, x + offset, y, 0.15);
            streaks.setXYZ(
              index + 1,
              x + offset - 0.06,
              y + this.viewHeight * (0.035 + lane * 0.045),
              0.15,
            );
          } else {
            const angle = (j * Math.PI) / 3 + i + time * 0.12;
            const dx = Math.cos(angle) * (0.07 + lane * 0.07);
            const dy = Math.sin(angle) * (0.07 + lane * 0.07);
            streaks.setXYZ(index, x - dx, y - dy, 0.15);
            streaks.setXYZ(index + 1, x + dx, y + dy, 0.15);
          }
        }
      }
      streaks.needsUpdate = true;
    }
    const intro = Math.min(1, this.transitionAge / 1.25);
    const stirring = this.mode === 'mixing' ? Math.min(1, this.stirEnergy / 10) : 0;
    this.ambientPulse.scale.setScalar(this.viewHeight * (0.16 + intro * 0.35 + stirring * 0.03));
    this.ambientPulseMaterial.opacity = this.reducedMotion.matches
      ? 0
      : (1 - intro) * 0.28 + stirring * 0.055;
  }

  private getBladeMaterial(): THREE.MeshBasicMaterial {
    let material = this.bladeMaterials.get(this.blade.id);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: this.blade.color, toneMapped: false });
      this.bladeMaterials.set(this.blade.id, material);
    }
    return material;
  }

  private sparkSlash(point: Point, dx: number, dy: number, hit: boolean): void {
    if (this.reducedMotion.matches) return;
    if (!hit && this.time - this.lastSparkAt < 0.038) return;
    this.lastSparkAt = this.time;
    const low = this.options.quality === 'low';
    const count = hit ? (low ? 3 : 8) : low ? 1 : 2;
    const limit = low ? 24 : 64;
    for (let i = 0; i < count && this.inkSparks.length < limit; i++) {
      const angle = Math.atan2(dy, dx) + Math.PI + (Math.random() - 0.5) * 2.4;
      const speed = (hit ? 90 : 45) + Math.random() * 70;
      this.inkSparks.push({
        x: point.x * this.width,
        y: point.y * this.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 0.18 + Math.random() * 0.22,
        size: 0.8 + Math.random() * 1.6,
        color: this.blade.color,
      });
    }
  }

  private celebrate(): void {
    this.celebrated = true;
    if (this.reducedMotion.matches) return;
    const count = this.options.quality === 'low' ? 18 : 44;
    const shape = this.factory.geometry(
      'celebration-flake',
      () => new THREE.BoxGeometry(1, 1, 0.18),
    );
    for (let i = 0; i < count && this.particles.length < 120; i++) {
      const object = new THREE.Mesh(
        shape,
        i % 3 === 0
          ? this.getBladeMaterial()
          : this.factory.material(i % 2 ? '#ffe6a5' : '#a5c489'),
      );
      const angle = i * 2.39996;
      const scale = 0.045 + Math.random() * 0.055;
      object.position.set(Math.cos(angle) * 1.8, 1.4 + Math.random() * 1.2, Math.sin(angle) * 1.8);
      object.scale.setScalar(scale);
      this.effects.add(object);
      this.particles.push({
        object,
        age: 0,
        life: 1.3 + Math.random() * 0.7,
        scale,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (1.2 + Math.random()),
          3.5 + Math.random() * 3,
          Math.sin(angle) * (1.2 + Math.random()),
        ),
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  private buildDisplay(): void {
    this.display.clear();
    this.floaters.length = 0;
    const shadow = new THREE.Mesh(
      this.factory.geometry('shadow-plane', () => new THREE.PlaneGeometry(9, 9)),
      this.shadowMaterial,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.25;
    this.display.add(shadow, this.factory.platter());
    const dish = this.factory.recipe(this.recipe);
    dish.name = 'hero-dish';
    dish.rotation.y = -0.15;
    this.display.add(dish);
    const floatKinds =
      this.recipe === 'cake'
        ? ['strawberry', 'chocolate', 'strawberry']
        : this.recipe === 'tacos'
          ? ['avocado', 'chili', 'onion']
          : ['tomato', 'onion', 'lettuce'];
    const positions = [
      new THREE.Vector3(-2.7, 2.7, 0.1),
      new THREE.Vector3(2.3, 3.65, -0.5),
      new THREE.Vector3(2.85, 1.8, 1),
    ];
    floatKinds.forEach((kind, i) => {
      const object = this.factory.createFood(kind);
      object.position.copy(positions[i]);
      object.rotation.set(0.6 + i * 0.4, i, 0.4 + i * 0.5);
      object.scale.setScalar(i === 2 ? 0.56 : 0.7);
      this.display.add(object);
      this.floaters.push({
        object,
        origin: positions[i].clone(),
        phase: i * 2.1,
        speed: 0.7 + i * 0.17,
      });
    });
    // Small detached basil leaves make the composition feel plated and fresh.
    for (let i = 0; i < 3; i++) {
      const leaf = this.factory.leaf('#3d713d');
      leaf.scale.set(0.37, 0.6, 0.15);
      leaf.position.set(-1.9 + i * 0.14, 0.18 + i * 0.02, 1.63 + i * 0.12);
      leaf.rotation.y = -0.5 + i * 0.4;
      this.display.add(leaf);
    }
  }

  private buildBowl(): void {
    const shellGeometry = this.factory.geometry(
      'mixing-bowl',
      () => new THREE.SphereGeometry(2.02, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    );
    const shell = this.factory.mesh(shellGeometry, '#b7cbb9', 0.32);
    shell.scale.y = 0.72;
    shell.position.y = 1.64;
    const rim = this.factory.ring('#e9f0df', 2.02, 0.095);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.64;
    const base = this.factory.cylinder('#738f7c', 0.72, 0.13);
    base.position.y = 0.22;
    const contents = this.factory.cylinder('#e6b978', 1.74, 0.08);
    contents.position.y = 1.08;
    this.bowl.add(
      this.factory.platter(),
      shell,
      rim,
      base,
      contents,
      this.bowlIngredients,
      this.whisk,
    );
    const handle = this.factory.cylinder('#a9794b', 0.11, 1.4);
    handle.position.y = 1.02;
    const collar = this.factory.cylinder('#bec7bf', 0.115, 0.3);
    collar.position.y = 0.32;
    this.whisk.add(handle, collar);
    for (let i = 0; i < 5; i++) {
      const wire = this.factory.ring('#dbe2d8', 0.4, 0.018);
      wire.scale.y *= 1.8;
      wire.rotation.y = (i * Math.PI) / 5;
      wire.position.y = -0.31;
      this.whisk.add(wire);
    }
    this.whisk.position.set(0, 1.55, 0);
    this.whisk.rotation.z = -0.32;
    this.populateBowl();
  }

  private populateBowl(): void {
    this.bowlIngredients.clear();
    const kinds =
      this.recipe === 'cake'
        ? ['strawberry', 'chocolate', 'egg']
        : this.recipe === 'tacos'
          ? ['tomato', 'avocado', 'chicken']
          : ['tomato', 'lettuce', 'cheese'];
    for (let i = 0; i < 9; i++) {
      const food = this.factory.createFood(kinds[i % kinds.length]);
      const a = (i * Math.PI * 2) / 9;
      food.position.set(
        Math.cos(a) * (0.7 + (i % 2) * 0.45),
        1.21 + (i % 3) * 0.035,
        Math.sin(a) * (0.7 + (i % 2) * 0.45),
      );
      food.scale.setScalar(0.35);
      food.rotation.set(i * 0.3, i * 0.7, i * 0.2);
      this.bowlIngredients.add(food);
    }
  }

  private burst(food: Ingredient, dx: number, dy: number, result?: HitResult): void {
    if (result === 'heal' || result === 'full-health') {
      this.healBurst(food, result === 'heal');
      return;
    }
    const special = isSpecialKind(food.kind);
    const focusCut = result === 'focus-start' || result === 'focus-cut';
    const count = this.reducedMotion.matches
      ? 4
      : this.options.quality === 'low'
        ? 7
        : special
          ? 15
          : focusCut
            ? 7
            : 12;
    const color =
      result === 'blocked'
        ? '#c5faff'
        : focusCut
          ? '#ffe19b'
          : food.kind === 'shield'
            ? '#a9f4ff'
            : food.kind === 'slow'
              ? '#8eeaff'
              : food.kind === 'danger' || !food.target
                ? '#ff7266'
                : FOOD_COLORS[food.kind] || '#eeb969';
    const limit = this.options.quality === 'low' ? 55 : 90;
    for (let i = 0; i < count && this.particles.length < limit; i++) {
      const shape = this.factory.geometry(
        special ? 'special-shard' : i < 2 && !focusCut ? 'chunk' : 'crumb',
        () =>
          special
            ? new THREE.OctahedronGeometry(1, 0)
            : i < 2 && !focusCut
              ? new THREE.IcosahedronGeometry(1, 1)
              : new THREE.SphereGeometry(1, 6, 4),
      );
      const object =
        !special && !focusCut && food.target && i >= 2 && i % 4 === 0
          ? new THREE.Mesh(shape, this.getBladeMaterial())
          : this.factory.mesh(shape, color);
      object.castShadow = false;
      object.receiveShadow = false;
      const scale = i < 2 && !focusCut ? 0.3 : 0.045 + Math.random() * 0.075;
      object.scale.set(scale, scale * (i < 2 ? 0.5 : 1), scale);
      object.position.copy(food.object.position);
      this.effects.add(object);
      const side = i % 2 ? 1 : -1;
      this.particles.push({
        object,
        age: 0,
        life: 0.48 + Math.random() * 0.36,
        scale,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4 + dy * side * 1.8,
          1.5 + Math.random() * 2 + dx * side,
          (Math.random() - 0.5) * 3,
        ),
        spin: (Math.random() - 0.5) * 9,
      });
    }
  }

  private healBurst(food: Ingredient, restored: boolean): void {
    const low = this.options.quality === 'low';
    const count = restored ? (this.reducedMotion.matches ? 4 : low ? 8 : 14) : 3;
    const limit = low ? 55 : 90;
    for (let i = 0; i < count && this.particles.length < limit; i++) {
      const heart = restored && i < (low ? 2 : 3);
      const geometry = heart
        ? this.factory.heartGeometry()
        : this.factory.geometry('heal-spark', () => new THREE.OctahedronGeometry(1, 0));
      const object = new THREE.Mesh(geometry, this.healMaterial);
      object.position.copy(food.object.position);
      object.position.z += 0.4;
      const scale = heart ? 0.14 + Math.random() * 0.07 : 0.04 + Math.random() * 0.04;
      object.scale.setScalar(scale);
      object.rotation.z = (Math.random() - 0.5) * 0.4;
      this.effects.add(object);
      this.particles.push({
        object,
        age: 0,
        life: restored ? 0.85 : 0.45,
        scale,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * (restored ? 2.4 : 1),
          restored ? 1.7 + Math.random() * 1.5 : 0.4,
          0.15,
        ),
        gravity: restored ? -0.25 : 1,
        spin: heart ? 0.3 : 2,
      });
    }
  }

  private update(dt: number): void {
    this.time += dt;
    this.shieldPulse *= Math.exp(-dt * 4);
    this.guidance.update(dt);
    this.transitionAge += dt;
    if (this.atmosphere.visible) this.updateAtmosphere();
    const progress = this.reducedMotion.matches ? 1 : Math.min(1, this.transitionAge / 0.85);
    // Ease decorative groups only: food positions and collision projection stay untouched.
    const entry = 1 - Math.pow(1 - progress, 3);
    const flourish = Math.sin(progress * Math.PI) * (1 - progress);
    if (this.mode === 'hero' || this.mode === 'result') {
      this.display.scale.setScalar(0.84 + entry * 0.16 + flourish * 0.075);
      this.display.position.y = (1 - entry) * -0.45;
      this.display.rotation.y = (1 - entry) * -0.28;
    } else if (this.mode === 'mixing') {
      this.bowl.scale.setScalar(0.82 + entry * 0.18 + flourish * 0.06);
      this.bowl.position.y = (1 - entry) * -0.35;
    }
    if (this.mode === 'hero' || this.mode === 'result') {
      if (!this.reducedMotion.matches) {
        for (const floater of this.floaters) {
          floater.object.position.y =
            floater.origin.y + Math.sin(this.time * floater.speed + floater.phase) * 0.17;
          floater.object.rotation.y += dt * 0.15;
          floater.object.rotation.z += Math.cos(this.time * 0.6 + floater.phase) * dt * 0.045;
        }
        const dish = this.display.getObjectByName('hero-dish');
        if (dish) dish.rotation.y = -0.15 + Math.sin(this.time * 0.24) * 0.12;
      }
    }
    if (this.mode === 'mixing') {
      this.stirEnergy *= Math.exp(-dt * 1.5);
      this.stirAngle += dt * (0.7 + this.stirEnergy);
      this.bowlIngredients.rotation.y = this.stirAngle;
      this.whisk.position.x = Math.sin(this.stirAngle) * 0.65;
      this.whisk.position.z = Math.cos(this.stirAngle) * 0.65;
      this.whisk.rotation.z = -0.26 + Math.cos(this.stirAngle) * 0.2;
      this.whisk.rotation.x = Math.sin(this.stirAngle) * 0.22;
      this.whisk.rotation.y = -this.stirAngle;
    }
    const focus = this.focus;
    this.updateFocus(dt);
    const flightDt = focus ? 0 : dt * this.worldSpeed;
    for (const food of this.foods.values()) {
      if (food.shinyMaterials) {
        const shine = this.reducedMotion.matches ? 0.14 : 0.12 + Math.sin(this.time * 4.5) * 0.045;
        for (const material of food.shinyMaterials) material.emissiveIntensity = shine;
        if (food.sparkles && !this.reducedMotion.matches) {
          food.sparkles.rotation.z = this.time * 0.35;
          for (let i = 0; i < food.sparkles.children.length; i++) {
            const flicker = 0.75 + Math.sin(this.time * 4 + i * 1.9) * 0.3;
            food.sparkles.children[i].scale.set(0.065 * flicker, 0.15 * flicker, 0.045 * flicker);
          }
        }
      }
      if (focus) {
        this.updateRareEffect(food, focus.id === food.id ? dt : 0);
        continue;
      }
      food.age += flightDt;
      food.velocity.y -= 4.9 * flightDt;
      food.object.position.addScaledVector(food.velocity, flightDt);
      food.object.rotation.x += food.spin.x * flightDt;
      food.object.rotation.y += food.spin.y * flightDt;
      food.object.rotation.z += food.spin.z * flightDt;
      if (food.candy) {
        const motion = this.reducedMotion.matches ? 0 : 1;
        food.candy.position.y = Math.sin(food.age * 4) * 0.065 * motion;
        food.candy.rotation.y = Math.sin(food.age * 2) * 0.24 * motion;
        food.candy.rotation.z = Math.sin(food.age * 3) * 0.1 * motion;
        food.candy.scale.setScalar(1 + Math.sin(food.age * 4.5) * 0.045 * motion);
      }
      this.updateRareEffect(food, dt);
      if (
        (food.age > 0.7 && food.object.position.y < -this.viewHeight * 0.8) ||
        food.age > ACTIVE_LIFETIME
      ) {
        this.removeFood(food);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.effects.remove(particle.object);
        this.particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= dt * (particle.gravity ?? 6);
      particle.object.position.addScaledVector(particle.velocity, dt);
      particle.object.rotation.x += particle.spin * dt;
      particle.object.rotation.z += particle.spin * dt * 0.7;
      const fade = Math.min(1, (1 - particle.age / particle.life) * 3);
      particle.object.scale.setScalar(particle.scale * fade);
    }
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      this.strokes[i].life -= dt * 4.6;
      if (this.strokes[i].life <= 0) this.strokes.splice(i, 1);
    }
    for (let i = this.inkSparks.length - 1; i >= 0; i--) {
      const spark = this.inkSparks[i];
      spark.age += dt;
      if (spark.age >= spark.life) {
        this.inkSparks.splice(i, 1);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 85 * dt;
    }
  }

  private drawInk(): void {
    const ctx = this.ink;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const glow = this.options.quality !== 'low' && !this.reducedMotion.matches;
    if (this.mode === 'playing') {
      if (!this.focus)
        this.guidance.drawShield(
          ctx,
          this.width,
          this.height,
          this.shieldSeconds,
          this.shieldPulse,
          this.time,
        );
      this.guidance.drawFeedback(ctx);
    } else if (this.mode === 'mixing') {
      this.projected.set(0, 1.15, 0).applyMatrix4(this.bowl.matrixWorld).project(this.camera);
      this.guidance.drawMixing(
        ctx,
        (this.projected.x * 0.5 + 0.5) * this.width,
        (-this.projected.y * 0.5 + 0.5) * this.height,
        ((2.65 * this.bowl.scale.x) / this.viewHeight) * this.height,
        this.stirAngle,
        this.blade.glow,
      );
    }
    for (const stroke of this.strokes) {
      const alpha = Math.max(0, stroke.life);
      ctx.beginPath();
      ctx.moveTo(stroke.from.x * this.width, stroke.from.y * this.height);
      ctx.lineTo(stroke.to.x * this.width, stroke.to.y * this.height);
      ctx.globalAlpha = alpha * 0.2;
      ctx.strokeStyle = this.blade.glow;
      ctx.lineWidth = 21 * alpha;
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = this.blade.color;
      ctx.lineWidth = 8 * alpha;
      // Layered strokes provide the glow without a costly blur for every input sample.
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fffdf0';
      ctx.lineWidth = 2.8 * alpha;
      ctx.stroke();
    }
    for (const spark of this.inkSparks) {
      ctx.globalAlpha = 1 - spark.age / spark.life;
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = spark.size;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 0.025, spark.y - spark.vy * 0.025);
      ctx.stroke();
    }
    if (performance.now() - this.pointer.seenAt < 1500 && this.mode === 'playing' && !this.paused) {
      const x = this.pointer.x * this.width;
      const y = this.pointer.y * this.height;
      const active = this.pointer.active;
      const pulse = active && !this.reducedMotion.matches ? Math.sin(this.time * 12) * 1.3 : 0;
      ctx.globalAlpha = active ? 1 : 0.8;
      ctx.shadowColor = this.blade.glow;
      ctx.shadowBlur = glow && active ? 15 : 0;
      ctx.beginPath();
      ctx.arc(x, y, (active ? 16 : 12) + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = this.blade.color;
      ctx.lineWidth = active ? 2 : 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.translate(x, y);
      ctx.rotate(this.bladeAngle);
      // A small directional blade makes the selected finish visible even without a cut.
      ctx.beginPath();
      ctx.moveTo(active ? 11 : 7, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fillStyle = this.blade.glow;
      ctx.fill();
    }
    ctx.restore();
  }

  private animate = (now: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    if (!this.last) this.last = now;
    // Match the host engine's clamp so lower frame rates do not slow only the food.
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (document.hidden) return;
    if (!this.paused) this.update(dt);
    const maxFPS =
      this.paused ||
      (this.reducedMotion.matches && this.mode !== 'playing' && this.mode !== 'mixing')
        ? 5
        : this.mode === 'playing' || this.mode === 'mixing'
          ? 60
          : 30;
    if (now - this.lastDraw < 1000 / maxFPS - 1) return;
    this.lastDraw = now;
    this.renderer.render(this.scene, this.camera);
    this.drawInk();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.foods.forEach((food) => this.removeFood(food));
    this.focus = null;
    this.resetFocusStroke();
    this.particles.length = 0;
    this.strokes.length = 0;
    this.inkSparks.length = 0;
    this.guidance.dispose();
    this.floaters.length = 0;
    this.ambientMarks.length = 0;
    this.scene.clear();
    this.ambientMaterials.forEach((material) => material.dispose());
    this.ambientMaterials.length = 0;
    this.ambientPulseMaterial.dispose();
    this.focusVeilMaterial.dispose();
    this.eventStreakMaterial.dispose();
    this.rareMaterials.forEach((material) => material.dispose());
    this.rareMaterials.length = 0;
    this.rareTexture?.dispose();
    this.rareSparkMaterial.dispose();
    this.healMaterial.dispose();
    this.bladeMaterials.forEach((material) => material.dispose());
    this.bladeMaterials.clear();
    this.factory.dispose();
    this.shadowTexture.dispose();
    this.shadowMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove();
    if (this.ownsPosition) this.container.style.position = this.originalPosition;
  }
}

export default KitchenScene;
