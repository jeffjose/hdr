# HLG Implementation Correction Details

This document outlines the correction made to the Hybrid Log-Gamma (HLG) transfer function implementation in `src/js/app.js`. The original implementation did not accurately follow the **ITU-R BT.2100** standard, leading to an incorrect OETF curve.

## The Problem: Incorrect Formulas and Transition Point

The previous HLG implementation had two primary issues:

1.  **Incorrect Transition Point**: The formula switched from a square-root function to a logarithmic function at a linear scene light value of **1.0**. The BT.2100 standard specifies this transition must occur at **1/12** (approximately 0.083).

2.  **Incorrect Formulas**:
    *   **Low-light (Square-root portion)**: The original code used `Math.sqrt(linear / 3)`. The correct formula according to the standard is `Math.sqrt(3) * Math.pow(E, 0.5)`, where `E` is the normalized input luminance.
    *   **High-light (Logarithmic portion)**: The original code used `a * Math.log(linear - b) + c`. The standard specifies the formula as `a * Math.log(12 * E - b) + c`.

These inaccuracies resulted in a curve that deviated significantly from the true HLG standard, especially in the critical transition area around reference white.

## The Solution: Adherence to the BT.2100 Standard

The `TransferFunctions.HLG` object in `app.js` was updated to precisely match the formulas and constants defined in ITU-R BT.2100-2.

### Key Changes:

1.  **Input Normalization**: The HLG OETF is defined based on an input luminance `E` that is normalized to the display's peak brightness (i.e., `E = 1.0` at peak). The `encode` function now correctly converts the input `linear` value (where 1.0 = 100 nits) to this normalized `E` value using the `peakBrightness` setting.

2.  **Corrected Formulas**:
    *   The transition point is now correctly set at `E <= 1/12`.
    *   The formulas for both the low-light and high-light portions of the curve now match the standard.

3.  **Constants Recalculated for Clarity**: The constants `b` and `c` are now calculated directly from `a` as specified in the standard, making the code clearer and ensuring their correctness:
    *   `a = 0.17883277`
    *   `b = 1 - 4 * a`
    *   `c = 0.5 - a * Math.log(4 * a)`

4.  **Symmetrical Decode Function**: The `decode` function was also updated to be the precise mathematical inverse of the new `encode` function, ensuring consistency between encoding and decoding operations. It correctly converts the normalized `E` value back to the project's relative linear space.

This correction ensures that the HLG OETF graph is now an accurate representation of the BT.2100 standard, providing a reliable reference for HDR analysis.
