// HLG (Hybrid Log-Gamma) Transfer Function Module
// Based on ITU-R BT.2100 and ARIB STD-B67

/**
 * HLG transfer function implementation
 * Reference: https://en.wikipedia.org/wiki/Hybrid_log-gamma
 * 
 * HLG is a relative HDR system designed for broadcast
 */
export const HLG = {
    // HLG constants as defined in ITU-R BT.2100
    constants: {
        a: 0.17883277,
        b: 0.28466892,      // 1 - 4*a
        c: 0.55991073,      // 0.5 - a*ln(4*a)
        systemGamma: 1.2    // Display system gamma
    },
    
    /**
     * Encode: Scene linear light to HLG signal (OETF)
     * Input: Scene-referred linear light, where 1.0 = SDR reference white (100 nits nominal).
     *        Can accept values up to 12.0 for HDR highlights (1200% diffuse white).
     * Output: HLG signal value (0-1), where 0.75 = reference white per BT.2100
     * 
     * Note: Per ITU-R BT.2100, HLG signal of 0.75 represents reference white (1.0 linear).
     */
    encode: (linear) => {
        const { a, b, c } = HLG.constants;
        
        if (linear <= 0) return 0;
        
        // Apply HLG OETF directly to the linear input
        // No normalization - the formulas expect linear where 1.0 = reference white
        if (linear <= 1/12) {
            // Square root portion for linear ≤ 1/12
            return 0.5 * Math.sqrt(3 * linear);
        } else {
            // Logarithmic portion for linear > 1/12
            // Clamp to avoid log of negative numbers
            if (12 * linear - b <= 0) return 0;
            return a * Math.log(12 * linear - b) + c;
        }
    },
    
    /**
     * Decode: HLG signal to scene linear light (Inverse OETF)
     * Input: HLG signal value (0-1), where 0.75 = reference white per BT.2100
     * Output: Scene-referred linear light, where 1.0 = SDR reference white.
     */
    decode: (hlg) => {
        const { a, b, c } = HLG.constants;
        
        if (hlg <= 0) return 0;
        
        // The threshold is at sqrt(3 * 1/12) = 0.5
        if (hlg <= 0.5) {
            // Inverse of square root portion
            return Math.pow(hlg / 0.5, 2) / 3.0;
        } else {
            // Inverse of logarithmic portion
            return (Math.exp((hlg - c) / a) + b) / 12;
        }
    },
    
    /**
     * Complete EOTF: HLG signal to display light
     * Input: HLG signal value (0-1), where 0.75 = reference white
     * Output: Display light in nits
     * 
     * EOTF = OOTF ∘ inverse_OETF
     * For HLG, the OOTF includes a system gamma of 1.2
     */
    signalToNits: (hlg, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        
        // Get scene light from inverse OETF (where 1.0 = reference white)
        const sceneLight = HLG.decode(hlg);
        
        // Apply system gamma (OOTF) - HLG uses gamma 1.2
        // Then scale by peak brightness
        // Note: sceneLight is already normalized where 1.0 = reference white
        const displayLight = Math.pow(sceneLight, systemGamma) * peakBrightness;
        
        return displayLight;
    },
    
    /**
     * Inverse EOTF: Display light to HLG signal
     * Input: Display light in nits
     * Output: HLG signal value (0-1), where 0.75 = reference white
     */
    nitsToSignal: (nits, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        
        // Normalize to peak brightness
        const normalizedDisplay = nits / peakBrightness;
        
        // Remove system gamma to get scene light
        const sceneLight = Math.pow(normalizedDisplay, 1 / systemGamma);
        
        // Apply OETF to get signal
        return HLG.encode(sceneLight);
    },
    
    /**
     * Metadata about this transfer function
     */
    metadata: {
        name: 'HLG (Hybrid Log-Gamma)',
        standard: 'ITU-R BT.2100 / ARIB STD-B67',
        description: 'Relative HDR system for broadcast, adapts to display peak brightness'
    }
};