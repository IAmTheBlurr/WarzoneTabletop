import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME } from '../constants';
import { boardInchesToWorld } from './layout';
import {
  createFabricMaterial,
  createPictureMaterial,
  createPlasterMaterial,
  createPrintedMaterial,
  createRugMaterial,
  createWoodMaterial,
} from './materials';

export interface DenRoom {
  readonly objectCount: number;
  update(timeSeconds: number): void;
}

function mesh(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  castShadow = false,
): THREE.Mesh {
  const item = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  item.castShadow = castShadow;
  item.receiveShadow = true;
  return item;
}

function place(
  parent: THREE.Object3D,
  item: THREE.Object3D,
  x: number,
  y: number,
  z: number,
): void {
  item.position.set(x, y, z);
  parent.add(item);
}

function belongsToDynamicGroup(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current && current !== root) {
    if (current.userData.dynamic === true) return true;
    current = current.parent;
  }
  return false;
}

function batchStaticRoomMeshes(root: THREE.Group): void {
  interface StaticRoomBatch {
    material: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
    geometries: THREE.BufferGeometry[];
  }

  root.updateMatrixWorld(true);
  const batches = new Map<string, StaticRoomBatch>();
  const originals: THREE.Mesh[] = [];

  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      belongsToDynamicGroup(object, root) ||
      Array.isArray(object.material)
    ) {
      return;
    }
    const key = `${object.material.uuid}:${object.castShadow ? 1 : 0}:${object.receiveShadow ? 1 : 0}`;
    const batch: StaticRoomBatch = batches.get(key) ?? {
      material: object.material,
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow,
      geometries: [],
    };
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    batch.geometries.push(geometry);
    batches.set(key, batch);
    originals.push(object);
  });

  for (const original of originals) {
    original.removeFromParent();
    original.geometry.dispose();
  }

  let batchIndex = 0;
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries, false);
    if (!geometry) continue;
    const combined = new THREE.Mesh(geometry, batch.material);
    combined.castShadow = batch.castShadow;
    combined.receiveShadow = batch.receiveShadow;
    combined.name = `den-static-material-batch-${batchIndex}`;
    root.add(combined);
    batchIndex += 1;
    batch.geometries.forEach((source) => source.dispose());
  }
}

function addBookcase(
  root: THREE.Group,
  x: number,
  z: number,
  wood: THREE.Material,
): number {
  const group = new THREE.Group();
  group.name = 'den-bookcase';
  const width = boardInchesToWorld(48);
  const height = boardInchesToWorld(78);
  const depth = boardInchesToWorld(12);
  const side = boardInchesToWorld(1.1);
  const floorY = GAME.spawn.roomFloorYUnits;
  const bottomY = floorY + height / 2;

  place(group, mesh(side, height, depth, wood), -width / 2 + side / 2, 0, 0);
  place(group, mesh(side, height, depth, wood), width / 2 - side / 2, 0, 0);
  place(group, mesh(width, side, depth, wood), 0, height / 2 - side / 2, 0);
  place(group, mesh(width, side, depth, wood), 0, -height / 2 + side / 2, 0);
  place(
    group,
    mesh(width - side * 2, height - side * 2, boardInchesToWorld(0.45), wood, false),
    0,
    0,
    depth / 2 - boardInchesToWorld(0.3),
  );

  const shelfCount = 5;
  for (let shelf = 1; shelf < shelfCount; shelf += 1) {
    place(
      group,
      mesh(width - side, side, depth, wood),
      0,
      -height / 2 + (height / shelfCount) * shelf,
      0,
    );
  }

  const bookColors = [0x7a3430, 0x283f58, 0x52603e, 0x8a6e3e, 0x4e365a, 0x70513a];
  const bookTransforms: THREE.Object3D[][] = bookColors.map(() => []);
  let bookCount = 0;
  for (let shelf = 0; shelf < 4; shelf += 1) {
    let cursor = -width / 2 + side + boardInchesToWorld(1.2);
    const shelfBase = -height / 2 + (height / shelfCount) * (shelf + 1) + side / 2;
    for (let book = 0; book < 11; book += 1) {
      const bookWidth = boardInchesToWorld(0.75 + ((book * 7 + shelf * 3) % 5) * 0.18);
      const bookHeight = boardInchesToWorld(7.4 + ((book * 5 + shelf) % 5) * 0.62);
      const bookDepth = boardInchesToWorld(8.0 + ((book + shelf) % 3) * 0.6);
      const transform = new THREE.Object3D();
      transform.position.set(
        cursor + bookWidth / 2,
        shelfBase + bookHeight / 2,
        -depth / 2 + bookDepth / 2 + boardInchesToWorld(0.7),
      );
      transform.rotation.z = book % 7 === 5 ? 0.075 : book % 9 === 3 ? -0.055 : 0;
      transform.scale.set(bookWidth, bookHeight, bookDepth);
      transform.updateMatrix();
      bookTransforms[(book + shelf * 2) % bookColors.length]?.push(transform);
      cursor += bookWidth + boardInchesToWorld(0.13);
      bookCount += 1;
    }
  }

  const bookGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (let colorIndex = 0; colorIndex < bookColors.length; colorIndex += 1) {
    const transforms = bookTransforms[colorIndex] ?? [];
    const volumes = new THREE.InstancedMesh(
      bookGeometry,
      new THREE.MeshStandardMaterial({ color: bookColors[colorIndex], roughness: 0.82 }),
      transforms.length,
    );
    transforms.forEach((transform, index) => volumes.setMatrixAt(index, transform.matrix));
    volumes.instanceMatrix.needsUpdate = true;
    volumes.name = `book-spines-${colorIndex}`;
    group.add(volumes);
  }

  const kitSpecs = [
    ['VOID LEGION', '#263a4b', '#c99454'],
    ['IRON CITADEL', '#4a2928', '#d5b16a'],
    ['BATTLEFORGE', '#39402e', '#c0c6a0'],
  ] as const;
  for (let index = 0; index < kitSpecs.length; index += 1) {
    const [title, primary, accent] = kitSpecs[index];
    const kit = mesh(
      boardInchesToWorld(10.5),
      boardInchesToWorld(8),
      boardInchesToWorld(2.2),
      createPrintedMaterial(title, primary, accent),
      false,
    );
    place(
      group,
      kit,
      -width / 2 + boardInchesToWorld(7) + index * boardInchesToWorld(12),
      -height / 2 + (height / shelfCount) * 4 + boardInchesToWorld(5),
      -depth / 2 + boardInchesToWorld(2),
    );
  }

  group.position.set(x, bottomY, z);
  root.add(group);
  return 4 + (shelfCount - 1) + 1 + bookCount + kitSpecs.length;
}

