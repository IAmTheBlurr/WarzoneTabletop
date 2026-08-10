import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAME } from '../constants';
import type { StaticCollider } from '../player/collision';
import {
  BATTLEFIELD_LAYOUT,
  boardInchesToWorld,
  getFootprintSpec,
  type FootprintPlacement,
} from './layout';
import { PALETTE } from './palette';

export interface TerrainGroundSample {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TerrainBuildResult {
  readonly group: THREE.Group;
  readonly groundSamples: readonly TerrainGroundSample[];
  readonly terrainMeshCount: number;
}

interface BuildContext {
  readonly group: THREE.Group;
  readonly groundGroup: THREE.Group;
  readonly collidables: StaticCollider[];
  readonly samples: TerrainGroundSample[];
  readonly edgeGeometries: THREE.BufferGeometry[];
  readonly contactShadowGeometries: THREE.BufferGeometry[];
  readonly visualBatches: Map<
    string,
    { material: THREE.Material; geometries: THREE.BufferGeometry[] }
  >;
}

const MASSING = {
  inset: boardInchesToWorld(0.25),
  doorwayWidth: 6.5,
  smallBodyGap: 2.5,
  floorRatio: 0.48,
  floorDepthRatio: 0.38,
} as const;

const materials = new Map<number, THREE.MeshStandardMaterial>();

function material(color: number): THREE.MeshStandardMaterial {
  const existing = materials.get(color);
  if (existing) return existing;
  const created = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: color === PALETTE.boneWall ? 0.01 : 0.12,
  });
  materials.set(color, created);
  return created;
}

function localToWorld(
  placement: FootprintPlacement,
  localX: number,
  localZ: number,
): THREE.Vector2 {
  const angle = THREE.MathUtils.degToRad(placement.rotationDegrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new THREE.Vector2(
    boardInchesToWorld(placement.boardX) + localX * cos + localZ * sin,
    boardInchesToWorld(placement.boardZ) - localX * sin + localZ * cos,
  );
}

function collectEdgeHighlight(mesh: THREE.Mesh, context: BuildContext): void {
  mesh.updateMatrix();
  const edges = new THREE.EdgesGeometry(mesh.geometry, 28);
  edges.applyMatrix4(mesh.matrix);
  context.edgeGeometries.push(edges);
}

function collectTerrainVisual(mesh: THREE.Mesh, context: BuildContext): void {
  mesh.updateMatrix();
  const key = (mesh.material as THREE.Material).uuid;
  const batch = context.visualBatches.get(key) ?? {
    material: mesh.material as THREE.Material,
    geometries: [],
  };
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrix);
  batch.geometries.push(geometry);
  context.visualBatches.set(key, batch);
}

function collectContactShadow(
  mesh: THREE.Mesh,
  width: number,
  depth: number,
  context: BuildContext,
): void {
  const shadow = new THREE.PlaneGeometry(width + 1.4, depth + 1.4);
  shadow.rotateX(-Math.PI / 2);
  const transform = new THREE.Object3D();
  transform.position.set(mesh.position.x + 0.34, 0.041, mesh.position.z + 0.52);
  transform.rotation.y = mesh.rotation.y;
  transform.updateMatrix();
  shadow.applyMatrix4(transform.matrix);
  context.contactShadowGeometries.push(shadow);
}

function addBox(
  context: BuildContext,
  placement: FootprintPlacement,
  id: string,
  localX: number,
  localZ: number,
  width: number,
  topY: number,
  depth: number,
  color: number,
  bottomY = 0,
): THREE.Mesh {
  const height = topY - bottomY;
  const world = localToWorld(placement, localX, localZ);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(color),
  );
  mesh.position.set(world.x, bottomY + height / 2, world.y);
  mesh.rotation.y = THREE.MathUtils.degToRad(placement.rotationDegrees);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `${placement.key}-${id}`;
  context.groundGroup.add(mesh);
  mesh.updateMatrixWorld(true);
  context.collidables.push({ id: mesh.name, bounds: new THREE.Box3().setFromObject(mesh) });
  collectEdgeHighlight(mesh, context);
  collectTerrainVisual(mesh, context);
  if (bottomY === 0) collectContactShadow(mesh, width, depth, context);
  // Keep the authored pieces as exact ground-ray targets while rendering a
  // handful of material batches. Three's raycaster intentionally still tests
  // invisible objects, so collision fidelity is unchanged.
  mesh.visible = false;
  return mesh;
}

