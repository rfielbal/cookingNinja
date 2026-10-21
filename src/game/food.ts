import * as THREE from 'three';

export type RecipeKind = 'burger' | 'tacos' | 'cake';

/** Procedural ingredients share their geometry and materials for the lifetime of a scene. */
export class FoodFactory {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();

  geometry(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let value = this.geometries.get(key);
    if (!value) {
      value = build();
      this.geometries.set(key, value);
    }
    return value;
  }

  material(color: string | number, roughness = 0.65): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}`;
    let value = this.materials.get(key);
    if (!value) {
      value = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      this.materials.set(key, value);
    }
    return value;
  }

  mesh(geometry: THREE.BufferGeometry, color: string | number, roughness = 0.65): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color, roughness));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  sphere(color: string | number, scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
    const mesh = this.mesh(
      this.geometry('sphere', () => new THREE.SphereGeometry(1, 24, 16)),
      color,
    );
    mesh.scale.set(...scale);
    return mesh;
  }

  cylinder(color: string | number, radius: number, height: number): THREE.Mesh {
    const mesh = this.mesh(
      this.geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 40)),
      color,
    );
    mesh.scale.set(radius, height, radius);
    return mesh;
  }

  box(color: string | number, scale: [number, number, number]): THREE.Mesh {
    const mesh = this.mesh(
      this.geometry('box', () => new THREE.BoxGeometry(1, 1, 1)),
      color,
    );
    mesh.scale.set(...scale);
    return mesh;
  }

  ring(color: string | number, radius: number, thickness: number): THREE.Mesh {
    const mesh = this.mesh(
      this.geometry(
        `ring:${thickness / radius}`,
        () => new THREE.TorusGeometry(1, thickness / radius, 8, 40),
      ),
      color,
    );
    mesh.scale.setScalar(radius);
    return mesh;
  }

  leaf(color = '#6b982f'): THREE.Mesh {
    const mesh = this.mesh(
      this.geometry('leaf', () => {
        const points: number[] = [0, 0.12, 0];
        const indices: number[] = [];
        const count = 40;
        for (let i = 0; i <= count; i++) {
          const a = (i / count) * Math.PI * 2;
          const r = 0.92 + Math.cos(a * 8) * 0.09;
          points.push(Math.cos(a) * r, Math.sin(a * 5) * 0.12, Math.sin(a) * r);
          if (i > 0) indices.push(0, i, i + 1);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
      }),
      color,
    );
    return mesh;
  }

  tomato(radius = 0.75): THREE.Group {
    const group = new THREE.Group();
    const body = this.cylinder('#e94d35', radius, 0.22);
    group.add(body);
    const inner = this.cylinder('#f27451', radius * 0.83, 0.226);
    group.add(inner);
    const core = this.cylinder('#ffd498', radius * 0.16, 0.232);
    group.add(core);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const rib = this.box('#ef6148', [radius * 0.94, 0.235, radius * 0.15]);
      rib.position.set(Math.sin(angle) * radius * 0.36, 0, Math.cos(angle) * radius * 0.36);
      rib.rotation.y = Math.PI / 2 - angle;
      group.add(rib);
      for (let j = 0; j < 2; j++) {
        const seed = this.sphere('#ffe3a5', [0.033, 0.018, 0.066]);
        const seedAngle = angle + 0.26 + j * 0.29;
        seed.position.set(
          Math.sin(seedAngle) * radius * 0.56,
          0.122,
          Math.cos(seedAngle) * radius * 0.56,
        );
        seed.rotation.y = -seedAngle;
        group.add(seed);
      }
    }
    return group;
  }

  bun(radius = 0.8, height = 0.58, seeds = true): THREE.Group {
    const group = new THREE.Group();
    const dome = this.mesh(
      this.geometry(
        'dome',
        () => new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      ),
      '#eeb464',
    );
    dome.scale.set(radius, height, radius);
    group.add(dome);
    const base = this.cylinder('#d59044', radius, 0.12);
    base.position.y = -0.015;
    group.add(base);
    if (seeds) {
      for (let i = 0; i < 32; i++) {
        const a = i * 2.39996;
        const r = Math.sqrt((i + 0.5) / 36) * radius * 0.88;
        const seed = this.sphere('#fff0ce', [0.026 * radius, 0.015 * radius, 0.072 * radius]);
        seed.position.set(
          Math.cos(a) * r,
          Math.sqrt(1 - (r / radius) ** 2) * height + 0.012,
          Math.sin(a) * r,
        );
        seed.rotation.set(Math.sin(a) * 0.45, a, -Math.cos(a) * 0.45);
        group.add(seed);
      }
    }
    return group;
  }

  strawberry(): THREE.Group {
    const group = new THREE.Group();
    const body = this.mesh(
      this.geometry('berry', () => {
        const geometry = new THREE.SphereGeometry(0.64, 22, 16);
        const p = geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          const taper = 0.74 + (y / 0.64) * 0.23;
          p.setXYZ(i, p.getX(i) * taper, y * 1.06, p.getZ(i) * taper);
        }
        geometry.computeVertexNormals();
        return geometry;
      }),
      '#e4473b',
    );
    group.add(body);
    for (let i = 0; i < 20; i++) {
      const a = i * 2.39996;
      const y = -0.44 + ((i % 5) / 5) * 0.92;
      const r = Math.sqrt(Math.max(0, 0.64 ** 2 - (y / 1.06) ** 2)) * (0.74 + (y / 0.64) * 0.23);
      const seed = this.sphere('#ffd29a', [0.018, 0.033, 0.018]);
      seed.position.set(Math.cos(a) * (r + 0.012), y, Math.sin(a) * (r + 0.012));
      group.add(seed);
    }
    for (let i = 0; i < 5; i++) {
      const leaf = this.leaf('#477a32');
      leaf.scale.set(0.31, 0.45, 0.12);
      leaf.rotation.y = (i * Math.PI * 2) / 5;
      leaf.position.y = 0.61;
      group.add(leaf);
    }
    return group;
  }

  createFood(kind: string): THREE.Group {
    const group = new THREE.Group();
    group.name = kind;
    switch (kind) {
      case 'heart': {
        const candy = new THREE.Group();
        candy.name = 'heart-candy';
        const body = this.mesh(this.heartGeometry(), '#ef4e78', 0.3);
        const highlight = this.sphere('#ffcad7', [0.11, 0.19, 0.025]);
        highlight.position.set(-0.28, 0.27, 0.27);
        highlight.rotation.z = -0.42;
        const glint = this.sphere('#ffe7ec', [0.045, 0.055, 0.018]);
        glint.position.set(-0.37, 0.1, 0.27);
        candy.add(body, highlight, glint);
        group.add(candy);
        break;
      }
      case 'shield': {
        const star = this.mesh(
          this.geometry('shield-star', () => {
            const shape = new THREE.Shape();
            for (let i = 0; i < 10; i++) {
              const angle = Math.PI / 2 + (i * Math.PI) / 5;
              const radius = i % 2 ? 0.36 : 0.8;
              const x = Math.cos(angle) * radius,
                y = Math.sin(angle) * radius;
              if (i === 0) shape.moveTo(x, y);
              else shape.lineTo(x, y);
            }
            shape.closePath();
            const geometry = new THREE.ExtrudeGeometry(shape, {
              depth: 0.22,
              bevelEnabled: true,
              bevelSize: 0.055,
              bevelThickness: 0.055,
              bevelSegments: 1,
              steps: 1,
            });
            geometry.translate(0, 0, -0.11);
            return geometry;
          }),
          '#f2d576',
          0.28,
        );
        group.add(star);
        const inset = new THREE.Mesh(star.geometry, this.material('#8eeaff', 0.25));
        inset.scale.set(0.66, 0.66, 1);
        inset.position.z = 0.04;
        group.add(inset);
        const crest = this.mesh(
          this.geometry('shield-crest', () => {
            const shape = new THREE.Shape();
            shape.moveTo(-0.27, 0.29);
            shape.lineTo(0.27, 0.29);
            shape.lineTo(0.24, -0.1);
            shape.lineTo(0, -0.36);
            shape.lineTo(-0.24, -0.1);
            shape.closePath();
            return new THREE.ExtrudeGeometry(shape, {
              depth: 0.06,
              bevelEnabled: true,
              bevelSize: 0.025,
              bevelThickness: 0.025,
              bevelSegments: 1,
              steps: 1,
            });
          }),
          '#f9ffed',
          0.25,
        );
        crest.position.z = 0.21;
        group.add(crest);
        break;
      }
      case 'slow': {
        const glass = this.mesh(
          this.geometry('hourglass', () => {
            const points = [
              new THREE.Vector2(0.4, -0.58),
              new THREE.Vector2(0.38, -0.4),
              new THREE.Vector2(0.1, -0.04),
              new THREE.Vector2(0.1, 0.04),
              new THREE.Vector2(0.38, 0.4),
              new THREE.Vector2(0.4, 0.58),
            ];
            return new THREE.LatheGeometry(points, 16);
          }),
          '#87e4e9',
          0.26,
        );
        group.add(glass);
        for (const side of [-1, 1]) {
          const cap = this.cylinder('#f8db99', 0.5, 0.12);
          cap.position.y = side * 0.65;
          group.add(cap);
          const sand = this.cylinder('#ecfdff', 0.28, 0.07);
          sand.position.y = side * 0.48;
          group.add(sand);
          for (const z of [-0.26, 0.26]) {
            const bar = this.cylinder('#247b85', 0.035, 1.25);
            bar.position.set(side * 0.36, 0, z);
            group.add(bar);
          }
        }
        break;
      }
      case 'danger': {
        group.add(this.sphere('#222632', [0.65, 0.65, 0.65]));
        const band = this.ring('#ef544e', 0.66, 0.065);
        band.rotation.x = Math.PI / 2;
        group.add(band);
        const cap = this.cylinder('#d24e42', 0.19, 0.17);
        cap.position.y = 0.66;
        group.add(cap);
        const fuse = this.cylinder('#e6bd84', 0.045, 0.38);
        fuse.position.set(0.06, 0.86, 0);
        fuse.rotation.z = -0.38;
        group.add(fuse);
        const ember = this.sphere('#ffc857', [0.085, 0.085, 0.085]);
        ember.position.set(0.13, 1.04, 0);
        group.add(ember);
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
          const cross = this.box('#ff8072', [0.54, 0.11, 0.04]);
          cross.position.set(0, 0.03, 0.65);
          cross.rotation.z = angle;
          group.add(cross);
        }
        break;
      }
      case 'bread':
        group.add(this.bun());
        group.position.y = -0.15;
        break;
      case 'patty': {
        const meat = this.cylinder('#75422d', 0.78, 0.3);
        group.add(meat);
        for (let i = -2; i <= 2; i++) {
          const mark = this.box('#4c3026', [1.15 - Math.abs(i) * 0.14, 0.018, 0.06]);
          mark.position.set(0, 0.16, i * 0.22);
          mark.rotation.y = 0.3;
          group.add(mark);
        }
        break;
      }
      case 'cheese': {
        const cheese = this.box('#ffca3c', [1.4, 0.1, 1.25]);
        cheese.rotation.y = 0.12;
        group.add(cheese);
        for (const [x, z] of [
          [-0.33, -0.22],
          [0.3, 0.28],
          [0.42, -0.35],
        ]) {
          const hole = this.cylinder('#e9a52a', 0.11, 0.004);
          hole.position.set(x, 0.054, z);
          group.add(hole);
        }
        break;
      }
      case 'lettuce':
        for (let i = 0; i < 4; i++) {
          const leaf = this.leaf(i % 2 ? '#80a936' : '#4d822e');
          leaf.rotation.set(i * 0.1, i * 1.5, i * 0.11);
          leaf.position.y = i * 0.085;
          group.add(leaf);
        }
        break;
      case 'tomato':
        group.add(this.tomato());
        break;
      case 'onion':
        for (let i = 0; i < 3; i++) {
          const ring = this.ring(i % 2 ? '#ead8ee' : '#ad73a1', 0.7 - i * 0.2, 0.073);
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
        }
        break;
      case 'tortilla': {
        group.add(this.cylinder('#efd99e', 0.87, 0.065));
        for (let i = 0; i < 13; i++) {
          const a = i * 2.39996;
          const r = Math.sqrt((i + 0.5) / 15) * 0.75;
          const mark = this.cylinder('#cba369', 0.028 + (i % 3) * 0.015, 0.008);
          mark.position.set(Math.cos(a) * r, 0.038, Math.sin(a) * r);
          group.add(mark);
        }
        break;
      }
      case 'chicken':
        for (let i = 0; i < 3; i++) {
          const nugget = this.sphere(i === 1 ? '#d99548' : '#e5ad64', [0.48, 0.24, 0.32]);
          nugget.position.set((i - 1) * 0.38, i * 0.045, (i % 2) * 0.2);
          nugget.rotation.y = i * 0.72;
          group.add(nugget);
        }
        break;
      case 'avocado': {
        const outer = this.sphere('#34583a', [0.59, 0.15, 0.85]);
        const flesh = this.sphere('#c2d36a', [0.52, 0.09, 0.77]);
        flesh.position.y = 0.11;
        const pit = this.sphere('#98613c', [0.28, 0.19, 0.29]);
        pit.position.set(0, 0.16, 0.16);
        group.add(outer, flesh, pit);
        break;
      }
      case 'flour': {
        const bag = this.box('#ecdab6', [0.88, 1.13, 0.64]);
        const fold = this.box('#d0b88e', [0.87, 0.13, 0.16]);
        fold.position.y = 0.59;
        const label = this.box('#fff6df', [0.56, 0.62, 0.016]);
        label.position.z = 0.33;
        const stalk = this.box('#b58942', [0.025, 0.4, 0.02]);
        stalk.position.z = 0.35;
        group.add(bag, fold, label, stalk);
        for (let i = 0; i < 6; i++) {
          const grain = this.sphere('#b58942', [0.065, 0.09, 0.023]);
          grain.position.set(i % 2 ? -0.067 : 0.067, -0.13 + Math.floor(i / 2) * 0.115, 0.36);
          grain.rotation.z = i % 2 ? -0.65 : 0.65;
          group.add(grain);
        }
        break;
      }
      case 'egg': {
        const shell = this.mesh(
          this.geometry('egg', () => {
            const geometry = new THREE.SphereGeometry(0.57, 24, 18);
            const p = geometry.getAttribute('position');
            for (let i = 0; i < p.count; i++) {
              const y = p.getY(i);
              const taper = 0.87 - y * 0.2;
              p.setXYZ(i, p.getX(i) * taper, y * 1.25, p.getZ(i) * taper);
            }
            geometry.computeVertexNormals();
            return geometry;
          }),
          '#f9e9ca',
        );
        group.add(shell);
        break;
      }
      case 'strawberry':
        group.add(this.strawberry());
        break;
      case 'chocolate':
        group.add(this.box('#5b352b', [1.12, 0.15, 1.42]));
        for (let x = 0; x < 2; x++)
          for (let z = 0; z < 3; z++) {
            const tile = this.box('#754737', [0.48, 0.16, 0.39]);
            tile.position.set((x - 0.5) * 0.54, 0.14, (z - 1) * 0.45);
            group.add(tile);
          }
        break;
      case 'fish': {
        group.add(this.sphere('#74abb4', [0.78, 0.34, 0.26]));
        const tail = this.mesh(
          this.geometry('fish-tail', () => new THREE.ConeGeometry(0.4, 0.53, 3)),
          '#458792',
        );
        tail.rotation.z = -Math.PI / 2;
        tail.scale.z = 0.4;
        tail.position.x = -0.87;
        const fin = this.mesh(
          this.geometry('fin', () => new THREE.ConeGeometry(0.21, 0.34, 3)),
          '#458792',
        );
        fin.position.set(-0.11, 0.3, 0);
        const eye = this.sphere('#fcf5df', [0.1, 0.1, 0.034]);
        eye.position.set(0.43, 0.07, 0.225);
        const pupil = this.sphere('#243d3c', [0.044, 0.05, 0.017]);
        pupil.position.set(0.45, 0.07, 0.257);
        group.add(tail, fin, eye, pupil);
        break;
      }
      case 'chili': {
        const pepper = this.mesh(
          this.geometry('chili', () => {
            const path = new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.65, -0.3, 0),
              new THREE.Vector3(-0.26, -0.27, 0),
              new THREE.Vector3(0.19, -0.04, 0),
              new THREE.Vector3(0.4, 0.34, 0),
            ]);
            const geometry = new THREE.TubeGeometry(path, 18, 0.21, 10, false);
            const p = geometry.getAttribute('position');
            for (let i = 0; i < p.count; i++) {
              const t = Math.floor(i / 11) / 18;
              const center = path.getPointAt(t);
              const factor = 0.12 + Math.sin((t * Math.PI) / 2) * 0.9;
              p.setXYZ(
                i,
                center.x + (p.getX(i) - center.x) * factor,
                center.y + (p.getY(i) - center.y) * factor,
                p.getZ(i) * factor,
              );
            }
            geometry.computeVertexNormals();
            return geometry;
          }),
          '#d94130',
        );
        const stem = this.cylinder('#477530', 0.065, 0.29);
        stem.position.set(0.4, 0.6, 0);
        stem.rotation.z = -0.15;
        group.add(pepper, stem);
        break;
      }
      case 'broccoli': {
        const stem = this.cylinder('#98ae56', 0.18, 0.88);
        stem.position.y = -0.28;
        group.add(stem);
        for (let i = 0; i < 7; i++) {
          const a = (i * Math.PI * 2) / 6;
          const r = i === 6 ? 0 : 0.4;
          const floret = this.mesh(
            this.geometry('floret', () => new THREE.IcosahedronGeometry(0.38, 1)),
            i % 2 ? '#487c39' : '#6b943c',
          );
          floret.position.set(Math.cos(a) * r, 0.27 + (i === 6 ? 0.23 : 0), Math.sin(a) * r);
          group.add(floret);
        }
        break;
      }
      default:
        group.add(this.sphere('#ed9b50', [0.6, 0.6, 0.6]));
    }
    return group;
  }

  /** Only the selected ingredient owns these clones; ordinary food materials stay shared. */
  makeShiny(group: THREE.Group, low: boolean): THREE.MeshStandardMaterial[] {
    const copies = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
    group.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial))
        return;
      let material = copies.get(node.material);
      if (!material) {
        material = node.material.clone();
        material.emissive.set('#ffe3a1');
        material.emissiveIntensity = 0.12;
        material.roughness = Math.min(0.55, material.roughness);
        copies.set(node.material, material);
      }
      node.material = material;
    });
    const sparkles = new THREE.Group();
    sparkles.name = 'shiny-sparkles';
    const geometry = this.geometry('shiny-spark', () => new THREE.OctahedronGeometry(1, 0));
    for (let i = 0; i < (low ? 3 : 5); i++) {
      const sparkle = this.mesh(geometry, i % 2 ? '#fff7dc' : '#ffe182', 0.18);
      const angle = i * 2.39996;
      sparkle.position.set(Math.cos(angle) * 0.95, Math.sin(angle) * 0.9, 0.25 + (i % 2) * 0.2);
      sparkle.scale.set(0.06, 0.13, 0.045);
      sparkle.castShadow = sparkle.receiveShadow = false;
      sparkles.add(sparkle);
    }
    group.add(sparkles);
    return [...copies.values()];
  }

  heartGeometry(): THREE.BufferGeometry {
    return this.geometry('heart-candy', () => {
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.68);
      shape.bezierCurveTo(-0.18, -0.46, -0.72, -0.05, -0.72, 0.31);
      shape.bezierCurveTo(-0.72, 0.79, -0.17, 0.86, 0, 0.43);
      shape.bezierCurveTo(0.17, 0.86, 0.72, 0.79, 0.72, 0.31);
      shape.bezierCurveTo(0.72, -0.05, 0.18, -0.46, 0, -0.68);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.28,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.09,
        bevelSegments: 3,
        curveSegments: 12,
        steps: 1,
      });
      geometry.translate(0, -0.025, -0.14);
      return geometry;
    });
  }

  platter(): THREE.Group {
    const group = new THREE.Group();
    const board = this.cylinder('#ce9c68', 2.92, 0.19);
    board.position.y = -0.08;
    const rim = this.ring('#b48252', 2.64, 0.023);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.018;
    const plate = this.cylinder('#fff8e9', 2.28, 0.115);
    plate.position.y = 0.07;
    const lip = this.ring('#eee5cc', 2.12, 0.064);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.13;
    group.add(board, rim, plate, lip);
    return group;
  }

  burger(): THREE.Group {
    const group = new THREE.Group();
    const base = this.bun(1.65, 0.36, false);
    base.rotation.x = Math.PI;
    base.position.y = 0.58;
    group.add(base);
    const lettuce = this.leaf('#5a8c36');
    lettuce.scale.set(1.86, 1.5, 1.86);
    lettuce.position.y = 0.67;
    group.add(lettuce);
    const meat = this.cylinder('#754331', 1.6, 0.37);
    meat.position.y = 0.97;
    group.add(meat);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const detail = this.sphere('#603827', [0.2, 0.17, 0.21]);
      detail.position.set(Math.cos(a) * 1.44, 0.99, Math.sin(a) * 1.44);
      group.add(detail);
    }
    const cheese = this.box('#ffbf37', [2.8, 0.08, 2.8]);
    cheese.position.y = 1.21;
    cheese.rotation.y = 0.24;
    group.add(cheese);
    for (let i = 0; i < 3; i++) {
      const tomato = this.tomato(0.98);
      tomato.position.set(
        Math.cos((i * Math.PI * 2) / 3) * 0.61,
        1.46,
        Math.sin((i * Math.PI * 2) / 3) * 0.61,
      );
      tomato.rotation.set(0.035, i, 0.05);
      group.add(tomato);
    }
    for (let i = 0; i < 3; i++) {
      const ring = this.ring('#c99bc4', 0.8 - i * 0.16, 0.07);
      ring.rotation.x = Math.PI / 2 + 0.08;
      ring.position.set(0.12, 1.69 + i * 0.01, 0);
      group.add(ring);
    }
    const upperLettuce = this.leaf('#779d39');
    upperLettuce.scale.set(1.61, 0.9, 1.63);
    upperLettuce.position.y = 1.83;
    group.add(upperLettuce);
    const top = this.bun(1.72, 0.99);
    top.position.y = 1.94;
    group.add(top);
    return group;
  }

  tacos(): THREE.Group {
    const group = new THREE.Group();
    const geometry = this.geometry('taco-shell', () => {
      const positions: number[] = [];
      const indices: number[] = [];
      for (let x = 0; x <= 10; x++)
        for (let j = 0; j <= 24; j++) {
          const angle = Math.PI + (j / 24) * Math.PI;
          const xx = (x / 10 - 0.5) * 2.5;
          const taper = Math.sqrt(1 - (xx / 1.7) ** 2);
          positions.push(xx, Math.sin(angle) * taper * 0.95, Math.cos(angle) * taper * 0.8);
          if (x < 10 && j < 24) {
            const a = x * 25 + j;
            indices.push(a, a + 25, a + 1, a + 1, a + 25, a + 26);
          }
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return g;
    });
    for (let n = 0; n < 2; n++) {
      const taco = new THREE.Group();
      taco.add(this.mesh(geometry, '#e7b65b'));
      for (let i = 0; i < 7; i++) {
        const leaf = this.leaf(i % 2 ? '#648c36' : '#87a84a');
        leaf.scale.set(0.47, 0.6, 0.4);
        leaf.position.set((i / 6 - 0.5) * 1.8, -0.04, Math.sin(i * 3.4) * 0.32);
        taco.add(leaf);
        const chicken = this.sphere('#d28a43', [0.19, 0.18, 0.16]);
        chicken.position.set((i / 6 - 0.5) * 1.8, 0.08, Math.cos(i * 3.4) * 0.24);
        const tomato = this.box('#e85b39', [0.16, 0.16, 0.18]);
        tomato.position.set((i / 6 - 0.5) * 1.8 + 0.12, 0.12, Math.sin(i * 2.4) * 0.3);
        taco.add(chicken, tomato);
      }
      taco.position.set(0, 1.06, (n - 0.5) * 1.5);
      taco.rotation.y = -0.2;
      group.add(taco);
    }
    return group;
  }

  cake(): THREE.Group {
    const group = new THREE.Group();
    const sponge = this.cylinder('#d69d65', 1.61, 1.2);
    sponge.position.y = 0.82;
    const cream = this.cylinder('#fff0d8', 1.635, 0.2);
    cream.position.y = 0.82;
    const icing = this.cylinder('#5d3428', 1.65, 0.17);
    icing.position.y = 1.49;
    group.add(sponge, cream, icing);
    for (let i = 0; i < 17; i++) {
      const a = (i / 17) * Math.PI * 2;
      const drip = this.sphere('#5d3428', [0.13, 0.18 + (i % 3) * 0.08, 0.13]);
      drip.position.set(Math.cos(a) * 1.56, 1.39, Math.sin(a) * 1.56);
      group.add(drip);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const berry = this.strawberry();
      berry.scale.setScalar(0.5);
      berry.position.set(Math.cos(a) * 1.13, 1.88, Math.sin(a) * 1.13);
      berry.rotation.z = Math.cos(a) * 0.2;
      group.add(berry);
      const dollop = this.sphere('#fff4df', [0.18, 0.19, 0.18]);
      dollop.position.set(Math.cos(a + 0.4) * 1.13, 1.7, Math.sin(a + 0.4) * 1.13);
      group.add(dollop);
    }
    return group;
  }

  recipe(kind: RecipeKind): THREE.Group {
    return kind === 'cake' ? this.cake() : kind === 'tacos' ? this.tacos() : this.burger();
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.geometries.clear();
    this.materials.clear();
  }
}

export const FOOD_COLORS: Record<string, string> = {
  bread: '#efb663',
  patty: '#81503a',
  cheese: '#ffc446',
  lettuce: '#7eab47',
  tomato: '#e45c3c',
  onion: '#c29bc5',
  tortilla: '#dfbd78',
  chicken: '#dc9c58',
  avocado: '#a8be59',
  flour: '#efe0c0',
  egg: '#f6e6bf',
  strawberry: '#e85a45',
  chocolate: '#724a38',
  fish: '#69a1a5',
  chili: '#d94331',
  broccoli: '#649447',
};
