const RANGE = 0x1_0000_0000;
type Uint32Source = () => number;

function secureUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}

/** Rejection sampling removes modulo bias. Animation never calls this function. */
export function randomBelow(bound: number, source: Uint32Source = secureUint32): number {
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > RANGE) {
    throw new RangeError("Invalid random bound");
  }
  const limit = RANGE - (RANGE % bound);
  for (let attempt = 0; attempt < 128; attempt++) {
    const value = source();
    if (!Number.isInteger(value) || value < 0 || value >= RANGE) {
      throw new RangeError("Invalid random source");
    }
    if (value < limit) return value % bound;
  }
  throw new Error("Random source failed");
}

export function selectWeighted<T>(
  entries: readonly { value: T; weight: number }[],
  source?: Uint32Source,
): T | null {
  if (entries.length === 0) return null;
  if (entries.some(({ weight }) => !Number.isSafeInteger(weight) || weight < 1)) {
    throw new RangeError("Weights must be positive integers");
  }
  const total = entries.reduce((sum, { weight }) => sum + weight, 0);
  let ticket = randomBelow(total, source);
  for (const { value, weight } of entries) {
    if (ticket < weight) return value;
    ticket -= weight;
  }
  throw new Error("Invalid selection");
}
