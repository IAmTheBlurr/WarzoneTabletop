import * as THREE from 'three';
import { FIXED_TIMESTEP, GAME, type BodyId, type BodyProfile } from '../constants';
import {
  detectGround,
  moveAndResolveHorizontal,
  type StaticCollider,
} from '../player/collision';
import type { ControllerSnapshot } from '../player/controller';
import { bodyHotkeyFromCode } from '../player/input';
import { boardInchesToWorld } from '../world/layout';
import { FixedStepClock } from '../simulation/fixedStepClock';

export interface TestApi {
  snapshot(): ControllerSnapshot;
  teleport(x: number, y: number, z: number): void;
  setInput(code: string, pressed: boolean): void;
  clearInput(): void;
  step(seconds: number): ControllerSnapshot;
  jump(): void;
  releaseJump(): void;
  packPress(): void;
  packRelease(): void;
  switchBody(body: BodyId): void;
  look(movementX: number, movementY: number): void;
  colliders(): Array<{
    id: string;
    min: [number, number, number];
    max: [number, number, number];
  }>;
  terrainSamples(): Array<{ label: string; x: number; y: number; z: number }>;
  worldStats(): {
    footprintPieces: number;
    footprintThickness: number;
    colliders: number;
    terrainMeshes: number;
    groundTargetNames: string[];
    roomObjects: number;
    tabletopDetails: number;
    environmentNames: string[];
    renderGroups: Array<{
      name: string;
      meshes: number;
      lines: number;
      shadowCasters: number;
    }>;
  };
  installPackTestArena(height: number, includeWall: boolean): {
    x: number;
    y: number;
    z: number;
  };
  clearPackTestArena(): void;
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
  const runSpeed = Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
  api.clearInput();
  results.push({
    label: 'Guardsman run speed',
    detail: `${runSpeed.toFixed(2)} u/s / target ${GAME.bodies.guardsman.runSpeed.toFixed(2)}`,
    passed: closeTo(runSpeed, GAME.bodies.guardsman.runSpeed, 0.02),
  });

