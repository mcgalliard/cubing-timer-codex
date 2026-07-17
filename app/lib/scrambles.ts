/** Cube sizes supported by the timer. */
export type CubeSize = 3 | 4 | 5 | 6 | 7;

type Axis = "x" | "y" | "z";
type Face = "R" | "L" | "U" | "D" | "F" | "B";
type Suffix = "" | "'" | "2";

const SCRAMBLE_LENGTH: Record<CubeSize, number> = {
  3: 20,
  4: 40,
  5: 60,
  6: 80,
  7: 100,
};

const FACES_BY_AXIS: Record<Axis, readonly Face[]> = {
  x: ["R", "L"],
  y: ["U", "D"],
  z: ["F", "B"],
};

const AXES = Object.keys(FACES_BY_AXIS) as Axis[];
const SUFFIXES: readonly Suffix[] = ["", "'", "2"];

function randomIndex(length: number): number {
  // Rejection sampling avoids the small modulo bias introduced by value % length.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const range = 0x1_0000_0000;
    const limit = range - (range % length);
    const buffer = new Uint32Array(1);

    do {
      crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);

    return buffer[0] % length;
  }

  return Math.floor(Math.random() * length);
}

function choose<T>(items: readonly T[]): T {
  return items[randomIndex(items.length)];
}

function movePrefix(face: Face, width: number): string {
  if (width === 1) return face;
  if (width === 2) return `${face}w`;
  return `${width}${face}w`;
}

/**
 * Generates a WCA-style random-move scramble for a 3x3 through 7x7 cube.
 *
 * Consecutive turns never use the same axis, which also prevents repeated or
 * immediately-opposite faces. Cubes 4x4 and larger include wide turns; 6x6
 * and 7x7 scrambles can additionally include three-layer wide turns.
 */
export function generateScramble(size: CubeSize): string {
  if (!(size in SCRAMBLE_LENGTH)) {
    throw new RangeError(`Unsupported cube size: ${size}. Expected 3 through 7.`);
  }

  const moves: string[] = [];
  let previousAxis: Axis | null = null;
  const maximumWidth = Math.floor(size / 2);

  for (let index = 0; index < SCRAMBLE_LENGTH[size]; index += 1) {
    const availableAxes = AXES.filter((axis) => axis !== previousAxis);
    const axis = choose(availableAxes);
    const face = choose(FACES_BY_AXIS[axis]);
    const width = 1 + randomIndex(maximumWidth);
    const suffix = choose(SUFFIXES);

    moves.push(`${movePrefix(face, width)}${suffix}`);
    previousAxis = axis;
  }

  return moves.join(" ");
}
