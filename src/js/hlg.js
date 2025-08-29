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
     * Output: HLG signal value (0-1), where 0.5 = reference white
     * 
     * Note: Per ITU-R BT.2100, HLG signal of 0.5 represents reference white for SDR compatibility.
     * Signal values 0.5-1.0 encode HDR highlights up to 12× reference white.
     */
    encode: (linear) => {
        const { a, b, c } = HLG.constants;
        
        if (linear <= 0) return 0;
        if (linear >= 12) return 1; // Clamp to peak at 12× reference

        // Normalize input: HLG expects 0-1 range where 1 = peak (12× reference)
        // Input linear is 0-12 where 1 = reference white
        const E = linear / 12;
        
        if (E <= 1/12) {
            // Square root portion for E ≤ 1/12
            return Math.sqrt(3 * E);
        } else {
            // Logarithmic portion for E > 1/12
            return a * Math.log(12 * E - b) + c;
        }
    },
    
    /**
     * Decode: HLG signal to scene linear light (Inverse OETF)
     * Input: HLG signal value (0-1), where 0.5 = reference white
     * Output: Scene-referred linear light, where 1.0 = SDR reference white, up to 12.0 for HDR peaks.
     */
    decode: (hlg) => {
        const { a, b, c } = HLG.constants;
        
        if (hlg <= 0) return 0;
        
        let E;
        if (hlg <= 0.5) {
            // Inverse of square root portion
            E = Math.pow(hlg, 2) / 3;
        } else {
            // Inverse of logarithmic portion
            E = (Math.exp((hlg - c) / a) + b) / 12;
        }

        // Denormalize: E is in 0-1 range, convert back to 0-12
        // where 1.0 = reference white
        return E * 12;
    },
    
    /**
     * Complete EOTF: HLG signal to display light
     * Input: HLG signal value (0-1), where 0.5 = reference white
     * Output: Display light in nits
     * 
     * EOTF = OOTF ∘ inverse_OETF
     * Display_light = (scene_light/12)^γ * peak_brightness
     */
    signalToNits: (hlg, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        
        // Get scene light from inverse OETF (0-12 range)
        const sceneLight = HLG.decode(hlg);
        
        // Normalize to 0-1 for display gamma, then apply system gamma (OOTF)
        const normalizedDisplay = Math.pow(sceneLight / 12, systemGamma);
        
        // Scale to peak brightness
        return normalizedDisplay * peakBrightness;
    },
    
    /**
     * Inverse EOTF: Display light to HLG signal
     * Input: Display light in nits
     * Output: HLG signal value (0-1), where 0.5 = reference white
     */
    nitsToSignal: (nits, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        
        // Normalize to peak brightness
        const normalizedDisplay = nits / peakBrightness;
        
        // Remove system gamma to get normalized scene light, then scale to 0-12
        const sceneLight = Math.pow(normalizedDisplay, 1 / systemGamma) * 12;
        
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