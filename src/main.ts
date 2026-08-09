import * as THREE from 'three';
import './styles.css';
import { FIXED_TIMESTEP, GAME, MAX_FRAME_DT } from './constants';
import { InputManager } from './player/input';
import { PlayerController } from './player/controller';
import { runPhaseOneSelfTest, runPhaseTwoSelfTest } from './testing/selftest';
import { createBoardWorld } from './world/board';

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
const input = new InputManager(renderer.domElement);
const controller = new PlayerController(camera, input, world);
const searchParams = new URLSearchParams(window.location.search);

let debugVisible = searchParams.has('debug');
let accumulator = 0;
let previousTime = performance.now();
let frameCount = 0;
let fpsSampleStarted = previousTime;
let displayedFps = 60;
let displayedBody = '';

input.onDebugToggle(() => {
  debugVisible = !debugVisible;
  debugPanel.hidden = !debugVisible;
});

debugPanel.hidden = !debugVisible;
if (searchParams.has('preview')) {
  document.body.classList.add('is-playing');
  entry.classList.add('dismissed');
}

function setPointerLockUi(locked: boolean): void {
  document.body.classList.toggle('is-playing', locked);
  if (locked) {
    entry.classList.add('dismissed');
    pauseHint.hidden = true;
  } else if (entry.classList.contains('dismissed')) {
    pauseHint.hidden = false;
  }
}

enterButton.addEventListener('click', () => input.requestPointerLock());
renderer.domElement.addEventListener('click', () => {
  if (!input.isPointerLocked() && entry.classList.contains('dismissed')) {
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
  ].join('\n');
}

const bodyPresentation = {
  guardsman: ['01', 'Nimble reconnaissance profile'],
  sister: ['02', 'Armoured momentum profile'],
  primaris: ['03', 'Heavy assault profile'],
} as const;

function updateBodyHud(): void {
  const snapshot = controller.snapshot();
  if (snapshot.body === displayedBody) return;
  displayedBody = snapshot.body;
  const [index, detail] = bodyPresentation[snapshot.body];
  bodyIndex.textContent = `FIELD UNIT / ${index}`;
  bodyLabel.textContent = GAME.bodies[snapshot.body].label;
  bodyDetail.textContent = `${detail} · 1 / 2 / 3 to switch`;
}

function render(now: number): void {
  requestAnimationFrame(render);
  const frameDt = Math.min((now - previousTime) / 1000, MAX_FRAME_DT);
  previousTime = now;
  accumulator += frameDt;

  while (accumulator >= FIXED_TIMESTEP) {
    controller.update(FIXED_TIMESTEP);
    accumulator -= FIXED_TIMESTEP;
  }
  controller.updateCamera();
  updateBodyHud();

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
  switchBody: (body: keyof typeof GAME.bodies) => controller.switchBody(body),
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
updateBodyHud();
requestAnimationFrame(render);

declare global {
  interface Window {
    __WZT__: typeof testApi;
  }
}
