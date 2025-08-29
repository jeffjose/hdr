// Enhanced histogram visualization functions

// Fixed settings for histogram visualization - area style with log scale

// Helper function to create histogram trace with multiple visualization options
function createHistogramTrace(histogram, scaleFactor = 0.3, baseColor = [255, 255, 255], transformFunc = null) {
    if (!histogram || !histogram.luminance) return null;
    
    const histX = [];
    const histY = [];
    const maxHistValue = Math.max(...histogram.luminance);
    
    // Prevent division by zero
    if (maxHistValue === 0) return null;
    
    // Calculate histogram values
    for (let i = 0; i < histogram.bins; i++) {
        const x = (i + 0.5) * histogram.binWidth;
        histX.push(x);
        
        let value = histogram.luminance[i] / maxHistValue;
        
        // Apply log scale transformation
        if (histogram.luminance[i] > 0) {
            value = Math.log10(1 + value * 99) / 2; // Log scale with adjustable range
        }
        
        // Apply transfer function transformation if provided
        if (transformFunc && x > 0) {
            const transferValue = transformFunc(x);
            value = value * transferValue * scaleFactor;
        } else {
            value = value * scaleFactor;
        }
        
        histY.push(value);
    }
    
    // Create color strings
    const rgbStr = `${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}`;
    
    // Return area style histogram (fixed visualization)
    // Add boundary points for proper area fill
    const areaX = [0, ...histX, 1];
    const areaY = [0, ...histY, 0];
    return {
        x: areaX,
        y: areaY,
        type: 'scatter',
        mode: 'lines',
        name: 'Luminance',
        line: {
            color: `rgba(${rgbStr}, 0.7)`,
            width: 2,
            shape: 'spline',
            smoothing: 1.0
        },
        fill: 'tozeroy',
        fillcolor: `rgba(${rgbStr}, 0.15)`,
        hovertemplate: 'Value: %{x:.3f}<br>Intensity: %{y:.2%}<extra></extra>',
        showlegend: true
    };
}

// Function to add histogram controls to the UI
// Note: No controls needed anymore - histogram is fixed to area style with log scale
function addHistogramControls() {
    // No controls to add - using fixed area visualization with log scale
    return;
}

// Export functions for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createHistogramTrace,
        addHistogramControls
    };
}