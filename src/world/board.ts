import * as THREE from 'three';
import { GAME } from '../constants';
import type { CollisionWorld, StaticCollider } from '../player/collision';
import { PALETTE } from './palette';

export interface BoardWorld extends CollisionWorld {
  readonly sceneRoot: THREE.Group;
}

function createBox(
  width: number,
  height: number,
  depth: number,
  color: number,
  roughness = 0.8,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function addRoomDressing(root: THREE.Group): void {
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x171419,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), floorMaterial);
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.position.y = GAME.spawn.roomFloorYUnits;
  roomFloor.receiveShadow = true;
  roomFloor.name = 'visual-room-floor--not-raycastable';
  root.add(roomFloor);

  const legMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.tableWood,
    roughness: 0.72,
  });
  const legPositions: Array<readonly [number, number]> = [
    [-125, -168],
    [125, -168],
    [-125, 168],
    [125, 168],
  ];
  for (const [x, z] of legPositions) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(13, 176, 13), legMaterial);
    leg.position.set(x, -90, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    root.add(leg);
  }

  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: 0x262027,
    roughness: 0.9,
  });
  for (let index = 0; index < 4; index += 1) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(90, 140 + index * 12, 38),
      shelfMaterial,
    );
    shelf.position.set(-290 + index * 190, -108 + index * 3, 360 + index * 28);
    root.add(shelf);
  }
}

export function createBoardWorld(scene: THREE.Scene): BoardWorld {
  scene.background = new THREE.Color(PALETTE.roomFog);
  scene.fog = new THREE.Fog(PALETTE.roomFog, 185, 720);

  const root = new THREE.Group();
  root.name = 'warzone-tabletop';
  scene.add(root);

  const groundRaycastGroup = new THREE.Group();
  groundRaycastGroup.name = 'ground-raycast-group';
  root.add(groundRaycastGroup);
  const collidables: StaticCollider[] = [];

  const mat = createBox(
    GAME.board.worldUnits.width,
    GAME.board.matThicknessWorldUnits,
    GAME.board.worldUnits.depth,
    PALETTE.matGreen,
    0.92,
  );
  mat.position.y = -GAME.board.matThicknessWorldUnits / 2;
  mat.name = 'battle-mat';
  groundRaycastGroup.add(mat);

  const apronWidth = 14;
  const table = createBox(
    GAME.board.worldUnits.width + apronWidth * 2,
    4,
    GAME.board.worldUnits.depth + apronWidth * 2,
    PALETTE.tableWood,
    0.68,
  );
  table.position.y = -2.35;
  table.name = 'table-apron';
  table.castShadow = true;
  groundRaycastGroup.add(table);

  const grid = new THREE.GridHelper(
    GAME.board.worldUnits.depth,
    30,
    PALETTE.brass,
    PALETTE.matBurn,
  );
  grid.position.y = 0.012;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.16;
  }
  root.add(grid);

  const boardBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.BoxGeometry(
        GAME.board.worldUnits.width,
        GAME.board.matThicknessWorldUnits,
        GAME.board.worldUnits.depth,
      ),
    ),
    new THREE.LineBasicMaterial({ color: PALETTE.brass, transparent: true, opacity: 0.62 }),
  );
  boardBorder.position.y = -GAME.board.matThicknessWorldUnits / 2;
  root.add(boardBorder);

  addRoomDressing(root);

  const hemisphere = new THREE.HemisphereLight(0x9eb0bf, 0x241b18, 1.6);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffd9a1, 3.4);
  key.position.set(-120, 220, -90);
  key.target.position.set(0, 0, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -180;
  key.shadow.camera.right = 180;
  key.shadow.camera.top = 220;
  key.shadow.camera.bottom = -220;
  key.shadow.camera.near = 20;
  key.shadow.camera.far = 520;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  const edgeGlow = new THREE.PointLight(0xb74d2f, 650, 420, 1.8);
  edgeGlow.position.set(160, 30, -210);
  scene.add(edgeGlow);

  // Ground raycasts run before the first render, so world matrices must not
  // wait for WebGLRenderer's implicit scene update.
  root.updateMatrixWorld(true);

  return {
    sceneRoot: root,
    collidables,
    groundRaycastGroup,
  };
}
