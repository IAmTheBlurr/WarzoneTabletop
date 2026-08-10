import * as THREE from 'three';
import {
  GAME,
  type BodyId,
  type BodyProfile,
  type ControllerState,
} from '../constants';
import type { InputManager } from './input';
import { createPackLaunchVelocity, integrateRetroBurnVelocity } from './jumppack';
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
  readonly pack: {
    readonly armed: boolean;
    readonly charge: number;
    readonly launchVerticalSpeed: number | null;
    readonly flightTime: number | null;
    readonly horizontalDistance: number | null;
    readonly peakHeight: number | null;
    readonly touchdownSpeed: number | null;
    readonly burnActivationDistance: number | null;
    readonly landingSurfaceY: number | null;
    readonly launchPosition: readonly [number, number, number] | null;
  };
  readonly landing: {
    readonly count: number;
    readonly impactSpeed: number;
    readonly wasPack: boolean;
    readonly position: readonly [number, number, number];
  };
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
  private packArmed = false;
  private packHoldElapsed = 0;
  private packLaunchPosition: THREE.Vector3 | null = null;
  private packFlightTime: number | null = null;
  private packHorizontalDistance: number | null = null;
  private packPeakHeight: number | null = null;
  private packTouchdownSpeed: number | null = null;
  private packBurnActivationDistance: number | null = null;
  private packLandingSurfaceY: number | null = null;
  private packLaunchVerticalSpeed: number | null = null;
  private packRetroTimeScale = 1;
  private landingCount = 0;
  private lastLandingImpactSpeed = 0;
  private lastLandingWasPack = false;
  private lastLandingPosition: [number, number, number] = [0, 0, 0];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly world: CollisionWorld,
  ) {
    input.onJump(() => this.handleJumpDown());
    input.onJumpRelease(() => this.handleJumpRelease());
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
    this.updatePackArming(dt, input.jumpHeld);
    const forwardAmount = Number(input.forward) - Number(input.back);
    const rightAmount = Number(input.right) - Number(input.left);

    const forward = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    // The camera's local forward is -Z and is displayed at yaw + PI, so its
    // visible right is the clockwise perpendicular of our +Z forward vector.
    const right = new THREE.Vector2(-Math.cos(this.yaw), Math.sin(this.yaw));
    const wish = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
    if (wish.lengthSq() > 1) wish.normalize();

    const packCommitted =
      this.state === 'PACK_BALLISTIC' || this.state === 'RETRO_BURN';
    if (!packCommitted) {
      const targetSpeed = input.sprint ? this.body.sprintSpeed : this.body.walkSpeed;
      const target = wish.multiplyScalar(targetSpeed);
      const horizontal = new THREE.Vector2(this.velocity.x, this.velocity.z);
      const accelerating = target.lengthSq() > horizontal.lengthSq();
      let rate = accelerating ? this.body.accelUnitsPerSec2 : this.body.decelUnitsPerSec2;
      if (this.state === 'AIRBORNE') rate *= this.body.airControlMultiplier;
      const nextHorizontal = moveTowardsVector(horizontal, target, rate * dt);
      this.velocity.x = nextHorizontal.x;
      this.velocity.z = nextHorizontal.y;
    }

    const preStepGroundDistance = centerGroundDistance(this.pos, this.world);
    if (this.state === 'RETRO_BURN' && !Number.isFinite(preStepGroundDistance)) {
      this.state = 'PACK_BALLISTIC';
      this.packRetroTimeScale = 1;
    }
    if (
      this.state === 'PACK_BALLISTIC' &&
      this.velocity.y < 0 &&
      preStepGroundDistance <= GAME.jumpPack.retroBurn.activationHeightUnits
    ) {
      this.state = 'RETRO_BURN';
      this.packBurnActivationDistance = preStepGroundDistance;
      const downwardSpeed = -this.velocity.y;
      const internalBurnTime =
        (2 * preStepGroundDistance) /
        (downwardSpeed + GAME.jumpPack.retroBurn.targetLandingSpeedUnitsPerSec);
      const desiredRealTime = Math.max(
        dt,
        GAME.jumpPack.airtimeSeconds - (this.packFlightTime ?? 0),
      );
      this.packRetroTimeScale = Math.max(1, internalBurnTime / desiredRealTime);
    }

    if (this.state !== 'RETRO_BURN' && this.state !== 'GROUNDED') {
      this.velocity.y -= GAME.physics.gravity * dt;
    }

    const horizontalCollision = moveAndResolveHorizontal(
      this.pos,
      this.velocity,
      dt,
      this.body,
      this.world.collidables,
    );
    if (
      packCommitted &&
      (horizontalCollision.hitX || horizontalCollision.hitZ)
    ) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    let retroTouchdownY: number | null = null;
    if (this.state === 'RETRO_BURN') {
      let internalTimeRemaining = dt * this.packRetroTimeScale;
      while (internalTimeRemaining > 0) {
        const substep = Math.min(dt, internalTimeRemaining);
        const distance = centerGroundDistance(this.pos, this.world);
        this.velocity.y = integrateRetroBurnVelocity(
          this.velocity.y,
          distance,
          substep,
        );
        const downwardMove = Math.max(-this.velocity.y * substep, 0);
        if (
          Number.isFinite(distance) &&
          this.velocity.y <= 0 &&
          downwardMove >= Math.max(distance - GAME.collision.contactEpsilonUnits, 0)
        ) {
          retroTouchdownY =
            this.pos.y + GAME.collision.contactEpsilonUnits * 0.02 - distance;
          this.pos.y = retroTouchdownY;
          break;
        }
        this.pos.y += this.velocity.y * substep;
        internalTimeRemaining -= substep;
      }
    } else {
      this.pos.y += this.velocity.y * dt;
    }

    if (packCommitted && this.packLaunchPosition) {
      this.packFlightTime = (this.packFlightTime ?? 0) + dt;
      this.packHorizontalDistance = Math.hypot(
        this.pos.x - this.packLaunchPosition.x,
        this.pos.z - this.packLaunchPosition.z,
      );
      this.packPeakHeight = Math.max(
        this.packPeakHeight ?? 0,
        this.pos.y - this.packLaunchPosition.y,
      );
    }

    const contact = detectGround(this.pos, this.velocity.y, this.body, this.world);
    const acceptGroundSnap =
      retroTouchdownY !== null ||
      (contact.grounded &&
        contact.hitY !== null &&
        this.state !== 'RETRO_BURN');
    if (acceptGroundSnap) {
      const landingY = retroTouchdownY ?? contact.hitY;
      if (landingY === null) throw new Error('Ground contact is missing a surface height.');
      const wasAirborne = this.state !== 'GROUNDED';
      const impactSpeed = Math.abs(this.velocity.y);
      if (packCommitted) {
        this.packTouchdownSpeed = impactSpeed;
        this.packLandingSurfaceY = landingY;
        this.velocity.set(0, 0, 0);
      }
      this.pos.y = landingY;
      this.velocity.y = 0;
      this.state = 'GROUNDED';
      if (wasAirborne) {
        this.landingCount += 1;
        this.lastLandingImpactSpeed = impactSpeed;
        this.lastLandingWasPack = packCommitted;
        this.lastLandingPosition = [this.pos.x, landingY, this.pos.z];
      }
      this.packArmed = false;
      this.packHoldElapsed = 0;
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
    this.handleJumpDown();
  }

  releaseJump(): void {
    this.handleJumpRelease();
  }

  switchBody(bodyId: BodyId): void {
    if (bodyId === this.bodyId) return;
    this.eyeTransitionFrom = this.currentEyeHeight;
    this.eyeTransitionElapsed = 0;
    this.bodyId = bodyId;
    if (!this.body.hasJumpPack && this.packArmed) {
      this.packArmed = false;
      this.packHoldElapsed = 0;
    }
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
      pack: {
        armed: this.packArmed,
        charge: this.packArmed
          ? THREE.MathUtils.clamp(
              this.packHoldElapsed / GAME.jumpPack.holdThresholdSeconds,
              0,
              1,
            )
          : 0,
        launchVerticalSpeed: this.packLaunchVerticalSpeed,
        flightTime: this.packFlightTime,
        horizontalDistance: this.packHorizontalDistance,
        peakHeight: this.packPeakHeight,
        touchdownSpeed: this.packTouchdownSpeed,
        burnActivationDistance: this.packBurnActivationDistance,
        landingSurfaceY: this.packLandingSurfaceY,
        launchPosition: this.packLaunchPosition
          ? [
              this.packLaunchPosition.x,
              this.packLaunchPosition.y,
              this.packLaunchPosition.z,
            ]
          : null,
      },
      landing: {
        count: this.landingCount,
        impactSpeed: this.lastLandingImpactSpeed,
        wasPack: this.lastLandingWasPack,
        position: this.lastLandingPosition,
      },
    };
  }

  private handleJumpDown(): void {
    const strictlyGrounded = this.state === 'GROUNDED';
    this.tryNormalJump();
    if (strictlyGrounded && this.body.hasJumpPack) {
      this.packArmed = true;
      this.packHoldElapsed = 0;
    }
  }

  private handleJumpRelease(): void {
    if (this.state === 'PACK_BALLISTIC' || this.state === 'RETRO_BURN') return;
    this.packArmed = false;
    this.packHoldElapsed = 0;
  }

  private updatePackArming(dt: number, jumpHeld: boolean): void {
    if (!this.packArmed) return;
    if (!jumpHeld) {
      this.handleJumpRelease();
      return;
    }
    this.packHoldElapsed += dt;
    if (this.packHoldElapsed + Number.EPSILON < GAME.jumpPack.holdThresholdSeconds) return;
    this.launchPack();
  }

  private launchPack(): void {
    const launchVelocity = createPackLaunchVelocity(this.yaw);
    this.velocity.copy(launchVelocity);
    this.state = 'PACK_BALLISTIC';
    this.packArmed = false;
    this.packHoldElapsed = GAME.jumpPack.holdThresholdSeconds;
    this.packLaunchPosition = this.pos.clone();
    this.packFlightTime = 0;
    this.packHorizontalDistance = 0;
    this.packPeakHeight = 0;
    this.packTouchdownSpeed = null;
    this.packBurnActivationDistance = null;
    this.packLandingSurfaceY = null;
    this.packLaunchVerticalSpeed = launchVelocity.y;
    this.packRetroTimeScale = 1;
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

  look(movementX: number, movementY: number): void {
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
    this.packArmed = false;
    this.packHoldElapsed = 0;
    this.packRetroTimeScale = 1;
    this.respawnCount += 1;
    this.updateCamera();
  }
}
