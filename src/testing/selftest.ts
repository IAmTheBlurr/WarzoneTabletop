import * as THREE from 'three';
import { FIXED_TIMESTEP, GAME, type BodyId, type BodyProfile } from '../constants';
import {
  detectGround,
  moveAndResolveHorizontal,
  type StaticCollider,
} from '../player/collision';
import type { ControllerSnapshot } from '../player/controller';
import { boardInchesToWorld } from '../world/layout';

export interface TestApi {
  snapshot(): ControllerSnapshot;
  teleport(x: number, y: number, z: number): void;
  setInput(code: string, pressed: boolean): void;
  clearInput(): void;
  step(seconds: number): ControllerSnapshot;
  jump(): void;
  switchBody(body: BodyId): void;
  colliders(): Array<{
    id: string;
    min: [number, number, number];
    max: [number, number, number];
  }>;
  terrainSamples(): Array<{ label: string; x: number; y: number; z: number }>;
  worldStats(): {
    footprintPieces: number;
    colliders: number;
    terrainMeshes: number;
    groundTargetNames: string[];
  };
  reset(): void;
}

interface TestResult {
  readonly label: string;
  readonly detail: string;
  readonly passed: boolean;
}

const closeTo = (actual: number, expected: number, tolerance: number) =>
  Math.abs(actual - expected) <= tolerance;

