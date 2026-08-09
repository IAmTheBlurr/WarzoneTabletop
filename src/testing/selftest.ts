import { FIXED_TIMESTEP, GAME } from '../constants';
import type { ControllerSnapshot } from '../player/controller';

export interface TestApi {
  snapshot(): ControllerSnapshot;
  teleport(x: number, y: number, z: number): void;
  setInput(code: string, pressed: boolean): void;
  clearInput(): void;
  step(seconds: number): ControllerSnapshot;
  jump(): void;
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

