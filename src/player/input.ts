export interface InputSnapshot {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

type JumpHandler = () => void;
type LookHandler = (movementX: number, movementY: number) => void;

export class InputManager {
  private readonly held = new Set<string>();
  private readonly virtual = new Set<string>();
  private jumpHandler: JumpHandler = () => undefined;
  private lookHandler: LookHandler = () => undefined;
  private debugHandler: () => void = () => undefined;

  constructor(private readonly lockTarget: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.clear);
  }

  onJump(handler: JumpHandler): void {
    this.jumpHandler = handler;
  }

  onLook(handler: LookHandler): void {
    this.lookHandler = handler;
  }

  onDebugToggle(handler: () => void): void {
    this.debugHandler = handler;
  }

  requestPointerLock(): void {
    void this.lockTarget.requestPointerLock();
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.lockTarget;
  }

  snapshot(): InputSnapshot {
    const active = (code: string) => this.held.has(code) || this.virtual.has(code);
    return {
      forward: active('KeyW'),
      back: active('KeyS'),
      left: active('KeyA'),
      right: active('KeyD'),
      sprint: active('ShiftLeft') || active('ShiftRight'),
    };
  }

  setVirtual(code: string, pressed: boolean): void {
    if (pressed) this.virtual.add(code);
    else this.virtual.delete(code);
  }

  clearVirtual(): void {
    this.virtual.clear();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote' && !event.repeat) {
      this.debugHandler();
      return;
    }

    if (!this.isPointerLocked() && !event.isTrusted) return;
    this.held.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.jumpHandler();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked()) return;
    this.lookHandler(event.movementX, event.movementY);
  };

  private readonly clear = (): void => {
    this.held.clear();
  };
}