export function runPhaseOneSelfTest(api: TestApi): void {
  const results: TestResult[] = [];

  api.switchBody('guardsman');
  api.step(GAME.camera.eyeHeightLerpSeconds);
  api.reset();
  let snapshot = api.snapshot();
  results.push({
    label: 'Spawn and facing',
    detail: `feet ${snapshot.position.map((value) => value.toFixed(1)).join(', ')} / yaw ${snapshot.yawDegrees.toFixed(1)}°`,
    passed:
      snapshot.position.every((value, index) =>
        closeTo(value, GAME.spawn.feetPosition[index] ?? 0, 0.01),
      ) && closeTo(snapshot.yawDegrees, 0, 0.01),
  });

  api.setInput('KeyW', true);
  snapshot = api.step(2);
  const walkSpeed = Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
  api.clearInput();
  results.push({
    label: 'Guardsman walk speed',
    detail: `${walkSpeed.toFixed(2)} u/s / target ${GAME.bodies.guardsman.walkSpeed.toFixed(2)}`,
    passed: closeTo(walkSpeed, GAME.bodies.guardsman.walkSpeed, 0.02),
  });

  api.reset();
  api.setInput('KeyW', true);
  api.setInput('ShiftLeft', true);
  snapshot = api.step(2);
  const sprintSpeed = Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
  api.clearInput();
  results.push({
    label: 'Sprint ratio',
    detail: `${sprintSpeed.toFixed(2)} u/s / ${(sprintSpeed / walkSpeed).toFixed(2)}× walk`,
    passed:
      closeTo(sprintSpeed, GAME.bodies.guardsman.sprintSpeed, 0.02) &&
      closeTo(sprintSpeed / walkSpeed, 1.8, 0.01),
  });

  api.reset();
  api.jump();
  let peakY = 0;
  for (let step = 0; step < GAME.physics.fixedTimestepHz * 2; step += 1) {
    snapshot = api.step(FIXED_TIMESTEP);
    peakY = Math.max(peakY, snapshot.position[1]);
  }
  results.push({
    label: 'Tap jump and landing',
    detail: `peak ${peakY.toFixed(2)} u / ${snapshot.state} at y ${snapshot.position[1].toFixed(2)}`,
    passed:
      closeTo(peakY, GAME.bodies.guardsman.jumpHeightUnits, 0.12) &&
      snapshot.state === 'GROUNDED' &&
      closeTo(snapshot.position[1], 0, 0.01),
  });

  const tableHalfDepth = (GAME.board.worldUnits.depth + 28) / 2;
  api.teleport(0, 0, tableHalfDepth - 0.5);
  api.setInput('KeyW', true);
  api.step(0.6);
  api.clearInput();
  const offEdge = api.snapshot();
  const respawnsBeforeFall = offEdge.respawnCount;
  snapshot = api.step(4.2);
  results.push({
    label: 'Table-edge fall and respawn',
    detail: `edge z ${offEdge.position[2].toFixed(2)} / respawns ${respawnsBeforeFall}→${snapshot.respawnCount}`,
    passed:
      offEdge.position[2] > tableHalfDepth &&
      snapshot.respawnCount > respawnsBeforeFall &&
      closeTo(snapshot.position[0], GAME.spawn.feetPosition[0] ?? 0, 0.01) &&
      closeTo(snapshot.position[2], GAME.spawn.feetPosition[2] ?? 0, 0.01) &&
      snapshot.state === 'GROUNDED',
  });

  api.reset();
  api.clearInput();
  api.switchBody('primaris');

  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Phase 1 measured acceptance</p>
    <h2>${passed}/${results.length} checks passed</h2>
    <ol>${results
      .map(
        (result) => `
          <li data-status="${result.passed ? 'passed' : 'failed'}">
            <strong>${result.passed ? 'PASS' : 'FAIL'} — ${result.label}</strong>
            <span>${result.detail}</span>
          </li>`,
      )
      .join('')}</ol>`;
  document.body.append(panel);
}

function measureBody(api: TestApi, bodyId: BodyId) {
  api.clearInput();
  api.switchBody(bodyId);
  api.step(GAME.camera.eyeHeightLerpSeconds);
  api.reset();
  api.setInput('KeyW', true);
  const early = api.step(0.1);
  const earlySpeed = Math.hypot(early.velocity[0], early.velocity[2]);
  const top = api.step(2);
  const topSpeed = Math.hypot(top.velocity[0], top.velocity[2]);
  api.clearInput();
  const stop = api.step(0.1);
  const stopSpeed = Math.hypot(stop.velocity[0], stop.velocity[2]);
  return { earlySpeed, topSpeed, stopSpeed };
}

function measureJump(api: TestApi, bodyId: BodyId): number {
  api.clearInput();
  api.switchBody(bodyId);
  api.reset();
  api.jump();
  let peak = 0;
  for (let step = 0; step < GAME.physics.fixedTimestepHz * 3; step += 1) {
    const snapshot = api.step(FIXED_TIMESTEP);
    peak = Math.max(peak, snapshot.position[1]);
    if (step > 2 && snapshot.state === 'GROUNDED') break;
  }
  return peak;
}

export function runPhaseTwoSelfTest(api: TestApi): void {
  const results: TestResult[] = [];
  api.switchBody('primaris');
  api.step(GAME.camera.eyeHeightLerpSeconds);
  api.reset();
  let snapshot = api.snapshot();
  results.push({
    label: 'Default hero body',
    detail: `${snapshot.body} / eye ${snapshot.eyeHeight.toFixed(2)} u`,
    passed:
      snapshot.body === 'primaris' &&
      closeTo(snapshot.eyeHeight, GAME.bodies.primaris.eyeHeightUnits, 0.01),
  });

  const eyeBefore = snapshot.eyeHeight;
  api.switchBody('guardsman');
  api.step(GAME.camera.eyeHeightLerpSeconds);
  snapshot = api.snapshot();
  results.push({
    label: 'Primaris → Guardsman eye drop',
    detail: `${eyeBefore.toFixed(2)} → ${snapshot.eyeHeight.toFixed(2)} u / drop ${(eyeBefore - snapshot.eyeHeight).toFixed(2)} u`,
    passed:
      closeTo(snapshot.eyeHeight, GAME.bodies.guardsman.eyeHeightUnits, 0.01) &&
      closeTo(eyeBefore - snapshot.eyeHeight, 2.7, 0.01),
  });

  const guardsman = measureBody(api, 'guardsman');
  const sister = measureBody(api, 'sister');
  const primaris = measureBody(api, 'primaris');
  results.push({
    label: 'Distinct handling identities',
    detail: `0.1s accel G/S/P ${guardsman.earlySpeed.toFixed(2)}/${sister.earlySpeed.toFixed(2)}/${primaris.earlySpeed.toFixed(2)} · tops ${guardsman.topSpeed.toFixed(2)}/${sister.topSpeed.toFixed(2)}/${primaris.topSpeed.toFixed(2)}`,
    passed:
      guardsman.earlySpeed > sister.earlySpeed &&
      sister.earlySpeed > primaris.earlySpeed &&
      guardsman.topSpeed < sister.topSpeed &&
      sister.topSpeed < primaris.topSpeed &&
      guardsman.stopSpeed < sister.stopSpeed &&
      sister.stopSpeed < primaris.stopSpeed,
  });

  const guardPeak = measureJump(api, 'guardsman');
  const sisterPeak = measureJump(api, 'sister');
  const primarisPeak = measureJump(api, 'primaris');
  results.push({
    label: 'Body-specific jump heights',
    detail: `G/S/P ${guardPeak.toFixed(2)}/${sisterPeak.toFixed(2)}/${primarisPeak.toFixed(2)} u`,
    passed:
      closeTo(guardPeak, GAME.bodies.guardsman.jumpHeightUnits, 0.15) &&
      closeTo(sisterPeak, GAME.bodies.sister.jumpHeightUnits, 0.18) &&
      closeTo(primarisPeak, GAME.bodies.primaris.jumpHeightUnits, 0.2),
  });

  const block = api.colliders()[0];
  if (!block) throw new Error('Phase 2 collision test needs one world collider.');
  api.switchBody('sister');
  api.step(GAME.camera.eyeHeightLerpSeconds);
  api.teleport(
    block.min[0] - GAME.bodies.sister.capsuleRadiusUnits - 0.01,
    0,
    (block.min[2] + block.max[2]) / 2,
  );
  const beforeSwap = api.snapshot().position[0];
  api.switchBody('primaris');
  const afterSwap = api.snapshot().position[0];
  results.push({
    label: 'Growing body collision resolve',
    detail: `x ${beforeSwap.toFixed(2)} → ${afterSwap.toFixed(2)} against calibration block`,
    passed:
      afterSwap < beforeSwap &&
      closeTo(
        afterSwap,
        block.min[0] - GAME.bodies.primaris.capsuleRadiusUnits,
        0.02,
      ),
  });

  api.clearInput();
  api.reset();

  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Phase 2 measured acceptance</p>
    <h2>${passed}/${results.length} checks passed</h2>
    <ol>${results
      .map(
        (result) => `
          <li data-status="${result.passed ? 'passed' : 'failed'}">
            <strong>${result.passed ? 'PASS' : 'FAIL'} — ${result.label}</strong>
            <span>${result.detail}</span>
          </li>`,
      )
      .join('')}</ol>`;
  document.body.append(panel);
}

