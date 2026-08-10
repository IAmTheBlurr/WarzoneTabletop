import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME } from '../constants';
import { boardInchesToWorld } from './layout';
import {
  createFabricMaterial,
  createImageMaterial,
  createPlasterMaterial,
  createPrintedMaterial,
  createRugMaterial,
  createWoodMaterial,
} from './materials';

const DOOR_OPENING_WIDTH = boardInchesToWorld(36);
const DOOR_OPENING_HEIGHT = boardInchesToWorld(80);
const DOOR_CENTER_X = 330;

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
    emissiveIntensity: 0.16,
    roughness: 0.22,
    metalness: 0.08,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xe3ded3, roughness: 0.75 });
  const exteriorMaterial = createImageMaterial(
    '/assets/textures/den-window-blue-hour.png',
    0.58,
  );
  place(
    group,
    mesh(boardInchesToWorld(0.24), height - frame * 0.7, width - frame * 0.7, exteriorMaterial),
    0,
    0,
    0,
  );
  place(
    group,
    mesh(boardInchesToWorld(0.12), height, width, glassMaterial, false),
    boardInchesToWorld(0.18),
    0,
    0,
  );
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
  return 8;
}

function addWallArt(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  imagePath: string,
): number {
  const group = new THREE.Group();
  group.name = 'den-framed-original-art';
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x302721, roughness: 0.68 });
  const width = boardInchesToWorld(22);
  const height = boardInchesToWorld(30);
  place(group, mesh(width + 7, height + 7, 3.5, frameMaterial), 0, 0, 0);
  // The group faces back into the room after its PI rotation; positive local Z
  // is therefore the visible face in front of the frame.
  place(group, mesh(width, height, 4, createImageMaterial(imagePath, 0.34), false), 0, 0, 2.1);
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  root.add(group);
  return 2;
}

function addStandingLamp(
  root: THREE.Group,
  x: number,
  z: number,
  lightColor: number,
  intensity: number,
): number {
  const group = new THREE.Group();
  group.name = 'den-standing-lamp';
  const floorY = GAME.spawn.roomFloorYUnits;
  const poleHeight = boardInchesToWorld(55);
  const metal = new THREE.MeshStandardMaterial({
    color: 0x282522,
    metalness: 0.72,
    roughness: 0.3,
  });
  const shadeMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8aa82,
    emissive: lightColor,
    emissiveIntensity: 0.52,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xffecd0,
    emissive: lightColor,
    emissiveIntensity: 2.4,
    roughness: 0.18,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(24, 28, 5, 24), metal);
  base.position.y = 2.5;
  group.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3, poleHeight, 14), metal);
  pole.position.y = poleHeight / 2 + 5;
  group.add(pole);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(19, 32, 42, 28, 1, true),
    shadeMaterial,
  );
  shade.position.y = poleHeight + 5;
  group.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(7.5, 16, 10), bulbMaterial);
  bulb.position.y = poleHeight + 7;
  group.add(bulb);

  group.position.set(x, floorY, z);
  root.add(group);

  const light = new THREE.PointLight(lightColor, intensity, 720, 1.45);
  light.name = 'standing-lamp-practical-light';
  light.position.set(x, floorY + poleHeight + 7, z);
  root.add(light);
  return 5;
}

