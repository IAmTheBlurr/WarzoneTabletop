import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GAME, type BodyId, type BodyProfile } from '../constants';
import type { ControllerSnapshot } from '../player/controller';
import type { StaticCollider } from '../player/collision';
import { FOOTPRINT_THICKNESS } from '../world/footprints';
import {
  BATTLEFIELD_LAYOUT,
  boardInchesToWorld,
  getFootprintSpec,
} from '../world/layout';
import { TABLE_APRON_WIDTH, TABLE_TOP_Y } from '../world/board';
import {
  COCKED_ANGLE_DEGREES,
  DIE_SIZE_WORLD_UNITS,
  FOOTPRINT_BRIDGE_ANGLE_DEGREES,
  readTopFace,
  type DieFaceReading,
} from './diceMath';

type AnnouncementTone = 'result' | 'reroll' | 'impact';
type ActivePhase = 'rolling' | 'settled';

export interface DiceSystemOptions {
  readonly scene: THREE.Scene;
  readonly collidables: readonly StaticCollider[];
  readonly getPlayerSnapshot: () => ControllerSnapshot;
  readonly onPlayerHit: () => void;
  readonly onStatus: (primary: string, secondary: string) => void;
  readonly onAnnouncement: (
    primary: string,
    secondary: string,
    tone: AnnouncementTone,
  ) => void;
}

interface ActiveDie {
  readonly group: THREE.Group;
  readonly body: CANNON.Body;
  phase: ActivePhase;
  age: number;
  stableTime: number;
  value: DieFaceReading['value'] | null;
  hitPlayer: boolean;
}

interface RetiringDie {
  readonly group: THREE.Group;
  readonly start: THREE.Vector3;
  readonly targetY: number;
  readonly halo: THREE.Mesh;
  age: number;
  readonly duration: number;
}

export interface DiceSnapshot {
  readonly state: 'ready' | 'rolling' | 'settled' | 'retiring';
  readonly value: DieFaceReading['value'] | null;
  readonly sizeBoardInches: number;
  readonly sizeWorldUnits: number;
  readonly cockedThresholdDegrees: number;
  readonly footprintBridgeDegrees: number;
  readonly rollCount: number;
  readonly rerollCount: number;
  readonly position: readonly [number, number, number] | null;
  readonly linearSpeed: number;
  readonly angularSpeed: number;
  readonly faceAngleDegrees: number | null;
}

const COLLISION_GROUP = {
  static: 1,
  die: 2,
  player: 4,
} as const;

const PIP_LAYOUTS: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, ReadonlyArray<readonly [number, number]>>> = {
  1: [[0, 0]],
  2: [[-1, 1], [1, -1]],
  3: [[-1, 1], [0, 0], [1, -1]],
  4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
  5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
  6: [[-1, 1], [-1, 0], [-1, -1], [1, 1], [1, 0], [1, -1]],
};

const smoothstep = (value: number): number => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function secureRandom(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] ?? 0) / 0x1_0000_0000;
}

function randomRange(min: number, max: number): number {
  return THREE.MathUtils.lerp(min, max, secureRandom());
}

function randomSign(): -1 | 1 {
  return secureRandom() < 0.5 ? -1 : 1;
}

function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function setObjectOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.35;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0xb59a64);
        material.emissiveIntensity = (1 - opacity) * 0.34;
      }
    }
  });
}