function makeCollider(
  id: string,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): StaticCollider {
  return {
    id,
    bounds: new THREE.Box3(
      new THREE.Vector3(...min),
      new THREE.Vector3(...max),
    ),
  };
}

function testWallSlide(body: BodyProfile): boolean {
  const wall = makeCollider('wall', [0, 0, -10], [2, 12, 10]);
  const pos = new THREE.Vector3(-2, 0, -3);
  const velocity = new THREE.Vector3(4, 0, 5);
  moveAndResolveHorizontal(pos, velocity, 0.5, body, [wall]);
  return closeTo(pos.x, -body.capsuleRadiusUnits, 0.01) && pos.z > -1;
}

function testAutoStepAndBarricade(body: BodyProfile): boolean {
  const debris = makeCollider('debris', [0, 0, -1], [1, 0.5, 1]);
  const barricade = makeCollider(
    'barricade',
    [0, 0, -1],
    [1, boardInchesToWorld(1), 1],
  );
  const debrisPos = new THREE.Vector3(-2, 0, 0);
  const debrisVelocity = new THREE.Vector3(4, 0, 0);
  const barricadePos = new THREE.Vector3(-2, 0, 0);
  const barricadeVelocity = new THREE.Vector3(4, 0, 0);
  for (let step = 0; step < GAME.physics.fixedTimestepHz; step += 1) {
    moveAndResolveHorizontal(debrisPos, debrisVelocity, FIXED_TIMESTEP, body, [debris]);
    moveAndResolveHorizontal(
      barricadePos,
      barricadeVelocity,
      FIXED_TIMESTEP,
      body,
      [barricade],
    );
  }
  return debrisPos.x > 1 && closeTo(barricadePos.x, -body.capsuleRadiusUnits, 0.01);
}

function canPassGap(body: BodyProfile, gap: number): boolean {
  const walls = [
    makeCollider('left', [-10, 0, 0], [-gap / 2, 12, 5]),
    makeCollider('right', [gap / 2, 0, 0], [10, 12, 5]),
  ];
  const pos = new THREE.Vector3(0, 0, -3);
  const velocity = new THREE.Vector3(0, 0, 6);
  moveAndResolveHorizontal(pos, velocity, 1, body, walls);
  return pos.z > 1;
}

function testOffsetRayStability(): boolean {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(10, GAME.terrainLevels.slabThicknessWorldUnits, 10),
    new THREE.MeshBasicMaterial(),
  );
  slab.position.y =
    (GAME.terrainLevels.levels[0]?.floorWorldUnits ?? 16) -
    GAME.terrainLevels.slabThicknessWorldUnits / 2;
  group.add(slab);
  group.updateMatrixWorld(true);
  const pos = new THREE.Vector3(
    5 + GAME.bodies.primaris.capsuleRadiusUnits * 0.3,
    GAME.terrainLevels.levels[0]?.floorWorldUnits ?? 16,
    0,
  );
  return detectGround(pos, 0, GAME.bodies.primaris, {
    collidables: [],
    groundRaycastGroup: group,
  }).grounded;
}