function addDoorAndHallway(
  root: THREE.Group,
  roomDepth: number,
  ceilingY: number,
  plaster: THREE.Material,
  wood: THREE.Material,
  trim: THREE.Material,
): number {
  const group = new THREE.Group();
  group.name = 'half-open-den-door-and-lit-hallway';
  const floorY = GAME.spawn.roomFloorYUnits;
  const backWallZ = roomDepth / 2;
  const casing = boardInchesToWorld(2.6);
  const doorWidth = DOOR_OPENING_WIDTH - boardInchesToWorld(1.5);
  const doorHeight = DOOR_OPENING_HEIGHT - boardInchesToWorld(1.2);
  let count = 0;

  for (const side of [-1, 1]) {
    place(
      group,
      mesh(casing, DOOR_OPENING_HEIGHT + casing, boardInchesToWorld(1.1), trim),
      DOOR_CENTER_X + side * (DOOR_OPENING_WIDTH / 2 + casing / 2),
      floorY + DOOR_OPENING_HEIGHT / 2,
      backWallZ - boardInchesToWorld(0.9),
    );
    count += 1;
  }
  place(
    group,
    mesh(DOOR_OPENING_WIDTH + casing * 2, casing, boardInchesToWorld(1.1), trim),
    DOOR_CENTER_X,
    floorY + DOOR_OPENING_HEIGHT + casing / 2,
    backWallZ - boardInchesToWorld(0.9),
  );
  count += 1;

  const litPortal = mesh(
    DOOR_OPENING_WIDTH * 0.91,
    DOOR_OPENING_HEIGHT * 0.96,
    boardInchesToWorld(0.18),
    new THREE.MeshBasicMaterial({ color: 0xd69b66 }),
  );
  litPortal.name = 'warm-lit-hallway-portal';
  place(
    group,
    litPortal,
    DOOR_CENTER_X,
    floorY + DOOR_OPENING_HEIGHT * 0.48,
    backWallZ + boardInchesToWorld(70),
  );
  count += 1;

  const doorPivot = new THREE.Group();
  doorPivot.name = 'half-open-door-leaf';
  doorPivot.position.set(
    DOOR_CENTER_X - DOOR_OPENING_WIDTH / 2 + casing * 0.45,
    floorY,
    backWallZ - boardInchesToWorld(1.15),
  );
  doorPivot.rotation.y = THREE.MathUtils.degToRad(-55);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x68452f,
    roughness: 0.68,
  });
  const door = mesh(doorWidth, doorHeight, boardInchesToWorld(1.35), doorMaterial);
  door.position.set(doorWidth / 2, doorHeight / 2, 0);
  doorPivot.add(door);
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x815d43, roughness: 0.72 });
  for (const y of [doorHeight * 0.28, doorHeight * 0.69]) {
    const panel = mesh(
      doorWidth * 0.68,
      doorHeight * 0.28,
      boardInchesToWorld(0.22),
      panelMaterial,
    );
    panel.position.set(doorWidth * 0.5, y, -boardInchesToWorld(0.8));
    doorPivot.add(panel);
    count += 1;
  }
  const knobMaterial = new THREE.MeshStandardMaterial({
    color: 0xb28a45,
    metalness: 0.82,
    roughness: 0.24,
  });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 10), knobMaterial);
  knob.position.set(doorWidth - boardInchesToWorld(3.1), doorHeight * 0.51, -boardInchesToWorld(1.25));
  doorPivot.add(knob);
  group.add(doorPivot);
  count += 2;

  const hallwayDepth = boardInchesToWorld(78);
  const hallwayWidth = DOOR_OPENING_WIDTH * 1.28;
  const hallwayHeight = ceilingY - floorY;
  const hallPlaster = (plaster as THREE.MeshStandardMaterial).clone();
  hallPlaster.color.set(0xe2d4c2);
  hallPlaster.emissive.set(0x39291d);
  hallPlaster.emissiveIntensity = 0.62;
  place(
    group,
    mesh(hallwayWidth, 2.2, hallwayDepth, wood),
    DOOR_CENTER_X,
    floorY - 1,
    backWallZ + hallwayDepth / 2,
  );
  for (const side of [-1, 1]) {
    place(
      group,
      mesh(boardInchesToWorld(1.1), hallwayHeight, hallwayDepth, hallPlaster),
      DOOR_CENTER_X + side * hallwayWidth / 2,
      floorY + hallwayHeight / 2,
      backWallZ + hallwayDepth / 2,
    );
  }
  place(
    group,
    mesh(hallwayWidth, hallwayHeight, boardInchesToWorld(1.1), hallPlaster),
    DOOR_CENTER_X,
    floorY + hallwayHeight / 2,
    backWallZ + hallwayDepth,
  );
  place(
    group,
    mesh(hallwayWidth, 2.2, hallwayDepth, hallPlaster),
    DOOR_CENTER_X,
    ceilingY,
    backWallZ + hallwayDepth / 2,
  );
  count += 5;

  const spillGeometry = new THREE.BufferGeometry();
  const spillY = floorY + 0.22;
  spillGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        DOOR_CENTER_X - DOOR_OPENING_WIDTH * 0.42, spillY, backWallZ - 3,
        DOOR_CENTER_X + DOOR_OPENING_WIDTH * 0.42, spillY, backWallZ - 3,
        DOOR_CENTER_X + 150, spillY, backWallZ - 310,
        DOOR_CENTER_X - DOOR_OPENING_WIDTH * 0.42, spillY, backWallZ - 3,
        DOOR_CENTER_X + 150, spillY, backWallZ - 310,
        DOOR_CENTER_X - 180, spillY, backWallZ - 310,
      ],
      3,
    ),
  );
  const spill = new THREE.Mesh(
    spillGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffbd78,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  spill.name = 'warm-hallway-light-spill';
  group.add(spill);
  count += 1;

  const hallLight = new THREE.PointLight(0xffc58a, 9000, 820, 1.45);
  hallLight.name = 'hallway-practical-light';
  hallLight.position.set(
    DOOR_CENTER_X,
    floorY + boardInchesToWorld(60),
    backWallZ + boardInchesToWorld(19),
  );
  group.add(hallLight);
  root.add(group);
  return count;
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

  const light = new THREE.PointLight(0xffc98d, 1800, 520, 1.45);
  light.name = 'ceiling-fan-low-fill-light';
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
  const doorLeft = DOOR_CENTER_X - DOOR_OPENING_WIDTH / 2;
  const doorRight = DOOR_CENTER_X + DOOR_OPENING_WIDTH / 2;

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
  const backLeftWidth = doorLeft + roomWidth / 2;
  const backRightWidth = roomWidth / 2 - doorRight;
  place(
    room,
    mesh(backLeftWidth, wallHeight, wallThickness, plaster, false),
    -roomWidth / 2 + backLeftWidth / 2,
    floorY + wallHeight / 2,
    roomDepth / 2,
  );
  place(
    room,
    mesh(backRightWidth, wallHeight, wallThickness, plaster, false),
    doorRight + backRightWidth / 2,
    floorY + wallHeight / 2,
    roomDepth / 2,
  );
  const doorHeaderHeight = wallHeight - DOOR_OPENING_HEIGHT;
  place(
    room,
    mesh(DOOR_OPENING_WIDTH, doorHeaderHeight, wallThickness, plaster, false),
    DOOR_CENTER_X,
    floorY + DOOR_OPENING_HEIGHT + doorHeaderHeight / 2,
    roomDepth / 2,
  );
  place(room, mesh(roomWidth, wallThickness, roomDepth, ceilingPlaster, false), 0, ceilingY, 0);
  objectCount += 7;

  const baseboardHeight = boardInchesToWorld(5.5);
  const baseboardDepth = boardInchesToWorld(0.8);
  place(room, mesh(baseboardDepth, baseboardHeight, roomDepth, trim, false), -roomWidth / 2 + wallThickness, floorY + baseboardHeight / 2, 0);
  place(room, mesh(baseboardDepth, baseboardHeight, roomDepth, trim, false), roomWidth / 2 - wallThickness, floorY + baseboardHeight / 2, 0);
  place(room, mesh(roomWidth, baseboardHeight, baseboardDepth, trim, false), 0, floorY + baseboardHeight / 2, -roomDepth / 2 + wallThickness);
  place(
    room,
    mesh(backLeftWidth, baseboardHeight, baseboardDepth, trim, false),
    -roomWidth / 2 + backLeftWidth / 2,
    floorY + baseboardHeight / 2,
    roomDepth / 2 - wallThickness,
  );
  place(
    room,
    mesh(backRightWidth, baseboardHeight, baseboardDepth, trim, false),
    doorRight + backRightWidth / 2,
    floorY + baseboardHeight / 2,
    roomDepth / 2 - wallThickness,
  );
  objectCount += 5;

  objectCount += addBookcase(room, -250, roomDepth / 2 - boardInchesToWorld(7.5), wood);
  objectCount += addSofa(room, roomWidth / 2 - boardInchesToWorld(18), 95);
  objectCount += addWindow(room, -roomWidth / 2);
  objectCount += addWallArt(
    room,
    20,
    120,
    roomDepth / 2 - wallThickness - 2,
    Math.PI,
    '/assets/textures/den-art-ringworld.png',
  );
  objectCount += addWallArt(
    room,
    158,
    105,
    roomDepth / 2 - wallThickness - 2,
    Math.PI,
    '/assets/textures/den-art-orbital-ocean.png',
  );
  objectCount += addDoorAndHallway(room, roomDepth, ceilingY, plaster, wood, trim);
  objectCount += addStandingLamp(room, 320, -255, 0xffc07b, 7200);
  objectCount += addStandingLamp(room, -370, 245, 0xffb66f, 6400);

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
