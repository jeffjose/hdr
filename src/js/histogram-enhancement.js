// Enhanced histogram visualization functions

// Global settings for histogram visualization
let histogramVisualization = 'area'; // 'bars', 'line', 'area', 'step', 'curve'
let histogramScale = 'log'; // 'linear', 'log', 'sqrt'

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
        
        // Apply scale transformation
        if (histogramScale === 'log' && histogram.luminance[i] > 0) {
            value = Math.log10(1 + value * 99) / 2; // Log scale with adjustable range
        } else if (histogramScale === 'sqrt') {
            value = Math.sqrt(value);
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
    
    // Return different trace types based on visualization mode
    switch (histogramVisualization) {
        case 'bars':
            return {
                x: histX,
                y: histY,
                type: 'bar',
                name: 'Luminance',
                marker: {
                    color: `rgba(${rgbStr}, 0.3)`,
                    line: {
                        color: `rgba(${rgbStr}, 0.5)`,
                        width: 0.5
                    }
                },
                width: histogram.binWidth * 0.9,
                hovertemplate: 'Bin: %{x:.3f}<br>Intensity: %{y:.2%}<extra></extra>',
                showlegend: false
            };
            
        case 'line':
            return {
                x: histX,
                y: histY,
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Luminance',
                line: {
                    color: `rgba(${rgbStr}, 0.8)`,
                    width: 2
                },
                marker: {
                    color: `rgba(${rgbStr}, 0.6)`,
                    size: 3
                },
                hovertemplate: 'Value: %{x:.3f}<br>Intensity: %{y:.2%}<extra></extra>',
                showlegend: true
            };
            
        case 'area':
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
            
        case 'step':
            return {
                x: histX,
                y: histY,
                type: 'scatter',
                mode: 'lines',
                name: 'Luminance',
                line: {
                    color: `rgba(${rgbStr}, 0.7)`,
                    width: 1.5,
                    shape: 'hv' // Horizontal-vertical steps
                },
                hovertemplate: 'Bin: %{x:.3f}<br>Intensity: %{y:.2%}<extra></extra>',
                showlegend: true
            };
            
        case 'curve':
            // Smooth curve with interpolation
            const curvePoints = 200;
            const curveX = Array.from({length: curvePoints}, (_, i) => i / (curvePoints - 1));
            const curveY = curveX.map(x => {
                // Find surrounding bins for interpolation
                const binIndex = x / histogram.binWidth;
                const lowerBin = Math.floor(binIndex);
                const upperBin = Math.ceil(binIndex);
                
                if (lowerBin >= histogram.bins) return 0;
                if (upperBin >= histogram.bins) return histY[lowerBin] || 0;
                
                const t = binIndex - lowerBin;
                const lower = histY[lowerBin] || 0;
                const upper = histY[upperBin] || 0;
                
                // Cubic interpolation for smoother curves
                return lower * (1 - t) + upper * t;
            });
            
            return {
                x: curveX,
                y: curveY,
                type: 'scatter',
                mode: 'lines',
                name: 'Luminance',
                line: {
                    color: `rgba(${rgbStr}, 0.8)`,
                    width: 2.5,
                    shape: 'spline',
                    smoothing: 1.3
                },
                fill: 'tozeroy',
                fillcolor: `rgba(${rgbStr}, 0.1)`,
                hovertemplate: 'Value: %{x:.3f}<br>Intensity: %{y:.2%}<extra></extra>',
                showlegend: true
            };
            
        default:
            return null;
    }
}

// Function to add histogram controls to the UI
function addHistogramControls() {
    // Check if controls already exist
    if (document.getElementById('histogramVizSelect')) return;
    
    // Find the histogram toggle checkbox
    const histogramCheckbox = document.getElementById('showHistogram');
    if (!histogramCheckbox) return;
    
    // Find the histogram toggle's parent container
    const histogramToggle = histogramCheckbox.closest('label');
    if (!histogramToggle) return;
    
    // Create container for histogram style controls
    const histogramControlsContainer = document.createElement('div');
    histogramControlsContainer.id = 'histogramControls';
    histogramControlsContainer.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-left: 4px;';
    histogramControlsContainer.className = 'histogram-controls';
    
    // Create visualization type selector (compact dropdown)
    const vizSelect = document.createElement('select');
    vizSelect.id = 'histogramVizSelect';
    vizSelect.className = 'bg-dark-panel text-dark-text border border-dark-border px-1.5 py-0.5 rounded text-[10px] focus:outline-none focus:border-brand-blue';
    vizSelect.style.cssText = 'height: 24px; min-width: 60px;';
    
    const vizOptions = [
        { value: 'area', text: 'Area' },
        { value: 'curve', text: 'Curve' },
        { value: 'line', text: 'Line' },
        { value: 'bars', text: 'Bars' },
        { value: 'step', text: 'Steps' }
    ];
    
    vizOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.value === histogramVisualization) {
            option.selected = true;
        }
        vizSelect.appendChild(option);
    });
    
    // Create scale selector (compact dropdown)
    const scaleSelect = document.createElement('select');
    scaleSelect.id = 'histogramScaleSelect';
    scaleSelect.className = 'bg-dark-panel text-dark-text border border-dark-border px-1.5 py-0.5 rounded text-[10px] focus:outline-none focus:border-brand-blue';
    scaleSelect.style.cssText = 'height: 24px; min-width: 45px;';
    
    const scaleOptions = [
        { value: 'linear', text: 'Lin' },
        { value: 'log', text: 'Log' },
        { value: 'sqrt', text: 'Sqrt' }
    ];
    
    scaleOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.value === histogramScale) {
            option.selected = true;
        }
        scaleSelect.appendChild(option);
    });
    
    // Add event listeners
    vizSelect.addEventListener('change', (e) => {
        histogramVisualization = e.target.value;
        if (typeof updateGraphs === 'function') {
            updateGraphs();
        }
    });
    
    scaleSelect.addEventListener('change', (e) => {
        histogramScale = e.target.value;
        if (typeof updateGraphs === 'function') {
            updateGraphs();
        }
    });
    
    // Assemble the controls
    histogramControlsContainer.appendChild(vizSelect);
    histogramControlsContainer.appendChild(scaleSelect);
    
    // Insert after the histogram toggle
    if (histogramToggle.parentNode) {
        histogramToggle.parentNode.insertBefore(histogramControlsContainer, histogramToggle.nextSibling);
    }
    
    // Function to toggle visibility based on checkbox state
    function updateHistogramControlsVisibility() {
        if (histogramCheckbox.checked) {
            histogramControlsContainer.style.display = 'flex';
        } else {
            histogramControlsContainer.style.display = 'none';
        }
    }
    
    // Set initial visibility
    updateHistogramControlsVisibility();
    
    // Listen for checkbox changes
    histogramCheckbox.addEventListener('change', updateHistogramControlsVisibility);
}

// Export functions for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createHistogramTrace,
        addHistogramControls,
        histogramVisualization,
        histogramScale
    };
}