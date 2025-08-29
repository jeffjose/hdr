import { describe, it, expect } from 'vitest';

// Since the transfer functions are in app.js, we need to extract them
// For testing purposes, we'll define them here based on the existing implementation
// In a real setup, these would be exported from separate modules

const TransferFunctions = {
    sRGB: {
        encode: (linearValue) => {
            linearValue = Math.max(0, Math.min(1, linearValue));
            if (linearValue <= 0.0031308) {
                return 12.92 * linearValue;
            } else {
                return 1.055 * Math.pow(linearValue, 1 / 2.4) - 0.055;
            }
        }
    },
    
    PQ: {
        encode: (linearValue) => {
            linearValue = Math.max(0, linearValue);
            const Y = linearValue / 100.0;
            const m1 = 0.1593017578125;
            const m2 = 78.84375;
            const c1 = 0.8359375;
            const c2 = 18.8515625;
            const c3 = 18.6875;
            
            const Ym1 = Math.pow(Y, m1);
            const numerator = c1 + c2 * Ym1;
            const denominator = 1 + c3 * Ym1;
            return Math.pow(numerator / denominator, m2);
        }
    },
    
    HLG: {
        constants: {
            a: 0.17883277,
            b: 0.28466892,
            c: 0.55991073
        },
        encode: (linearValue) => {
            linearValue = Math.max(0, linearValue);
            
            if (linearValue <= 1/12) {
                return Math.sqrt(3 * linearValue);
            } else {
                const { a, b, c } = HLG.constants;
                if (12 * linearValue - b <= 0) return 0;
                return a * Math.log(12 * linearValue - b) + c;
            }
        }
    }
};

const HLG = TransferFunctions.HLG;

// --- sRGB OETF Tests ---
describe('sRGB.encode (OETF)', () => {
    it('should correctly encode the black point (0.0)', () => {
        expect(TransferFunctions.sRGB.encode(0.0)).toBeCloseTo(0.0);
    });

    it('should use the linear segment for values below the threshold', () => {
        const linearInput = 0.001;
        const expected = 12.92 * linearInput;
        expect(TransferFunctions.sRGB.encode(linearInput)).toBeCloseTo(expected);
    });
    
    it('should correctly encode the threshold value (0.0031308)', () => {
        expect(TransferFunctions.sRGB.encode(0.0031308)).toBeCloseTo(0.040449936);
    });

    it('should use the gamma segment for values above the threshold', () => {
        const linearInput = 0.5;
        const expected = 1.055 * Math.pow(linearInput, 1 / 2.4) - 0.055;
        expect(TransferFunctions.sRGB.encode(linearInput)).toBeCloseTo(expected);
    });

    it('should correctly encode SDR white (1.0)', () => {
        expect(TransferFunctions.sRGB.encode(1.0)).toBeCloseTo(1.0);
    });
    
    it('should clamp values greater than 1.0', () => {
        expect(TransferFunctions.sRGB.encode(2.0)).toBeCloseTo(1.0);
    });

    it('should handle edge cases at the threshold boundary', () => {
        // Just below threshold
        const belowThreshold = 0.003130;
        expect(TransferFunctions.sRGB.encode(belowThreshold)).toBeCloseTo(12.92 * belowThreshold);
        
        // Just above threshold
        const aboveThreshold = 0.003131;
        expect(TransferFunctions.sRGB.encode(aboveThreshold)).toBeCloseTo(
            1.055 * Math.pow(aboveThreshold, 1 / 2.4) - 0.055
        );
    });

    it('should handle negative values by clamping to 0', () => {
        expect(TransferFunctions.sRGB.encode(-0.5)).toBeCloseTo(0.0);
    });
});

// --- PQ OETF Tests ---
describe('PQ.encode (OETF)', () => {
    it('should correctly encode black (0 nits)', () => {
        expect(TransferFunctions.PQ.encode(0.0)).toBeCloseTo(0.0);
    });

    it('should correctly encode a dark tone (1 nit)', () => {
        expect(TransferFunctions.PQ.encode(0.01)).toBeCloseTo(0.14994573210018022, 5);
    });

    it('should correctly encode a mid-tone (50 nits)', () => {
        expect(TransferFunctions.PQ.encode(0.5)).toBeCloseTo(0.44028157342046104, 5);
    });

    it('should correctly encode SDR white (100 nits)', () => {
        expect(TransferFunctions.PQ.encode(1.0)).toBeCloseTo(0.508078, 5);
    });
    
    it('should correctly encode a bright HDR highlight (1000 nits)', () => {
        expect(TransferFunctions.PQ.encode(10.0)).toBeCloseTo(0.751827096247041, 5);
    });
    
    it('should correctly encode the peak brightness (10,000 nits)', () => {
        expect(TransferFunctions.PQ.encode(100.0)).toBeCloseTo(1.0);
    });

    it('should handle values between key luminance levels', () => {
        // 200 nits (2x SDR white)
        expect(TransferFunctions.PQ.encode(2.0)).toBeCloseTo(0.5791332452435196, 5);
        
        // 500 nits
        expect(TransferFunctions.PQ.encode(5.0)).toBeCloseTo(0.6765848107833876, 5);
        
        // 4000 nits
        expect(TransferFunctions.PQ.encode(40.0)).toBeCloseTo(0.9025723933109373, 5);
    });

    it('should handle values beyond 10,000 nits gracefully', () => {
        // Should continue the curve beyond 1.0
        const result = TransferFunctions.PQ.encode(200.0); // 20,000 nits
        expect(result).toBeGreaterThan(1.0);
    });

    it('should handle negative values by clamping to 0', () => {
        expect(TransferFunctions.PQ.encode(-1.0)).toBeCloseTo(0.0);
    });
});

