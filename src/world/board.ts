import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME } from '../constants';
import type { CollisionWorld, StaticCollider } from '../player/collision';
import { createBattleMatMaterial } from './materials';
import { PALETTE } from './palette';
import { addDenRoom } from './room';
import { addTabletopDetails } from './tabletopDetails';

export interface BoardWorld extends CollisionWorld {
  readonly sceneRoot: THREE.Group;
  readonly environmentStats: {
    roomObjects: number;
    tabletopDetails: number;
  };
  updateEnvironment(timeSeconds: number): void;
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

function addTableStructure(root: THREE.Group): void {
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE.tableWood,
    roughness: 0.72,
  });
  const geometries: THREE.BufferGeometry[] = [];
  const addBoxGeometry = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
  ): void => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(x, y, z);
    geometries.push(geometry);
  };
  const legPositions: Array<readonly [number, number]> = [
    [-125, -168],
    [125, -168],
    [-125, 168],
    [125, 168],
  ];
  for (const [x, z] of legPositions) {
    addBoxGeometry(13, 176, 13, x, -90, z);
  }

  addBoxGeometry(
    GAME.board.worldUnits.width + 22,
    8,
    3,
    0,
    -7,
    GAME.board.worldUnits.depth / 2 + 8,
  );
  addBoxGeometry(
    GAME.board.worldUnits.width + 22,
    8,
    3,
    0,
    -7,
    -GAME.board.worldUnits.depth / 2 - 8,
  );
  addBoxGeometry(
    3,
    8,
    GAME.board.worldUnits.depth + 22,
    GAME.board.worldUnits.width / 2 + 8,
    -7,
    0,
  );
  addBoxGeometry(
    3,
    8,
    GAME.board.worldUnits.depth + 22,
    -GAME.board.worldUnits.width / 2 - 8,
    -7,
    0,
  );

  const geometry = mergeGeometries(geometries, false);
  if (!geometry) return;
  const structure = new THREE.Mesh(geometry, material);
  structure.name = 'merged-table-legs-and-aprons';
  structure.receiveShadow = true;
  root.add(structure);
  geometries.forEach((source) => source.dispose());
}

export function createBoardWorld(scene: THREE.Scene): BoardWorld {
  scene.background = new THREE.Color(PALETTE.roomFog);
  scene.fog = new THREE.Fog(PALETTE.roomFog, 430, 1080);

  const root = new THREE.Group();
  root.name = 'warzone-tabletop';
  scene.add(root);
  const den = addDenRoom(root);

  const groundRaycastGroup = new THREE.Group();
  groundRaycastGroup.name = 'ground-raycast-group';
  root.add(groundRaycastGroup);
  const collidables: StaticCollider[] = [];

  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(
      GAME.board.worldUnits.width,
      GAME.board.matThicknessWorldUnits,
      GAME.board.worldUnits.depth,
    ),
    createBattleMatMaterial(),
  );
  mat.receiveShadow = true;
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

  const dieSize = 9;
  const dieX = -GAME.board.worldUnits.width / 2 - 6.2;
  const dieZ = -120;
  const tableTop = -0.35;
  const die = createBox(dieSize, dieSize, dieSize, PALETTE.templateTan, 0.48);
  die.position.set(dieX, tableTop + dieSize / 2, dieZ);
  die.name = 'off-board-scale-die';
  die.castShadow = true;
  groundRaycastGroup.add(die);
  die.updateMatrixWorld(true);
  collidables.push({ id: die.name, bounds: new THREE.Box3().setFromObject(die) });

  const pipMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.templateDark,
    roughness: 0.5,
  });
  const pipGeometry = new THREE.SphereGeometry(0.56, 10, 6);
  const pips = new THREE.InstancedMesh(pipGeometry, pipMaterial, 7);
  pips.name = 'instanced-scale-die-pips';
  const pipTransform = new THREE.Object3D();
  let pipIndex = 0;
  const topY = tableTop + dieSize - 0.1;
  for (const [offsetX, offsetZ] of [
    [-2.1, -2.1],
    [0, 0],
    [2.1, 2.1],
  ] as const) {
    pipTransform.position.set(dieX + offsetX, topY, dieZ + offsetZ);
    pipTransform.rotation.set(0, 0, 0);
    pipTransform.scale.set(1, 0.34, 1);
    pipTransform.updateMatrix();
    pips.setMatrixAt(pipIndex, pipTransform.matrix);
    pipIndex += 1;
  }
  for (const [offsetX, offsetY] of [
    [-2.1, -2.1],
    [2.1, -2.1],
    [-2.1, 2.1],
    [2.1, 2.1],
  ] as const) {
    pipTransform.position.set(
      dieX + offsetX,
      tableTop + dieSize / 2 + offsetY,
      dieZ - dieSize / 2 + 0.1,
    );
    pipTransform.rotation.set(0, 0, 0);
    pipTransform.scale.set(1, 1, 0.34);
    pipTransform.updateMatrix();
    pips.setMatrixAt(pipIndex, pipTransform.matrix);
    pipIndex += 1;
  }
  pips.instanceMatrix.needsUpdate = true;
  root.add(pips);

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

  addTableStructure(root);
  const tabletopDetailCount = addTabletopDetails(root);

  const hemisphere = new THREE.HemisphereLight(0x9eb0bf, 0x241b18, 1.6);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffd9a1, 3.4);
  key.position.set(-120, 220, -90);
  key.target.position.set(0, 0, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(256, 256);
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
    environmentStats: {
      roomObjects: den.objectCount,
      tabletopDetails: tabletopDetailCount,
    },
    updateEnvironment: den.update,
  };
}
