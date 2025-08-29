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
     * Input: App's linear light, where 1.0 = 100 nits (SDR reference white).
     * Output: HLG signal value (0-1)
     */
    encode: (linear) => {
        const { a, b, c } = HLG.constants;
        
        if (linear <= 0) return 0;

        // Convert app's linear (1.0 = 100 nits) to HLG's E (1.0 = 1000 nits nominal peak)
        const E = linear / 10.0;
        
        const E_times_12 = 12 * E;
        
        if (E_times_12 <= 1) {
            // Square root portion for 12*E ≤ 1
            return Math.sqrt(3 * E);
        } else {
            // Logarithmic portion for 12*E > 1
            return a * Math.log(E_times_12 - b) + c;
        }
    },
    
    /**
     * Decode: HLG signal to scene linear light (Inverse OETF)
     * Input: HLG signal value (0-1)
     * Output: App's linear light, where 1.0 = 100 nits.
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
            const E_times_12 = Math.exp((hlg - c) / a) + b;
            E = E_times_12 / 12;
        }

        // Convert HLG's E back to app's linear scale
        return E * 10.0;
    },
    
    /**
     * Complete EOTF: HLG signal to display light
     * Input: HLG signal value (0-1)
     * Output: Display light in nits
     * 
     * EOTF = OOTF ∘ inverse_OETF
     * Display_light = (scene_light)^γ * peak_brightness
     */
    signalToNits: (hlg, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        
        // Get scene light from inverse OETF
        const sceneLight = HLG.decode(hlg);
        
        // Apply system gamma (OOTF)
        const normalizedDisplay = Math.pow(sceneLight, systemGamma);
        
        // Scale to peak brightness
        return normalizedDisplay * peakBrightness;
    },
    
    /**
     * Inverse EOTF: Display light to HLG signal
     * Input: Display light in nits
     * Output: HLG signal value (0-1)
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