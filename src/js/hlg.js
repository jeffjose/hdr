export const HLG = {
  // HLG constants as defined in ITU-R BT.2100
  constants: {
    a: 0.17883277,
    b: 0.28466892, // 1 - 4*a
    c: 0.55991073, // 0.5 - a*ln(4*a)
    systemGamma: 1.2
  },

  /**
   * Encode: Scene linear light to HLG signal (OETF)
   * This is the standard, nominal HLG OETF formula. The output can exceed 1.0.
   */
  encode: (linear) => {
    const { a, b, c } = HLG.constants;
    if (linear <= 0) return 0;

    if (linear <= 1 / 12) {
      return Math.sqrt(3 * linear);
    } else {
      return a * Math.log(12 * linear - b) + c;
    }
  },

  /**
   * Decode: HLG signal to scene linear light (Inverse OETF)
   * This is the true mathematical inverse of the encode function.
   */
  decode: (hlg) => {
    const { a, b, c } = HLG.constants;
    if (hlg <= 0) return 0;

    if (hlg <= 0.5) {
      return Math.pow(hlg, 2) / 3;
    } else {
      return (Math.exp((hlg - c) / a) + b) / 12;
    }
  }

  // ... (keep the rest of your HLG object: signalToNits, nitsToSignal, metadata)
};
