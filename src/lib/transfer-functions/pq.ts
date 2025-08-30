export const PQ = {
  // PQ constants as defined in ST.2084
  constants: {
    m1: 0.1593017578125, // 2610/16384
    m2: 78.84375, // 128 * 2523/4096
    c1: 0.8359375, // 3424/4096
    c2: 18.8515625, // 32 * 2413/4096
    c3: 18.6875, // 32 * 2392/4096
    peakNits: 10000 // PQ designed for 10,000 nits peak
  },

  /**
   * Encode: Linear light to PQ signal (OETF)
   * Input: Linear light value where 1.0 = 100 nits (SDR reference white)
   * Output: PQ signal value (0-1), reaches 1.0 at 10,000 nits
   */
  encode: (linear: number): number => {
    const { m1, m2, c1, c2, c3, peakNits } = PQ.constants;

    // Convert from relative (1.0 = 100 nits) to absolute nits
    const nits = linear * 100;

    // Normalize to PQ range (0-1 where 1.0 = 10,000 nits)
    const Y = Math.max(0, nits / peakNits);

    // Apply PQ encoding formula
    const Ym1 = Math.pow(Y, m1);
    const numerator = c1 + c2 * Ym1;
    const denominator = 1 + c3 * Ym1;

    return Math.pow(numerator / denominator, m2);
  },

  /**
   * Decode: PQ signal to linear light (EOTF)
   * Input: PQ signal value (0-1)
   * Output: Linear light value where 1.0 = 100 nits
   */
  decode: (pq: number): number => {
    const { m1, m2, c1, c2, c3, peakNits } = PQ.constants;

    // Clamp input to valid range
    const E = Math.max(0, Math.min(1, pq));

    // Apply inverse PQ formula
    const Em2 = Math.pow(E, 1 / m2);
    const numerator = Math.max(0, Em2 - c1);
    const denominator = c2 - c3 * Em2;

    // Prevent division by zero
    if (denominator <= 0) return 0;

    // Calculate normalized luminance (0-1 where 1 = 10,000 nits)
    const Y = Math.pow(numerator / denominator, 1 / m1);

    // Convert from absolute nits to relative (1.0 = 100 nits)
    const nits = Y * peakNits;
    return nits / 100;
  },

  /**
   * Helper function to convert PQ signal to nits directly
   */
  signalToNits: (pq: number): number => {
    return PQ.decode(pq) * 100;
  },

  /**
   * Helper function to convert nits to PQ signal directly
   */
  nitsToSignal: (nits: number): number => {
    return PQ.encode(nits / 100);
  },

  /**
   * Metadata about this transfer function
   */
  metadata: {
    name: 'PQ (Perceptual Quantizer)',
    standard: 'SMPTE ST 2084:2014',
    peakNits: 10000,
    description: 'HDR transfer function for absolute luminance encoding up to 10,000 nits'
  }
};
