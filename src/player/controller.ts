import * as THREE from 'three';
import {
  GAME,
  type BodyId,
  type BodyProfile,
  type ControllerState,
} from '../constants';
import type { InputManager } from './input';
import {
  centerGroundDistance,
  detectGround,
  moveAndResolveHorizontal,
  resolveCurrentPosition,
  type CollisionWorld,
} from './collision';

export interface ControllerSnapshot {
  readonly body: BodyId;
  readonly state: ControllerState;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly groundDistance: number;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly respawnCount: number;
  readonly eyeHeight: number;
}

function moveTowardsVector(
  current: THREE.Vector2,
  target: THREE.Vector2,
  maxDelta: number,
): THREE.Vector2 {
  const delta = target.clone().sub(current);
  const distance = delta.length();
  if (distance <= maxDelta || distance === 0) return target.clone();
  return current.clone().addScaledVector(delta, maxDelta / distance);
}

export class PlayerController {
  readonly pos = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  state: ControllerState = 'GROUNDED';
  yaw = 0;
  pitch = 0;

  private bodyId = GAME.spawn.defaultBody as BodyId;
  private groundDistance = 0;
  private lastGroundedAt = 0;
  private simulationTime = 0;
  private respawnCount = 0;
  private currentEyeHeight = GAME.bodies.primaris.eyeHeightUnits;
  private eyeTransitionFrom = GAME.bodies.primaris.eyeHeightUnits;
  private eyeTransitionElapsed = GAME.camera.eyeHeightLerpSeconds;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly world: CollisionWorld,
  ) {
    input.onJump(() => this.tryNormalJump());
    input.onLook((movementX, movementY) => this.look(movementX, movementY));
    input.onBodySwitch((hotkey) => {
      const body = (Object.entries(GAME.bodies) as Array<[BodyId, BodyProfile]>).find(
        ([, profile]) => profile.hotkey === hotkey,
      );
      if (body) this.switchBody(body[0]);
    });
    this.currentEyeHeight = this.body.eyeHeightUnits;
    this.eyeTransitionFrom = this.currentEyeHeight;
    this.respawn();
  }

  get body(): BodyProfile {
    return GAME.bodies[this.bodyId];
  }

  update(dt: number): void {
    this.simulationTime += dt;
    this.updateEyeHeight(dt);
    const input = this.input.snapshot();
    const forwardAmount = Number(input.forward) - Number(input.back);
    const rightAmount = Number(input.right) - Number(input.left);

    const forward = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    const right = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
    const wish = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
    if (wish.lengthSq() > 1) wish.normalize();

    const targetSpeed = input.sprint ? this.body.sprintSpeed : this.body.walkSpeed;
    const target = wish.multiplyScalar(targetSpeed);
    const horizontal = new THREE.Vector2(this.velocity.x, this.velocity.z);
    const accelerating = target.lengthSq() > horizontal.lengthSq();
    let rate = accelerating ? this.body.accelUnitsPerSec2 : this.body.decelUnitsPerSec2;
    if (this.state === 'AIRBORNE') rate *= this.body.airControlMultiplier;
    const nextHorizontal = moveTowardsVector(horizontal, target, rate * dt);
    this.velocity.x = nextHorizontal.x;
    this.velocity.z = nextHorizontal.y;

    if (this.state !== 'GROUNDED') this.velocity.y -= GAME.physics.gravity * dt;

    moveAndResolveHorizontal(
      this.pos,
      this.velocity,
      dt,
      this.body,
      this.world.collidables,
    );
    this.pos.y += this.velocity.y * dt;

    const contact = detectGround(this.pos, this.velocity.y, this.body, this.world);
    if (contact.grounded && contact.hitY !== null) {
      this.pos.y = contact.hitY;
      this.velocity.y = 0;
      this.state = 'GROUNDED';
      this.lastGroundedAt = this.simulationTime;
    } else if (this.state === 'GROUNDED') {
      this.state = 'AIRBORNE';
    }

    this.groundDistance = centerGroundDistance(this.pos, this.world);
    if (this.pos.y < GAME.spawn.respawnPlaneY) this.respawn();
  }

  updateCamera(): void {
    this.camera.position.set(
      this.pos.x,
      this.pos.y + this.currentEyeHeight,
      this.pos.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
  }

  teleport(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.state = 'AIRBORNE';
    this.updateCamera();
  }

  reset(): void {
    this.respawn();
  }

  pressJump(): void {
    this.tryNormalJump();
  }

  switchBody(bodyId: BodyId): void {
    if (bodyId === this.bodyId) return;
    this.eyeTransitionFrom = this.currentEyeHeight;
    this.eyeTransitionElapsed = 0;
    this.bodyId = bodyId;
    resolveCurrentPosition(this.pos, this.body, this.world.collidables);
    this.groundDistance = centerGroundDistance(this.pos, this.world);
  }

  snapshot(): ControllerSnapshot {
    const finiteGroundDistance = Number.isFinite(this.groundDistance)
      ? this.groundDistance
      : Infinity;
    return {
      body: this.bodyId,
      state: this.state,
      position: [this.pos.x, this.pos.y, this.pos.z],
      velocity: [this.velocity.x, this.velocity.y, this.velocity.z],
      groundDistance: finiteGroundDistance,
      yawDegrees: THREE.MathUtils.radToDeg(this.yaw),
      pitchDegrees: THREE.MathUtils.radToDeg(this.pitch),
      respawnCount: this.respawnCount,
      eyeHeight: this.currentEyeHeight,
    };
  }

  private updateEyeHeight(dt: number): void {
    const duration = GAME.camera.eyeHeightLerpSeconds;
    this.eyeTransitionElapsed = Math.min(this.eyeTransitionElapsed + dt, duration);
    const alpha = duration > 0 ? this.eyeTransitionElapsed / duration : 1;
    this.currentEyeHeight = THREE.MathUtils.lerp(
      this.eyeTransitionFrom,
      this.body.eyeHeightUnits,
      alpha,
    );
  }

  private tryNormalJump(): void {
    const withinCoyote =
      this.simulationTime - this.lastGroundedAt <= GAME.collision.coyoteTimeSeconds;
    if (this.state !== 'GROUNDED' && !withinCoyote) return;

    this.velocity.y = Math.sqrt(
      2 * GAME.physics.gravity * this.body.jumpHeightUnits,
    );
    this.state = 'AIRBORNE';
  }

  private look(movementX: number, movementY: number): void {
    const sensitivity = 0.0018;
    this.yaw -= movementX * sensitivity;
    this.pitch -= movementY * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );
  }

  private respawn(): void {
    const [x, y, z] = GAME.spawn.feetPosition;
    this.pos.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.state = 'GROUNDED';
    this.yaw = 0;
    this.pitch = 0;
    this.lastGroundedAt = this.simulationTime;
    this.groundDistance = 0;
    this.respawnCount += 1;
    this.updateCamera();
  }
}
