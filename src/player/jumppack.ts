import * as THREE from 'three';
import { GAME } from '../constants';

export function createPackLaunchVelocity(yaw: number): THREE.Vector3 {
  const angle = THREE.MathUtils.degToRad(GAME.jumpPack.launchAngleDegrees);
  const horizontalSpeed = GAME.jumpPack.launchSpeedUnitsPerSec * Math.cos(angle);
  const verticalSpeed = GAME.jumpPack.launchSpeedUnitsPerSec * Math.sin(angle);
  return new THREE.Vector3(
    Math.sin(yaw) * horizontalSpeed,
    verticalSpeed,
    Math.cos(yaw) * horizontalSpeed,
  );
}

export function integrateRetroBurnVelocity(
  verticalVelocity: number,
  groundDistance: number,
  dt: number,
): number {
  const { targetLandingSpeedUnitsPerSec, maxThrustAccelUnitsPerSec2 } =
    GAME.jumpPack.retroBurn;
  const downwardSpeed = -verticalVelocity;
  let thrust = 0;
  if (
    Number.isFinite(groundDistance) &&
    groundDistance > 0.01 &&
    downwardSpeed > targetLandingSpeedUnitsPerSec
  ) {
    thrust =
      (downwardSpeed * downwardSpeed -
        targetLandingSpeedUnitsPerSec * targetLandingSpeedUnitsPerSec) /
        (2 * groundDistance) +
      GAME.physics.gravity;
    thrust = Math.min(thrust, maxThrustAccelUnitsPerSec2);
  }
  return Math.min(verticalVelocity + (thrust - GAME.physics.gravity) * dt, 0);
}
