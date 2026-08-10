import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME } from '../constants';
import { boardInchesToWorld } from './layout';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function addInstances(
  root: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  configure: (index: number, transform: THREE.Object3D, item: THREE.InstancedMesh) => void,
  name: string,
): void {
  const instances = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    configure(index, transform, instances);
    transform.updateMatrix();
    instances.setMatrixAt(index, transform.matrix);
  }
  instances.instanceMatrix.needsUpdate = true;
  if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  instances.name = name;
  instances.receiveShadow = true;
  root.add(instances);
}

function randomBoardPosition(random: () => number): [number, number] {
  return [
    (random() - 0.5) * (GAME.board.worldUnits.width - 5),
    (random() - 0.5) * (GAME.board.worldUnits.depth - 5),
  ];
}

function addMatMicroDetail(root: THREE.Group): number {
  const random = seededRandom(0x40f1c);
  const fleckColors = [0xbda474, 0x817967, 0x47503a, 0x9a6448, 0x343832];
  addInstances(
    root,
    new THREE.CircleGeometry(1, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }),
    180,
    (index, transform, instances) => {
      const [x, z] = randomBoardPosition(random);
      const size = 0.025 + random() * 0.13;
      transform.position.set(x, 0.018 + random() * 0.012, z);
      transform.rotation.set(-Math.PI / 2, 0, random() * Math.PI);
      transform.scale.set(size * (0.45 + random()), size, 1);
      instances.setColorAt(index, new THREE.Color(fleckColors[index % fleckColors.length]));
    },
    'mat-paint-and-flock-flecks',
  );

  addInstances(
    root,
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xb5a886,
      roughness: 1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    72,
    (_index, transform) => {
      const [x, z] = randomBoardPosition(random);
      transform.position.set(x, 0.024, z);
      transform.rotation.set(-Math.PI / 2, 0, random() * Math.PI);
      transform.scale.set(0.7 + random() * 3.2, 0.018 + random() * 0.035, 1);
    },
    'mat-hairline-scratches',
  );

  addInstances(
    root,
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8d8066, roughness: 0.96 }),
    58,
    (index, transform, instances) => {
      const [x, z] = randomBoardPosition(random);
      const size = 0.045 + random() * 0.16;
      transform.position.set(x, size * 0.45, z);
      transform.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      transform.scale.set(size, size * (0.35 + random() * 0.55), size * (0.6 + random() * 0.8));
      instances.setColorAt(index, new THREE.Color(index % 4 === 0 ? 0x655e4f : 0x9a8d70));
    },
    'tiny-basing-stones',
  );

  addInstances(
    root,
    new THREE.ConeGeometry(1, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x6d7142, roughness: 1 }),
    46,
    (index, transform, instances) => {
      const [x, z] = randomBoardPosition(random);
      const radius = 0.035 + random() * 0.11;
      const height = 0.05 + random() * 0.22;
      transform.position.set(x, height / 2, z);
      transform.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.28);
      transform.scale.set(radius, height, radius);
      instances.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0x8a7b45 : 0x55613b));
    },
    'miniature-flock-tufts',
  );

  return 356;
}

function addPaintPot(
  root: THREE.Group,
  x: number,
  z: number,
  color: number,
  labelColor: number,
): number {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
  const lidMaterial = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.5 });
  const labelMaterial = new THREE.MeshStandardMaterial({ color: labelColor, roughness: 0.68 });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(boardInchesToWorld(0.56), boardInchesToWorld(0.68), boardInchesToWorld(1.28), 20),
    bodyMaterial,
  );
  body.position.y = boardInchesToWorld(0.64);
  body.castShadow = false;
  group.add(body);
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(boardInchesToWorld(0.69), boardInchesToWorld(0.69), boardInchesToWorld(0.52), 20),
    labelMaterial,
  );
  label.position.y = boardInchesToWorld(0.58);
  group.add(label);
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(boardInchesToWorld(0.7), boardInchesToWorld(0.64), boardInchesToWorld(0.28), 20),
    lidMaterial,
  );
  lid.position.y = boardInchesToWorld(1.42);
  lid.castShadow = false;
  group.add(lid);
  group.position.set(x, -0.3, z);
  root.add(group);
  return 3;
}

