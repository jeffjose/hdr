// HLG (Hybrid Log-Gamma) Transfer Function Module
// Based on ITU-R BT.2100 and ARIB STD-B67

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
        
        // The switch point in the signal domain is 0.5
        if (hlg <= 0.5) {
            return Math.pow(hlg, 2) / 3;
        } else {
            return (Math.exp((hlg - c) / a) + b) / 12;
        }
    },
    
    /**
     * Complete EOTF: HLG signal to display light in nits
     * Maps signal 1.0 to peak brightness
     */
    signalToNits: (hlg, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        const sceneLight = HLG.decode(hlg);
        
        // Apply system gamma and scale to peak brightness
        // Signal 1.0 -> scene light 1.0 -> display peak brightness
        const displayLight = Math.pow(sceneLight, systemGamma) * peakBrightness;
        
        return displayLight;
    },
    
    /**
     * Inverse EOTF: Display light in nits to HLG signal
     */
    nitsToSignal: (nits, peakBrightness = 1000) => {
        const { systemGamma } = HLG.constants;
        
        // Remove display scaling and system gamma to get scene light
        const normalizedDisplay = nits / peakBrightness;
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