function addRuin(
  context: BuildContext,
  placement: FootprintPlacement,
  width: number,
  depth: number,
  hasLevelTwo: boolean,
  triangular = false,
): void {
  const slab = GAME.terrainLevels.slabThicknessWorldUnits;
  const levelOne = GAME.terrainLevels.levels[0]?.floorWorldUnits ?? 16;
  const levelTwo = GAME.terrainLevels.levels[1]?.floorWorldUnits ?? 32;
  const lineHeight = boardInchesToWorld(1);
  const wallTop = (hasLevelTwo ? levelTwo : levelOne) + lineHeight;
  const innerWidth = width - MASSING.inset * 2;
  const innerDepth = depth - MASSING.inset * 2;
  const rearZ = -depth / 2 + MASSING.inset;
  const sideX = -width / 2 + MASSING.inset;
  const doorway = triangular ? MASSING.smallBodyGap : MASSING.doorwayWidth;
  const rearSegment = Math.max((innerWidth - doorway) / 2, slab);

  addBox(
    context,
    placement,
    'rear-left-wall',
    -doorway / 2 - rearSegment / 2,
    rearZ,
    rearSegment,
    wallTop,
    slab,
    PALETTE.boneWall,
  );
  addBox(
    context,
    placement,
    'rear-right-wall',
    doorway / 2 + rearSegment / 2,
    rearZ,
    rearSegment,
    wallTop - (triangular ? lineHeight : 0),
    slab,
    PALETTE.boneWall,
  );
  addBox(
    context,
    placement,
    'side-wall',
    sideX,
    innerDepth * 0.08,
    slab,
    wallTop,
    innerDepth * 0.66,
    PALETTE.boneShadow,
  );

  const floorWidth = innerWidth * MASSING.floorRatio;
  const floorDepth = innerDepth * MASSING.floorDepthRatio;
  const floorX = width / 2 - MASSING.inset - floorWidth / 2;
  const floorZ = depth / 2 - MASSING.inset - floorDepth / 2;
  addBox(
    context,
    placement,
    'level-one-floor',
    floorX,
    floorZ,
    floorWidth,
    levelOne,
    floorDepth,
    PALETTE.boneWall,
    levelOne - slab,
  );

  const levelOnePoint = localToWorld(placement, floorX, floorZ);
  context.samples.push({
    label: `${placement.key} level 1`,
    x: levelOnePoint.x,
    y: levelOne,
    z: levelOnePoint.y,
  });

  const supportTop = levelOne - slab;
  addBox(
    context,
    placement,
    'floor-support',
    floorX + floorWidth / 2 - slab / 2,
    floorZ,
    slab,
    supportTop,
    floorDepth,
    PALETTE.boneShadow,
  );

  if (!hasLevelTwo) return;

  const upperWidth = floorWidth * 0.72;
  const upperDepth = floorDepth * 0.72;
  addBox(
    context,
    placement,
    'level-two-floor',
    floorX - floorWidth * 0.1,
    floorZ - floorDepth * 0.1,
    upperWidth,
    levelTwo,
    upperDepth,
    PALETTE.boneWall,
    levelTwo - slab,
  );
  const levelTwoPoint = localToWorld(
    placement,
    floorX - floorWidth * 0.1,
    floorZ - floorDepth * 0.1,
  );
  context.samples.push({
    label: `${placement.key} level 2`,
    x: levelTwoPoint.x,
    y: levelTwo,
    z: levelTwoPoint.y,
  });
}

