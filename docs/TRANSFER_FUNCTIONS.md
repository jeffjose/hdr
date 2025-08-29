# Transfer Functions Analysis - HDR Image Analyzer

## Executive Summary

After thorough analysis of the transfer function implementations in the HDR Image Analyzer, I've identified and fixed several critical issues. The application implements three transfer functions (sRGB, PQ, and HLG) with both OETF and EOTF modes.

## Issues Found and Fixed

### 1. ~~**CONCEPTUAL CONFUSION: EOTF vs OETF Graphs Are Inverted**~~ ✅ FIXED

The most significant issue was that the EOTF and OETF implementations were conceptually backwards in how they were graphed:

- **EOTF Mode Problem**: The code was graphing the INVERSE of the EOTF (i.e., the OETF) when in EOTF mode
- **What it was doing**: Given a brightness value, finding what signal would produce that brightness
- **What it should do**: Given a signal value, show what brightness it produces

#### Fix Applied:
```javascript
// BEFORE: Wrong axis configuration
x: brightnessValues,
y: brightnessValues.map(brightness => {
    const linear = brightness / srgbPeak;
    return TransferFunctions.sRGB.encode(linear);  // This was OETF, not EOTF!
})

// AFTER: Correct EOTF implementation
x: signalValues,
y: signalValues.map(signal => {
    const linear = TransferFunctions.sRGB.decode(signal);  // Proper EOTF
    return linear * 100; // Convert to cd/m²
})
```

The axes have been swapped: X-axis is now Input Signal (0-1), Y-axis is Output Brightness (cd/m²).

### 2. ~~**HLG Implementation Issues**~~ ✅ PARTIALLY FIXED

The HLG implementation had several problems:

#### a) ~~Missing System Gamma in Forward EOTF~~ ✅ FIXED
The decode function only implemented the inverse OETF, not the full EOTF which should include the system gamma.

**Fix Applied:**
```javascript
// AFTER: Proper HLG EOTF with system gamma
y: signalValues.map(signal => {
    // HLG EOTF: Signal → Inverse OETF → Scene light → System gamma → Display light
    const sceneLight = TransferFunctions.HLG.decode(signal);
    const normalizedDisplay = Math.pow(sceneLight, 1.2); // Apply system gamma
    return normalizedDisplay * peakBrightness; // Scale to peak brightness
})
```

#### b) Incorrect inverseEOTF Function ⚠️ STILL EXISTS
The code still has the conceptually wrong `inverseEOTF` function that should be removed or properly renamed:
```javascript
// This function is still in the code but not used after fixes
inverseEOTF: (normalizedBrightness, peakNits = 1000) => {
    const sceneLight = Math.pow(normalizedBrightness, 1/1.2);
    return TransferFunctions.HLG.encode(sceneLight);
}
```

### 3. **PQ Scaling and Range Issues**

#### a) Inconsistent Normalization
The PQ implementation expects normalized input (0-1) but the comments and actual usage are inconsistent:
- Line 24: "Input: relative linear light (0-1 SDR, >1 for HDR)"
- But PQ is an absolute luminance standard, not relative

#### b) Missing Peak Luminance Scaling
PQ should work with absolute luminance values (0-10,000 cd/m²), but the implementation treats it as normalized 0-1.

### 4. **sRGB Issues**

#### a) Incorrect Terminology
The code uses "encode" and "decode" but these should be:
- `encode` → Should be called `OETF` (linear to non-linear)
- `decode` → Should be called `EOTF` (non-linear to linear)

#### b) Limited to SDR
The sRGB implementation correctly clamps at 1.0 in combined view but doesn't handle extended range sRGB.

## Detailed Function Analysis

### sRGB Transfer Functions

```javascript
// Current Implementation (lines 4-18)
sRGB: {
    encode: (linear) => {  // This is actually OETF
        if (linear <= 0.0031308) {
            return 12.92 * linear;
        } else {
            return 1.055 * Math.pow(linear, 1/2.4) - 0.055;
        }
    },
    decode: (srgb) => {  // This is actually EOTF
        if (srgb <= 0.04045) {
            return srgb / 12.92;
        } else {
            return Math.pow((srgb + 0.055) / 1.055, 2.4);
        }
    }
}
```

**Assessment**: The math is CORRECT but the naming is misleading. These are properly implementing the sRGB transfer functions.

### PQ Transfer Functions

```javascript
// Current Implementation (lines 22-54)
PQ: {
    encode: (linear) => {  // PQ OETF
        const m1 = 0.1593017578125;  // Correct constants
        const m2 = 78.84375;
        const c1 = 0.8359375;
        const c2 = 18.8515625;
        const c3 = 18.6875;
        
        const Y = Math.max(0, linear);
        const Ym1 = Math.pow(Y, m1);
        const num = c1 + c2 * Ym1;
        const den = 1 + c3 * Ym1;
        return Math.pow(num / den, m2);
    },
    decode: (pq) => {  // PQ EOTF
        // Inverse implementation...
    }
}
```

**Assessment**: The mathematical constants and formulas are CORRECT for PQ (ST.2084), but:
- Input/output scaling is unclear (should be 0-10,000 cd/m² normalized to 0-1)
- No documentation of the expected units

### HLG Transfer Functions

```javascript
// Current Implementation (lines 58-96)
HLG: {
    encode: (linear) => {  // HLG OETF
        const a = 0.17883277;  // Correct constants
        const b = 0.28466892;
        const c = 0.55991073;
        
        if (linear <= 0) return 0;
        if (linear <= 1/12) {
            return Math.sqrt(3 * linear);
        } else {
            return a * Math.log(12 * linear - b) + c;
        }
    },
    decode: (hlg) => {  // HLG inverse OETF (NOT the full EOTF!)
        // ...
    }
}
```

