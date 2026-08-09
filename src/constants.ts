import rawConstants from '../game-constants.json';

export const GAME = rawConstants;

export type BodyId = keyof typeof GAME.bodies;
export type BodyProfile = (typeof GAME.bodies)[BodyId];

export type ControllerState =
  | 'GROUNDED'
  | 'AIRBORNE'
  | 'PACK_BALLISTIC'
  | 'RETRO_BURN';

export const FIXED_TIMESTEP = 1 / GAME.physics.fixedTimestepHz;
export const MAX_FRAME_DT = GAME.physics.maxDtClampMs / 1000;

