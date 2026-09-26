import * as THREE from 'three';
import './styles.css';
import { FootstepAudio } from './audio/footsteps';
import { FIXED_TIMESTEP, GAME } from './constants';
import { DiceSystem } from './dice/diceSystem';
import { InputManager } from './player/input';
import { PlayerController } from './player/controller';
import { createPackLaunchVelocity } from './player/jumppack';
import {
  runControlsSelfTest,
  runEnvironmentSelfTest,
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
import { mouseSensitivityMultiplier, SettingsStore } from './settings';

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required application shell element is missing: ${selector}`);
  return element;
}

const app = requiredElement<HTMLDivElement>('#app');
const entry = requiredElement<HTMLElement>('#entry');
const enterButton = requiredElement<HTMLButtonElement>('#enter-button');
const mainOptionsButton = requiredElement<HTMLButtonElement>('#main-options-button');
const pauseMenu = requiredElement<HTMLElement>('#pause-menu');
const resumeButton = requiredElement<HTMLButtonElement>('#resume-button');
const pauseOptionsButton = requiredElement<HTMLButtonElement>('#pause-options-button');
const mainMenuButton = requiredElement<HTMLButtonElement>('#main-menu-button');
const optionsMenu = requiredElement<HTMLElement>('#options-menu');
const optionsContext = requiredElement<HTMLElement>('#options-context');
const optionsBackButton = requiredElement<HTMLButtonElement>('#options-back-button');
const optionsResetButton = requiredElement<HTMLButtonElement>('#options-reset-button');
const mouseSensitivityInput = requiredElement<HTMLInputElement>('#mouse-sensitivity');
const mouseSensitivityValue = requiredElement<HTMLOutputElement>('#mouse-sensitivity-value');
const mouseSensitivityDetail = requiredElement<HTMLElement>('#mouse-sensitivity-detail');
const debugPanel = requiredElement<HTMLElement>('#debug');
const debugReadout = requiredElement<HTMLElement>('#debug-readout');
const bodyIndex = requiredElement<HTMLElement>('#body-index');
const bodyLabel = requiredElement<HTMLElement>('#body-label');
const bodyDetail = requiredElement<HTMLElement>('#body-detail');
const packMeter = requiredElement<HTMLElement>('#pack-meter');
const packFill = requiredElement<HTMLElement>('#pack-fill');
const packReadout = requiredElement<HTMLElement>('#pack-readout');
const diceRollButton = requiredElement<HTMLButtonElement>('#dice-roll-button');
const diceStatus = requiredElement<HTMLElement>('#dice-status');
const diceDetail = requiredElement<HTMLElement>('#dice-detail');
const diceAnnouncement = requiredElement<HTMLElement>('#dice-announcement');
const diceAnnouncementPrimary = requiredElement<HTMLElement>('#dice-announcement-primary');
const diceAnnouncementSecondary = requiredElement<HTMLElement>('#dice-announcement-secondary');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  GAME.camera.fovDegrees,
  window.innerWidth / window.innerHeight,
  GAME.camera.near,
  GAME.camera.far,
);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
// Favor motion clarity over supersampling. Dense material detail still reads
// at 0.7×, while the lower internal resolution keeps this WebGL scene above
// the 60 FPS floor on integrated GPUs and high-DPI displays.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.7));
// Static contact shading carries the miniature-scale grounding without a
// second realtime shadow render of the entire scene.
renderer.shadowMap.enabled = false;
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
const settings = new SettingsStore();
let diceAnnouncementTimer: number | null = null;

mouseSensitivityInput.min = String(GAME.controls.mouseSensitivity.minimum);
mouseSensitivityInput.max = String(GAME.controls.mouseSensitivity.maximum);
settings.subscribe((next) => {
  controller.setMouseSensitivity(next.mouseSensitivity);
  mouseSensitivityInput.value = String(next.mouseSensitivity);
  mouseSensitivityValue.value = String(next.mouseSensitivity);
  mouseSensitivityValue.textContent = String(next.mouseSensitivity);
  mouseSensitivityDetail.textContent = `${mouseSensitivityMultiplier(next.mouseSensitivity).toFixed(2)}× look input · saved automatically`;
});

mouseSensitivityInput.addEventListener('input', () => {
  settings.setMouseSensitivity(Number(mouseSensitivityInput.value));
});
optionsResetButton.addEventListener('click', () => settings.reset());

function showDiceAnnouncement(
  primary: string,
  secondary: string,
  tone: 'result' | 'reroll' | 'impact',
): void {
  if (diceAnnouncementTimer !== null) window.clearTimeout(diceAnnouncementTimer);
  diceAnnouncement.classList.remove('visible');
  diceAnnouncement.dataset.tone = tone;
  diceAnnouncementPrimary.textContent = primary;
  diceAnnouncementSecondary.textContent = secondary;
  // Restart the transition even when a rapid automatic reroll replaces a result.
  void diceAnnouncement.offsetWidth;
  diceAnnouncement.classList.add('visible');
  const duration = tone === 'result' ? 1050 : 820;
  diceAnnouncementTimer = window.setTimeout(() => {
    diceAnnouncement.classList.remove('visible');
    diceAnnouncementTimer = null;
  }, duration);
}

const dice = new DiceSystem({
  scene,
  collidables: world.collidables,
  getPlayerSnapshot: () => controller.snapshot(),
  onPlayerHit: () => controller.reset(),
  onStatus: (primary, secondary) => {
    diceStatus.textContent = primary;
    diceDetail.textContent = secondary;
  },
  onAnnouncement: showDiceAnnouncement,
});
input.onDiceRoll(() => dice.roll());
diceRollButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  dice.roll();
});
const searchParams = new URLSearchParams(window.location.search);
const cornerPreview = searchParams.get('preview') === 'corner';
const windowPreview = searchParams.get('preview') === 'window';
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
let displayedPackTransform = '';
let displayedPackReadout = '';
let lastDebugUpdate = 0;
let observedLandingCount = controller.snapshot().landing.count;

interface DustBurst {
  readonly points: THREE.Points;
  readonly velocities: Float32Array;
  age: number;
  readonly lifetime: number;
}

const dustBursts: DustBurst[] = [];
const POLISH = {
  dustLifetime: 0.58,
  dustPointCount: 18,
} as const;

input.onDebugToggle(() => {
  debugVisible = !debugVisible;
  debugPanel.hidden = !debugVisible;
});

debugPanel.hidden = !debugVisible;
let hasEnteredBattlefield = searchParams.has('preview');
let optionsReturnContext: 'main' | 'pause' = 'main';
if (searchParams.has('preview')) {
  document.body.classList.add('is-playing');
  entry.classList.add('dismissed');
}
if (cornerPreview) document.body.classList.add('cinematic-preview');

function requestFieldControl(): void {
  footstepAudio.unlock();
  input.requestPointerLock();
}

function openOptions(context: 'main' | 'pause'): void {
  optionsReturnContext = context;
  optionsContext.textContent =
    context === 'main' ? 'Main menu / configuration' : 'Paused / configuration';
  pauseMenu.hidden = true;
  optionsMenu.hidden = false;
  mouseSensitivityInput.focus();
}

function closeOptions(): void {
  optionsMenu.hidden = true;
  if (optionsReturnContext === 'pause' && hasEnteredBattlefield) {
    pauseMenu.hidden = false;
    resumeButton.focus();
  } else {
    mainOptionsButton.focus();
  }
}

function showMainMenu(): void {
  hasEnteredBattlefield = false;
  input.releaseHeld();
  optionsMenu.hidden = true;
  pauseMenu.hidden = true;
  entry.classList.remove('dismissed');
  document.body.classList.remove('is-playing');
  enterButton.focus();
}

function setPointerLockUi(locked: boolean): void {
  document.body.classList.toggle('is-playing', locked);
  if (locked) {
    hasEnteredBattlefield = true;
    entry.classList.add('dismissed');
    pauseMenu.hidden = true;
    optionsMenu.hidden = true;
  } else {
    input.releaseHeld();
    if (hasEnteredBattlefield && !searchParams.has('preview') && optionsMenu.hidden) {
      pauseMenu.hidden = false;
      resumeButton.focus();
    }
  }
}

enterButton.addEventListener('click', () => {
  hasEnteredBattlefield = true;
  requestFieldControl();
});
mainOptionsButton.addEventListener('click', () => openOptions('main'));
resumeButton.addEventListener('click', requestFieldControl);
pauseOptionsButton.addEventListener('click', () => openOptions('pause'));
mainMenuButton.addEventListener('click', showMainMenu);
optionsBackButton.addEventListener('click', closeOptions);
renderer.domElement.addEventListener('click', () => {
  if (
    !input.isPointerLocked() &&
    hasEnteredBattlefield &&
    pauseMenu.hidden &&
    optionsMenu.hidden
  ) {
    requestFieldControl();
  }
});
document.addEventListener('pointerlockchange', () => setPointerLockUi(input.isPointerLocked()));
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape') return;
  if (!optionsMenu.hidden) {
    event.preventDefault();
    closeOptions();
    return;
  }
  if (!hasEnteredBattlefield || !input.isPointerLocked()) return;
  input.releaseHeld();
  setPointerLockUi(false);
  void document.exitPointerLock();
});

function updateDebug(): void {
  if (!debugVisible) return;
  const now = performance.now();
  if (now - lastDebugUpdate < 100) return;
  lastDebugUpdate = now;
  const snapshot = controller.snapshot();
  const die = dice.snapshot();
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
    `DRAW    ${String(renderer.info.render.calls).padStart(8, ' ')} calls  ${String(renderer.info.render.triangles).padStart(8, ' ')} tris`,
    `DIE     ${die.state.padStart(8, ' ')}  ${die.value === null ? '-' : die.value}  ${die.linearSpeed.toFixed(2)}u/s`,
    `D6 SIZE ${die.sizeBoardInches.toFixed(3).padStart(8, ' ')}in  COCKED >${die.cockedThresholdDegrees.toFixed(1)}°`,
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
  const packTransform = `scaleX(${snapshot.pack.charge})`;
  if (packTransform !== displayedPackTransform) {
    displayedPackTransform = packTransform;
    packFill.style.transform = packTransform;
  }
  const nextPackReadout =
    snapshot.state === 'PACK_BALLISTIC'
      ? 'Ballistic commitment'
      : snapshot.state === 'RETRO_BURN'
        ? 'Retro-burn'
        : snapshot.pack.armed
          ? `Charging ${Math.round(snapshot.pack.charge * 100)}%`
          : 'Pack ready · hold Space';
  if (nextPackReadout !== displayedPackReadout) {
    displayedPackReadout = nextPackReadout;
    packReadout.textContent = nextPackReadout;
  }
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

function updatePresentation(dt: number): void {
  const snapshot = controller.snapshot();
  if (snapshot.landing.count !== observedLandingCount) {
    observedLandingCount = snapshot.landing.count;
    spawnDust(snapshot.landing.position, snapshot.landing.impactSpeed);
  }
  footstepAudio.update(snapshot, input.isPointerLocked());
  updateDust(dt);
  dice.updatePresentation(dt);
}

function render(now: number): void {
  requestAnimationFrame(render);
  const frameDt = Math.max((now - previousTime) / 1000, 0);
  previousTime = now;
  physicsClock.advance(frameDt, (dt) => {
    controller.update(dt);
    dice.updatePhysics(dt);
  });
  if (cornerPreview) {
    camera.position.set(-178, 152, -224);
    camera.lookAt(0, 9, 0);
  } else if (windowPreview) {
    camera.position.set(115, 138, -35);
    camera.lookAt(-440, 132, -155);
  } else {
    controller.updateCamera();
  }
  updateBodyHud();
  updateDebugArc();
  updatePresentation(frameDt);
  world.updateEnvironment(now / 1000);

  frameCount += 1;
  if (now - fpsSampleStarted >= 500) {
    displayedFps = Math.round((frameCount * 1000) / (now - fpsSampleStarted));
    renderer.domElement.dataset.fps = String(displayedFps);
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
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
    for (let index = 0; index < steps; index += 1) {
      controller.update(FIXED_TIMESTEP);
      dice.updatePhysics(FIXED_TIMESTEP);
      dice.updatePresentation(FIXED_TIMESTEP);
    }
    controller.updateCamera();
    return controller.snapshot();
  },
  rollDie: () => {
    dice.roll();
    return dice.snapshot();
  },
  diceSnapshot: () => dice.snapshot(),
  settingsSnapshot: () => settings.snapshot(),
  setMouseSensitivity: (value: number) => {
    settings.setMouseSensitivity(value);
    return settings.snapshot();
  },
  menuSnapshot: () => ({
    entryVisible: !entry.classList.contains('dismissed'),
    pauseVisible: !pauseMenu.hidden,
    optionsVisible: !optionsMenu.hidden,
    pointerLocked: input.isPointerLocked(),
  }),
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
    footprintThickness: footprints.userData.thicknessWorldUnits as number,
    colliders: world.collidables.length,
    terrainMeshes: terrain.terrainMeshCount,
    groundTargetNames: world.groundRaycastGroup.children.map((child) => child.name),
    roomObjects: world.environmentStats.roomObjects,
    tabletopDetails: world.environmentStats.tabletopDetails,
    environmentNames: (() => {
      const names: string[] = [];
      world.sceneRoot.traverse((object) => {
        if (object.name) names.push(object.name);
      });
      return names;
    })(),
    renderGroups: world.sceneRoot.children.map((child) => {
      let meshes = 0;
      let lines = 0;
      let shadowCasters = 0;
      child.traverse((descendant) => {
        if (descendant instanceof THREE.Mesh) {
          meshes += 1;
          if (descendant.castShadow) shadowCasters += 1;
        } else if (descendant instanceof THREE.LineSegments) {
          lines += 1;
        }
      });
      return { name: child.name || '(unnamed)', meshes, lines, shadowCasters };
    }),
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
if (searchParams.get('selftest') === 'environment') {
  runEnvironmentSelfTest(testApi);
}
updateBodyHud();
requestAnimationFrame(render);

declare global {
  interface Window {
    __WZT__: typeof testApi;
  }
}