// --- HLG OETF Tests ---
describe('HLG.encode (OETF)', () => {
    it('should correctly encode the black point (0.0)', () => {
        expect(TransferFunctions.HLG.encode(0.0)).toBeCloseTo(0.0);
    });

    it('should use the gamma segment for values below the threshold', () => {
        const linearInput = 0.05; // Less than 1/12
        const expected = Math.sqrt(3 * linearInput);
        expect(TransferFunctions.HLG.encode(linearInput)).toBeCloseTo(expected);
    });
    
    it('should correctly encode the threshold value (1/12)', () => {
        const linearInput = 1 / 12;
        // The two formulas should meet at this point
        const gammaExpected = Math.sqrt(3 * linearInput);
        const logExpected = HLG.constants.a * Math.log(12 * linearInput - HLG.constants.b) + HLG.constants.c;
        expect(gammaExpected).toBeCloseTo(logExpected, 5);
        expect(TransferFunctions.HLG.encode(linearInput)).toBeCloseTo(0.5);
    });

    it('should use the log segment for values above the threshold', () => {
        const linearInput = 0.5; // Greater than 1/12
        const expected = HLG.constants.a * Math.log(12 * linearInput - HLG.constants.b) + HLG.constants.c;
        expect(TransferFunctions.HLG.encode(linearInput)).toBeCloseTo(expected);
    });
    
    it('should correctly encode SDR reference white (1.0)', () => {
        // HLG encodes 1.0 linear to ~1.0, not 0.75
        // The 0.75 = reference white is for the inverse (decode) direction
        expect(TransferFunctions.HLG.encode(1.0)).toBeCloseTo(0.9999999955365686, 5);
    });

    it('should correctly encode a bright HDR highlight (5.0)', () => {
        expect(TransferFunctions.HLG.encode(5.0)).toBeCloseTo(1.291263221376612, 5);
    });

    it('should correctly encode the peak value (12.0)', () => {
        // HLG can encode beyond 1.0 for HDR highlights
        expect(TransferFunctions.HLG.encode(12.0)).toBeCloseTo(1.4483223301541637, 5);
    });

    it('should handle intermediate values correctly', () => {
        // 0.5x SDR white
        expect(TransferFunctions.HLG.encode(0.5)).toBeCloseTo(0.8716434713446153, 5);
        
        // 2x SDR white
        expect(TransferFunctions.HLG.encode(2.0)).toBeCloseTo(1.1261170473476987, 5);
        
        // 8x SDR white
        expect(TransferFunctions.HLG.encode(8.0)).toBeCloseTo(1.375634679491204, 5);
    });

    it('should handle values at the boundary correctly', () => {
        const threshold = 1/12;
        
        // Just below threshold
        const belowThreshold = threshold - 0.0001;
        const expectedBelow = Math.sqrt(3 * belowThreshold);
        expect(TransferFunctions.HLG.encode(belowThreshold)).toBeCloseTo(expectedBelow);
        
        // Just above threshold
        const aboveThreshold = threshold + 0.0001;
        const { a, b, c } = HLG.constants;
        const expectedAbove = a * Math.log(12 * aboveThreshold - b) + c;
        expect(TransferFunctions.HLG.encode(aboveThreshold)).toBeCloseTo(expectedAbove);
    });

    it('should handle negative values by returning 0', () => {
        expect(TransferFunctions.HLG.encode(-0.5)).toBeCloseTo(0.0);
    });
});

// --- Cross-function consistency tests ---
describe('Transfer Function Consistency', () => {
    it('all functions should encode 0 as 0', () => {
        expect(TransferFunctions.sRGB.encode(0)).toBeCloseTo(0);
        expect(TransferFunctions.PQ.encode(0)).toBeCloseTo(0);
        expect(TransferFunctions.HLG.encode(0)).toBeCloseTo(0);
    });
    
    it('all functions should be monotonically increasing', () => {
        const testValues = [0, 0.001, 0.01, 0.1, 0.5, 1.0];
        
        // sRGB (limited to 0-1)
        const srgbResults = testValues.map(v => TransferFunctions.sRGB.encode(v));
        for (let i = 1; i < srgbResults.length; i++) {
            expect(srgbResults[i]).toBeGreaterThan(srgbResults[i-1]);
        }
        
        // PQ (0-100 scale)
        const pqResults = testValues.map(v => TransferFunctions.PQ.encode(v));
        for (let i = 1; i < pqResults.length; i++) {
            expect(pqResults[i]).toBeGreaterThan(pqResults[i-1]);
        }
        
        // HLG (0-12 scale)
        const hlgResults = testValues.map(v => TransferFunctions.HLG.encode(v));
        for (let i = 1; i < hlgResults.length; i++) {
            expect(hlgResults[i]).toBeGreaterThan(hlgResults[i-1]);
        }
    });
});

// --- Performance tests ---
describe('Performance characteristics', () => {
    it('should handle large batches of values efficiently', () => {
        const values = Array.from({ length: 10000 }, (_, i) => i / 10000);
        
        const startSRGB = performance.now();
        values.forEach(v => TransferFunctions.sRGB.encode(v));
        const srgbTime = performance.now() - startSRGB;
        
        const startPQ = performance.now();
        values.forEach(v => TransferFunctions.PQ.encode(v));
        const pqTime = performance.now() - startPQ;
        
        const startHLG = performance.now();
        values.forEach(v => TransferFunctions.HLG.encode(v));
        const hlgTime = performance.now() - startHLG;
        
        // All should complete in reasonable time (< 100ms for 10k values)
        expect(srgbTime).toBeLessThan(100);
        expect(pqTime).toBeLessThan(100);
        expect(hlgTime).toBeLessThan(100);
    });
});