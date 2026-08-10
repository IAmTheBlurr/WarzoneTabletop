export class FixedStepClock {
  private accumulator = 0;

  constructor(private readonly timestep: number) {
    if (!Number.isFinite(timestep) || timestep <= 0) {
      throw new Error('Fixed timestep must be a positive finite number.');
    }
  }

  advance(realElapsedSeconds: number, update: (dt: number) => void): number {
    if (!Number.isFinite(realElapsedSeconds) || realElapsedSeconds <= 0) return 0;
    this.accumulator += realElapsedSeconds;
    let steps = 0;
    while (this.accumulator + Number.EPSILON >= this.timestep) {
      update(this.timestep);
      this.accumulator -= this.timestep;
      steps += 1;
    }
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

