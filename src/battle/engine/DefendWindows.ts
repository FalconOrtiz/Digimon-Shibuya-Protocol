/**
 * Ventanas de defensa E33 (puro). Dado un golpe, un input (tipo + tiempo
 * relativo al hit frame) y los chips, decide el DefendResult.
 */

import type { TimelineHit } from './timelines';
import { parryExtension } from './digichips';

export type WindowType = 'dodge' | 'parry' | 'jump' | 'gradient';

export interface WindowDef {
  type: WindowType;
  /** Segundos desde el hit frame. */
  open: number;
  close: number;
  /** Sub-ventana perfecta (solo dodge). */
  perfect?: number;
  validFor: TimelineHit['type'][];
}

export const WINDOWS: Record<WindowType, WindowDef> = {
  dodge: { type: 'dodge', open: 0, close: 0.45, perfect: 0.22, validFor: ['strike', 'jumpable', 'gradient'] },
  parry: { type: 'parry', open: 0, close: 0.18, validFor: ['strike', 'jumpable'] },
  jump: { type: 'jump', open: 0, close: 0.35, validFor: ['jumpable'] },
  gradient: { type: 'gradient', open: 0, close: 0.3, validFor: ['gradient'] },
};

export type DefendResult =
  | 'clean'
  | 'dodge'
  | 'perfect-dodge'
  | 'parry'
  | 'perfect-parry'
  | 'jump'
  | 'gradient'
  | 'whiff';

export interface DefendInput {
  type: WindowType;
  /** Segundos desde que se abrió el hit frame. */
  t: number;
}

export const DEFEND_KEYS: Record<WindowType, string> = {
  dodge: 'Space',
  parry: 'KeyE',
  jump: 'ShiftLeft',
  gradient: 'KeyF',
};

/** Qué inputs acepta un tipo de golpe (para el prompt del HUD). */
export function validInputs(type: TimelineHit['type']): WindowType[] {
  return (Object.keys(WINDOWS) as WindowType[]).filter((w) => WINDOWS[w].validFor.includes(type));
}

/**
 * - Sin input → 'clean' (daño completo).
 * - Input inválido para el golpe o fuera de ventana → 'whiff'.
 * - Dodge dentro de la sub-ventana perfecta → 'perfect-dodge'.
 * - `reflex-core` ensancha la ventana de parry 25 ms.
 */
export function matchWindow(hit: TimelineHit, input: DefendInput | null, chips: string[] = []): DefendResult {
  if (!input) return 'clean';
  const def = WINDOWS[input.type];
  if (!def.validFor.includes(hit.type)) return 'whiff';

  const close = input.type === 'parry' ? def.close + parryExtension(chips) : def.close;
  if (input.t < def.open || input.t > close) return 'whiff';
  if (input.type === 'dodge' && def.perfect !== undefined && input.t <= def.perfect) return 'perfect-dodge';
  return input.type;
}

export function negatesDamage(result: DefendResult): boolean {
  return result !== 'clean' && result !== 'whiff';
}

/** AP que da cada defensa; gradient llena el Gradient en su lugar. */
export function defendAp(result: DefendResult): number {
  switch (result) {
    case 'dodge':
    case 'perfect-dodge':
    case 'parry':
    case 'perfect-parry':
    case 'jump':
      return 1;
    default:
      return 0;
  }
}
