import * as THREE from 'three';
import { GAME, type BodyProfile } from '../constants';

export interface StaticCollider {
  readonly id: string;
  readonly bounds: THREE.Box3;
}

export interface CollisionWorld {
  readonly collidables: StaticCollider[];
  readonly groundRaycastGroup: THREE.Group;
}

export interface GroundContact {
  readonly grounded: boolean;
  readonly hitY: number | null;
  readonly snapDistance: number;
}

export interface HorizontalCollisionResult {
  readonly hitX: boolean;
  readonly hitZ: boolean;
}

const down = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const offsets: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function raycastDistance(
  world: CollisionWorld,
  x: number,
  y: number,
  z: number,
  far = Infinity,
): THREE.Intersection | null {
  origin.set(x, y, z);
  raycaster.set(origin, down);
  raycaster.near = 0;
  raycaster.far = far;
  return raycaster.intersectObjects(world.groundRaycastGroup.children, true)[0] ?? null;
}

export function detectGround(
  pos: THREE.Vector3,
  verticalVelocity: number,
  body: BodyProfile,
  world: CollisionWorld,
): GroundContact {
  const rayHeight = pos.y + body.stepHeightUnits;
  const offsetDistance = body.capsuleRadiusUnits * 0.7;
  const maxSnap = body.stepHeightUnits + GAME.collision.groundSnapDistanceUnits;
  let nearest: THREE.Intersection | null = null;

  for (const [offsetX, offsetZ] of offsets) {
    const hit = raycastDistance(
      world,
      pos.x + offsetX * offsetDistance,
      rayHeight,
      pos.z + offsetZ * offsetDistance,
      maxSnap,
    );
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
  }

  return {
    grounded: verticalVelocity <= 0 && !!nearest && nearest.distance <= maxSnap,
    hitY: nearest?.point.y ?? null,
    snapDistance: nearest?.distance ?? Infinity,
  };
}

export function centerGroundDistance(
  pos: THREE.Vector3,
  world: CollisionWorld,
): number {
  const hit = raycastDistance(
    world,
    pos.x,
    pos.y + GAME.collision.contactEpsilonUnits * 0.02,
    pos.z,
  );
  return hit?.distance ?? Infinity;
}

function verticalBandsOverlap(
  pos: THREE.Vector3,
  body: BodyProfile,
  box: THREE.Box3,
): boolean {
  const wallBandMin = pos.y + body.stepHeightUnits;
  const wallBandMax = pos.y + body.heightUnits;
  return box.max.y > wallBandMin && box.min.y < wallBandMax;
}

function distanceToInterval(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function resolveAxis(
  axis: 'x' | 'z',
  pos: THREE.Vector3,
  previousAxisValue: number,
  delta: number,
  body: BodyProfile,
  collidables: readonly StaticCollider[],
): boolean {
  let collided = false;
  const radius = body.capsuleRadiusUnits;
  const otherAxis = axis === 'x' ? 'z' : 'x';

  for (const collider of collidables) {
    const box = collider.bounds;
    if (!verticalBandsOverlap(pos, body, box)) continue;

    const otherDistance = distanceToInterval(
      pos[otherAxis],
      box.min[otherAxis],
      box.max[otherAxis],
    );
    if (otherDistance >= radius) continue;

    const circleReach = Math.sqrt(radius * radius - otherDistance * otherDistance);
    const low = box.min[axis] - circleReach;
    const high = box.max[axis] + circleReach;
    const value = pos[axis];
    if (value <= low || value >= high) continue;

    let resolved: number;
    if (previousAxisValue <= low || delta > 0) resolved = low;
    else if (previousAxisValue >= high || delta < 0) resolved = high;
    else resolved = value - low < high - value ? low : high;

    pos[axis] = resolved;
    collided = true;
  }

  return collided;
}

export function moveAndResolveHorizontal(
  pos: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number,
  body: BodyProfile,
  collidables: readonly StaticCollider[],
  iterations = GAME.collision.horizontalResolveIterations,
): HorizontalCollisionResult {
  const deltaX = velocity.x * dt;
  const deltaZ = velocity.z * dt;
  let hitX = false;
  let hitZ = false;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const scale = iteration === 0 ? 1 : 0;
    const previousX = pos.x;
    pos.x += deltaX * scale;
    if (resolveAxis('x', pos, previousX, deltaX, body, collidables)) {
      velocity.x = 0;
      hitX = true;
    }

    const previousZ = pos.z;
    pos.z += deltaZ * scale;
    if (resolveAxis('z', pos, previousZ, deltaZ, body, collidables)) {
      velocity.z = 0;
      hitZ = true;
    }
  }

  return { hitX, hitZ };
}

export function resolveCurrentPosition(
  pos: THREE.Vector3,
  body: BodyProfile,
  collidables: readonly StaticCollider[],
): void {
  const noVelocity = new THREE.Vector3();
  moveAndResolveHorizontal(pos, noVelocity, 0, body, collidables, 1);
}

