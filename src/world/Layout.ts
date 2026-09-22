// Shared dimensions of the Shibuya crossing (metres). Crossing centred at the
// origin, north = -Z. ART_DIRECTION §6.

export const LAYOUT = {
  /** Road width; the intersection box is |x|,|z| < ROAD/2. */
  ROAD: 26,
  /** Curb line from the centre. */
  CURB: 13,
  /** Sidewalk width from the curb to the building line. */
  SW: 8,
  /** Building line (front faces of frontage buildings). */
  FRONT: 21,
  /** Centre of the sidewalk strip. */
  SW_CENTER: 17,
  /** Height of the sidewalk slab top. */
  SLAB_H: 0.18,
  /** Crosswalk depth (along the road). */
  ZEBRA: 5,
  /** How far the streets run out before the skyline takes over. */
  STREET_LEN: 170,
} as const;

/** Sidewalk slab height at (x, z), 0 on the road. */
export function groundHeightAt(x: number, z: number): number {
  return Math.abs(x) > LAYOUT.CURB && Math.abs(z) > LAYOUT.CURB ? LAYOUT.SLAB_H : 0;
}
