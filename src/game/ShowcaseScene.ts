import * as THREE from 'three';
import { FoodFactory } from './food';
import { RUSH_WORLD_SPEED } from './events';
import type { FoodKind } from './recipes';

type CutHalf = { object: THREE.Group; plane: THREE.Plane; side: number };
type BurgerLayer = { object: THREE.Object3D; y: number; order: number };
const WIDTH = 1920;
const HEIGHT = 1080;
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const out = (x: number) => 1 - (1 - clamp(x)) ** 3;
const fraction = (x: number) => x - Math.floor(x);
const seed = (index: number) => fraction(Math.sin(index * 127.1 + 311.7) * 43758.5453123);

/** A seekable, silent 32-second film layer. Every pose depends only on the supplied time. */
export class ShowcaseScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-960, 960, 540, -540, 0.1, 4000);
  private readonly factory = new FoodFactory();
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly plans: THREE.Group[] = [];
  private readonly hero = new THREE.Group();
  private readonly heroLayers: BurgerLayer[] = [];
  private readonly gesture = new THREE.Group();
  private readonly phone = new THREE.Group();
  private readonly phoneCursor = new THREE.Group();
  private readonly gestureTomato: THREE.Group;
  private readonly flight = new THREE.Group();
  private readonly flightFoods: THREE.Group[] = [];
  private readonly rare = new THREE.Group();
  private readonly rareTomato: THREE.Group;
  private readonly shieldStar: THREE.Group;
  private readonly goldSparks: THREE.Mesh[] = [];
  private readonly speedMarks: THREE.Mesh[] = [];
  private readonly mix = new THREE.Group();
  private readonly bowlFoods = new THREE.Group();
  private readonly whisk = new THREE.Group();
  private readonly recipes = new THREE.Group();
  private readonly dishes: THREE.Group[] = [];
  private readonly finaleFoods: THREE.Group[] = [];
  private readonly fragments: THREE.Mesh[] = [];
  private readonly fragmentMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly halves: CutHalf[] = [];
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly warmHalo: THREE.Mesh;
  private readonly cyanHalo: THREE.Mesh;
  private readonly contactShadow: THREE.Mesh;
  private readonly blade: THREE.Mesh;
  private readonly bladeGlow: THREE.Mesh;
  private readonly pathDots: THREE.Mesh[] = [];
  private disposed = false;
  private contextLost = false;
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
  };
  private readonly onContextRestored = () => {
    this.contextLost = false;
  };

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(WIDTH, HEIGHT, false);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.camera.position.z = 1800;
    this.scene.add(new THREE.HemisphereLight('#fff2d5', '#47725e', 2.35));
    const key = new THREE.DirectionalLight('#ffe8c3', 3.8);
    key.position.set(-500, 900, 1200);
    const fill = new THREE.DirectionalLight('#bdfff1', 1.65);
    fill.position.set(900, 220, 600);
    const rim = new THREE.DirectionalLight('#ffd09c', 2.4);
    rim.position.set(200, 700, -700);
    this.scene.add(key, fill, rim);
    this.plans.push(this.hero, this.gesture, this.flight, this.rare, this.mix, this.recipes);
    this.scene.add(...this.plans);

    this.warmHalo = this.makeHalo('#ffd08c', true);
    this.cyanHalo = this.makeHalo('#8af1d5', true);
    this.contactShadow = this.makeHalo('#001a10', false);
    this.scene.add(this.warmHalo, this.cyanHalo, this.contactShadow);

    const burger = this.factory.burger();
    for (const object of burger.children)
      this.heroLayers.push({ object, y: object.position.y, order: object.position.y / 2.94 });
    this.hero.add(this.factory.platter(), burger);
    this.buildPhone();
    this.gestureTomato = this.food('tomato');
    this.gesture.add(this.phone, this.gestureTomato);
    for (const kind of ['bread', 'tomato', 'lettuce', 'cheese'] as const) {
      const object = this.food(kind);
      this.flightFoods.push(object);
      this.flight.add(object);
    }
    this.rareTomato = this.food('tomato');
    this.ownedMaterials.push(...this.factory.makeShiny(this.rareTomato, false));
    this.shieldStar = this.factory.createFood('shield');
    this.rare.add(this.rareTomato, this.shieldStar);
    const gold = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
    const streak = new THREE.MeshBasicMaterial({
      color: '#ffc97d',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    });
    this.ownedMaterials.push(gold, streak);
    for (let i = 0; i < 28; i++) {
      const sparkle = new THREE.Mesh(
        this.factory.geometry('film-spark', () => new THREE.OctahedronGeometry(1, 0)),
        gold,
      );
      this.goldSparks.push(sparkle);
      this.rare.add(sparkle);
      if (i < 12) {
        const mark = new THREE.Mesh(
          this.factory.geometry('film-streak', () => new THREE.PlaneGeometry(1, 1)),
          streak,
        );
        this.speedMarks.push(mark);
        this.rare.add(mark);
      }
    }
    this.buildBowl();
    for (const kind of ['burger', 'tacos', 'cake'] as const) {
      const model = new THREE.Group();
      model.add(this.factory.platter(), this.factory.recipe(kind));
      model.rotation.x = 0.29;
      const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      model.position.sub(center);
      const dish = new THREE.Group();
      dish.add(model);
      this.dishes.push(dish);
      this.recipes.add(dish);
    }
    for (const kind of ['tomato', 'onion', 'lettuce'] as const) {
      const object = this.food(kind);
      this.finaleFoods.push(object);
      this.scene.add(object);
    }
    const bladeMaterial = new THREE.MeshBasicMaterial({
      color: '#fff8df',
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
    });
    const bladeGlowMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd28d',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.ownedMaterials.push(bladeMaterial, bladeGlowMaterial);
    const slashGeometry = this.factory.geometry('film-slash', () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0);
      shape.quadraticCurveTo(0, 0.48, 0.5, 0);
      shape.quadraticCurveTo(0, 0.08, -0.5, 0);
      return new THREE.ShapeGeometry(shape, 16);
    });
    this.blade = new THREE.Mesh(slashGeometry, bladeMaterial);
    this.bladeGlow = new THREE.Mesh(slashGeometry, bladeGlowMaterial);
    this.scene.add(this.bladeGlow, this.blade);
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(
        this.factory.geometry('film-dot', () => new THREE.SphereGeometry(1, 12, 8)),
        gold,
      );
      this.pathDots.push(dot);
      this.scene.add(dot);
    }
    for (const color of ['#ef6e4a', '#ffb385', '#fbd7a7', '#88b955', '#ffd083'])
      this.fragmentMaterials.push(this.factory.material(color, 0.6));
    for (let i = 0; i < 28; i++) {
      const fragment = new THREE.Mesh(
        this.factory.geometry('film-fragment', () => new THREE.IcosahedronGeometry(1, 0)),
        this.fragmentMaterials[i % 3],
      );
      this.fragments.push(fragment);
      this.scene.add(fragment);
    }
    this.buildCutHalves();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  render(timeSeconds: number): void {
    if (this.disposed) return;
    if (this.contextLost) throw new Error('Le contexte WebGL du film est indisponible.');
    const t = Number.isFinite(timeSeconds) ? ((timeSeconds % 32) + 32) % 32 : 0;
    for (const plan of this.plans) plan.visible = false;
    for (const object of [...this.finaleFoods, ...this.pathDots, ...this.fragments])
      object.visible = false;
    for (const half of this.halves) half.object.visible = false;
    this.warmHalo.visible = this.cyanHalo.visible = this.contactShadow.visible = false;
    this.blade.visible = this.bladeGlow.visible = false;
    if (t < 4) this.hook(t);
    else if (t < 9) this.gesturePlan(t - 4);
    else if (t < 14) this.cutPlan(t - 9);
    else if (t < 18) this.frenzy(t - 14);
    else if (t < 23) this.mixing(t - 18);
    else if (t < 27) this.recipePlan(t - 23);
    else this.finalPlan(t - 27);
    this.scene.updateMatrixWorld(true);
    for (const half of this.halves) {
      if (!half.object.visible) continue;
      half.plane.set(new THREE.Vector3(half.side, 0, 0), 0);
      this.normalMatrix.getNormalMatrix(half.object.matrixWorld);
      half.plane.applyMatrix4(half.object.matrixWorld, this.normalMatrix);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private position(object: THREE.Object3D, x: number, y: number, z = 0): void {
    object.position.set(x - WIDTH / 2, HEIGHT / 2 - y, z);
  }

  private food(kind: FoodKind): THREE.Group {
    const object = this.factory.createFood(kind);
    object.rotation.set(
      ['fish', 'flour', 'egg', 'strawberry', 'chili'].includes(kind) ? 0.1 : 1.05,
      -0.16,
      -0.09,
    );
    return object;
  }

  private makeHalo(color: string, additive: boolean): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(color) }, opacity: { value: 0.3 } },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'varying vec2 vUv; uniform vec3 tint; uniform float opacity; void main(){float d=length((vUv-0.5)*2.0);float a=pow(max(0.0,1.0-d),2.3)*opacity;gl_FragColor=vec4(tint,a);}',
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.ownedMaterials.push(material);
    return new THREE.Mesh(
      this.factory.geometry('film-halo', () => new THREE.PlaneGeometry(1, 1)),
      material,
    );
  }

  private halo(
    mesh: THREE.Mesh,
    x: number,
    y: number,
    width: number,
    height: number,
    opacity: number,
  ): void {
    mesh.visible = true;
    this.position(mesh, x, y, -400);
    mesh.scale.set(width, height, 1);
    (mesh.material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;
  }

  private heroPose(local: number, explode: number, scale: number, x = 1450): void {
    this.hero.visible = true;
    this.position(this.hero, x, 827 + Math.sin(local * 1.1) * 7);
    this.hero.rotation.set(0.26, -0.18 + Math.sin(local * 0.6) * 0.09, 0.035 * Math.sin(local));
    this.hero.scale.setScalar(scale);
    for (const layer of this.heroLayers) layer.object.position.y = layer.y + layer.order * explode;
    this.halo(this.warmHalo, x, 545, 700, 730, 0.29);
    this.halo(this.contactShadow, x, 913, 690, 70, 0.55);
  }

  private hook(t: number): void {
    const entrance = out(t / 0.65);
    const explode = 0.92 * smooth((t - 0.35) / 0.7) * (1 - smooth((t - 2.15) / 1.0));
    this.heroPose(t, explode, 115 * (0.76 + entrance * 0.24));
    const shine = 1 - Math.abs(t - 2.6) / 0.9;
    if (shine > 0) {
      this.finaleFoods[1].visible = true;
      this.position(this.finaleFoods[1], 1760, 395 + Math.sin(t * 2) * 10);
      this.finaleFoods[1].scale.setScalar(42 * smooth(shine));
      this.finaleFoods[1].rotation.set(1.05, -0.16, -0.09);
    }
  }

  private buildPhone(): void {
    const body = this.factory.mesh(
      this.factory.geometry('film-phone-body', () => {
        const shape = this.rounded(188, 356, 27);
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 19,
          bevelEnabled: true,
          bevelSize: 3,
          bevelThickness: 3,
          bevelSegments: 3,
          steps: 1,
          curveSegments: 10,
        });
        geometry.translate(0, 0, -10);
        return geometry;
      }),
      '#183b30',
      0.25,
    );
    const bezel = this.factory.mesh(
      this.factory.geometry(
        'film-phone-bezel',
        () => new THREE.ShapeGeometry(this.rounded(180, 348, 25)),
      ),
      '#65796d',
      0.35,
    );
    bezel.position.z = 12;
    const screen = this.factory.mesh(
      this.factory.geometry(
        'film-phone-screen',
        () => new THREE.ShapeGeometry(this.rounded(166, 330, 20)),
      ),
      '#0c3027',
      0.35,
    );
    screen.position.z = 13;
    const speaker = this.factory.box('#071c17', [46, 5, 2]);
    speaker.position.set(0, 147, 16);
    const button = this.factory.sphere('#ffbc70', [21, 21, 3]);
    button.position.set(0, -110, 16);
    const home = this.factory.box('#b7d4c1', [44, 3, 2]);
    home.position.set(0, -151, 16);
    const ring = this.factory.ring('#a7e4bb', 15, 1.4);
    const core = this.factory.sphere('#ffe4ab', [4, 4, 2]);
    this.phoneCursor.add(ring, core);
    this.phoneCursor.position.z = 20;
    this.phone.add(body, bezel, screen, speaker, button, home, this.phoneCursor);
  }

  private rounded(width: number, height: number, radius: number): THREE.Shape {
    const x = -width / 2,
      y = -height / 2;
    const s = new THREE.Shape();
    s.moveTo(x + radius, y);
    s.lineTo(x + width - radius, y);
    s.quadraticCurveTo(x + width, y, x + width, y + radius);
    s.lineTo(x + width, y + height - radius);
    s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    s.lineTo(x + radius, y + height);
    s.quadraticCurveTo(x, y + height, x, y + height - radius);
    s.lineTo(x, y + radius);
    s.quadraticCurveTo(x, y, x + radius, y);
    return s;
  }

  private gesturePlan(t: number): void {
    this.gesture.visible = true;
    const swing = Math.sin(t * 1.65 - 0.5);
    this.position(this.phone, 1250, 570 + Math.sin(t * 0.9) * 13);
    this.phone.rotation.set(0.04, -0.26 + swing * 0.14, swing * -0.17);
    this.phone.scale.setScalar(1.12 * (0.85 + out(t / 0.5) * 0.15));
    this.phoneCursor.position.set(swing * 40, 30 + Math.cos(t * 1.65) * 20, 20);
    this.position(this.gestureTomato, 1650, 540 + Math.sin(t * 1.3) * 15);
    this.gestureTomato.scale.setScalar(137);
    const cut = t - 2.0;
    this.gestureTomato.visible = cut < 0 || cut >= 1.25;
    this.halo(this.cyanHalo, 1260, 585, 510, 650, 0.25);
    this.halo(this.warmHalo, 1650, 540, 420, 420, 0.23);
    if (t < 2) {
      this.pathDots.forEach((dot, index) => {
        const p = fraction(t * 0.8 + index / 4);
        dot.visible = true;
        this.position(dot, 1370 + p * 165, 560 - Math.sin(p * Math.PI) * 30, 70);
        dot.scale.setScalar(3 + Math.sin(p * Math.PI) * 2);
      });
    }
    this.sweep(cut + 0.3, 1650, 540, 320, -0.42);
    this.cutTomato(cut, 1650, 540, 137);
  }

  private flightPose(t: number, index: number, speed = 1) {
    const p = fraction((t * speed + [0.12, 0.2, 1.15, 1.95][index]) / 3.2);
    return {
      x: [1160, 1425, 1575, 1715][index] + (p - 0.5) * (index % 2 ? -130 : 130),
      y: 840 - 500 * 4 * p * (1 - p),
      scale: [96, 111, 100, 103][index] * (0.28 + 0.72 * Math.sin(p * Math.PI) ** 0.4),
      p,
    };
  }

  private showFlights(t: number, speed: number, hideTomato = false): void {
    this.flight.visible = true;
    this.flightFoods.forEach((food, index) => {
      const p = this.flightPose(t, index, speed);
      food.visible = !(hideTomato && index === 1);
      this.position(food, p.x, p.y, index % 2 ? -35 : 10);
      food.scale.setScalar(p.scale);
      food.rotation.set(
        1.05 + Math.sin(p.p * TAU) * 0.1,
        Math.sin(p.p * TAU + index) * 0.25,
        Math.sin(p.p * TAU) * 0.35,
      );
    });
  }

  private cutPlan(t: number): void {
    const impact = 1.4;
    const cut = t - impact;
    const target = this.flightPose(impact, 1);
    this.showFlights(t, 1, cut >= 0 && cut < 1.25);
    this.halo(this.warmHalo, 1460, 590, 780, 720, 0.2);
    this.sweep(cut + 0.3, target.x, target.y, 620, -0.42);
    this.cutTomato(cut, target.x, target.y, target.scale);
    if (t > 3.4) {
      const p = smooth((t - 3.4) / 0.5);
      this.blade.visible = this.bladeGlow.visible = t < 4.2;
      this.slashPose(
        1150 + p * 620,
        770 - p * 270,
        260,
        -0.42,
        Math.sin(clamp((t - 3.4) / 0.8) * Math.PI),
      );
    }
  }

  private frenzy(t: number): void {
    this.rare.visible = true;
    this.showFlights(t + 0.4, RUSH_WORLD_SPEED);
    this.flightFoods[1].visible = false;
    const pulse = Math.sin(t * 2.4) * 0.5 + 0.5;
    this.position(this.rareTomato, 1445, 570 + Math.sin(t * 1.3) * 18, 100);
    this.rareTomato.scale.setScalar(153 * (0.92 + out(t / 0.45) * 0.08));
    this.rareTomato.rotation.z = Math.sin(t) * 0.12;
    this.position(this.shieldStar, 1740, 485 + Math.sin(t * 1.8) * 21, 110);
    this.shieldStar.scale.setScalar(70);
    this.shieldStar.rotation.set(0.08, Math.sin(t * 1.6) * 0.25, Math.sin(t * 1.1) * 0.12);
    this.halo(this.warmHalo, 1445, 570, 570 + pulse * 45, 570 + pulse * 45, 0.62);
    this.halo(this.cyanHalo, 1740, 485, 280, 310, 0.32);
    this.goldSparks.forEach((sparkle, i) => {
      const angle = i * 2.39996 + t * (0.35 + seed(i + 1) * 0.25);
      const radius = 135 + seed(i + 28) * 85;
      this.position(
        sparkle,
        1445 + Math.cos(angle) * radius,
        570 + Math.sin(angle) * radius * 0.92,
        70 + Math.cos(angle) * 70,
      );
      sparkle.rotation.set(t + i, i, angle);
      const size = 3 + 4 * (0.5 + Math.sin(t * 2 + i) * 0.5);
      sparkle.scale.set(size, size * 1.7, size);
    });
    this.speedMarks.forEach((mark, i) => {
      const p = fraction(t * 0.95 + seed(i + 80));
      this.position(mark, 1050 + p * 720, 245 + seed(i + 100) * 590, -180);
      mark.rotation.z = 0.2;
      mark.scale.set(48 + seed(i + 140) * 83, 1.7 + seed(i) * 2.5, 1);
    });
  }

  private buildBowl(): void {
    const shell = this.factory.mesh(
      this.factory.geometry(
        'film-bowl',
        () => new THREE.SphereGeometry(2.02, 40, 22, 0, TAU, Math.PI / 2, Math.PI / 2),
      ),
      '#b7cbb9',
      0.28,
    );
    shell.scale.y = 0.72;
    shell.position.y = 1.64;
    const rim = this.factory.ring('#eaf1e0', 2.02, 0.095);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.64;
    const contents = this.factory.cylinder('#e4b677', 1.74, 0.08);
    contents.position.y = 1.1;
    const handle = this.factory.cylinder('#ad8055', 0.12, 1.4);
    handle.position.y = 1.04;
    const collar = this.factory.cylinder('#dce2d4', 0.13, 0.3);
    collar.position.y = 0.34;
    this.whisk.add(handle, collar);
    for (let i = 0; i < 5; i++) {
      const wire = this.factory.ring('#e1e8da', 0.41, 0.019);
      wire.scale.y *= 1.8;
      wire.rotation.y = (i * Math.PI) / 5;
      wire.position.y = -0.31;
      this.whisk.add(wire);
    }
    this.whisk.position.y = 1.55;
    for (let i = 0; i < 9; i++) {
      const food = this.factory.createFood((['tomato', 'lettuce', 'cheese'] as const)[i % 3]);
      const angle = (i / 9) * TAU;
      food.scale.setScalar(0.37);
      food.position.set(
        Math.cos(angle) * (0.75 + (i % 2) * 0.35),
        1.26 + (i % 3) * 0.035,
        Math.sin(angle) * (0.75 + (i % 2) * 0.35),
      );
      food.rotation.set(0.3, angle, 0.12);
      this.bowlFoods.add(food);
    }
    this.mix.add(this.factory.platter(), shell, rim, contents, this.bowlFoods, this.whisk);
  }

  private mixing(t: number): void {
    this.mix.visible = true;
    this.position(this.mix, 1445, 820 + Math.sin(t * 2) * 3);
    this.mix.rotation.set(0.4, Math.sin(t * 0.7) * 0.045, 0);
    this.mix.scale.setScalar(104 * (0.88 + out(t / 0.55) * 0.12));
    const angle = t * 6.3 + t * t * 0.35;
    this.bowlFoods.rotation.y = angle;
    this.whisk.position.set(Math.sin(angle) * 0.62, 1.55, Math.cos(angle) * 0.62);
    this.whisk.rotation.set(Math.sin(angle) * 0.22, -angle, -0.25 + Math.cos(angle) * 0.18);
    this.halo(this.cyanHalo, 1445, 620, 650, 600, 0.3);
    this.halo(this.contactShadow, 1445, 925, 650, 65, 0.5);
    this.pathDots.forEach((dot, i) => {
      const a = angle * 0.5 + (i * Math.PI) / 2;
      dot.visible = true;
      this.position(dot, 1445 + Math.cos(a) * 238, 630 + Math.sin(a) * 95, Math.sin(a) * 160);
      dot.scale.setScalar(4 + (i % 2));
    });
  }

  private recipePlan(t: number): void {
    this.recipes.visible = true;
    this.dishes.forEach((dish, i) => {
      const entry = out((t - i * 0.15) / 0.65);
      this.position(dish, [480, 960, 1440][i], 650 + (1 - entry) * 70 + Math.sin(t * 1.2 + i) * 7);
      dish.scale.setScalar(76 * (0.68 + entry * 0.32));
      dish.rotation.y = Math.sin(t * 0.55 + i) * 0.1;
      dish.rotation.z = (1 - entry) * (i - 1) * 0.08;
    });
    this.halo(this.warmHalo, 960, 670, 1500, 520, 0.21);
  }

  private finalPlan(t: number): void {
    this.heroPose(t + 4, 0.12 * (1 - smooth(t / 1.0)), 115 * (0.92 + out(t / 0.65) * 0.08));
    const poses = [
      [1130, 420, 59],
      [1760, 410, 53],
      [1740, 730, 60],
    ];
    this.finaleFoods.forEach((food, i) => {
      const [x, y, scale] = poses[i];
      food.visible = true;
      this.position(food, x + Math.sin(t * 0.8 + i) * 16, y + Math.cos(t * 1.1 + i) * 18, 20);
      food.scale.setScalar(scale * (0.8 + out((t - i * 0.12) / 0.7) * 0.2));
      food.rotation.z = Math.sin(t * 0.8 + i) * 0.2;
    });
  }

  private slashPose(x: number, y: number, width: number, angle: number, opacity: number): void {
    for (const [index, blade] of [this.blade, this.bladeGlow].entries()) {
      this.position(blade, x, y, 330 - index);
      blade.rotation.z = -angle;
      blade.scale.set(width, index ? 42 : 13, 1);
      (blade.material as THREE.MeshBasicMaterial).opacity = clamp(opacity) * (index ? 0.28 : 0.96);
    }
  }

  private sweep(t: number, x: number, y: number, width: number, angle: number): void {
    if (t < 0 || t > 0.66) return;
    const p = smooth(t / 0.6);
    this.blade.visible = this.bladeGlow.visible = true;
    this.slashPose(
      x + (p - 0.5) * width,
      y + (p - 0.5) * width * Math.tan(angle),
      width * 0.6,
      angle,
      Math.sin(clamp(t / 0.66) * Math.PI),
    );
  }

  private buildCutHalves(): void {
    for (const side of [-1, 1]) {
      const object = new THREE.Group();
      const model = this.food('tomato');
      const plane = new THREE.Plane(new THREE.Vector3(side, 0, 0), 0);
      const copied = new Map<THREE.Material, THREE.Material>();
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const source = node.material as THREE.MeshStandardMaterial;
        let material = copied.get(source);
        if (!material) {
          material = source.clone();
          material.clippingPlanes = [plane];
          copied.set(source, material);
          this.ownedMaterials.push(material);
        }
        node.material = material;
      });
      object.add(model);
      this.halves.push({ object, plane, side });
      this.scene.add(object);
    }
  }

  private cutTomato(t: number, x: number, y: number, scale: number): void {
    if (t < 0 || t >= 1.25) return;
    const life = clamp(t / 1.25);
    for (const half of this.halves) {
      half.object.visible = true;
      this.position(half.object, x - half.side * (18 + t * 115), y - t * 105 + t * t * 155, t * 20);
      half.object.scale.setScalar(scale * (1 - smooth((life - 0.55) / 0.45) * 0.92));
      half.object.rotation.set(t * half.side * 0.22, t * half.side * 0.25, t * half.side * 0.8);
    }
    this.fragments.forEach((fragment, i) => {
      fragment.visible = t < 0.95;
      if (!fragment.visible) return;
      const angle = seed(i + 21) * TAU;
      const speed = 70 + seed(i + 55) * 170;
      this.position(
        fragment,
        x + Math.cos(angle) * speed * t,
        y + Math.sin(angle) * speed * t + t * t * 160,
        80 + seed(i + 20) * 25,
      );
      fragment.rotation.set(i + t * 3, i * 2 + t, angle + t * (i % 2 ? 4 : -4));
      const size = (5 + seed(i + 99) * 8) * (1 - t / 0.95);
      fragment.scale.set(size, size * 0.7, size);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scene.clear();
    this.factory.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
