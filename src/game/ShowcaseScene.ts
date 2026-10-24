import * as THREE from 'three';
import { FoodFactory } from './food';
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
  private readonly cutPairs: CutHalf[][] = [];
  private readonly bomb: THREE.Group;
  private readonly shieldShell: THREE.Mesh;
  private readonly impactRing: THREE.Mesh;
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
    for (const kind of [
      'bread',
      'tomato',
      'lettuce',
      'cheese',
      'onion',
      'avocado',
      'strawberry',
      'chicken',
    ] as const) {
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
      depthTest: false,
      toneMapped: false,
    });
    const bladeGlowMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd28d',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: false,
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
    this.blade.renderOrder = this.bladeGlow.renderOrder = 20;
    this.scene.add(this.bladeGlow, this.blade);
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(
        this.factory.geometry('film-dot', () => new THREE.SphereGeometry(1, 12, 8)),
        gold,
      );
      this.pathDots.push(dot);
      this.scene.add(dot);
    }
    for (const color of [
      '#ef6e4a',
      '#ffb385',
      '#fbd7a7',
      '#88b955',
      '#ffd083',
      '#9bfff0',
      '#313546',
      '#f65b44',
    ])
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
    this.bomb = this.factory.createFood('danger');
    const shieldMaterial = new THREE.MeshPhysicalMaterial({
      color: '#6fece2',
      transparent: true,
      opacity: 0.14,
      roughness: 0.15,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#ffda83',
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.ownedMaterials.push(shieldMaterial, ringMaterial);
    this.shieldShell = new THREE.Mesh(
      this.factory.geometry('film-shield-shell', () => new THREE.SphereGeometry(1, 48, 32)),
      shieldMaterial,
    );
    this.impactRing = new THREE.Mesh(
      this.factory.geometry('film-impact-ring', () => new THREE.TorusGeometry(1, 0.014, 8, 96)),
      ringMaterial,
    );
    this.scene.add(this.bomb, this.shieldShell, this.impactRing);
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
    this.bomb.visible = this.shieldShell.visible = this.impactRing.visible = false;
    this.shieldStar.visible = this.rareTomato.visible = false;
    for (const sparkle of this.goldSparks) sparkle.visible = false;
    for (const mark of this.speedMarks) mark.visible = false;
    this.camera.position.set(0, 0, 1800);
    this.camera.rotation.set(0, 0, 0);
    this.camera.zoom = 1;
    if (t < 2) this.hook(t);
    else if (t < 4) this.brand(t - 2);
    else if (t < 7) this.gesturePlan(t - 4);
    else if (t < 11) this.cutPlan(t - 7);
    else if (t < 13) this.danger(t - 11);
    else if (t < 17) this.frenzy(t - 13);
    else if (t < 19) this.shield(t - 17);
    else if (t < 22) this.mixing(t - 19);
    else if (t < 26) this.macroDishes(t - 22);
    else if (t < 29.5) this.recipePlan(t - 26);
    else this.loop(t - 29.5);
    this.camera.updateProjectionMatrix();
    this.scene.updateMatrixWorld(true);
    for (const half of this.halves) {
      if (!half.object.visible) continue;
      half.plane.normal.set(half.side, 0, 0);
      half.plane.constant = 0;
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

  private heroPose(t: number, explode: number, scale: number): void {
    this.hero.visible = true;
    this.position(this.hero, 960, 835 + Math.sin(t * 2) * 10);
    this.hero.rotation.set(
      0.34 + Math.sin(t * 1.4) * 0.045,
      -0.42 + t * 0.3,
      Math.sin(t * 2) * 0.035,
    );
    this.hero.scale.setScalar(scale);
    for (const layer of this.heroLayers) layer.object.position.y = layer.y + layer.order * explode;
    this.halo(this.warmHalo, 960, 570, 1250, 1050, 0.42);
    this.halo(this.contactShadow, 960, 940, 1100, 100, 0.6);
  }

  private hook(t: number): void {
    const cut = t - 1.2;
    this.gesture.visible = true;
    this.phone.visible = false;
    this.gestureTomato.visible = cut < 0;
    const scale = 305 + out(t / 0.95) * 155;
    this.position(this.gestureTomato, 960, 540, 80);
    this.gestureTomato.scale.setScalar(scale);
    this.gestureTomato.rotation.set(1.05, -0.16, -0.09 + Math.sin(t * 2) * 0.06);
    this.halo(this.warmHalo, 960, 540, 1250, 1150, 0.48);
    this.sweep(cut + 0.18, 960, 540, 1240, -0.38);
    this.cutFood(cut, 960, 540, 460, 1, 1.05, 300);
    this.burst(cut, 960, 540, 1.4, 'food');
    this.camera.zoom = 1 + Math.sin(clamp(cut / 0.3) * Math.PI) * 0.035;
  }

  private brand(t: number): void {
    const assembly = smooth((t - 0.1) / 1.25);
    const bounce = Math.sin(clamp((t - 1.15) / 0.75) * Math.PI) * 0.07;
    this.heroPose(t, (1 - assembly) * 2.5, 142 + out(t / 0.5) * 13 + bounce * 100);
    this.hero.rotation.y = -0.72 + out(t / 1.8) * 1.07;
    this.camera.zoom = 0.91 + smooth(t / 2) * 0.12;
    this.camera.rotation.z = (1 - assembly) * -0.045;
    this.finaleFoods.forEach((food, i) => {
      const a = t * 1.6 + (i * TAU) / 3;
      food.visible = true;
      this.position(food, 960 + Math.cos(a) * 580, 540 + Math.sin(a) * 260, Math.sin(a) * 100);
      food.rotation.set(1.05, a, a * 0.2);
      food.scale.setScalar(70 + Math.sin(t * 3 + i) * 8);
    });
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
    bezel.position.z = 15;
    const screen = this.factory.mesh(
      this.factory.geometry(
        'film-phone-screen',
        () => new THREE.ShapeGeometry(this.rounded(166, 330, 20)),
      ),
      '#0c3027',
      0.35,
    );
    screen.position.z = 17;
    const speaker = this.factory.box('#071c17', [46, 5, 2]);
    speaker.position.set(0, 147, 21);
    const button = this.factory.sphere('#ffbc70', [21, 21, 3]);
    button.position.set(0, -110, 21);
    const home = this.factory.box('#b7d4c1', [44, 3, 2]);
    home.position.set(0, -151, 21);
    const ring = this.factory.ring('#a7e4bb', 15, 1.4);
    const core = this.factory.sphere('#ffe4ab', [4, 4, 2]);
    this.phoneCursor.add(ring, core);
    this.phoneCursor.position.z = 25;
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
    this.phone.visible = true;
    const swing = Math.sin((t - 0.15) * 2.2);
    this.position(this.phone, 650 + swing * 35, 570 + Math.sin(t * 1.5) * 16);
    this.phone.rotation.set(0.08, -0.3 + swing * 0.26, swing * -0.25);
    this.phone.scale.setScalar(1.6 * (0.8 + out(t / 0.42) * 0.2));
    this.phoneCursor.position.set(swing * 45, 30 + Math.cos(t * 2.2) * 30, 25);
    const cut = t - 1.5;
    this.position(this.gestureTomato, 1350, 520 + Math.sin(t * 2) * 9);
    this.gestureTomato.rotation.set(1.05, -0.16, Math.sin(t * 2) * 0.1);
    this.gestureTomato.scale.setScalar(230);
    this.gestureTomato.visible = cut < 0;
    this.halo(this.cyanHalo, 650, 570, 850, 1050, 0.3);
    this.halo(this.warmHalo, 1350, 520, 700, 750, 0.3);
    this.pathDots.forEach((dot, index) => {
      const p = fraction(t * 1.1 + index / 4);
      dot.visible = t < 1.5;
      this.position(dot, 840 + p * 280, 550 - Math.sin(p * Math.PI) * 70, 70);
      dot.scale.setScalar(4 + Math.sin(p * Math.PI) * 3);
    });
    this.sweep(cut + 0.18, 1350, 520, 700, -0.48);
    this.cutFood(cut, 1350, 520, 230, 1, 1.2, 230);
    this.burst(cut, 1350, 520, 0.95, 'food');
    this.camera.position.x = Math.sin(t * 1.2) * 25;
    this.camera.zoom = 1 + t * 0.018;
  }

  private flightPose(t: number, i: number, speed = 1) {
    const p = fraction((t * speed + [0.2, 0.5, 1.1, 1.8, 0.8, 2.4, 1.6, 2.9][i]) / 3.2);
    return {
      x: 320 + i * 175 + (p - 0.5) * (i % 2 ? -230 : 230),
      y: 1000 - 700 * 4 * p * (1 - p),
      scale: (i < 4 ? 145 : 105) * (0.3 + Math.sin(p * Math.PI) ** 0.4 * 0.7),
      p,
    };
  }

  private showFlights(t: number, speed: number): void {
    this.flight.visible = true;
    this.flightFoods.forEach((food, i) => {
      const p = this.flightPose(t, i, speed);
      food.visible = true;
      this.position(food, p.x, p.y, i % 2 ? -80 : -20);
      food.scale.setScalar(p.scale);
      food.rotation.set(
        1.05 + Math.sin(p.p * TAU) * 0.2,
        p.p * 1.5 + i,
        Math.sin(p.p * TAU) * 0.65,
      );
    });
  }

  private cutPlan(t: number): void {
    this.showFlights(t, 1.15);
    const times = [1.5, 0.5, 3.25, 2.5];
    const positions = [
      [1250, 550],
      [480, 425],
      [1450, 410],
      [820, 630],
    ];
    let recent = Infinity;
    let recentIndex = 0;
    this.flightFoods.slice(0, 4).forEach((food, i) => {
      const age = t - times[i];
      const [x, y] = positions[i];
      const lead = Math.max(0, -age);
      food.visible = age < 0;
      this.position(food, x + Math.sin(lead * 1.2) * 110, y + lead * lead * 130, 70);
      food.scale.setScalar(158);
      food.rotation.set(1.05, -0.16, -0.09 + lead * 0.5);
      this.cutFood(age, x, y, 158, i, 0.95, 220);
      if (age >= -0.18 && age < recent) {
        recent = age;
        recentIndex = i;
      }
    });
    const [x, y] = positions[recentIndex];
    this.sweep(recent + 0.18, x, y, 920, recentIndex % 2 ? -0.55 : 0.43);
    this.burst(recent, x, y, 1.05, 'food');
    this.halo(this.warmHalo, 960, 570, 1800, 1000, 0.24);
    this.camera.position.x = -75 + t * 37;
    this.camera.position.y = Math.sin(t * 1.4) * 30;
    this.camera.rotation.z = Math.sin(t * 1.35) * 0.025;
    this.camera.zoom = 1.02 + Math.sin(t * 0.9) * 0.075;
  }

  private danger(t: number): void {
    const impact = t - 0.9;
    this.bomb.visible = impact < 0;
    this.position(this.bomb, 960 + Math.sin(t * 48) * smooth((t - 0.55) / 0.35) * 12, 555, 150);
    this.bomb.scale.setScalar(160 + out(t / 0.85) * 150);
    this.bomb.rotation.set(0.06, Math.sin(t * 3) * 0.15, Math.sin(t * 40) * 0.055);
    this.showFlights(t * 0.3, 1);
    this.flightFoods.forEach((food, i) => {
      const a = (i * TAU) / 8 + 0.35;
      const radius = 340 + Math.max(0, impact) * 850;
      this.position(food, 960 + Math.cos(a) * radius, 550 + Math.sin(a) * radius * 0.75, -80);
      food.scale.setScalar(90 * (1 - smooth(Math.max(0, impact) / 1.2) * 0.5));
      food.rotation.set(1.05 + impact, i, a + Math.max(0, impact) * 4);
    });
    this.halo(
      this.warmHalo,
      960,
      560,
      1200,
      1150,
      0.3 + Math.max(0, 1 - Math.abs(impact) * 4) * 0.45,
    );
    this.burst(impact, 960, 550, 2.4, 'danger');
    this.ripple(impact, 960, 550, '#ff9955', 900);
    this.camera.zoom = 1 + Math.sin(clamp(impact / 0.45) * Math.PI) * 0.07;
    this.camera.rotation.z = Math.sin(impact * 24) * Math.max(0, 1 - Math.abs(impact) * 3) * 0.025;
  }

  private frenzy(t: number): void {
    this.rare.visible = this.rareTomato.visible = true;
    this.showFlights(t + 0.6, 2.7);
    const beat = fraction(t * 2);
    const firstHit = t >= 0.5;
    const hit = firstHit ? beat * 0.5 : -1;
    const pulse = firstHit ? Math.exp(-beat * 7) : 0;
    this.position(this.rareTomato, 960, 550 + Math.sin(t * 3) * 10, 210);
    this.rareTomato.scale.setScalar(340 * (1 + pulse * 0.07));
    this.rareTomato.rotation.set(
      1.05 + Math.sin(t * 2) * 0.05,
      -0.16 + Math.sin(t) * 0.13,
      Math.sin(t * 3) * 0.06,
    );
    this.halo(this.warmHalo, 960, 550, 1150 + pulse * 180, 1150 + pulse * 180, 0.67);
    this.goldSparks.forEach((sparkle, i) => {
      sparkle.visible = true;
      const angle = i * 2.39996 + t * (0.6 + seed(i + 1) * 0.5);
      const radius = 300 + seed(i + 28) * 210 + pulse * 55;
      this.position(
        sparkle,
        960 + Math.cos(angle) * radius,
        550 + Math.sin(angle) * radius * 0.83,
        230 + Math.cos(angle) * 65,
      );
      sparkle.rotation.set(t * 2 + i, i, angle);
      const size = 5 + 5 * (0.5 + Math.sin(t * 3 + i) * 0.5);
      sparkle.scale.set(size, size * 2.2, size);
    });
    this.speedMarks.forEach((mark, i) => {
      mark.visible = true;
      const p = fraction(t * 1.6 + seed(i + 80));
      this.position(mark, -150 + p * 2220, 180 + seed(i + 100) * 720, -180);
      mark.rotation.z = 0.16;
      mark.scale.set(130 + seed(i + 140) * 170, 3 + seed(i) * 3, 1);
    });
    if (firstHit) {
      this.sweep(hit + 0.08, 960, 550, 1100, Math.floor(t * 2) % 2 ? -0.5 : 0.5);
      this.burst(hit, 960, 550, 1.6, 'gold');
    }
    this.camera.zoom = 1 + pulse * 0.025;
    this.camera.rotation.z = Math.sin(t * 1.5) * 0.018;
  }

  private shield(t: number): void {
    this.rare.visible = this.shieldStar.visible = true;
    const entry = out(t / 0.5);
    const impact = t - 1;
    this.position(this.shieldStar, 960, 555, 100);
    this.shieldStar.scale.setScalar(
      260 * (0.65 + entry * 0.35) * (1 + Math.exp(-Math.abs(impact) * 7) * 0.055),
    );
    this.shieldStar.rotation.set(0.08, Math.sin(t * 2) * 0.2, Math.sin(t * 1.6) * 0.07);
    this.shieldShell.visible = true;
    this.position(this.shieldShell, 960, 555, 0);
    this.shieldShell.scale.setScalar(365 * (0.5 + entry * 0.5));
    (this.shieldShell.material as THREE.MeshPhysicalMaterial).opacity =
      0.1 + Math.exp(-Math.abs(impact) * 6) * 0.18;
    this.bomb.visible = t < 1.23;
    const x = impact < 0 ? 1780 - smooth(t) * 485 : 1295 + out(impact / 0.23) * 180;
    this.position(this.bomb, x, 480 - Math.max(0, impact) * 270, 140);
    this.bomb.scale.setScalar(125 * (1 - smooth(Math.max(0, impact) / 0.3) * 0.8));
    this.bomb.rotation.set(0, -0.2, -t * 1.5);
    this.halo(this.cyanHalo, 960, 555, 1300, 1200, 0.56);
    this.ripple(impact, 960, 555, '#adfff3', 650);
    this.burst(impact, 1295, 480, 1.5, 'cyan');
    this.camera.zoom = 0.94 + entry * 0.06;
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
    this.position(this.mix, 960, 855 + Math.sin(t * 4) * 8);
    this.mix.rotation.set(
      0.42 + smooth(t / 3) * 0.18,
      Math.sin(t * 1.4) * 0.13,
      Math.sin(t * 3) * 0.055,
    );
    this.mix.scale.setScalar(150 + out(t / 0.5) * 12);
    const angle = t * 4 + t * t * 2.6;
    this.bowlFoods.rotation.y = angle;
    this.whisk.position.set(Math.sin(angle) * 0.72, 1.55, Math.cos(angle) * 0.72);
    this.whisk.rotation.set(Math.sin(angle) * 0.3, -angle, -0.27 + Math.cos(angle) * 0.2);
    this.halo(this.cyanHalo, 960, 575, 1300, 1100, 0.39);
    this.halo(this.contactShadow, 960, 1000, 1000, 80, 0.5);
    this.pathDots.forEach((dot, i) => {
      const a = angle * 0.5 + (i * Math.PI) / 2;
      dot.visible = true;
      this.position(dot, 960 + Math.cos(a) * 400, 565 + Math.sin(a) * 170, Math.sin(a) * 260);
      dot.scale.setScalar(6 + (i % 2) * 2);
    });
    this.camera.position.x = Math.sin(t * 1.2) * 55;
    this.camera.zoom = 0.94 + smooth(t / 3) * 0.1;
    this.camera.rotation.z = Math.sin(t * 1.8) * 0.018;
  }

  private macroDishes(t: number): void {
    this.recipes.visible = true;
    const index = t < 1.3 ? 0 : t < 2.6 ? 1 : 2;
    const local = t - index * 1.3;
    this.dishes.forEach((dish, i) => {
      dish.visible = i === index;
      if (!dish.visible) return;
      this.position(dish, 960 + (1 - out(local / 0.45)) * (i % 2 ? -130 : 130), 600, 0);
      dish.scale.setScalar([164, 181, 170][i] * (0.94 + out(local / 0.7) * 0.06));
      dish.rotation.set(
        [0.02, 0.27, 0.13][i],
        -0.4 + local * 0.42,
        (1 - smooth(local / 0.7)) * (i % 2 ? 0.07 : -0.06),
      );
    });
    this.halo(this.warmHalo, 960, 580, 1550, 1050, 0.4);
    this.halo(this.contactShadow, 960, 930, 1250, 100, 0.45);
    this.camera.zoom = 0.98 + local * 0.045;
    this.camera.position.x = -35 + local * 55;
  }

  private recipePlan(t: number): void {
    this.recipes.visible = true;
    this.dishes.forEach((dish, i) => {
      dish.visible = true;
      const entry = out((t - i * 0.1) / 0.5);
      this.position(dish, [430, 960, 1490][i], 680 + (1 - entry) * 90 + Math.sin(t * 1.5 + i) * 10);
      dish.scale.setScalar(87 * (0.82 + entry * 0.18));
      dish.rotation.set(0, Math.sin(t * 0.6 + i) * 0.13, (1 - entry) * (i - 1) * 0.08);
    });
    this.halo(this.warmHalo, 960, 680, 1900, 850, 0.32);
    this.camera.zoom = 1 + Math.sin(t * 0.7) * 0.018;
  }

  private loop(t: number): void {
    this.flight.visible = true;
    const close = smooth((t - 1.1) / 1.4);
    this.flightFoods.forEach((food, i) => {
      const a = (i * TAU) / 8 + t * 2.4;
      const radius = 440 + t * 180;
      food.visible = t < 2.2;
      this.position(
        food,
        960 + Math.cos(a) * radius,
        540 + Math.sin(a) * radius * 0.67,
        -100 + t * 180,
      );
      food.rotation.set(1.05 + t * 0.4, a, a * 0.4);
      food.scale.setScalar((85 + t * 75) * (1 - smooth((t - 1.7) / 0.5)));
    });
    this.gesture.visible = true;
    this.phone.visible = false;
    this.gestureTomato.visible = true;
    this.position(this.gestureTomato, 960, 540, 400 - close * 320);
    this.gestureTomato.scale.setScalar(60 + close * 245);
    this.gestureTomato.rotation.set(1.05, -0.16, -0.09 + (1 - close) * 1.2);
    this.halo(this.warmHalo, 960, 540, 1250, 1150, 0.35 + close * 0.13);
    this.camera.rotation.z = Math.sin((t * Math.PI) / 2.5) * 0.055;
  }

  private ripple(t: number, x: number, y: number, color: string, radius: number): void {
    if (t < 0 || t > 0.85) return;
    this.impactRing.visible = true;
    this.position(this.impactRing, x, y, 350);
    this.impactRing.scale.setScalar(70 + out(t / 0.85) * radius);
    const material = this.impactRing.material as THREE.MeshBasicMaterial;
    material.color.set(color);
    material.opacity = (1 - t / 0.85) * 0.55;
  }

  private burst(
    t: number,
    x: number,
    y: number,
    strength: number,
    theme: 'food' | 'gold' | 'danger' | 'cyan',
  ): void {
    if (t < 0 || t >= 0.85) return;
    this.fragments.forEach((fragment, i) => {
      fragment.visible = true;
      fragment.material =
        this.fragmentMaterials[
          theme === 'food' ? i % 3 : theme === 'gold' ? 4 : theme === 'cyan' ? 5 : 6 + (i % 2)
        ];
      const a = seed(i + 21) * TAU;
      const speed = (180 + seed(i + 55) * 360) * strength;
      this.position(
        fragment,
        x + Math.cos(a) * speed * t,
        y + Math.sin(a) * speed * t + t * t * 230,
        420 + seed(i + 20) * 25,
      );
      fragment.rotation.set(i + t * 4, i * 2 + t, a + t * (i % 2 ? 5 : -5));
      const size = (7 + seed(i + 99) * 11) * (1 - t / 0.85) * Math.min(1.5, strength);
      fragment.scale.set(size, size * 0.6, size);
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
    for (const kind of ['bread', 'tomato', 'lettuce', 'cheese'] as const) {
      const pair: CutHalf[] = [];
      for (const side of [-1, 1]) {
        const object = new THREE.Group();
        const model = this.food(kind);
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
        const half = { object, plane, side };
        pair.push(half);
        this.halves.push(half);
        this.scene.add(object);
      }
      this.cutPairs.push(pair);
    }
  }

  private cutFood(
    t: number,
    x: number,
    y: number,
    scale: number,
    pair: number,
    duration: number,
    speed: number,
  ): void {
    if (t < 0 || t >= duration) return;
    const life = clamp(t / duration);
    for (const half of this.cutPairs[pair]) {
      half.object.visible = true;
      this.position(
        half.object,
        x - half.side * (12 + t * speed),
        y - t * 130 + t * t * 260,
        120 + t * 60,
      );
      half.object.scale.setScalar(scale * (1 - smooth((life - 0.38) / 0.62) * 0.98));
      half.object.rotation.set(t * half.side * 0.38, t * half.side * 0.4, t * half.side * 0.9);
    }
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