function addSofa(root: THREE.Group, x: number, z: number): number {
  const group = new THREE.Group();
  group.name = 'den-sofa';
  const fabric = createFabricMaterial('#41383d');
  const dark = new THREE.MeshStandardMaterial({ color: 0x241f22, roughness: 0.9 });
  const floorY = GAME.spawn.roomFloorYUnits;
  const width = boardInchesToWorld(76);
  const depth = boardInchesToWorld(34);
  const seatHeight = boardInchesToWorld(17);

  place(group, mesh(depth, boardInchesToWorld(8), width, dark), 0, seatHeight / 2, 0);
  place(
    group,
    mesh(boardInchesToWorld(8), boardInchesToWorld(23), width, fabric),
    depth / 2 - boardInchesToWorld(4),
    boardInchesToWorld(22),
    0,
  );
  for (const side of [-1, 1]) {
    place(
      group,
      mesh(depth, boardInchesToWorld(12), boardInchesToWorld(7), fabric),
      0,
      boardInchesToWorld(19),
      side * (width / 2 - boardInchesToWorld(3.5)),
    );
  }
  for (let cushion = 0; cushion < 3; cushion += 1) {
    place(
      group,
      mesh(
        depth - boardInchesToWorld(9),
        boardInchesToWorld(4),
        boardInchesToWorld(21),
        fabric,
      ),
      -boardInchesToWorld(2),
      seatHeight + boardInchesToWorld(2),
      (cushion - 1) * boardInchesToWorld(23),
    );
  }
  group.position.set(x, floorY, z);
  root.add(group);
  return 7;
}

function addWindow(root: THREE.Group, wallX: number): number {
  const group = new THREE.Group();
  group.name = 'den-window';
  const width = boardInchesToWorld(58);
  const height = boardInchesToWorld(46);
  const frame = boardInchesToWorld(2.2);
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x526577,
    emissive: 0x1d2935,
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.08,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xe3ded3, roughness: 0.75 });
  place(group, mesh(boardInchesToWorld(0.4), height, width, glassMaterial, false), 0, 0, 0);
  for (const y of [-1, 1]) {
    place(group, mesh(frame, frame, width + frame * 2, trimMaterial), 0, y * height / 2, 0);
  }
  for (const z of [-1, 1]) {
    place(group, mesh(frame, height, frame, trimMaterial), 0, 0, z * width / 2);
  }
  place(group, mesh(frame, height, frame, trimMaterial), 0, 0, 0);
  place(group, mesh(frame, frame, width, trimMaterial), 0, 0, 0);
  group.position.set(wallX + boardInchesToWorld(0.8), GAME.spawn.roomFloorYUnits + boardInchesToWorld(61), -155);
  root.add(group);
  return 7;
}

function addWallArt(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  seed: number,
): number {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x302721, roughness: 0.68 });
  const width = boardInchesToWorld(22);
  const height = boardInchesToWorld(30);
  place(group, mesh(width + 7, height + 7, 3.5, frameMaterial), 0, 0, 0);
  place(group, mesh(width, height, 4, createPictureMaterial(seed), false), 0, 0, -2.1);
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  root.add(group);
  return 2;
}

