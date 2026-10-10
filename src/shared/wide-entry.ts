/** A continuous two-cell entrance stair, authored by the host. The first
 * cell keeps the usual entry anchor, +Z descends, and local +X adds the
 * second cell. It has no raised coping across the walking surface. */
export const WIDE_ENTRY_ID = 'step.entry-wide' as const;
export const WIDE_ENTRY = {
  width: 2, centerX: .5, span: 2, depth: 1,
  count: 4, rise: .15, going: .25, bottom: -.9,
} as const;
export interface WideEntryBox {
  tag: string;
  center: [number, number, number];
  half: [number, number, number];
  support: true;
}
export function wideEntryBoxes(): WideEntryBox[] {
  const d = WIDE_ENTRY;
  return Array.from({ length: d.count }, (_, i) => {
    const top = -(i + 1) * d.rise;
    return {
      tag: 'wide entry tread',
      center: [d.centerX, (top + d.bottom) / 2, -.5 + (i + .5) * d.going],
      half: [d.width / 2, (top - d.bottom) / 2, d.going / 2],
      support: true,
    };
  });
}
export const wideEntryEnvelope = {
  min: [-.5, -.9, -.5] as [number, number, number],
  max: [1.5, -.15, .5] as [number, number, number],
};
