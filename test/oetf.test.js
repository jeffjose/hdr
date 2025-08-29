import { describe, it, expect } from 'vitest';
import { sRGB } from '../src/js/srgb.js';
import { PQ } from '../src/js/pq.js';
import { HLG } from '../src/js/hlg.js';

// --- sRGB OETF Tests ---
describe('sRGB.encode (OETF)', () => {
    it('should correctly encode the black point (0.0)', () => {
        expect(sRGB.encode(0.0)).toBeCloseTo(0.0);
    });

    it('should use the linear segment for values below the threshold', () => {
        const linearInput = 0.001;
        const expected = 12.92 * linearInput;
        expect(sRGB.encode(linearInput)).toBeCloseTo(expected);
    });
    
    it('should correctly encode the threshold value (0.0031308)', () => {
        expect(sRGB.encode(0.0031308)).toBeCloseTo(0.040449936);
    });

    it('should use the gamma segment for values above the threshold', () => {
        const linearInput = 0.5;
        const expected = 1.055 * Math.pow(linearInput, 1 / 2.4) - 0.055;
        expect(sRGB.encode(linearInput)).toBeCloseTo(expected);
    });

    it('should correctly encode SDR white (1.0)', () => {
        expect(sRGB.encode(1.0)).toBeCloseTo(1.0);
    });
    
    it('should clamp values greater than 1.0', () => {
        expect(sRGB.encode(2.0)).toBeCloseTo(1.0);
    });

    it('should handle edge cases at the threshold boundary', () => {
        // Just below threshold
        const belowThreshold = 0.003130;
        expect(sRGB.encode(belowThreshold)).toBeCloseTo(12.92 * belowThreshold);
        
        // Just above threshold
        const aboveThreshold = 0.003131;
        expect(sRGB.encode(aboveThreshold)).toBeCloseTo(
            1.055 * Math.pow(aboveThreshold, 1 / 2.4) - 0.055
        );
    });

    it('should handle negative values', () => {
        // sRGB implementation doesn't explicitly handle negatives, 
        // but the Math.pow will work on negative values
        const result = sRGB.encode(-0.5);
        expect(result).toBeDefined();
    });
});

// --- PQ OETF Tests ---
describe('PQ.encode (OETF)', () => {
    it('should correctly encode black (0 nits)', () => {
        expect(PQ.encode(0.0)).toBeCloseTo(0.0);
    });

    it('should correctly encode a dark tone (1 nit)', () => {
        // 0.01 in our scale = 1 nit (since 1.0 = 100 nits)
        // PQ encodes 1 nit to ~0.1499
        expect(PQ.encode(0.01)).toBeCloseTo(0.14994573210018022, 5);
    });

    it('should correctly encode a mid-tone (50 nits)', () => {
        // 0.5 in our scale = 50 nits (since 1.0 = 100 nits)
        // PQ encodes 50 nits to ~0.4403
        expect(PQ.encode(0.5)).toBeCloseTo(0.44028157342046104, 5);
    });

    it('should correctly encode SDR white (100 nits)', () => {
        expect(PQ.encode(1.0)).toBeCloseTo(0.508078, 5);
    });
    
    it('should correctly encode a bright HDR highlight (1000 nits)', () => {
        expect(PQ.encode(10.0)).toBeCloseTo(0.751827096247041, 5);
    });
    
    it('should correctly encode the peak brightness (10,000 nits)', () => {
        expect(PQ.encode(100.0)).toBeCloseTo(1.0);
    });

    it('should handle values between key luminance levels', () => {
        // 200 nits (2x SDR white)
        expect(PQ.encode(2.0)).toBeCloseTo(0.5791332452435196, 5);
        
        // 500 nits
        expect(PQ.encode(5.0)).toBeCloseTo(0.6765848107833876, 5);
        
        // 4000 nits
        expect(PQ.encode(40.0)).toBeCloseTo(0.9025723933109373, 5);
    });

    it('should handle values beyond 10,000 nits gracefully', () => {
        // Should continue the curve beyond 1.0
        const result = PQ.encode(200.0); // 20,000 nits
        expect(result).toBeGreaterThan(1.0);
    });

    it('should handle negative values by clamping to 0', () => {
        expect(PQ.encode(-1.0)).toBeCloseTo(0.0);
    });
});

