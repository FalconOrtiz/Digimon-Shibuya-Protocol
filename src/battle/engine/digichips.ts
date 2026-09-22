/**
 * DigiChips pasivos del E33. Se equipan en el Digivice (3 slots) y el motor
 * aplica sus efectos a través de estos hooks puros.
 */

export interface DigiChipDef {
  id: string;
  name: string;
  desc: string;
  slot: number;
}

export const DIGICHIPS: DigiChipDef[] = [
  { id: 'pepper-pack', name: 'Pepper Pack', desc: '+10% daño de habilidades', slot: 0 },
  { id: 'reflex-core', name: 'Reflex Core', desc: '+25 ms de ventana de parry', slot: 1 },
  { id: 'ap-overclock', name: 'AP Overclock', desc: '+1 AP tras parar un combo entero', slot: 2 },
  { id: 'break-bit', name: 'Break Bit', desc: '+8 break en ataques básicos', slot: 0 },
  { id: 'gradual-charge', name: 'Gradual Charge', desc: '+2% Gradient por turno propio', slot: 1 },
];

export const DEFAULT_CHIPS = ['pepper-pack', 'reflex-core', 'ap-overclock'];

export const CHIP_BY_ID: Record<string, DigiChipDef> = Object.fromEntries(DIGICHIPS.map((c) => [c.id, c]));

export function skillDamageMult(chips: string[]): number {
  return chips.includes('pepper-pack') ? 1.1 : 1;
}

export function parryExtension(chips: string[]): number {
  return chips.includes('reflex-core') ? 0.025 : 0;
}

export function overclockBonus(chips: string[]): number {
  return chips.includes('ap-overclock') ? 1 : 0;
}

export function basicBreakBonus(chips: string[]): number {
  return chips.includes('break-bit') ? 8 : 0;
}

export function gradualCharge(chips: string[]): number {
  return chips.includes('gradual-charge') ? 2 : 0;
}