function addCeilingFan(root: THREE.Group, ceilingY: number): { blades: THREE.Group; count: number } {
  const group = new THREE.Group();
  group.name = 'den-ceiling-fan';
  group.userData.dynamic = true;
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b3531, metalness: 0.55, roughness: 0.35 });
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3d2a, roughness: 0.62 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffe1b1,
    emissive: 0xffbd6e,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  place(group, mesh(4, boardInchesToWorld(8), 4, metal), 0, -boardInchesToWorld(4), 0);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, 17, 20), metal);
  motor.position.y = -boardInchesToWorld(11);
  group.add(motor);
  const blades = new THREE.Group();
  blades.position.y = -boardInchesToWorld(14);
  for (let blade = 0; blade < 5; blade += 1) {
    const arm = mesh(boardInchesToWorld(22), 2.4, boardInchesToWorld(6), bladeMaterial, false);
    arm.position.x = boardInchesToWorld(13);
    arm.rotation.y = 0.12;
    const pivot = new THREE.Group();
    pivot.rotation.y = (blade / 5) * Math.PI * 2;
    pivot.add(arm);
    blades.add(pivot);
  }
  group.add(blades);
  const lightShade = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  lightShade.rotation.x = Math.PI;
  lightShade.position.y = -boardInchesToWorld(17);
  group.add(lightShade);
  group.position.set(35, ceilingY, 45);
  root.add(group);

  const light = new THREE.PointLight(0xffc98d, 3100, 650, 1.65);
  light.position.set(35, ceilingY - boardInchesToWorld(19), 45);
  root.add(light);
  return { blades, count: 9 };
}

export function addDenRoom(root: THREE.Group): DenRoom {
  const room = new THREE.Group();
  room.name = 'full-scale-home-den';
  root.add(room);

  const floorY = GAME.spawn.roomFloorYUnits;
  const ceilingY = floorY + boardInchesToWorld(96);
  const roomWidth = boardInchesToWorld(168);
  const roomDepth = boardInchesToWorld(192);
  const wallThickness = boardInchesToWorld(1.5);
  const wallHeight = ceilingY - floorY;
  const plaster = createPlasterMaterial();
  const ceilingPlaster = plaster.clone();
  ceilingPlaster.emissive.set(0x51483d);
  ceilingPlaster.emissiveIntensity = 0.72;
  const wood = createWoodMaterial();
  const trim = new THREE.MeshStandardMaterial({ color: 0xe1dbcf, roughness: 0.76 });
  let objectCount = 0;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), wood);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  floor.name = 'visual-room-floor--not-raycastable';
  room.add(floor);
  objectCount += 1;

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(boardInchesToWorld(102), boardInchesToWorld(124)),
    createRugMaterial(),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, floorY + 0.15, 0);
  rug.receiveShadow = true;
  room.add(rug);
  objectCount += 1;

  place(room, mesh(wallThickness, wallHeight, roomDepth, plaster, false), -roomWidth / 2, floorY + wallHeight / 2, 0);
  place(room, mesh(wallThickness, wallHeight, roomDepth, plaster, false), roomWidth / 2, floorY + wallHeight / 2, 0);
  place(room, mesh(roomWidth, wallHeight, wallThickness, plaster, false), 0, floorY + wallHeight / 2, -roomDepth / 2);
  place(room, mesh(roomWidth, wallHeight, wallThickness, plaster, false), 0, floorY + wallHeight / 2, roomDepth / 2);
  place(room, mesh(roomWidth, wallThickness, roomDepth, ceilingPlaster, false), 0, ceilingY, 0);
  objectCount += 5;

  const baseboardHeight = boardInchesToWorld(5.5);
  const baseboardDepth = boardInchesToWorld(0.8);
  place(room, mesh(baseboardDepth, baseboardHeight, roomDepth, trim, false), -roomWidth / 2 + wallThickness, floorY + baseboardHeight / 2, 0);
  place(room, mesh(baseboardDepth, baseboardHeight, roomDepth, trim, false), roomWidth / 2 - wallThickness, floorY + baseboardHeight / 2, 0);
  place(room, mesh(roomWidth, baseboardHeight, baseboardDepth, trim, false), 0, floorY + baseboardHeight / 2, -roomDepth / 2 + wallThickness);
  place(room, mesh(roomWidth, baseboardHeight, baseboardDepth, trim, false), 0, floorY + baseboardHeight / 2, roomDepth / 2 - wallThickness);
  objectCount += 4;

  objectCount += addBookcase(room, -250, roomDepth / 2 - boardInchesToWorld(7.5), wood);
  objectCount += addSofa(room, roomWidth / 2 - boardInchesToWorld(18), 95);
  objectCount += addWindow(room, -roomWidth / 2);
  objectCount += addWallArt(room, 80, 120, roomDepth / 2 - wallThickness - 2, Math.PI, 19);
  objectCount += addWallArt(room, 230, 105, roomDepth / 2 - wallThickness - 2, Math.PI, 31);

  const fan = addCeilingFan(room, ceilingY - wallThickness);
  objectCount += fan.count;
  batchStaticRoomMeshes(room);

  return {
    objectCount,
    update: (timeSeconds: number) => {
      fan.blades.rotation.y = timeSeconds * 0.72;
    },
  };
}
