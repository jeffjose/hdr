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
     * Encode: Scene linear light to HLG signal (OETF) - CORRECTED
     * Input: Scene-referred linear light, where 1.0 = SDR reference white.
     * Output: HLG signal value (0-1), where 0.75 = reference white.
     */
    encode: (linear) => {
        const { a, b, c } = HLG.constants;
        if (linear <= 0) return 0;

        if (linear <= 1) { // Standard SDR range
            return 0.5 * Math.sqrt(linear);
        } else { // HDR highlight range
            return a * Math.log(linear - b) + c + 0.5;
        }
    },
    
    /**
     * Decode: HLG signal to scene linear light (Inverse OETF) - CORRECTED
     * Input: HLG signal value (0-1), where 0.75 = reference white.
     * Output: Scene-referred linear light, where 1.0 = SDR reference white.
     */
    decode: (hlg) => {
        const { a, b, c } = HLG.constants;
        if (hlg <= 0) return 0;
        
        // The standard maps reference white to a signal of 0.75
        if (hlg <= 0.75) {
            return Math.pow(hlg / 0.5, 2);
        } else {
            return Math.exp((hlg - 0.5 - c) / a) + b;
        }
    },
    
    /**
     * Complete EOTF: HLG signal to display light
     */
    signalToNits: (hlg, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        const sceneLight = HLG.decode(hlg);
        
        // Apply system gamma (OOTF) and scale to peak brightness
        const displayLight = Math.pow(sceneLight, systemGamma) * (peakBrightness / 100);
        
        return displayLight;
    },
    
    /**
     * Inverse EOTF: Display light to HLG signal
     */
    nitsToSignal: (nits, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        const normalizedDisplay = nits / (peakBrightness / 100);
        const sceneLight = Math.pow(normalizedDisplay, 1 / systemGamma);
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
