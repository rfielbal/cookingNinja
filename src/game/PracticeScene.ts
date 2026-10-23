import * as THREE from 'three';
import { FoodFactory, FOOD_COLORS } from './food';
import type { FoodKind } from './recipes';
import type { PracticeSegment, PracticeTarget } from './practice';

/** Three cached models, one reusable slash and a small fixed pool of fragments. */
export class PracticeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 30);
  private readonly factory = new FoodFactory();
  private readonly foods = new Map<FoodKind, THREE.Group>();
  private readonly fragments: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[] = [];
  private readonly fragmentMaterial = new THREE.MeshBasicMaterial({ color: '#ffcb8e' });
  private readonly slashGeometry = new THREE.BufferGeometry();
  private readonly slashPositions = new Float32Array(6);
  private readonly slashMaterial: THREE.LineBasicMaterial;
  private readonly slashLine: THREE.Line;
  private width = 1;
  private height = 1;
  private elapsed = 0;
  private burstAge = 1;
  private slashAge = 1;
  private disposed = false;
  private reducedMotion = false;

  constructor(
    private readonly container: HTMLElement,
    foods: readonly FoodKind[],
    lowQuality = false,
    bladeColor = '#ffd090',
  ) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !lowQuality });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : 1.5));
    this.renderer.setClearColor(0, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);
    this.camera.position.z = 12;
    this.scene.add(new THREE.HemisphereLight('#fff4de', '#5e9b83', 2.6));
    const key = new THREE.DirectionalLight('#fff3da', 3.6);
    key.position.set(-4, 6, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#bdeddf', 1.4);
    rim.position.set(4, 1, 3);
    this.scene.add(rim);
    for (const kind of foods) {
      if (this.foods.has(kind)) continue;
      const model = this.factory.createFood(kind);
      const upright = ['fish', 'chili', 'flour', 'egg', 'strawberry', 'broccoli'].includes(kind);
      model.rotation.set(upright ? 0.12 : 1.02, -0.16, -0.08);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      model.position.sub(center);
      const normalized = new THREE.Group();
      normalized.add(model);
      normalized.scale.setScalar(2 / Math.max(size.x, size.y));
      const wrapper = new THREE.Group();
      wrapper.add(normalized);
      wrapper.visible = false;
      this.foods.set(kind, wrapper);
      this.scene.add(wrapper);
    }
    this.slashGeometry.setAttribute('position', new THREE.BufferAttribute(this.slashPositions, 3));
    this.slashMaterial = new THREE.LineBasicMaterial({
      color: bladeColor,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.slashLine = new THREE.Line(this.slashGeometry, this.slashMaterial);
    this.slashLine.frustumCulled = false;
    this.slashLine.visible = false;
    this.scene.add(this.slashLine);
    for (let i = 0; i < (lowQuality ? 5 : 9); i++) {
      const mesh = new THREE.Mesh(
        this.factory.geometry('practice-fragment', () => new THREE.BoxGeometry(1, 1, 1)),
        this.fragmentMaterial,
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.fragments.push({ mesh, velocity: new THREE.Vector3() });
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.left = (-4 * this.width) / this.height;
    this.camera.right = (4 * this.width) / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.slashAge = 1;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  slash(segment: PracticeSegment): void {
    this.slashPositions.set([
      (segment.from.x - 0.5) * 8 * (this.width / this.height),
      (0.5 - segment.from.y) * 8,
      3,
      (segment.to.x - 0.5) * 8 * (this.width / this.height),
      (0.5 - segment.to.y) * 8,
      3,
    ]);
    this.slashGeometry.attributes.position.needsUpdate = true;
    this.slashAge = 0;
  }

  burst(target: PracticeTarget, mistake: boolean): void {
    this.burstAge = 0;
    this.fragmentMaterial.color.set(mistake ? '#ffa8a2' : FOOD_COLORS[target.kind] || '#ffcb8e');
    this.fragments.forEach(({ mesh, velocity }, index) => {
      const angle = (index / this.fragments.length) * Math.PI * 2;
      mesh.position.set((target.x - 0.5) * 8 * (this.width / this.height), (0.5 - target.y) * 8, 1);
      mesh.rotation.set(angle, angle * 2, 0);
      velocity.set(Math.cos(angle) * 2.2, Math.sin(angle) * 2 + 0.5, 0);
      mesh.visible = true;
    });
  }

  render(target: PracticeTarget, dt: number): void {
    if (this.disposed) return;
    this.elapsed += dt;
    this.slashAge += dt;
    this.burstAge += dt;
    for (const [kind, object] of this.foods) {
      object.visible = target.visible && kind === target.kind;
      if (!object.visible) continue;
      object.position.set(
        (target.x - 0.5) * 8 * (this.width / this.height),
        (0.5 - target.y) * 8,
        0,
      );
      object.scale.setScalar(target.radiusY * 8);
      object.rotation.z = this.reducedMotion ? 0 : Math.sin(this.elapsed * 0.75) * 0.045;
    }
    this.slashLine.visible = this.slashAge < 0.16;
    this.slashMaterial.opacity = Math.max(0, 1 - this.slashAge / 0.16);
    for (const { mesh, velocity } of this.fragments) {
      mesh.visible = this.burstAge < (this.reducedMotion ? 0.16 : 0.5);
      if (!mesh.visible) continue;
      const movement = this.reducedMotion ? 0.25 : 1;
      mesh.position.addScaledVector(velocity, dt * movement);
      velocity.y -= dt * 4;
      mesh.rotation.z += dt * movement * 2;
      mesh.scale.setScalar(Math.max(0, 1 - this.burstAge / 0.5) * 0.12);
    }
    this.renderer.render(this.scene, this.camera);
  }

  clearGesture(): void {
    this.slashAge = 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.clear();
    this.foods.clear();
    this.factory.dispose();
    this.fragmentMaterial.dispose();
    this.slashMaterial.dispose();
    this.slashGeometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
