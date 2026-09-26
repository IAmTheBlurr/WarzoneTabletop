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

export const TABLE_APRON_WIDTH = 14;
export const TABLE_TOP_Y = -0.35;

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

  const apronWidth = TABLE_APRON_WIDTH;
  const table = createBox(
    GAME.board.worldUnits.width + apronWidth * 2,
    4,
    GAME.board.worldUnits.depth + apronWidth * 2,
    PALETTE.tableWood,
    0.68,
  );
  table.position.y = TABLE_TOP_Y - 2;
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

  addTableStructure(root);
  const tabletopDetailCount = addTabletopDetails(root);

  // Low-level sky fill only; the visible standing lamps, hallway, and fan are
  // the dominant sources so the room reads as locally illuminated.
  const hemisphere = new THREE.HemisphereLight(0x8491a0, 0x211a17, 0.34);
  scene.add(hemisphere);
  scene.add(new THREE.AmbientLight(0x806f62, 0.1));

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