function addBrushes(root: THREE.Group): number {
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x7a3825, roughness: 0.55 });
  const ferruleMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9b96, metalness: 0.7, roughness: 0.24 });
  const bristleMaterial = new THREE.MeshStandardMaterial({ color: 0x34261e, roughness: 0.96 });
  for (let index = 0; index < 3; index += 1) {
    const brush = new THREE.Group();
    const length = boardInchesToWorld(6.4 + index * 0.55);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, length, 10), handleMaterial);
    handle.rotation.z = Math.PI / 2;
    brush.add(handle);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.55, 5.2, 10), ferruleMaterial);
    ferrule.rotation.z = Math.PI / 2;
    ferrule.position.x = length / 2 + 2.3;
    brush.add(ferrule);
    const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.7, 5.5, 10), bristleMaterial);
    bristle.rotation.z = -Math.PI / 2;
    bristle.position.x = length / 2 + 7.3;
    brush.add(bristle);
    brush.rotation.y = -0.55 + index * 0.18;
    brush.position.set(-70 + index * 5, 1.1 + index * 0.35, -166 + index * 2.5);
    root.add(brush);
  }
  return 9;
}

function addTapeMeasure(root: THREE.Group): number {
  const group = new THREE.Group();
  const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x212328, roughness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc89d2b, roughness: 0.46 });
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(15, 7.5, 13), caseMaterial);
  caseMesh.position.y = 3.5;
  caseMesh.castShadow = false;
  group.add(caseMesh);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(15.2, 4.2, 9.2), accent);
  panel.position.set(0, 4.2, -2.1);
  group.add(panel);
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(boardInchesToWorld(13), 0.35, boardInchesToWorld(0.55)),
    new THREE.MeshStandardMaterial({ color: 0xd8c65d, metalness: 0.25, roughness: 0.48 }),
  );
  tape.position.set(-boardInchesToWorld(7), 0.5, 0);
  group.add(tape);
  group.position.set(68, -0.25, 166.5);
  group.rotation.y = -0.12;
  root.add(group);
  return 3;
}

function batchHobbyProps(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const batches = new Map<string, THREE.BufferGeometry[]>();
  const originals: THREE.Mesh[] = [];

  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      Array.isArray(object.material) ||
      !(object.material instanceof THREE.MeshStandardMaterial)
    ) {
      return;
    }
    const material = object.material;
    const bucket = material.metalness > 0.35 ? 'metallic' : 'matte';
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = material.color.r;
      colors[index + 1] = material.color.g;
      colors[index + 2] = material.color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sources = batches.get(bucket) ?? [];
    sources.push(geometry);
    batches.set(bucket, sources);
    originals.push(object);
  });

  for (const original of originals) {
    original.removeFromParent();
    original.geometry.dispose();
  }

  for (const [bucket, sources] of batches) {
    const geometry = mergeGeometries(sources, false);
    if (!geometry) continue;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: bucket === 'metallic' ? 0.62 : 0.02,
      roughness: bucket === 'metallic' ? 0.32 : 0.56,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `merged-hobby-props-${bucket}`;
    mesh.receiveShadow = true;
    root.add(mesh);
    sources.forEach((source) => source.dispose());
  }
}

export function addTabletopDetails(root: THREE.Group): number {
  const details = new THREE.Group();
  details.name = 'miniature-scale-surface-and-hobby-details';
  root.add(details);
  let objectCount = addMatMicroDetail(details);
  objectCount += addPaintPot(details, 124, 83, 0x7f2f29, 0xe8d8b9);
  objectCount += addPaintPot(details, 124, 66, 0x485c37, 0xd4c7a3);
  objectCount += addPaintPot(details, 123, 49, 0x354b62, 0xb8c9d6);
  objectCount += addBrushes(details);
  objectCount += addTapeMeasure(details);
  batchHobbyProps(details);
  return objectCount;
}
