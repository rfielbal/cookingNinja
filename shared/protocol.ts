import { DEFAULT_BLADE, isBladeId, type BladeId } from './blades.js';

/** Small, versionable protocol shared by the browser and the relay. */
export type GamePhase = 'menu' | 'ready' | 'countdown' | 'playing' | 'paused' | 'mixing' | 'result';
export type ControllerMode = 'motion' | 'touch';
export type ControlMode = ControllerMode | 'mouse';
export type ControllerAction = 'start' | 'pause' | 'resume';

export interface InputMessage {
  type: 'input';
  x: number;
  y: number;
  slash: boolean;
  stir: number;
  seq: number;
  source?: ControllerMode;
  /** Actual start of this touch segment, so two separate gestures cannot be joined. */
  fromX?: number;
  fromY?: number;
}

export interface ControllerActionMessage {
  type: 'controller:action';
  action: ControllerAction;
}

export interface ControllerSettingsMessage {
  type: 'controller:settings';
  mode: ControllerMode;
  blade: BladeId;
}

export interface GameStateMessage {
  type: 'game:state';
  phase: GamePhase;
  recipe: string;
  hearts: number;
  score: number;
  canStart: boolean;
  canResume: boolean;
  starting: boolean;
  blade: BladeId;
  controlMode: ControlMode;
  notice: string;
}

/** Older hosts can omit the new presentation fields; the parser supplies safe defaults. */
export type GameStateUpdate = Pick<GameStateMessage, 'phase' | 'recipe' | 'hearts' | 'score'> &
  Partial<
    Pick<
      GameStateMessage,
      'canStart' | 'canResume' | 'starting' | 'blade' | 'controlMode' | 'notice'
    >
  >;

export type ClientMessage =
  | { type: 'host:create' }
  | { type: 'controller:join'; code: string; resumeToken?: string }
  | { type: 'controller:leave' }
  | InputMessage
  | ControllerActionMessage
  | ControllerSettingsMessage
  | GameStateMessage;

export type ServerMessage =
  | { type: 'room:created'; code: string }
  | { type: 'room:joined'; code: string; role: 'controller'; resumeToken: string }
  | { type: 'peer:status'; connected: boolean }
  | { type: 'error'; message: string; code?: 'ROOM_BUSY' | 'ROOM_NOT_FOUND'; recoverable?: boolean }
  | InputMessage
  | ControllerActionMessage
  | ControllerSettingsMessage
  | GameStateMessage;

export interface ServerConfig {
  controllerOrigin?: string;
  localUrls: string[];
  secure: boolean;
}

const phases: readonly string[] = [
  'menu',
  'ready',
  'countdown',
  'playing',
  'paused',
  'mixing',
  'result',
];
const unit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const optionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';

/** Validate and copy only known fields; never forward arbitrary client JSON. */
export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'host:create':
      return { type: 'host:create' };
    case 'controller:leave':
      return { type: 'controller:leave' };
    case 'controller:action':
      if (message.action !== 'start' && message.action !== 'pause' && message.action !== 'resume')
        return null;
      return { type: 'controller:action', action: message.action };
    case 'controller:settings':
      if ((message.mode !== 'motion' && message.mode !== 'touch') || !isBladeId(message.blade))
        return null;
      return { type: 'controller:settings', mode: message.mode, blade: message.blade };
    case 'controller:join': {
      if (typeof message.code !== 'string') return null;
      const code = message.code.trim().toUpperCase();
      if (
        !/^[A-HJ-NP-Z2-9]{6}$/.test(code) ||
        (message.resumeToken !== undefined &&
          (typeof message.resumeToken !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(message.resumeToken)))
      )
        return null;
      return {
        type: 'controller:join',
        code,
        ...(message.resumeToken ? { resumeToken: message.resumeToken as string } : {}),
      };
    }
    case 'input':
      if (
        !unit(message.x) ||
        !unit(message.y) ||
        !unit(message.stir) ||
        typeof message.slash !== 'boolean' ||
        !Number.isSafeInteger(message.seq) ||
        (message.seq as number) < 0 ||
        (message.source !== undefined &&
          message.source !== 'motion' &&
          message.source !== 'touch') ||
        ((message.fromX !== undefined || message.fromY !== undefined) &&
          (message.source !== 'touch' || !unit(message.fromX) || !unit(message.fromY)))
      )
        return null;
      return {
        type: 'input',
        x: message.x,
        y: message.y,
        slash: message.slash,
        stir: message.stir,
        seq: message.seq as number,
        ...(message.source ? { source: message.source as 'motion' | 'touch' } : {}),
        ...(message.fromX !== undefined
          ? { fromX: message.fromX as number, fromY: message.fromY as number }
          : {}),
      };
    case 'game:state':
      if (
        typeof message.phase !== 'string' ||
        !phases.includes(message.phase) ||
        typeof message.recipe !== 'string' ||
        message.recipe.length > 80 ||
        /[\u0000-\u001f]/.test(message.recipe) ||
        !Number.isInteger(message.hearts) ||
        (message.hearts as number) < 0 ||
        (message.hearts as number) > 3 ||
        !Number.isSafeInteger(message.score) ||
        (message.score as number) < 0 ||
        (message.score as number) > 1_000_000_000 ||
        !optionalBoolean(message.canStart) ||
        !optionalBoolean(message.canResume) ||
        !optionalBoolean(message.starting) ||
        (message.blade !== undefined && !isBladeId(message.blade)) ||
        (message.controlMode !== undefined &&
          message.controlMode !== 'motion' &&
          message.controlMode !== 'touch' &&
          message.controlMode !== 'mouse') ||
        (message.notice !== undefined &&
          (typeof message.notice !== 'string' ||
            message.notice.length > 240 ||
            /[\u0000-\u001f\u007f]/.test(message.notice)))
      )
        return null;
      return {
        type: 'game:state',
        phase: message.phase as GamePhase,
        recipe: message.recipe,
        hearts: message.hearts as number,
        score: message.score as number,
        canStart: message.canStart ?? false,
        canResume: message.canResume ?? false,
        starting: message.starting ?? false,
        blade: (message.blade as BladeId | undefined) ?? DEFAULT_BLADE,
        controlMode: (message.controlMode as ControlMode | undefined) ?? 'mouse',
        notice: (message.notice as string | undefined) ?? '',
      };
    default:
      return null;
  }
}
