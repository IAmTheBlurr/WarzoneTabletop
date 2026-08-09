import { GAME, type BodyId } from '../constants';
import type { ControllerSnapshot } from '../player/controller';

const SOUND_PROFILE: Record<BodyId, { frequency: number; volume: number; duration: number }> = {
  guardsman: { frequency: 104, volume: 0.022, duration: 0.055 },
  sister: { frequency: 78, volume: 0.03, duration: 0.075 },
  primaris: { frequency: 52, volume: 0.045, duration: 0.11 },
};

export class FootstepAudio {
  private context: AudioContext | null = null;
  private nextStepAt = 0;

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    void this.context.resume();
  }

  update(snapshot: ControllerSnapshot, enabled: boolean): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !enabled) return;
    const horizontalSpeed = Math.hypot(snapshot.velocity[0], snapshot.velocity[2]);
    const body = GAME.bodies[snapshot.body];
    if (snapshot.state !== 'GROUNDED' || horizontalSpeed < body.walkSpeed * 0.2) {
      this.nextStepAt = context.currentTime;
      return;
    }
    if (context.currentTime < this.nextStepAt) return;

    this.playStep(snapshot.body);
    const strideLength = body.heightUnits * 0.42;
    const interval = Math.min(Math.max(strideLength / horizontalSpeed, 0.22), 0.72);
    this.nextStepAt = context.currentTime + interval;
  }

  private playStep(bodyId: BodyId): void {
    const context = this.context;
    if (!context) return;
    const profile = SOUND_PROFILE[bodyId];
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = bodyId === 'primaris' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(profile.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      profile.frequency * 0.52,
      now + profile.duration,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + profile.duration);
  }
}

