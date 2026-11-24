/** Plain-text rendering of a chunk, for debugging and review. */
import { type Chunk, hIndex, vIndex } from './chunk.ts';

/**
 * Each cell is 3 characters wide. `+` marks corners, `---`/`|` walls, blanks
 * open edges. Corridor cells are shaded with `.`.
 */
export function chunkToAscii(chunk: Chunk): string {
  const s = chunk.size;
  const lines: string[] = [];
  for (let z = 0; z <= s; z++) {
    let edge = '';
    for (let x = 0; x < s; x++) edge += '+' + (chunk.hWalls[hIndex(s, x, z)] ? '---' : '   ');
    lines.push(edge + '+');
    if (z === s) break;
    let row = '';
    for (let x = 0; x <= s; x++) {
      row += chunk.vWalls[vIndex(s, x, z)] ? '|' : ' ';
      if (x < s) {
        const room = chunk.rooms[chunk.roomOf[z * s + x] as number];
        row += room?.kind === 'corridor' ? ' . ' : '   ';
      }
    }
    lines.push(row);
  }
  return lines.join('\n');
}