function createDieVisual(): THREE.Group {
  const size = DIE_SIZE_WORLD_UNITS;
  const half = size / 2;
  const group = new THREE.Group();
  group.name = 'physical-games-workshop-scale-d6';

  const shell = new THREE.Mesh(
    new RoundedBoxGeometry(size, size, size, 4, size * 0.075),
    new THREE.MeshStandardMaterial({
      color: 0xd9d0ba,
      roughness: 0.42,
      metalness: 0.015,
      emissive: 0x000000,
    }),
  );
  shell.name = 'die-shell--five-eighths-inch';
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  const pipGeometry = new THREE.CircleGeometry(size * 0.082, 16);
  const pipMaterial = new THREE.MeshStandardMaterial({
    color: 0x181519,
    roughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const faceOffset = half + size * 0.002;
  const pipOffset = size * 0.23;

  const addFace = (
    value: 1 | 2 | 3 | 4 | 5 | 6,
    normal: THREE.Vector3,
    tangentU: THREE.Vector3,
    tangentV: THREE.Vector3,
    rotation: THREE.Euler,
  ): void => {
    for (const [u, v] of PIP_LAYOUTS[value]) {
      const pip = new THREE.Mesh(pipGeometry, pipMaterial);
      pip.position
        .copy(normal)
        .multiplyScalar(faceOffset)
        .addScaledVector(tangentU, u * pipOffset)
        .addScaledVector(tangentV, v * pipOffset);
      pip.rotation.copy(rotation);
      pip.name = `die-face-${value}-pip`;
      group.add(pip);
    }
  };

  addFace(1, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Euler(-Math.PI / 2, 0, 0));
  addFace(6, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Euler(Math.PI / 2, 0, 0));
  addFace(3, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Euler(0, Math.PI / 2, 0));
  addFace(4, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Euler(0, -Math.PI / 2, 0));
  addFace(2, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Euler(0, 0, 0));
  addFace(5, new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Euler(0, Math.PI, 0));

  return group;
}

export class DiceSystem {
  private readonly physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -GAME.physics.gravity, 0),
  });
  private readonly staticMaterial = new CANNON.Material('tabletop-and-terrain');
  private readonly dieMaterial = new CANNON.Material('die');
  private readonly playerMaterial = new CANNON.Material('player');
  private active: ActiveDie | null = null;
  private readonly retiring: RetiringDie[] = [];
  private playerBody: CANNON.Body | null = null;
  private playerBodyId: BodyId | null = null;
  private pendingRoll = false;
  private rerollDelay = 0;
  private rollCount = 0;
  private rerollCount = 0;
  private lastLaunchIndex = -1;

  constructor(private readonly options: DiceSystemOptions) {
    this.physicsWorld.allowSleep = true;
    this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
    const solver = this.physicsWorld.solver as CANNON.GSSolver;
    solver.iterations = 14;
    solver.tolerance = 0.001;
    this.physicsWorld.defaultContactMaterial.friction = 0.36;
    this.physicsWorld.defaultContactMaterial.restitution = 0.28;
    this.physicsWorld.addContactMaterial(
      new CANNON.ContactMaterial(this.dieMaterial, this.staticMaterial, {
        friction: GAME.dice.friction,
        restitution: GAME.dice.restitution,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 4,
      }),
    );
    this.physicsWorld.addContactMaterial(
      new CANNON.ContactMaterial(this.dieMaterial, this.playerMaterial, {
        friction: 0.22,
        restitution: 0.44,
      }),
    );
    this.installStaticWorld(options.collidables);
    this.syncPlayerBody();
    options.onStatus('D6 ready', 'Press R or roll');
  }

  roll(): void {
    this.pendingRoll = true;
    this.rerollDelay = 0;
    if (this.active) {
      this.options.onStatus('Recalling die', 'The previous result ascends');
      this.retireActive();
      return;
    }
    if (this.retiring.length === 0) this.spawnDie();
  }

  updatePhysics(dt: number): void {
    this.syncPlayerBody();
    const substep = dt / GAME.dice.physicsSubsteps;
    for (let index = 0; index < GAME.dice.physicsSubsteps; index += 1) {
      this.physicsWorld.step(substep);
    }

    const active = this.active;
    if (!active) return;
    active.age += dt;
    this.syncActiveVisual(active);

    if (this.hasLeftTable(active.body)) {
      this.rejectRoll('OFF THE TABLE');
      return;
    }

    const linearSpeed = active.body.velocity.length();
    const angularSpeed = active.body.angularVelocity.length();
    if (active.phase === 'settled') {
      if (linearSpeed > GAME.dice.disturbedLinearSpeed || angularSpeed > GAME.dice.disturbedAngularSpeed) {
        active.phase = 'rolling';
        active.value = null;
        active.stableTime = 0;
        this.options.onStatus('Die disturbed', 'Result pending');
      }
      return;
    }

    const stable =
      active.body.sleepState === CANNON.Body.SLEEPING ||
      (linearSpeed <= GAME.dice.settleLinearSpeed &&
        angularSpeed <= GAME.dice.settleAngularSpeed);
    active.stableTime = stable ? active.stableTime + dt : 0;
    if (active.stableTime < GAME.dice.settleDurationSeconds) return;

    const reading = readTopFace(active.body.quaternion);
    if (reading.cocked) {
      this.rejectRoll('COCKED DIE');
      return;
    }

    active.phase = 'settled';
    active.value = reading.value;
    active.body.sleep();
    this.options.onStatus(`Result // ${reading.value}`, `Stable within ${reading.angleDegrees.toFixed(1)}°`);
    this.options.onAnnouncement(String(reading.value), 'D6 RESULT', 'result');
  }

  updatePresentation(dt: number): void {
    this.rerollDelay = Math.max(this.rerollDelay - dt, 0);
    for (let index = this.retiring.length - 1; index >= 0; index -= 1) {
      const retiring = this.retiring[index];
      if (!retiring) continue;
      retiring.age += dt;
      const progress = THREE.MathUtils.clamp(retiring.age / retiring.duration, 0, 1);
      const rise = smoothstep(progress / 0.68);
      retiring.group.position.x = retiring.start.x;
      retiring.group.position.y = THREE.MathUtils.lerp(retiring.start.y, retiring.targetY, rise);
      retiring.group.position.z = retiring.start.z;
      retiring.group.rotation.y += dt * 0.48;

      const collapse = smoothstep((progress - 0.76) / 0.24);
      const scale = THREE.MathUtils.lerp(1, 0.015, collapse);
      retiring.group.scale.setScalar(scale);
      setObjectOpacity(retiring.group, 1 - smoothstep((progress - 0.82) / 0.18));
      const haloMaterial = retiring.halo.material as THREE.MeshBasicMaterial;
      haloMaterial.opacity = 0.55 * Math.sin(Math.PI * progress) * (1 - collapse);
      retiring.halo.scale.setScalar(1 + rise * 1.8);

      if (progress < 1) continue;
      this.options.scene.remove(retiring.group);
      disposeObject(retiring.group);
      this.retiring.splice(index, 1);
    }

    if (this.pendingRoll && !this.active && this.retiring.length === 0 && this.rerollDelay <= 0) {
      this.spawnDie();
    }
  }

  snapshot(): DiceSnapshot {
    const body = this.active?.body ?? null;
    const face = body ? readTopFace(body.quaternion) : null;
    return {
      state: this.active
        ? this.active.phase
        : this.retiring.length > 0
          ? 'retiring'
          : 'ready',
      value: this.active?.value ?? null,
      sizeBoardInches: GAME.dice.sizeBoardInches,
      sizeWorldUnits: DIE_SIZE_WORLD_UNITS,
      cockedThresholdDegrees: COCKED_ANGLE_DEGREES,
      footprintBridgeDegrees: FOOTPRINT_BRIDGE_ANGLE_DEGREES,
      rollCount: this.rollCount,
      rerollCount: this.rerollCount,
      position: body ? [body.position.x, body.position.y, body.position.z] : null,
      linearSpeed: body?.velocity.length() ?? 0,
      angularSpeed: body?.angularVelocity.length() ?? 0,
      faceAngleDegrees: face?.angleDegrees ?? null,
    };
  }

  private installStaticWorld(collidables: readonly StaticCollider[]): void {
    this.addStaticBox(
      new THREE.Vector3(
        GAME.board.worldUnits.width + TABLE_APRON_WIDTH * 2,
        4,
        GAME.board.worldUnits.depth + TABLE_APRON_WIDTH * 2,
      ),
      new THREE.Vector3(0, -2.35, 0),
    );
    this.addStaticBox(
      new THREE.Vector3(
        GAME.board.worldUnits.width,
        GAME.board.matThicknessWorldUnits,
        GAME.board.worldUnits.depth,
      ),
      new THREE.Vector3(0, -GAME.board.matThicknessWorldUnits / 2, 0),
    );

    for (const placement of BATTLEFIELD_LAYOUT) {
      const spec = getFootprintSpec(placement.footprintId);
      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.STATIC,
        material: this.staticMaterial,
        collisionFilterGroup: COLLISION_GROUP.static,
        collisionFilterMask: COLLISION_GROUP.die,
      });
      body.addShape(
        new CANNON.Box(
          new CANNON.Vec3(
            boardInchesToWorld(spec.boardInches[0]) / 2,
            FOOTPRINT_THICKNESS / 2,
            boardInchesToWorld(spec.boardInches[1]) / 2,
          ),
        ),
      );
      body.position.set(
        boardInchesToWorld(placement.boardX),
        0.014 + FOOTPRINT_THICKNESS / 2,
        boardInchesToWorld(placement.boardZ),
      );
      body.quaternion.setFromEuler(0, THREE.MathUtils.degToRad(placement.rotationDegrees), 0);
      this.physicsWorld.addBody(body);
    }

    for (const collider of collidables) {
      const size = collider.bounds.getSize(new THREE.Vector3());
      const center = collider.bounds.getCenter(new THREE.Vector3());
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue;
      this.addStaticBox(size, center);
    }
  }

  private addStaticBox(size: THREE.Vector3, center: THREE.Vector3): void {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: this.staticMaterial,
      collisionFilterGroup: COLLISION_GROUP.static,
      collisionFilterMask: COLLISION_GROUP.die,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
    body.position.set(center.x, center.y, center.z);
    this.physicsWorld.addBody(body);
  }

  private syncPlayerBody(): void {
    const snapshot = this.options.getPlayerSnapshot();
    if (!this.playerBody || this.playerBodyId !== snapshot.body) {
      if (this.playerBody) this.physicsWorld.removeBody(this.playerBody);
      this.playerBody = this.createPlayerBody(GAME.bodies[snapshot.body]);
      this.playerBodyId = snapshot.body;
      this.physicsWorld.addBody(this.playerBody);
    }
    this.playerBody.position.set(
      snapshot.position[0],
      snapshot.position[1] + GAME.bodies[snapshot.body].heightUnits / 2,
      snapshot.position[2],
    );
    this.playerBody.velocity.set(
      snapshot.velocity[0],
      snapshot.velocity[1],
      snapshot.velocity[2],
    );
    this.playerBody.aabbNeedsUpdate = true;
  }

  private createPlayerBody(profile: BodyProfile): CANNON.Body {
    const radius = profile.capsuleRadiusUnits;
    const straightHeight = Math.max(profile.heightUnits - radius * 2, 0.05);
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: this.playerMaterial,
      collisionFilterGroup: COLLISION_GROUP.player,
      collisionFilterMask: COLLISION_GROUP.die,
    });
    body.addShape(new CANNON.Cylinder(radius, radius, straightHeight, 12));
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, straightHeight / 2, 0));
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, -straightHeight / 2, 0));
    return body;
  }

  private spawnDie(): void {
    this.pendingRoll = false;
    this.rollCount += 1;
    const visual = createDieVisual();
    const half = DIE_SIZE_WORLD_UNITS / 2;
    const shape = new CANNON.Box(new CANNON.Vec3(half, half, half));
    const body = new CANNON.Body({
      mass: GAME.dice.mass,
      shape,
      material: this.dieMaterial,
      allowSleep: true,
      sleepSpeedLimit: GAME.dice.sleepSpeedLimit,
      sleepTimeLimit: GAME.dice.sleepTimeLimitSeconds,
      linearDamping: GAME.dice.linearDamping,
      angularDamping: GAME.dice.angularDamping,
      collisionFilterGroup: COLLISION_GROUP.die,
      collisionFilterMask: COLLISION_GROUP.static | COLLISION_GROUP.player,
    });

    const launch = this.createLaunch();
    body.position.copy(launch.position);
    body.velocity.copy(launch.velocity);
    body.angularVelocity.set(
      randomSign() * randomRange(7, 15),
      randomSign() * randomRange(9, 18),
      randomSign() * randomRange(7, 15),
    );
    const randomAxis = new CANNON.Vec3(
      randomRange(-1, 1),
      randomRange(-1, 1),
      randomRange(-1, 1),
    );
    if (randomAxis.lengthSquared() < 0.001) randomAxis.set(0, 1, 0);
    randomAxis.normalize();
    body.quaternion.setFromAxisAngle(randomAxis, randomRange(0, Math.PI * 2));

    const active: ActiveDie = {
      group: visual,
      body,
      phase: 'rolling',
      age: 0,
      stableTime: 0,
      value: null,
      hitPlayer: false,
    };
    body.addEventListener('collide', (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      if (!this.playerBody || event.body !== this.playerBody || active.hitPlayer) return;
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact < GAME.dice.playerKillImpactSpeed) return;
      active.hitPlayer = true;
      this.options.onAnnouncement('DIRECT HIT', 'RESPAWNING UNIT', 'impact');
      this.options.onPlayerHit();
    });

    this.active = active;
    this.options.scene.add(visual);
    this.physicsWorld.addBody(body);
    this.syncActiveVisual(active);
    this.options.onStatus('D6 in motion', `Throw ${this.rollCount}`);
  }

  private createLaunch(): { position: CANNON.Vec3; velocity: CANNON.Vec3 } {
    const boardHalfX = GAME.board.worldUnits.width / 2;
    const boardHalfZ = GAME.board.worldUnits.depth / 2;
    const launchCount = 6;
    let launchIndex = Math.floor(secureRandom() * launchCount);
    if (launchIndex === this.lastLaunchIndex) launchIndex = (launchIndex + 1) % launchCount;
    this.lastLaunchIndex = launchIndex;

    const y = randomRange(28, 44);
    const xMargin = randomRange(4, 9);
    const zMargin = randomRange(4, 9);
    const positions: CANNON.Vec3[] = [
      new CANNON.Vec3(-boardHalfX - xMargin, y, randomRange(-boardHalfZ * 0.4, boardHalfZ * 0.4)),
      new CANNON.Vec3(boardHalfX + xMargin, y, randomRange(-boardHalfZ * 0.4, boardHalfZ * 0.4)),
      new CANNON.Vec3(randomRange(-boardHalfX * 0.4, boardHalfX * 0.4), y, -boardHalfZ - zMargin),
      new CANNON.Vec3(randomRange(-boardHalfX * 0.4, boardHalfX * 0.4), y, boardHalfZ + zMargin),
      new CANNON.Vec3(-boardHalfX - xMargin, y + 5, -boardHalfZ * 0.55),
      new CANNON.Vec3(boardHalfX + xMargin, y + 5, boardHalfZ * 0.55),
    ];
    const position = positions[launchIndex] ?? positions[0]!;
    const leftwardTarget = randomRange(-boardHalfX * 0.32, boardHalfX * 0.1);
    const rightwardTarget = randomRange(-boardHalfX * 0.1, boardHalfX * 0.32);
    const northwardTarget = randomRange(-boardHalfZ * 0.32, boardHalfZ * 0.1);
    const southwardTarget = randomRange(-boardHalfZ * 0.1, boardHalfZ * 0.32);
    const target = launchIndex === 0 || launchIndex === 4
      ? new CANNON.Vec3(leftwardTarget, DIE_SIZE_WORLD_UNITS / 2, randomRange(-boardHalfZ * 0.4, boardHalfZ * 0.4))
      : launchIndex === 1 || launchIndex === 5
        ? new CANNON.Vec3(rightwardTarget, DIE_SIZE_WORLD_UNITS / 2, randomRange(-boardHalfZ * 0.4, boardHalfZ * 0.4))
        : launchIndex === 2
          ? new CANNON.Vec3(randomRange(-boardHalfX * 0.4, boardHalfX * 0.4), DIE_SIZE_WORLD_UNITS / 2, northwardTarget)
          : new CANNON.Vec3(randomRange(-boardHalfX * 0.4, boardHalfX * 0.4), DIE_SIZE_WORLD_UNITS / 2, southwardTarget);
    const flightTime = randomRange(1.35, 1.65);
    const velocity = new CANNON.Vec3(
      (target.x - position.x) / flightTime,
      (target.y - position.y + 0.5 * GAME.physics.gravity * flightTime * flightTime) / flightTime,
      (target.z - position.z) / flightTime,
    );
    const strength = randomRange(0.97, 1.03);
    velocity.x *= strength;
    velocity.z *= strength;
    return { position, velocity };
  }

  private syncActiveVisual(active: ActiveDie): void {
    active.group.position.set(active.body.position.x, active.body.position.y, active.body.position.z);
    active.group.quaternion.set(
      active.body.quaternion.x,
      active.body.quaternion.y,
      active.body.quaternion.z,
      active.body.quaternion.w,
    );
  }

  private hasLeftTable(body: CANNON.Body): boolean {
    const halfX = GAME.board.worldUnits.width / 2 + TABLE_APRON_WIDTH;
    const halfZ = GAME.board.worldUnits.depth / 2 + TABLE_APRON_WIDTH;
    const outside = Math.abs(body.position.x) > halfX + DIE_SIZE_WORLD_UNITS ||
      Math.abs(body.position.z) > halfZ + DIE_SIZE_WORLD_UNITS;
    return body.position.y < TABLE_TOP_Y - 8 && outside;
  }

  private rejectRoll(reason: 'COCKED DIE' | 'OFF THE TABLE'): void {
    if (!this.active) return;
    this.rerollCount += 1;
    this.pendingRoll = true;
    this.rerollDelay = GAME.dice.rerollDelaySeconds;
    this.options.onStatus('Automatic reroll', reason.toLowerCase());
    this.options.onAnnouncement('RE-ROLL!', reason, 'reroll');
    this.retireActive();
  }

  private retireActive(): void {
    const active = this.active;
    if (!active) return;
    this.physicsWorld.removeBody(active.body);
    this.active = null;

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(DIE_SIZE_WORLD_UNITS * 0.62, DIE_SIZE_WORLD_UNITS * 0.025, 6, 48),
      new THREE.MeshBasicMaterial({
        color: 0xd9bd7a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -DIE_SIZE_WORLD_UNITS * 0.62;
    halo.name = 'die-ascension-halo';
    active.group.add(halo);
    const start = active.group.position.clone();
    this.retiring.push({
      group: active.group,
      start,
      targetY: Math.max(
        start.y + boardInchesToWorld(GAME.dice.ascensionHeightBoardInches),
        boardInchesToWorld(GAME.dice.ascensionHeightBoardInches) + DIE_SIZE_WORLD_UNITS / 2,
      ),
      halo,
      age: 0,
      duration: GAME.dice.ascensionDurationSeconds,
    });
  }
}
