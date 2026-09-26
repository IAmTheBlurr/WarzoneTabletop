import * as THREE from 'three';
import { GAME } from '../constants';
import { FOOTPRINT_THICKNESS } from '../world/footprints';
import { boardInchesToWorld } from '../world/layout';

export const DIE_SIZE_WORLD_UNITS = boardInchesToWorld(GAME.dice.sizeBoardInches);

// A die bridging the full 5/8-inch face across a 1/16-inch footprint step
// naturally rests at this angle. Add a small tolerance so that ordinary
// footprint-edge rests remain valid while wall-supported dice are rerolled.
export const FOOTPRINT_BRIDGE_ANGLE_DEGREES = THREE.MathUtils.radToDeg(
  Math.atan(FOOTPRINT_THICKNESS / DIE_SIZE_WORLD_UNITS),
);
export const COCKED_ANGLE_DEGREES =
  FOOTPRINT_BRIDGE_ANGLE_DEGREES + GAME.dice.cockedToleranceDegrees;

export interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface DieFaceReading {
  readonly value: 1 | 2 | 3 | 4 | 5 | 6;
  readonly alignment: number;
  readonly angleDegrees: number;
  readonly cocked: boolean;
}

const FACE_NORMALS: ReadonlyArray<{
  readonly value: DieFaceReading['value'];
  readonly normal: THREE.Vector3;
}> = [
  { value: 1, normal: new THREE.Vector3(0, 1, 0) },
  { value: 6, normal: new THREE.Vector3(0, -1, 0) },
  { value: 3, normal: new THREE.Vector3(1, 0, 0) },
  { value: 4, normal: new THREE.Vector3(-1, 0, 0) },
  { value: 2, normal: new THREE.Vector3(0, 0, 1) },
  { value: 5, normal: new THREE.Vector3(0, 0, -1) },
];

const worldUp = new THREE.Vector3(0, 1, 0);
const transformedNormal = new THREE.Vector3();
const quaternion = new THREE.Quaternion();

export function readTopFace(rotation: QuaternionLike): DieFaceReading {
  quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  let bestValue: DieFaceReading['value'] = 1;
  let bestAlignment = -Infinity;

  for (const face of FACE_NORMALS) {
    transformedNormal.copy(face.normal).applyQuaternion(quaternion);
    const alignment = transformedNormal.dot(worldUp);
    if (alignment <= bestAlignment) continue;
    bestAlignment = alignment;
    bestValue = face.value;
  }

  const angleDegrees = THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp(bestAlignment, -1, 1)),
  );
  return {
    value: bestValue,
    alignment: bestAlignment,
    angleDegrees,
    cocked: angleDegrees > COCKED_ANGLE_DEGREES,
  };
}