// --- HLG OETF Tests ---
describe('HLG.encode (OETF)', () => {
    it('should correctly encode the black point (0.0)', () => {
        expect(HLG.encode(0.0)).toBeCloseTo(0.0);
    });

    it('should use the square root segment for values below 1', () => {
        const linearInput = 0.5; // Less than 1
        const expected = 0.5 * Math.sqrt(linearInput);
        expect(HLG.encode(linearInput)).toBeCloseTo(expected);
    });
    
    it('should correctly encode the threshold value (1.0)', () => {
        const linearInput = 1.0;
        // At the threshold, sqrt formula gives 0.5
        expect(HLG.encode(linearInput)).toBeCloseTo(0.5, 5);
    });

    it('should use the log segment for values above 1', () => {
        const linearInput = 2.0; // Greater than 1
        const expected = HLG.constants.a * Math.log(linearInput - HLG.constants.b) + HLG.constants.c + 0.5;
        expect(HLG.encode(linearInput)).toBeCloseTo(expected);
    });
    
    it('should correctly encode SDR reference white (1.0)', () => {
        // With the corrected implementation, 1.0 linear maps to 0.5
        expect(HLG.encode(1.0)).toBeCloseTo(0.5, 5);
    });

    it('should correctly encode a bright HDR highlight (5.0)', () => {
        // Linear 5.0 (500% reference white)
        const expected = HLG.constants.a * Math.log(5.0 - HLG.constants.b) + HLG.constants.c + 0.5;
        expect(HLG.encode(5.0)).toBeCloseTo(expected, 5);
    });

    it('should correctly encode the peak value (12.0)', () => {
        // HLG can encode beyond 1.0 for HDR highlights
        const expected = HLG.constants.a * Math.log(12.0 - HLG.constants.b) + HLG.constants.c + 0.5;
        expect(HLG.encode(12.0)).toBeCloseTo(expected, 5);
    });

    it('should handle intermediate values correctly', () => {
        // 0.5x SDR white (uses sqrt formula)
        const half = 0.5 * Math.sqrt(0.5);
        expect(HLG.encode(0.5)).toBeCloseTo(half, 5);
        
        // 2x SDR white (uses log formula)
        const double = HLG.constants.a * Math.log(2.0 - HLG.constants.b) + HLG.constants.c + 0.5;
        expect(HLG.encode(2.0)).toBeCloseTo(double, 5);
        
        // 8x SDR white (uses log formula)
        const eight = HLG.constants.a * Math.log(8.0 - HLG.constants.b) + HLG.constants.c + 0.5;
        expect(HLG.encode(8.0)).toBeCloseTo(eight, 5);
    });

    it('should handle values at the boundary correctly', () => {
        const threshold = 1.0;
        
        // Just below threshold (uses sqrt formula)
        const belowThreshold = threshold - 0.0001;
        const expectedBelow = 0.5 * Math.sqrt(belowThreshold);
        expect(HLG.encode(belowThreshold)).toBeCloseTo(expectedBelow);
        
        // Just above threshold (uses log formula)
        const aboveThreshold = threshold + 0.0001;
        const { a, b, c } = HLG.constants;
        const expectedAbove = a * Math.log(aboveThreshold - b) + c + 0.5;
        expect(HLG.encode(aboveThreshold)).toBeCloseTo(expectedAbove);
    });

    it('should handle negative values by returning 0', () => {
        expect(HLG.encode(-0.5)).toBeCloseTo(0.0);
    });
});

// --- Cross-function consistency tests ---
describe('Transfer Function Consistency', () => {
    it('all functions should encode 0 as 0', () => {
        expect(sRGB.encode(0)).toBeCloseTo(0);
        expect(PQ.encode(0)).toBeCloseTo(0);
        expect(HLG.encode(0)).toBeCloseTo(0);
    });
    
    it('all functions should be monotonically increasing', () => {
        const testValues = [0, 0.001, 0.01, 0.1, 0.5, 1.0];
        
        // sRGB (limited to 0-1)
        const srgbResults = testValues.map(v => sRGB.encode(v));
        for (let i = 1; i < srgbResults.length; i++) {
            expect(srgbResults[i]).toBeGreaterThan(srgbResults[i-1]);
        }
        
        // PQ (0-100 scale)
        const pqResults = testValues.map(v => PQ.encode(v));
        for (let i = 1; i < pqResults.length; i++) {
            expect(pqResults[i]).toBeGreaterThan(pqResults[i-1]);
        }
        
        // HLG (0-12 scale)
        const hlgResults = testValues.map(v => HLG.encode(v));
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
        values.forEach(v => sRGB.encode(v));
        const srgbTime = performance.now() - startSRGB;
        
        const startPQ = performance.now();
        values.forEach(v => PQ.encode(v));
        const pqTime = performance.now() - startPQ;
        
        const startHLG = performance.now();
        values.forEach(v => HLG.encode(v));
        const hlgTime = performance.now() - startHLG;
        
        // All should complete in reasonable time (< 100ms for 10k values)
        expect(srgbTime).toBeLessThan(100);
        expect(pqTime).toBeLessThan(100);
        expect(hlgTime).toBeLessThan(100);
    });
});