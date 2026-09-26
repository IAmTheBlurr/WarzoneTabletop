export interface InputSnapshot {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jumpHeld: boolean;
}

type JumpHandler = () => void;
type LookHandler = (movementX: number, movementY: number) => void;
type BodySwitchHandler = (hotkey: '1' | '2' | '3') => void;
type DiceRollHandler = () => void;

const BODY_HOTKEY_BY_CODE = {
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
} as const;

export function bodyHotkeyFromCode(code: string): '1' | '2' | '3' | null {
  return BODY_HOTKEY_BY_CODE[code as keyof typeof BODY_HOTKEY_BY_CODE] ?? null;
}

export class InputManager {
  private readonly held = new Set<string>();
  private readonly virtual = new Set<string>();
  private jumpHandler: JumpHandler = () => undefined;
  private jumpReleaseHandler: JumpHandler = () => undefined;
  private lookHandler: LookHandler = () => undefined;
  private debugHandler: () => void = () => undefined;
  private bodySwitchHandler: BodySwitchHandler = () => undefined;
  private diceRollHandler: DiceRollHandler = () => undefined;

  constructor(private readonly lockTarget: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.clear);
  }

  onJump(handler: JumpHandler): void {
    this.jumpHandler = handler;
  }

  onJumpRelease(handler: JumpHandler): void {
    this.jumpReleaseHandler = handler;
  }

  onLook(handler: LookHandler): void {
    this.lookHandler = handler;
  }

  onDebugToggle(handler: () => void): void {
    this.debugHandler = handler;
  }

  onBodySwitch(handler: BodySwitchHandler): void {
    this.bodySwitchHandler = handler;
  }

  onDiceRoll(handler: DiceRollHandler): void {
    this.diceRollHandler = handler;
  }

  requestPointerLock(): void {
    void this.lockTarget.requestPointerLock().catch(() => undefined);
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
      jumpHeld: active('Space'),
    };
  }

  setVirtual(code: string, pressed: boolean): void {
    if (pressed) this.virtual.add(code);
    else this.virtual.delete(code);
  }

  clearVirtual(): void {
    this.virtual.clear();
  }

  releaseHeld(): void {
    const releasedJump = this.held.has('Space');
    this.held.clear();
    if (releasedJump) this.jumpReleaseHandler();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote' && !event.repeat) {
      this.debugHandler();
      return;
    }

    if (!this.isPointerLocked()) return;
    this.held.add(event.code);

    const bodyHotkey = bodyHotkeyFromCode(event.code);
    if (!event.repeat && bodyHotkey) this.bodySwitchHandler(bodyHotkey);

    if (event.code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      this.diceRollHandler();
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.jumpHandler();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
    if (event.code === 'Space') this.jumpReleaseHandler();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked()) return;
    this.lookHandler(event.movementX, event.movementY);
  };

  private readonly clear = (): void => {
    this.releaseHeld();
  };
}
