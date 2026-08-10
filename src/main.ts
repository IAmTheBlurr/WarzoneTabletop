import * as THREE from 'three';
import './styles.css';
import { FootstepAudio } from './audio/footsteps';
import { FIXED_TIMESTEP, GAME } from './constants';
import { InputManager } from './player/input';
import { PlayerController } from './player/controller';
import { createPackLaunchVelocity } from './player/jumppack';
import {
  runControlsSelfTest,
  runPhaseOneSelfTest,
  runPhaseFourSelfTest,
  runPhaseThreeSelfTest,
  runTimingSelfTest,
  runPhaseTwoSelfTest,
} from './testing/selftest';
import { createBoardWorld } from './world/board';
import { createFootprints } from './world/footprints';
import { createTerrain } from './world/terrain';
import { FixedStepClock } from './simulation/fixedStepClock';

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required application shell element is missing: ${selector}`);
  return element;
}

const app = requiredElement<HTMLDivElement>('#app');
const entry = requiredElement<HTMLElement>('#entry');
const enterButton = requiredElement<HTMLButtonElement>('#enter-button');
const pauseHint = requiredElement<HTMLElement>('#pause-hint');
const debugPanel = requiredElement<HTMLElement>('#debug');
const debugReadout = requiredElement<HTMLElement>('#debug-readout');
const bodyIndex = requiredElement<HTMLElement>('#body-index');
const bodyLabel = requiredElement<HTMLElement>('#body-label');
const bodyDetail = requiredElement<HTMLElement>('#body-detail');
const packMeter = requiredElement<HTMLElement>('#pack-meter');
const packFill = requiredElement<HTMLElement>('#pack-fill');
const packReadout = requiredElement<HTMLElement>('#pack-readout');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  GAME.camera.fovDegrees,
  window.innerWidth / window.innerHeight,
  GAME.camera.near,
  GAME.camera.far,
);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.append(renderer.domElement);

const world = createBoardWorld(scene);
const footprints = createFootprints(world.sceneRoot);
const terrain = createTerrain(
  world.sceneRoot,
  world.groundRaycastGroup,
  world.collidables,
);
const input = new InputManager(renderer.domElement);
const controller = new PlayerController(camera, input, world);
const footstepAudio = new FootstepAudio();
const searchParams = new URLSearchParams(window.location.search);
const cornerPreview = searchParams.get('preview') === 'corner';
const DEBUG_ARC = searchParams.has('debugArc');
let debugArcLine: THREE.Line | null = null;
let previousControllerState = controller.state;
let testArenaColliderIds: string[] = [];
let testArenaMeshes: THREE.Mesh[] = [];

function clearPackTestArena(): void {
  for (const mesh of testArenaMeshes) {
    world.groundRaycastGroup.remove(mesh);
    mesh.geometry.dispose();
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const meshMaterial of meshMaterials) meshMaterial.dispose();
  }
  for (let index = world.collidables.length - 1; index >= 0; index -= 1) {
    if (testArenaColliderIds.includes(world.collidables[index]?.id ?? '')) {
      world.collidables.splice(index, 1);
    }
  }
  testArenaColliderIds = [];
  testArenaMeshes = [];
}

function installPackTestArena(height: number, includeWall: boolean) {
  clearPackTestArena();
  const addTestBox = (
    id: string,
    size: THREE.Vector3,
    position: THREE.Vector3,
  ): void => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ color: 0x221f22 }),
    );
    mesh.position.copy(position);
    mesh.name = id;
    world.groundRaycastGroup.add(mesh);
    mesh.updateMatrixWorld(true);
    world.collidables.push({ id, bounds: new THREE.Box3().setFromObject(mesh) });
    testArenaColliderIds.push(id);
    testArenaMeshes.push(mesh);
  };

  const slab = GAME.terrainLevels.slabThicknessWorldUnits;
  addTestBox(
    '__test-pack-deck',
    new THREE.Vector3(24, slab, 112),
    new THREE.Vector3(300, height - slab / 2, 8),
  );
  if (includeWall) {
    addTestBox(
      '__test-pack-wall',
      new THREE.Vector3(24, 40, 1),
      new THREE.Vector3(300, height + 20, -10),
    );
  }
  return { x: 300, y: height, z: -32 };
}

let debugVisible = searchParams.has('debug');
const physicsClock = new FixedStepClock(FIXED_TIMESTEP);
let previousTime = performance.now();
let frameCount = 0;
let fpsSampleStarted = previousTime;
let displayedFps = 60;
let displayedBody = '';
let observedLandingCount = controller.snapshot().landing.count;
let cameraDip = 0;

interface DustBurst {
  readonly points: THREE.Points;
  readonly velocities: Float32Array;
  age: number;
  readonly lifetime: number;
}

const dustBursts: DustBurst[] = [];
const POLISH = {
  normalLandingDip: 0.08,
  packLandingDip: 0.32,
  dipRecoveryRate: 9,
  dustLifetime: 0.58,
  dustPointCount: 18,
  fovResponse: 7,
  rumbleHeight: 0.018,
  rumbleRoll: 0.0016,
} as const;

input.onDebugToggle(() => {
  debugVisible = !debugVisible;
  debugPanel.hidden = !debugVisible;
});

debugPanel.hidden = !debugVisible;
if (searchParams.has('preview')) {
  document.body.classList.add('is-playing');
  entry.classList.add('dismissed');
}
if (cornerPreview) document.body.classList.add('cinematic-preview');

function setPointerLockUi(locked: boolean): void {
  document.body.classList.toggle('is-playing', locked);
  if (locked) {
    entry.classList.add('dismissed');
    pauseHint.hidden = true;
  } else if (entry.classList.contains('dismissed')) {
    pauseHint.hidden = false;
  }
}

enterButton.addEventListener('click', () => {
  footstepAudio.unlock();
  input.requestPointerLock();
});
renderer.domElement.addEventListener('click', () => {
  if (!input.isPointerLocked() && entry.classList.contains('dismissed')) {
    footstepAudio.unlock();
    input.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => setPointerLockUi(input.isPointerLocked()));

function updateDebug(): void {
  if (!debugVisible) return;
  const snapshot = controller.snapshot();
  const format = (value: number) => value.toFixed(2).padStart(8, ' ');
  const distance = Number.isFinite(snapshot.groundDistance)
    ? `${format(snapshot.groundDistance)} u`
    : '    VOID';
  debugReadout.textContent = [
    `POS     ${snapshot.position.map(format).join('  ')}`,
    `VEL     ${snapshot.velocity.map(format).join('  ')}`,
    `STATE   ${snapshot.state}`,
    `GROUND  ${distance}`,
    `VIEW    ${format(snapshot.yawDegrees)}°  ${format(snapshot.pitchDegrees)}°`,
    `FPS     ${String(displayedFps).padStart(8, ' ')}`,
    `PACK    ${snapshot.pack.charge.toFixed(2).padStart(8, ' ')}  ${
      snapshot.pack.horizontalDistance === null
        ? 'NO FLIGHT'
        : `${snapshot.pack.horizontalDistance.toFixed(2)}u / ${(snapshot.pack.flightTime ?? 0).toFixed(2)}s`
    }`,
  ].join('\n');
}

const bodyPresentation = {
  guardsman: ['01', 'Nimble reconnaissance profile'],
  sister: ['02', 'Armoured momentum profile'],
  primaris: ['03', 'Heavy assault profile'],
} as const;

function updateBodyHud(): void {
  const snapshot = controller.snapshot();
  if (snapshot.body !== displayedBody) {
    displayedBody = snapshot.body;
    const [index, detail] = bodyPresentation[snapshot.body];
    bodyIndex.textContent = `FIELD UNIT / ${index}`;
    bodyLabel.textContent = GAME.bodies[snapshot.body].label;
    bodyDetail.textContent = `${detail} · 1 / 2 / 3 to switch`;
  }
  const hasPack = GAME.bodies[snapshot.body].hasJumpPack;
  packMeter.classList.toggle('available', hasPack);
  packFill.style.transform = `scaleX(${snapshot.pack.charge})`;
  packReadout.textContent =
    snapshot.state === 'PACK_BALLISTIC'
      ? 'Ballistic commitment'
      : snapshot.state === 'RETRO_BURN'
        ? 'Retro-burn'
        : snapshot.pack.armed
          ? `Charging ${Math.round(snapshot.pack.charge * 100)}%`
          : 'Pack ready · hold Space';
}

function updateDebugArc(): void {
  const snapshot = controller.snapshot();
  if (
    !DEBUG_ARC ||
    snapshot.state !== 'PACK_BALLISTIC' ||
    previousControllerState === 'PACK_BALLISTIC' ||
    !snapshot.pack.launchPosition
  ) {
    previousControllerState = snapshot.state;
    return;
  }

  if (debugArcLine) {
    scene.remove(debugArcLine);
    debugArcLine.geometry.dispose();
  }
  const launch = new THREE.Vector3(...snapshot.pack.launchPosition);
  const velocity = createPackLaunchVelocity(THREE.MathUtils.degToRad(snapshot.yawDegrees));
  const points: THREE.Vector3[] = [];
  const segments = GAME.physics.fixedTimestepHz * GAME.jumpPack.airtimeSeconds;
  for (let index = 0; index <= segments; index += 1) {
    const time = (index / segments) * GAME.jumpPack.airtimeSeconds;
    points.push(
      new THREE.Vector3(
        launch.x + velocity.x * time,
        launch.y + velocity.y * time - 0.5 * GAME.physics.gravity * time * time,
        launch.z + velocity.z * time,
      ),
    );
  }
  debugArcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xe2b36e, transparent: true, opacity: 0.86 }),
  );
  debugArcLine.name = 'debug-predicted-pack-arc';
  scene.add(debugArcLine);
  previousControllerState = snapshot.state;
}

function spawnDust(position: readonly [number, number, number], impactSpeed: number): void {
  const positions = new Float32Array(POLISH.dustPointCount * 3);
  const velocities = new Float32Array(POLISH.dustPointCount * 3);
  for (let index = 0; index < POLISH.dustPointCount; index += 1) {
    const angle = (index / POLISH.dustPointCount) * Math.PI * 2;
    const radius = 0.18 + (index % 3) * 0.09;
    positions[index * 3] = position[0] + Math.cos(angle) * radius;
    positions[index * 3 + 1] = position[1] + 0.08;
    positions[index * 3 + 2] = position[2] + Math.sin(angle) * radius;
    const speed = 1.4 + Math.min(impactSpeed, 12) * 0.1 + (index % 4) * 0.12;
    velocities[index * 3] = Math.cos(angle) * speed;
    velocities[index * 3 + 1] = 0.5 + (index % 3) * 0.16;
    velocities[index * 3 + 2] = Math.sin(angle) * speed;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xa79572,
    size: 0.48,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'landing-dust';
  scene.add(points);
  dustBursts.push({ points, velocities, age: 0, lifetime: POLISH.dustLifetime });
}

function updateDust(dt: number): void {
  for (let index = dustBursts.length - 1; index >= 0; index -= 1) {
    const burst = dustBursts[index];
    if (!burst) continue;
    burst.age += dt;
    const attribute = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    for (let point = 0; point < positions.length / 3; point += 1) {
      positions[point * 3] = (positions[point * 3] ?? 0) + (burst.velocities[point * 3] ?? 0) * dt;
      positions[point * 3 + 1] =
        (positions[point * 3 + 1] ?? 0) +
        ((burst.velocities[point * 3 + 1] ?? 0) - burst.age * 1.5) * dt;
      positions[point * 3 + 2] =
        (positions[point * 3 + 2] ?? 0) + (burst.velocities[point * 3 + 2] ?? 0) * dt;
    }
    attribute.needsUpdate = true;
    const burstMaterial = burst.points.material as THREE.PointsMaterial;
    burstMaterial.opacity = 0.58 * Math.max(1 - burst.age / burst.lifetime, 0);
    if (burst.age < burst.lifetime) continue;
    scene.remove(burst.points);
    burst.points.geometry.dispose();
    burstMaterial.dispose();
    dustBursts.splice(index, 1);
  }
}

function updatePresentation(dt: number, now: number): void {
  const snapshot = controller.snapshot();
  if (snapshot.landing.count !== observedLandingCount) {
    observedLandingCount = snapshot.landing.count;
    cameraDip = Math.max(
      cameraDip,
      snapshot.landing.wasPack ? POLISH.packLandingDip : POLISH.normalLandingDip,
    );
    spawnDust(snapshot.landing.position, snapshot.landing.impactSpeed);
  }
  cameraDip = THREE.MathUtils.damp(cameraDip, 0, POLISH.dipRecoveryRate, dt);
  const packFlight =
    snapshot.state === 'PACK_BALLISTIC' || snapshot.state === 'RETRO_BURN';
  const targetFov =
    GAME.camera.fovDegrees + (packFlight ? GAME.camera.packFlightFovKickDegrees : 0);
  const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, POLISH.fovResponse, dt);
  if (Math.abs(nextFov - camera.fov) > 0.001) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
  if (!cornerPreview) {
    camera.position.y -= cameraDip;
    camera.position.y += packFlight ? Math.sin(now * 0.028) * POLISH.rumbleHeight : 0;
    camera.rotation.z = packFlight ? Math.sin(now * 0.034) * POLISH.rumbleRoll : 0;
  }
  footstepAudio.update(snapshot, input.isPointerLocked());
  updateDust(dt);
}

function render(now: number): void {
  requestAnimationFrame(render);
  const frameDt = Math.max((now - previousTime) / 1000, 0);
  previousTime = now;
  physicsClock.advance(frameDt, (dt) => controller.update(dt));
  if (cornerPreview) {
    camera.position.set(-178, 152, -224);
    camera.lookAt(0, 9, 0);
  } else {
    controller.updateCamera();
  }
  updateBodyHud();
  updateDebugArc();
  updatePresentation(frameDt, now);

  frameCount += 1;
  if (now - fpsSampleStarted >= 500) {
    displayedFps = Math.round((frameCount * 1000) / (now - fpsSampleStarted));
    frameCount = 0;
    fpsSampleStarted = now;
  }

  updateDebug();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  // requestAnimationFrame pauses in a hidden tab. Reset the wall-clock origin
  // instead of treating inactive-tab time as a frame that physics must replay.
  previousTime = performance.now();
  physicsClock.reset();
});

const testApi = {
  snapshot: () => controller.snapshot(),
  teleport: (x: number, y: number, z: number) => controller.teleport(x, y, z),
  setInput: (code: string, pressed: boolean) => input.setVirtual(code, pressed),
  clearInput: () => input.clearVirtual(),
  step: (seconds: number) => {
    const steps = Math.ceil(seconds / FIXED_TIMESTEP);
    for (let index = 0; index < steps; index += 1) controller.update(FIXED_TIMESTEP);
    controller.updateCamera();
    return controller.snapshot();
  },
  jump: () => controller.pressJump(),
  releaseJump: () => controller.releaseJump(),
  packPress: () => {
    input.setVirtual('Space', true);
    controller.pressJump();
  },
  packRelease: () => {
    input.setVirtual('Space', false);
    controller.releaseJump();
  },
  switchBody: (body: keyof typeof GAME.bodies) => controller.switchBody(body),
  look: (movementX: number, movementY: number) => controller.look(movementX, movementY),
  colliders: () =>
    world.collidables.map((collider) => ({
      id: collider.id,
      min: collider.bounds.min.toArray() as [number, number, number],
      max: collider.bounds.max.toArray() as [number, number, number],
    })),
  terrainSamples: () => terrain.groundSamples.map((sample) => ({ ...sample })),
  worldStats: () => ({
    footprintPieces: footprints.userData.pieceCount as number,
    colliders: world.collidables.length,
    terrainMeshes: terrain.terrainMeshCount,
    groundTargetNames: world.groundRaycastGroup.children.map((child) => child.name),
  }),
  installPackTestArena,
  clearPackTestArena,
  reset: () => controller.reset(),
};

Object.assign(window, { __WZT__: testApi });
controller.updateCamera();
if (searchParams.get('selftest') === 'phase1') {
  runPhaseOneSelfTest(testApi);
}
if (searchParams.get('selftest') === 'phase2') {
  runPhaseTwoSelfTest(testApi);
}
if (searchParams.get('selftest') === 'phase3') {
  runPhaseThreeSelfTest(testApi);
}
if (searchParams.get('selftest') === 'phase4') {
  runPhaseFourSelfTest(testApi);
}
if (searchParams.get('selftest') === 'timing') {
  runTimingSelfTest();
}
if (searchParams.get('selftest') === 'controls') {
  runControlsSelfTest(testApi);
}
updateBodyHud();
requestAnimationFrame(render);

declare global {
  interface Window {
    __WZT__: typeof testApi;
  }
}