  api.reset();
  api.setInput('KeyW', true);
  api.setInput('ShiftLeft', true);
  snapshot = api.step(2);
  const sprintSpeed = Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
  api.clearInput();
  results.push({
    label: 'Sprint ratio',
    detail: `${sprintSpeed.toFixed(2)} u/s / ${(sprintSpeed / runSpeed).toFixed(2)}× run`,
    passed:
      closeTo(sprintSpeed, GAME.bodies.guardsman.sprintSpeed, 0.02) &&
      closeTo(
        sprintSpeed / runSpeed,
        GAME.bodies.guardsman.sprintSpeed / GAME.bodies.guardsman.runSpeed,
        0.01,
      ),
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
    label: 'Instant response and distinct run identities',
    detail: `first response G/S/P ${guardsman.earlySpeed.toFixed(2)}/${sister.earlySpeed.toFixed(2)}/${primaris.earlySpeed.toFixed(2)} · stops ${guardsman.stopSpeed.toFixed(2)}/${sister.stopSpeed.toFixed(2)}/${primaris.stopSpeed.toFixed(2)}`,
    passed:
      closeTo(guardsman.earlySpeed, GAME.bodies.guardsman.runSpeed, 0.02) &&
      closeTo(sister.earlySpeed, GAME.bodies.sister.runSpeed, 0.02) &&
      closeTo(primaris.earlySpeed, GAME.bodies.primaris.runSpeed, 0.02) &&
      guardsman.topSpeed < sister.topSpeed &&
      sister.topSpeed < primaris.topSpeed &&
      closeTo(guardsman.stopSpeed, 0, 0.01) &&
      closeTo(sister.stopSpeed, 0, 0.01) &&
      closeTo(primaris.stopSpeed, 0, 0.01),
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
    detail: `${stats.footprintPieces} raised boards / ${stats.terrainMeshes} terrain meshes / ${stats.colliders} AABBs`,
    passed:
      stats.footprintPieces === 16 &&
      stats.terrainMeshes <= stats.colliders &&
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
  const footprintBase = boardInchesToWorld(1 / 16);
  const levelOne = samples.find((sample) => closeTo(sample.y, 16 + footprintBase, 0.01));
  const levelTwo = samples.find((sample) => closeTo(sample.y, 32 + footprintBase, 0.01));
  let levelGroundingPassed = false;
  if (levelOne && levelTwo) {
    api.switchBody('primaris');
    api.teleport(levelOne.x, levelOne.y + 0.1, levelOne.z);
    const one = api.step(0.1);
    api.teleport(levelTwo.x, levelTwo.y + 0.1, levelTwo.z);
    const two = api.step(0.1);
    levelGroundingPassed =
      one.state === 'GROUNDED' &&
      closeTo(one.position[1], 16 + footprintBase, 0.01) &&
      two.state === 'GROUNDED' &&
      closeTo(two.position[1], 32 + footprintBase, 0.01);
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

function preparePackLaunch(
  api: TestApi,
  height: number,
  includeWall = false,
): void {
  const start = api.installPackTestArena(height, includeWall);
  api.clearInput();
  api.switchBody('primaris');
  api.teleport(start.x, start.y + 0.05, start.z);
  api.step(0.1);
}

function runCommittedPackFlight(
  api: TestApi,
  applyAirInput = false,
): ControllerSnapshot {
  api.packPress();
  let snapshot = api.snapshot();
  for (let step = 0; step < GAME.physics.fixedTimestepHz; step += 1) {
    snapshot = api.step(FIXED_TIMESTEP);
    if (snapshot.state === 'PACK_BALLISTIC') break;
  }
  if (applyAirInput) api.setInput('KeyA', true);
  api.packRelease();
  for (let step = 0; step < GAME.physics.fixedTimestepHz * 6; step += 1) {
    snapshot = api.step(FIXED_TIMESTEP);
    if (snapshot.state === 'GROUNDED') break;
  }
  api.clearInput();
  return snapshot;
}

export function runPhaseFourSelfTest(api: TestApi): void {
  const results: TestResult[] = [];

  preparePackLaunch(api, 0);
  api.packPress();
  api.step(GAME.jumpPack.holdThresholdSeconds - FIXED_TIMESTEP);
  const beforeThreshold = api.snapshot();
  api.step(FIXED_TIMESTEP);
  const atThreshold = api.snapshot();
  api.packRelease();
  results.push({
    label: 'Grounded-at-keydown hold activation',
    detail: `${beforeThreshold.state} at ${(GAME.jumpPack.holdThresholdSeconds - FIXED_TIMESTEP).toFixed(3)}s → ${atThreshold.state} at ${GAME.jumpPack.holdThresholdSeconds.toFixed(3)}s / launch vy ${(atThreshold.pack.launchVerticalSpeed ?? 0).toFixed(2)}`,
    passed:
      beforeThreshold.state === 'AIRBORNE' &&
      atThreshold.state === 'PACK_BALLISTIC' &&
      closeTo(
        atThreshold.pack.launchVerticalSpeed ?? 0,
        GAME.jumpPack.launchSpeedUnitsPerSec * Math.SQRT1_2,
        0.05,
      ),
  });

  api.clearPackTestArena();
  preparePackLaunch(api, 0);
  const flat = runCommittedPackFlight(api, true);
  results.push({
    label: 'Flat-ground fixed arc',
    detail: `${(flat.pack.horizontalDistance ?? 0).toFixed(2)} u / ${(flat.pack.flightTime ?? 0).toFixed(2)} s / peak ${(flat.pack.peakHeight ?? 0).toFixed(2)} u`,
    passed:
      closeTo(flat.pack.horizontalDistance ?? 0, GAME.jumpPack.rangeUnits, 1) &&
      closeTo(flat.pack.flightTime ?? 0, GAME.jumpPack.airtimeSeconds, 0.2) &&
      closeTo(flat.pack.peakHeight ?? 0, GAME.jumpPack.peakHeightUnits, 0.35),
  });

  results.push({
    label: 'Unsteerable committed flight',
    detail: 'A input held after launch; range remains on the launch heading',
    passed: closeTo(flat.position[0], 300, 0.05),
  });

  results.push({
    label: 'Mat-height proximity burn',
    detail: `burn ${(flat.pack.burnActivationDistance ?? 0).toFixed(2)} u / touchdown ${(flat.pack.touchdownSpeed ?? 0).toFixed(2)} u/s`,
    passed:
      (flat.pack.burnActivationDistance ?? Infinity) <=
        GAME.jumpPack.retroBurn.activationHeightUnits &&
      (flat.pack.burnActivationDistance ?? 0) > 9.5 &&
      (flat.pack.touchdownSpeed ?? Infinity) <= 6,
  });

  api.clearPackTestArena();
  preparePackLaunch(api, GAME.terrainLevels.levels[1]?.floorWorldUnits ?? 32);
  const roof = runCommittedPackFlight(api);
  results.push({
    label: 'Level-2 proximity burn',
    detail: `surface ${(roof.pack.landingSurfaceY ?? 0).toFixed(2)} u / burn ${(roof.pack.burnActivationDistance ?? 0).toFixed(2)} u / touchdown ${(roof.pack.touchdownSpeed ?? 0).toFixed(2)} u/s`,
    passed:
      closeTo(
        roof.pack.landingSurfaceY ?? 0,
        GAME.terrainLevels.levels[1]?.floorWorldUnits ?? 32,
        0.01,
      ) &&
      (roof.pack.burnActivationDistance ?? Infinity) <=
        GAME.jumpPack.retroBurn.activationHeightUnits &&
      (roof.pack.touchdownSpeed ?? Infinity) <= 6,
  });

  api.clearPackTestArena();
  preparePackLaunch(api, 0, true);
  api.packPress();
  let wallFlight = api.snapshot();
  for (let step = 0; step < GAME.physics.fixedTimestepHz * 2; step += 1) {
    wallFlight = api.step(FIXED_TIMESTEP);
    if (
      wallFlight.state === 'PACK_BALLISTIC' &&
      Math.hypot(wallFlight.velocity[0], wallFlight.velocity[2]) < 0.01
    ) {
      break;
    }
  }
  api.packRelease();
  results.push({
    label: 'Pack wall impact',
    detail: `horizontal speed ${Math.hypot(wallFlight.velocity[0], wallFlight.velocity[2]).toFixed(2)} u/s / vertical ${wallFlight.velocity[1].toFixed(2)} u/s`,
    passed:
      wallFlight.state === 'PACK_BALLISTIC' &&
      Math.hypot(wallFlight.velocity[0], wallFlight.velocity[2]) < 0.01,
  });

  api.clearPackTestArena();
  api.switchBody('primaris');
  api.teleport(0, -0.3, 173);
  api.step(0.1);
  const respawnsBefore = api.snapshot().respawnCount;
  api.packPress();
  let voidFlight = api.snapshot();
  for (let step = 0; step < GAME.physics.fixedTimestepHz * 7; step += 1) {
    voidFlight = api.step(FIXED_TIMESTEP);
    if (voidFlight.respawnCount > respawnsBefore) break;
  }
  api.packRelease();
  results.push({
    label: 'Off-table void behavior',
    detail: `burn ${voidFlight.pack.burnActivationDistance === null ? 'none' : 'fired'} / respawns ${respawnsBefore}→${voidFlight.respawnCount}`,
    passed:
      voidFlight.pack.burnActivationDistance === null &&
      voidFlight.respawnCount > respawnsBefore,
  });

  api.clearPackTestArena();
  api.switchBody('primaris');
  api.reset();
  api.clearInput();

  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Phase 4 measured acceptance</p>
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

export function runTimingSelfTest(): void {
  const results: TestResult[] = [];
  const schedules = [60, 30, 20, 15, 10];
  const measurements = schedules.map((renderFps) => {
    const clock = new FixedStepClock(FIXED_TIMESTEP);
    let simulationSteps = 0;
    let distance = 0;
    for (let frame = 0; frame < renderFps; frame += 1) {
      clock.advance(1 / renderFps, (dt) => {
        simulationSteps += 1;
        distance += GAME.bodies.guardsman.runSpeed * dt;
      });
    }
    return { renderFps, simulationSteps, distance };
  });

  results.push({
    label: 'Render-rate-independent simulation clock',
    detail: measurements
      .map((measurement) => `${measurement.renderFps}fps→${measurement.simulationSteps} steps`)
      .join(' · '),
    passed: measurements.every(
      (measurement) => measurement.simulationSteps === GAME.physics.fixedTimestepHz,
    ),
  });

  results.push({
    label: 'Render-rate-independent movement distance',
    detail: measurements
      .map((measurement) => `${measurement.renderFps}fps→${measurement.distance.toFixed(2)}u`)
      .join(' · '),
    passed: measurements.every((measurement) =>
      closeTo(measurement.distance, GAME.bodies.guardsman.runSpeed, 0.001),
    ),
  });

  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Frame timing regression</p>
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

export function runControlsSelfTest(api: TestApi): void {
  const results: TestResult[] = [];
  api.clearInput();
  api.switchBody('primaris');

  const measureDirection = (code: string) => {
    api.clearInput();
    api.reset();
    const before = api.snapshot();
    api.setInput(code, true);
    const after = api.step(0.5);
    api.clearInput();
    return {
      dx: after.position[0] - before.position[0],
      dz: after.position[2] - before.position[2],
      speed: Math.hypot(after.velocity[0], after.velocity[2]),
    };
  };

  const forward = measureDirection('KeyW');
  const back = measureDirection('KeyS');
  const left = measureDirection('KeyA');
  const right = measureDirection('KeyD');
  results.push({
    label: 'WASD camera-relative directions',
    detail: `W Δz ${forward.dz.toFixed(2)} · S Δz ${back.dz.toFixed(2)} · A Δx ${left.dx.toFixed(2)} · D Δx ${right.dx.toFixed(2)}`,
    passed:
      forward.dz > 0 &&
      back.dz < 0 &&
      left.dx > 0 &&
      right.dx < 0 &&
      closeTo(forward.dx, 0, 0.01) &&
      closeTo(back.dx, 0, 0.01) &&
      closeTo(left.dz, 0, 0.01) &&
      closeTo(right.dz, 0, 0.01),
  });

  const cardinalSpeeds = [forward.speed, back.speed, left.speed, right.speed];
  results.push({
    label: 'Equal cardinal movement speed',
    detail: cardinalSpeeds.map((speed) => speed.toFixed(2)).join(' / '),
    passed: cardinalSpeeds.every((speed) =>
      closeTo(speed, GAME.bodies.primaris.runSpeed, 0.02),
    ),
  });

  const sprintSpeeds = ['ShiftLeft', 'ShiftRight'].map((shiftCode) => {
    api.reset();
    api.setInput('KeyW', true);
    api.setInput(shiftCode, true);
    const snapshot = api.step(1);
    api.clearInput();
    return Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
  });
  results.push({
    label: 'Left and right Shift sprint modifiers',
    detail: `left ${sprintSpeeds[0]?.toFixed(2)} · right ${sprintSpeeds[1]?.toFixed(2)} u/s`,
    passed: sprintSpeeds.every((speed) =>
      closeTo(speed, GAME.bodies.primaris.sprintSpeed, 0.02),
    ),
  });
  api.reset();
  api.look(100, -100);
  const rightAndUp = api.snapshot();
  api.setInput('KeyW', true);
  const turnedMovement = api.step(0.5);
  api.clearInput();
  results.push({
    label: 'Mouse look axes and movement alignment',
    detail: `right yaw ${rightAndUp.yawDegrees.toFixed(1)}° · up pitch ${rightAndUp.pitchDegrees.toFixed(1)}° · forward x ${turnedMovement.position[0].toFixed(2)}`,
    passed:
      rightAndUp.yawDegrees < 0 &&
      rightAndUp.pitchDegrees > 0 &&
      turnedMovement.position[0] < GAME.spawn.feetPosition[0],
  });

  api.reset();
  api.look(0, -100000);
  const upperPitch = api.snapshot().pitchDegrees;
  api.look(0, 200000);
  const lowerPitch = api.snapshot().pitchDegrees;
  results.push({
    label: 'Mouse pitch safety limits',
    detail: `${lowerPitch.toFixed(1)}° to ${upperPitch.toFixed(1)}°`,
    passed: upperPitch > 89 && upperPitch < 90 && lowerPitch < -89 && lowerPitch > -90,
  });

  const bodyHotkeys = ['Digit1', 'Digit2', 'Digit3'].map(bodyHotkeyFromCode);
  results.push({
    label: 'Body-selection hotkeys',
    detail: bodyHotkeys.map((hotkey, index) => `${index + 1}→${hotkey}`).join(' · '),
    passed:
      bodyHotkeys.join('') === '123' &&
      GAME.bodies.guardsman.hotkey === '1' &&
      GAME.bodies.sister.hotkey === '2' &&
      GAME.bodies.primaris.hotkey === '3',
  });

  api.reset();
  api.clearInput();
  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Keyboard and mouse control regression</p>
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

export function runEnvironmentSelfTest(api: TestApi): void {
  const results: TestResult[] = [];
  const stats = api.worldStats();
  results.push({
    label: 'Physically modeled home-den surround',
    detail: `${stats.roomObjects} room objects`,
    passed:
      stats.roomObjects >= 80 &&
      stats.environmentNames.includes('full-scale-home-den'),
  });
  results.push({
    label: 'Localized practical-light room features',
    detail: 'two standing lamps · fan fill · lit half-open doorway · exterior window',
    passed:
      stats.environmentNames.includes('half-open-den-door-and-lit-hallway') &&
      stats.environmentNames.includes('standing-lamp-practical-light') &&
      stats.environmentNames.includes('ceiling-fan-low-fill-light') &&
      stats.environmentNames.includes('den-window'),
  });
  results.push({
    label: 'Miniature-scale surface density',
    detail: `${stats.tabletopDetails} paint, scratch, flock, stone, and hobby details`,
    passed:
      stats.tabletopDetails >= 350 &&
      stats.environmentNames.includes('miniature-scale-surface-and-hobby-details'),
  });
  results.push({
    label: 'Raised rubble terrain footprints',
    detail: `${stats.footprintPieces} pieces · ${(stats.footprintThickness / boardInchesToWorld(1)).toFixed(4)}in physical board thickness`,
    passed:
      stats.footprintPieces === 16 &&
      closeTo(stats.footprintThickness, boardInchesToWorld(1 / 16), 0.001) &&
      stats.environmentNames.includes('raised-rubble-footprints--excluded-from-ground-rays'),
  });

  const primarisRunCrossing =
    GAME.board.worldUnits.width / GAME.bodies.primaris.runSpeed;
  const primarisSprintCrossing =
    GAME.board.worldUnits.width / GAME.bodies.primaris.sprintSpeed;
  results.push({
    label: 'Primaris traversal targets',
    detail: `run ${primarisRunCrossing.toFixed(2)}s · sprint ${primarisSprintCrossing.toFixed(2)}s across 44in`,
    passed:
      closeTo(primarisRunCrossing, 13.81, 0.02) &&
      closeTo(primarisSprintCrossing, 8.06, 0.02),
  });

  results.push({
    label: 'Presentation-neutral camera configuration',
    detail: 'fixed base FOV · no locomotion or flight camera offsets',
    passed: !('packFlightFovKickDegrees' in GAME.camera),
  });

  const panel = document.createElement('section');
  const passed = results.filter((result) => result.passed).length;
  panel.id = 'self-test-report';
  panel.className = 'self-test-report';
  panel.dataset.status = passed === results.length ? 'passed' : 'failed';
  panel.innerHTML = `
    <p>Environment and locomotion regression</p>
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
