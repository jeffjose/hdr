// sRGB Transfer Function Module
// Based on IEC 61966-2-1:1999

/**
 * sRGB transfer function implementation
 * Reference: https://en.wikipedia.org/wiki/SRGB
 */
export const sRGB = {
    /**
     * Encode: Linear RGB to sRGB (OETF - Opto-Electronic Transfer Function)
     * Input: Linear light value (0-1 range, where 1.0 = 100 nits SDR)
     * Output: sRGB encoded signal value (0-1)
     */
    encode: (linear) => {
        if (linear <= 0.0031308) {
            return 12.92 * linear;
        } else {
            return 1.055 * Math.pow(linear, 1/2.4) - 0.055;
        }
    },
    
    /**
     * Decode: sRGB to Linear RGB (EOTF - Electro-Optical Transfer Function)
     * Input: sRGB signal value (0-1)
     * Output: Linear light value (0-1 range, where 1.0 = 100 nits SDR)
     */
    decode: (srgb) => {
        if (srgb <= 0.04045) {
            return srgb / 12.92;
        } else {
            return Math.pow((srgb + 0.055) / 1.055, 2.4);
        }
    },
    
    /**
     * Metadata about this transfer function
     */
    metadata: {
        name: 'sRGB',
        standard: 'IEC 61966-2-1:1999',
        peakNits: 100,  // sRGB is SDR, peaks at 100 nits
        description: 'Standard RGB color space for monitors, printers, and the web'
    }
};