export function runPhaseThreeSelfTest(api: TestApi): void {
  const results: TestResult[] = [];
  const stats = api.worldStats();
  results.push({
    label: 'Footprint and terrain registration',
    detail: `${stats.footprintPieces} decals / ${stats.terrainMeshes} terrain meshes / ${stats.colliders} AABBs`,
    passed:
      stats.footprintPieces === 16 &&
      stats.terrainMeshes === stats.colliders &&
      stats.groundTargetNames.every((name) => !name.startsWith('footprint-')),
  });

  results.push({
    label: 'Wall slide and inside-corner resolve',
    detail: '45° velocity preserves the free axis; two-pass resolver remains bounded',
    passed: testWallSlide(GAME.bodies.primaris),
  });

  results.push({
    label: 'Five-ray slab-edge stability',
    detail: 'center beyond edge; inward 0.7r offset retains Level-1 contact',
    passed: testOffsetRayStability(),
  });

  results.push({
    label: 'Wall-band auto-step and barricade',
    detail: '0.5u debris passes; 5.33u barricade blocks',
    passed: testAutoStepAndBarricade(GAME.bodies.guardsman),
  });

  const narrowGap = 2.5;
  const standardGap = GAME.collision.minDoorwayWidthUnits;
  results.push({
    label: 'Body-width doorway matrix',
    detail: `2.5u: Guardsman ${canPassGap(GAME.bodies.guardsman, narrowGap) ? 'pass' : 'block'}, Primaris ${canPassGap(GAME.bodies.primaris, narrowGap) ? 'pass' : 'block'} · 5u: both pass`,
    passed:
      canPassGap(GAME.bodies.guardsman, narrowGap) &&
      !canPassGap(GAME.bodies.primaris, narrowGap) &&
      canPassGap(GAME.bodies.guardsman, standardGap) &&
      canPassGap(GAME.bodies.primaris, standardGap),
  });

  const samples = api.terrainSamples();
  const levelOne = samples.find((sample) => closeTo(sample.y, 16, 0.01));
  const levelTwo = samples.find((sample) => closeTo(sample.y, 32, 0.01));
  let levelGroundingPassed = false;
  if (levelOne && levelTwo) {
    api.switchBody('primaris');
    api.teleport(levelOne.x, levelOne.y + 0.1, levelOne.z);
    const one = api.step(0.1);
    api.teleport(levelTwo.x, levelTwo.y + 0.1, levelTwo.z);
    const two = api.step(0.1);
    levelGroundingPassed =
      one.state === 'GROUNDED' &&
      closeTo(one.position[1], 16, 0.01) &&
      two.state === 'GROUNDED' &&
      closeTo(two.position[1], 32, 0.01);
  }
  results.push({
    label: 'Level-1 and Level-2 grounding',
    detail: `${levelOne?.label ?? 'missing'} / ${levelTwo?.label ?? 'missing'}`,
    passed: levelGroundingPassed,
  });

  api.switchBody('guardsman');
  api.reset();
  api.step(FIXED_TIMESTEP);
  api.teleport(GAME.board.worldUnits.width, 0, 0);
  api.step(0.05);
  api.jump();
  const coyoteAccepted = api.snapshot().velocity[1] > 0;
  api.reset();
  api.step(FIXED_TIMESTEP);
  api.teleport(GAME.board.worldUnits.width, 0, 0);
  api.step(0.2);
  api.jump();
  const lateRejected = api.snapshot().velocity[1] < 0;
  results.push({
    label: 'Coyote window',
    detail: `0.05s ${coyoteAccepted ? 'accepted' : 'rejected'} / 0.20s ${lateRejected ? 'rejected' : 'accepted'}`,
    passed: coyoteAccepted && lateRejected,
  });

  const lineColliders = api.colliders().filter((collider) => collider.id.endsWith('-barricade'));
  results.push({
    label: 'Line terrain height',
    detail: `${lineColliders.length} pieces at ${boardInchesToWorld(1).toFixed(4)} u`,
    passed:
      lineColliders.length === 6 &&
      lineColliders.every((collider) =>
        closeTo(collider.max[1] - collider.min[1], boardInchesToWorld(1), 0.001),
      ),
  });

  api.switchBody('primaris');
  api.reset();
  api.clearInput();

  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Phase 3 collision acceptance</p>
    <h2>${passed}/${results.length} checks passed</h2>
    <ol>${results
      .map(
        (result) => `
          <li data-status="${result.passed ? 'passed' : 'failed'}">
            <strong>${result.passed ? 'PASS' : 'FAIL'} — ${result.label}</strong>
            <span>${result.detail}</span>
          </li>`,
      )
      .join('')}</ol>`;
  document.body.append(panel);
}