function addContainerBlock(
  context: BuildContext,
  placement: FootprintPlacement,
  width: number,
  depth: number,
): void {
  const levelOne = GAME.terrainLevels.levels[0]?.floorWorldUnits ?? 16;
  const levelTwo = GAME.terrainLevels.levels[1]?.floorWorldUnits ?? 32;
  const top = placement.instance >= 2 ? levelTwo : levelOne;
  const insetWidth = width - MASSING.inset * 2;
  const insetDepth = depth - MASSING.inset * 2;
  addBox(
    context,
    placement,
    'container-stack',
    0,
    0,
    insetWidth,
    top,
    insetDepth,
    placement.instance % 2 === 0 ? PALETTE.rustAccent : PALETTE.oxidizedMetal,
  );
  const point = localToWorld(placement, 0, 0);
  context.samples.push({
    label: `${placement.key} roof`,
    x: point.x,
    y: top,
    z: point.y,
  });

  const bandHeight = GAME.terrainLevels.slabThicknessWorldUnits * 0.45;
  for (const y of [top * 0.32, top * 0.66]) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(insetWidth + 0.05, bandHeight, insetDepth + 0.05),
      material(PALETTE.boneShadow),
    );
    band.position.set(point.x, y, point.y);
    band.rotation.y = THREE.MathUtils.degToRad(placement.rotationDegrees);
    collectTerrainVisual(band, context);
    band.geometry.dispose();
  }
}

function addLineObstacle(
  context: BuildContext,
  placement: FootprintPlacement,
  width: number,
  depth: number,
): void {
  const height = boardInchesToWorld(1);
  addBox(
    context,
    placement,
    'barricade',
    0,
    0,
    width - MASSING.inset * 2,
    height,
    Math.max(depth - MASSING.inset * 2, GAME.terrainLevels.slabThicknessWorldUnits),
    placement.instance % 2 === 0 ? PALETTE.rustAccent : PALETTE.oxidizedMetal,
  );
}

export function createTerrain(
  root: THREE.Group,
  groundGroup: THREE.Group,
  collidables: StaticCollider[],
): TerrainBuildResult {
  const group = new THREE.Group();
  group.name = 'generic-gothic-industrial-terrain';
  root.add(group);
  const context: BuildContext = {
    group,
    groundGroup,
    collidables,
    samples: [],
    edgeGeometries: [],
    contactShadowGeometries: [],
    visualBatches: new Map(),
  };
  const beforeCount = groundGroup.children.length;

  for (const placement of BATTLEFIELD_LAYOUT) {
    const spec = getFootprintSpec(placement.footprintId);
    const width = boardInchesToWorld(spec.boardInches[0]);
    const depth = boardInchesToWorld(spec.boardInches[1]);
    if (placement.footprintId === 'largeRect') {
      addRuin(context, placement, width, depth, placement.instance >= 2);
    } else if (placement.footprintId === 'largeTri') {
      addRuin(context, placement, width, depth, false, true);
    } else if (placement.footprintId === 'mediumRect') {
      addContainerBlock(context, placement, width, depth);
    } else {
      addLineObstacle(context, placement, width, depth);
    }
  }

  const mergedContactShadows = mergeGeometries(context.contactShadowGeometries, false);
  if (mergedContactShadows) {
    const contactShadows = new THREE.Mesh(
      mergedContactShadows,
      new THREE.MeshBasicMaterial({
        color: 0x11130e,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
    );
    contactShadows.name = 'baked-terrain-contact-shadows';
    contactShadows.renderOrder = 2;
    group.add(contactShadows);
  }

  let visualBatchIndex = 0;
  for (const batch of context.visualBatches.values()) {
    const geometry = mergeGeometries(batch.geometries, false);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = `merged-terrain-material-${visualBatchIndex}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    visualBatchIndex += 1;
    batch.geometries.forEach((source) => source.dispose());
  }

  const mergedEdges = mergeGeometries(context.edgeGeometries, false);
  if (mergedEdges) {
    const highlights = new THREE.LineSegments(
      mergedEdges,
      new THREE.LineBasicMaterial({
        color: 0xe2d6bf,
        transparent: true,
        opacity: 0.25,
      }),
    );
    highlights.name = 'merged-terrain-edge-highlights';
    group.add(highlights);
  }

  root.updateMatrixWorld(true);
  return {
    group,
    groundSamples: context.samples,
    terrainMeshCount: groundGroup.children.length - beforeCount,
  };
}