**Assessment**: 
- OETF implementation is CORRECT
- The "decode" function is only the inverse OETF, missing the system gamma
- The `inverseEOTF` function is conceptually wrong

## Graph Display Issues

### 1. Axis Configuration Problems

#### EOTF Mode (What it currently does - WRONG):
- **X-axis**: Output Brightness (cd/m²) - Should be Input Signal
- **Y-axis**: Digital Values (0-1) - Should be Output Brightness
- **Result**: Shows inverse EOTF curves (OETF curves)

#### OETF Mode (Currently CORRECT):
- **X-axis**: Linear Light Input
- **Y-axis**: Encoded Signal Output
- **Result**: Correctly shows OETF curves

### 2. Range Issues

#### sRGB:
- **EOTF mode**: Limited to 100 cd/m² (correct for SDR)
- **OETF mode**: Clamps at 1.0 (correct)

#### PQ:
- **EOTF mode**: Shows 0.1-10,000 cd/m² (correct range)
- **OETF mode**: Extended to 2.5x SDR (arbitrary, should be absolute)

#### HLG:
- **EOTF mode**: Adjustable peak brightness (correct approach)
- **OETF mode**: Extended to 5x SDR (arbitrary)

## Correct Implementations Should Be

### 1. EOTF (Electro-Optical Transfer Function)
**Purpose**: Convert electrical signal to optical output (display brightness)
- **Input**: Digital code values (0-1 or 0-255 or 0-1023)
- **Output**: Display luminance (cd/m²)
- **Graph**: X-axis = Signal, Y-axis = Brightness

### 2. OETF (Opto-Electronic Transfer Function)
**Purpose**: Convert optical input to electrical signal (camera encoding)
- **Input**: Scene luminance (relative or absolute)
- **Output**: Digital code values
- **Graph**: X-axis = Scene Light, Y-axis = Signal

### 3. Correct HLG EOTF
```javascript
// Correct HLG EOTF implementation
hlgEOTF: (signal, peakLuminance = 1000) => {
    // Step 1: Inverse OETF (signal to scene light)
    const sceneLight = HLG.decode(signal);  // Current decode function
    
    // Step 2: Apply system gamma
    const normalizedDisplay = Math.pow(sceneLight, 1.2);
    
    // Step 3: Scale to peak luminance
    return normalizedDisplay * peakLuminance;
}
```

### 4. Correct PQ Scaling
```javascript
// PQ with proper absolute luminance
pqEOTF: (signal) => {
    const normalized = PQ.decode(signal);  // Current decode gives 0-1
    return normalized * 10000;  // Convert to cd/m²
}

pqOETF: (luminance) => {
    const normalized = luminance / 10000;  // Normalize from cd/m²
    return PQ.encode(normalized);
}
```

## Status of Fixes

### ✅ COMPLETED
1. **Fixed EOTF Graph Display**
   - Swapped X and Y axes in EOTF mode
   - X-axis is now "Input Signal (0-1)"
   - Y-axis is now "Output Brightness (cd/m²)"
   - Using actual EOTF functions, not their inverses

2. **Fixed HLG System Gamma**
   - Implemented proper EOTF with system gamma (γ=1.2)
   - Now correctly follows: Signal → Inverse OETF → Scene light → System gamma → Display light

3. **Fixed PQ Scaling**
   - PQ EOTF now properly outputs absolute luminance (0-10,000 cd/m²)
   - Correctly scales normalized values to nits

### ⚠️ REMAINING ISSUES

1. **Remove inverseEOTF Function**
   - The confusing `inverseEOTF` function still exists in HLG object
   - Should be removed or properly renamed

2. **Improve Naming**
   - Still using `encode`/`decode` instead of `oetf`/`eotf`
   - Need clearer comments about direction and units

3. **Add Hover Functionality for EOTF**
   - OETF mode has hover pixel highlighting
   - EOTF mode needs the same feature

4. **Add Validation**
   - Need input range checking
   - Need unit tests for transfer functions
   - Need validation against reference implementations

## Mathematical Accuracy Assessment

### ✅ CORRECT Mathematics:
- sRGB formulas and constants
- PQ formulas and constants
- HLG OETF formulas and constants

### ❌ INCORRECT Concepts:
- EOTF graphs showing OETF curves
- HLG missing system gamma in EOTF
- Confusion between inverse operations

### ⚠️ UNCLEAR/AMBIGUOUS:
- PQ input/output units and scaling
- Extended range handling for HDR
- Peak brightness application points

## Conclusion

The HDR Image Analyzer has mathematically correct transfer function implementations but suffers from:
1. **Fundamental conceptual error** in EOTF graph display (showing inverse curves)
2. **Incomplete HLG EOTF** implementation (missing system gamma)
3. **Confusing naming** conventions (encode/decode vs OETF/EOTF)
4. **Unclear scaling** especially for PQ absolute luminance

The core mathematics are sound, but the presentation and conceptual framework need significant revision to accurately represent how these transfer functions work in practice.

## Test Cases for Validation

To verify the corrections, test these values:

### sRGB:
- Signal 0.5 → Linear ~0.2140 (EOTF)
- Linear 0.5 → Signal ~0.7354 (OETF)

### PQ (normalized):
- Signal 0.5 → Linear ~0.0089 (EOTF)
- Linear 0.01 → Signal ~0.5081 (OETF)

### HLG:
- Signal 0.5 → Scene Light 0.0833 → Display ~0.0516 (with γ=1.2)
- Scene Light 0.5 → Signal ~0.7788 (OETF)