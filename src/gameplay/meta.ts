/** The Archive: unlocks earned automatically as banked Evidence crosses each cost. */
export type UnlockKind = 'lore' | 'filter' | 'perk' | 'badge' | 'photo';

export interface Unlock {
  id: string;
  cost: number;
  kind: UnlockKind;
  name: string;
  detail: string;
}

export const UNLOCKS: Unlock[] = [
  { id: 'lore1', cost: 5, kind: 'lore', name: 'Tape 0001: Orientation', detail: 'lore' },
  { id: 'filter1', cost: 12, kind: 'filter', name: 'Filter: Sepia Archive', detail: '1' },
  { id: 'lore2', cost: 20, kind: 'lore', name: 'Tape 0007: Maintenance', detail: 'lore' },
  { id: 'perks', cost: 30, kind: 'perk', name: 'Perk slot', detail: 'Equip one small advantage.' },
  { id: 'lore3', cost: 45, kind: 'lore', name: 'Tape 0019: The Tenant', detail: 'lore' },
  { id: 'filter2', cost: 60, kind: 'filter', name: 'Filter: Monochrome', detail: '2' },
  { id: 'badge', cost: 80, kind: 'badge', name: 'Night shift badge', detail: 'Shows your Daily Shift streak on the title screen.' },
  { id: 'photo', cost: 100, kind: 'photo', name: 'Photo mode', detail: 'Press P while paused to frame a shot without the HUD.' },
  { id: 'lore4', cost: 130, kind: 'lore', name: 'Tape 0031: Overtime', detail: 'lore' },
  { id: 'filter3', cost: 170, kind: 'filter', name: 'Filter: Cold Storage', detail: '3' },
  { id: 'lore5', cost: 220, kind: 'lore', name: 'Tape 0042: Your Tape', detail: 'lore' },
];

export const PERKS: { id: string; name: string; detail: string }[] = [
  { id: 'battery', name: 'Spare cell', detail: 'Plus 10 per cent battery capacity.' },
  { id: 'quiet', name: 'Soft soles', detail: 'Footsteps are quieter, so the Occupant hears you later.' },
  { id: 'wide', name: 'Wide lens', detail: 'Camcorder field of view is 8 degrees wider.' },
];

export const LORE: Record<string, string[]> = {
  lore1: [
    'If you are hearing this, the building has let you in. That is not the same as being allowed to stay.',
    'Keep the camera charged. Film what is wrong. Wrong things are easier to leave behind once they are on tape.',
    'Do not trust the quiet rooms.',
  ],
  lore2: [
    'Work order 7. Panels in sector four buzzing at the wrong pitch. Replaced ballast. Buzzing continued.',
    'Replaced panel. Buzzing continued. Removed panel. Buzzing continued from the empty housing.',
    'Closing ticket. Not a lighting fault.',
  ],
  lore3: [
    'It does not walk so much as arrive. You only catch it on the lens, and only while you keep looking.',
    'It is not angry. It is a tenant, and you are standing in the space it rents.',
    'Every time I lowered the camera, it was closer. Every time I raised it, it was polite.',
  ],
  lore4: [
    'Clocks here are honest except for one. Find the one that lies and you will know how long you have been gone.',
    'I counted nine hours. My phone said eleven minutes. The clock on the wall said tomorrow.',
  ],
  lore5: [
    'This is your tape. You recorded over the label, but the handwriting is yours.',
    'You have been here before. You will be here again. The office keeps the good footage.',
    'Rewind.',
  ],
};

export function unlockedIds(banked: number): Set<string> {
  return new Set(UNLOCKS.filter((u) => banked >= u.cost).map((u) => u.id));
}

export function nextUnlock(banked: number): Unlock | null {
  return UNLOCKS.find((u) => u.cost > banked) ?? null;
}
