// Transfer function implementations
const TransferFunctions = {
    // sRGB transfer function
    sRGB: {
        encode: (linear) => {
            if (linear <= 0.0031308) {
                return 12.92 * linear;
            } else {
                return 1.055 * Math.pow(linear, 1/2.4) - 0.055;
            }
        },
        decode: (srgb) => {
            if (srgb <= 0.04045) {
                return srgb / 12.92;
            } else {
                return Math.pow((srgb + 0.055) / 1.055, 2.4);
            }
        }
    },
    
    // PQ (Perceptual Quantizer) - ST.2084
    PQ: {
        // PQ expects absolute luminance normalized to 10,000 nits
        // Input: relative linear light (0-1 SDR = 0-100 nits, >1 for HDR)
        // Output: PQ signal value (0.508 for 100 nits, 1.0 for 10,000 nits)
        encode: (linear) => {
            // PQ constants
            const m1 = 0.1593017578125;
            const m2 = 78.84375;
            const c1 = 0.8359375;
            const c2 = 18.8515625;
            const c3 = 18.6875;
            
            // Convert from relative (1.0 = 100 nits) to absolute (1.0 = 10,000 nits)
            // linear * 100 gives us nits, then divide by 10,000 for PQ normalization
            const Y = Math.max(0, linear * 0.01); // 100/10000 = 0.01
            const Ym1 = Math.pow(Y, m1);
            const num = c1 + c2 * Ym1;
            const den = 1 + c3 * Ym1;
            return Math.pow(num / den, m2);
        },
        decode: (pq) => {
            const m1 = 0.1593017578125;
            const m2 = 78.84375;
            const c1 = 0.8359375;
            const c2 = 18.8515625;
            const c3 = 18.6875;
            
            const E = Math.max(0, pq);
            const Em1 = Math.pow(E, 1/m2);
            const num = Math.max(0, Em1 - c1);
            const den = c2 - c3 * Em1;
            if (den === 0) return 0;
            // Returns absolute luminance (0-1 where 1 = 10,000 nits)
            // Convert back to relative (1.0 = 100 nits) by multiplying by 100
            return Math.pow(num / den, 1/m1) * 100; // Convert from PQ normalized to relative
        }
    },
    
    // HLG (Hybrid Log-Gamma) - BT.2100
    HLG: {
        // HLG OETF (Opto-Electronic Transfer Function)
        // Based on ITU-R BT.2100-2
        encode: (linear) => {
            const a = 0.17883277;
            const b = 1 - 4 * a; // 0.28466892
            const c = 0.5 - a * Math.log(4 * a); // 0.55991073

            if (linear <= 0) return 0;

            // The HLG formula is specified for E, where E is normalized to 1.0 for peak display luminance.
            // The graph's `linear` input has 1.0 as 100 nits (SDR ref white).
            // We must convert it to the normalized E value.
            const E = (linear * 100) / peakBrightness;

            if (E <= 1 / 12) {
                return Math.sqrt(3) * Math.pow(E, 0.5);
            } else {
                return a * Math.log(12 * E - b) + c;
            }
        },
        // HLG inverse OETF (EOTF uses this)
        decode: (hlg) => {
            const a = 0.17883277;
            const b = 1 - 4 * a; // 0.28466892
            const c = 0.5 - a * Math.log(4 * a); // 0.55991073

            if (hlg < 0) return 0;
            
            let E;
            if (hlg <= 0.5) { // Signal 0.5 corresponds to E = 1/12
                E = Math.pow(hlg, 2) / 3;
            } else {
                E = (Math.exp((hlg - c) / a) + b) / 12;
            }

            // The formula gives us E, which is normalized to peak brightness.
            // We must convert back to relative linear where 1.0 = 100 nits.
            return (E * peakBrightness) / 100;
        },
        // This function is kept for potential future use, but the primary decoding
        // for the EOTF graph is now handled by the main `decode` function.
        inverseEOTF: (normalizedBrightness, peakNits = 1000) => {
            // HLG EOTF: Display_light = (OETF^-1(signal))^gamma
            // Inverse: signal = OETF(Display_light^(1/gamma))
            
            // First, undo the system gamma (typically 1.2)
            const sceneLight = Math.pow(normalizedBrightness, 1/1.2);
            
            // Then encode using HLG OETF to get the signal
            // Note: This requires the `encode` function to be aware of the peakNits context.
            const originalPeak = peakBrightness;
            peakBrightness = peakNits; // Temporarily set context for encode
            const signal = TransferFunctions.HLG.encode(sceneLight * (peakNits / 100));
            peakBrightness = originalPeak; // Restore context
            return signal;
        }
    }
};

// Global variables
let imageData = null;
let canvas = null;
let ctx = null;
let currentHoverPixel = null;
let viewMode = 'combined'; // 'separate' or 'combined'
let transferMode = localStorage.getItem('transferMode') || 'eotf'; // 'oetf' or 'eotf'
let peakBrightness = 1000; // Peak brightness in nits
let histogram = null; // Store histogram data
let updateGraphTimeout = null; // For debouncing graph updates
let lastUpdateTime = 0; // For throttling

// Initialize graphs
function initializeGraphs() {
    if (transferMode === 'eotf') {
        initializeEOTFGraphs();
    } else {
        initializeOETFGraphs();
    }
}

// Initialize EOTF graphs (encoded input -> brightness output)
function initializeEOTFGraphs() {
    // Only initialize graphs based on current view mode
    if (viewMode === 'combined') {
        initializeCombinedEOTFGraph();
    } else {
        initializeSeparateEOTFGraphs();
    }
}

function initializeSeparateEOTFGraphs() {
    const sdrLayout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 30, r: 30, b: 60, l: 60 },
        xaxis: {
            title: 'Input Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            type: 'log',
            range: [-1, Math.log10(peakBrightness) + 0.5],
            tickmode: 'array',
            tickvals: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10),
            ticktext: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10).map(v => v < 1000 ? String(v) : `${v/1000}k`)
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        }
    };
    
    const config = {
        responsive: true,
        displayModeBar: false,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage']
    };
    
    // Generate signal values (0-1)
    const numPoints = 100;
    const signalValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // sRGB EOTF - SDR standard is 100 nits
    const srgbPeak = 100; // sRGB is SDR, always 100 nits
    const srgbLayout = {...sdrLayout, 
        title: 'sRGB EOTF (100 nits SDR)',
        yaxis: {
            ...sdrLayout.yaxis,
            range: [-1, Math.log10(srgbPeak) + 0.5],
            tickvals: [0.1, 1, 10, 100],
            ticktext: ['0.1', '1', '10', '100']
        }
    };
    Plotly.newPlot('srgbGraph', [{
        x: signalValues,
        y: signalValues.map(signal => {
            const linear = TransferFunctions.sRGB.decode(signal);
            return linear * srgbPeak; // Convert to cd/m²
        }),
        type: 'scatter',
        mode: 'lines',
        name: 'sRGB',
        line: { color: '#00bcd4', width: 2 },
        hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
    }], srgbLayout, config);
    
    // PQ EOTF (absolute brightness)
    const pqLayout = {
        ...sdrLayout,
        title: 'PQ EOTF (ST.2084)',
        yaxis: {
            ...sdrLayout.yaxis,
            range: [-1, 4],  // 0.1 to 10000 nits
            tickvals: [0.1, 1, 10, 100, 1000, 10000],
            ticktext: ['0.1', '1', '10', '100', '1k', '10k']
        }
    };
    Plotly.newPlot('pqGraph', [{
        x: signalValues,
        y: signalValues.map(signal => {
            const normalized = TransferFunctions.PQ.decode(signal);
            return normalized * 10000; // Convert to cd/m²
        }),
        type: 'scatter',
        mode: 'lines',
        name: 'PQ',
        line: { color: '#ff9800', width: 2 },
        hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
    }], pqLayout, config);
    
    // HLG EOTF (relative to display peak)
    const hlgLayout = {
        ...sdrLayout,
        title: `HLG EOTF (Peak: ${peakBrightness} cd/m²)`,
        yaxis: {
            ...sdrLayout.yaxis,
            range: [-1, Math.log10(peakBrightness) + 0.5],
            tickvals: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10),
            ticktext: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10).map(v => v < 1000 ? String(v) : `${v/1000}k`)
        }
    };
    Plotly.newPlot('hlgGraph', [{
        x: signalValues,
        y: signalValues.map(signal => {
            // HLG EOTF: Signal → Inverse OETF → Scene light → System gamma → Display light
            const sceneLight = TransferFunctions.HLG.decode(signal);
            const normalizedDisplay = Math.pow(sceneLight, 1.2); // Apply system gamma
            return normalizedDisplay * peakBrightness; // Scale to peak brightness
        }),
        type: 'scatter',
        mode: 'lines',
        name: 'HLG',
        line: { color: '#9c27b0', width: 2 },
        hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
    }], hlgLayout, config);
}

// Initialize OETF graphs (brightness input -> encoded output)
function initializeOETFGraphs() {
    // Only initialize graphs based on current view mode
    if (viewMode === 'combined') {
        initializeCombinedGraph();
    } else {
        initializeSeparateOETFGraphs();
    }
}

function initializeSeparateOETFGraphs() {
    const baseLayout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 30, r: 30, b: 60, l: 60 },
        xaxis: {
            title: 'Scene Light Intensity (Linear)',
            gridcolor: '#333',
            zerolinecolor: '#555'
        },
        yaxis: {
            title: 'Encoded Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05]
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        }
    };
    
    const config = {
        responsive: true,
        displayModeBar: false,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage']
    };
    
    const numPoints = 200;
    
    // sRGB: Can only encode up to 100 nits SDR
    const srgbLayout = {
        ...baseLayout,
        title: 'sRGB OETF (SDR only)',
        xaxis: {
            ...baseLayout.xaxis,
            title: 'Scene Light Intensity (nits)',
            range: [0, 200],
            dtick: 50
        }
    };
    const srgbNits = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 200);
    const srgbY = srgbNits.map(nits => {
        const relative = nits / 100;
        return relative <= 1 ? TransferFunctions.sRGB.encode(relative) : 1.0;
    });
    
    Plotly.newPlot('srgbGraph', [{
        x: srgbNits,
        y: srgbY,
        type: 'scatter',
        mode: 'lines',
        name: 'sRGB',
        line: { color: '#00bcd4', width: 2 },
        hovertemplate: 'Scene: %{x:.0f} nits<br>Signal: %{y:.3f}<extra></extra>'
    }], srgbLayout, config);
    
    // PQ: Can encode up to 10,000 nits
    const pqLayout = {
        ...baseLayout,
        title: 'PQ OETF (ST.2084)',
        xaxis: {
            ...baseLayout.xaxis,
            title: 'Scene Light Intensity (nits)',
            range: [0, 10000],
            dtick: 2000
        }
    };
    const pqNits = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 10000);
    const pqY = pqNits.map(nits => TransferFunctions.PQ.encode(nits / 100));
    
    Plotly.newPlot('pqGraph', [{
        x: pqNits,
        y: pqY,
        type: 'scatter',
        mode: 'lines',
        name: 'PQ',
        line: { color: '#ff9800', width: 2 },
        hovertemplate: 'Scene: %{x:.0f} nits<br>Signal: %{y:.3f}<extra></extra>'
    }], pqLayout, config);
    
    // HLG: Relative encoding, can handle HDR
    const hlgLayout = {
        ...baseLayout,
        title: 'HLG OETF (BT.2100)',
        xaxis: {
            ...baseLayout.xaxis,
            title: 'Scene Light Intensity (nits, relative)',
            range: [0, 1200],
            dtick: 200
        }
    };
    const hlgNits = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 1200);
    const hlgY = hlgNits.map(nits => TransferFunctions.HLG.encode(nits / 100));
    
    Plotly.newPlot('hlgGraph', [{
        x: hlgNits,
        y: hlgY,
        type: 'scatter',
        mode: 'lines',
        name: 'HLG',
        line: { color: '#9c27b0', width: 2 },
        hovertemplate: 'Scene: %{x:.0f} nits<br>Signal: %{y:.3f}<extra></extra>'
    }], hlgLayout, config);
}

// Initialize combined EOTF graph
function initializeCombinedEOTFGraph() {
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 40, r: 30, b: 60, l: 70 },
        xaxis: {
            title: 'Input Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05],
            dtick: 0.2
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            type: 'log',
            range: [-1, 4],  // Log scale: 10^-1 (0.1) to 10^4 (10000)
            tickmode: 'array',
            tickvals: [0.1, 1, 10, 100, 1000, 10000],
            ticktext: ['0.1', '1', '10', '100', '1k', '10k']
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        },
        title: 'EOTF (Display Response Curves)'
    };
    
    const config = {
        responsive: true,
        displayModeBar: false
    };
    
    // Generate signal values (0-1)
    const numPoints = 100;
    const signalValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    const traces = [
        {
            x: signalValues,
            y: signalValues.map(signal => {
                // sRGB EOTF: signal -> linear -> brightness
                const linear = TransferFunctions.sRGB.decode(signal);
                return linear * 100; // sRGB peak is 100 nits
            }),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB (100 nits SDR)',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
        },
        {
            x: signalValues,
            y: signalValues.map(signal => {
                // PQ EOTF: signal -> brightness (decode already returns nits)
                return TransferFunctions.PQ.decode(signal);
            }),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ (10000 nits)',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
        },
        {
            x: signalValues,
            y: signalValues.map(signal => {
                // HLG EOTF: signal -> scene light -> system gamma -> brightness
                const sceneLight = TransferFunctions.HLG.decode(signal);
                const normalizedDisplay = Math.pow(sceneLight, 1.2); // Apply system gamma
                return normalizedDisplay * peakBrightness;
            }),
            type: 'scatter',
            mode: 'lines',
            name: `HLG (${peakBrightness} nits)`,
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
        }
    ];
    
    console.time('Plotly.newPlot-EOTF');
    Plotly.newPlot('combinedGraph', traces, layout, config);
    console.timeEnd('Plotly.newPlot-EOTF');
}

// Initialize combined OETF graph
function initializeCombinedGraph() {
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 40, r: 30, b: 60, l: 70 },
        xaxis: {
            title: 'Linear Intensity',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 6],
            // dtick removed - Plotly will auto-adjust based on zoom
            autorange: false,
            fixedrange: false  // Allow zooming via axis drag
        },
        yaxis: {
            title: 'Encoded Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05],
            // dtick removed - Plotly will auto-adjust based on zoom
            autorange: false,
            fixedrange: false  // Allow zooming via axis drag
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        },
        title: 'OETF (Camera Encoding Curves)',
        annotations: [
            {
                x: 1,
                y: 1.0,
                xref: 'x',
                yref: 'y',
                text: 'Reference<br>White',
                showarrow: true,
                arrowhead: 2,
                arrowsize: 1,
                arrowwidth: 1,
                arrowcolor: '#666',
                ax: 30,
                ay: -30,
                font: { size: 10, color: '#999' }
            }
        ]
    };
    
    const config = {
        responsive: true,
        displayModeBar: false
    };
    
    const numPoints = 200;
    // Create linear points from 0 to 12 (relative intensity)
    const xLinear = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 12);
    
    // sRGB: Clips at 1.0
    const srgbY = xLinear.map(v => v <= 1 ? TransferFunctions.sRGB.encode(v) : 1.0);
    
    // HLG: Can encode the full range  
    const hlgY = xLinear.map(v => TransferFunctions.HLG.encode(v));
    
    // PQ: For comparison, though it uses absolute scale
    const pqY = xLinear.map(v => TransferFunctions.PQ.encode(v));
    
    const traces = [
        {
            x: xLinear,
            y: srgbY,
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'sRGB<br>Linear: %{x:.2f}<br>Signal: %{y:.3f}<extra></extra>'
        },
        {
            x: xLinear,
            y: hlgY,
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'HLG<br>Linear: %{x:.2f}<br>Signal: %{y:.3f}<extra></extra>'
        },
        {
            x: xLinear,
            y: pqY,
            type: 'scatter',
            mode: 'lines',
            name: 'PQ (ST.2084)',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'PQ<br>Linear: %{x:.2f} (~%{text})<br>Signal: %{y:.3f}<extra></extra>',
            text: xLinear.map(v => `${(v * 100).toFixed(0)} nits`)
        }
    ];
    
    Plotly.newPlot('combinedGraph', traces, layout, config);
}

// Calculate histogram from image data
function calculateHistogram(imageData) {
    const bins = 100; // Number of histogram bins
    const histogramR = new Array(bins).fill(0);
    const histogramG = new Array(bins).fill(0);
    const histogramB = new Array(bins).fill(0);
    const histogramLuminance = new Array(bins).fill(0);
    
    const data = imageData.data;
    const totalPixels = imageData.width * imageData.height;
    
    for (let i = 0; i < data.length; i += 4) {
        // Get sRGB values (0-1)
        const srgb = {
            r: data[i] / 255,
            g: data[i + 1] / 255,
            b: data[i + 2] / 255
        };
        
        // Convert to linear
        const linear = {
            r: TransferFunctions.sRGB.decode(srgb.r),
            g: TransferFunctions.sRGB.decode(srgb.g),
            b: TransferFunctions.sRGB.decode(srgb.b)
        };
        
        // Calculate luminance (using BT.709 coefficients)
        const luminance = 0.2126 * linear.r + 0.7152 * linear.g + 0.0722 * linear.b;
        
        // Determine bin index (0 to bins-1)
        const binR = Math.min(Math.floor(linear.r * bins), bins - 1);
        const binG = Math.min(Math.floor(linear.g * bins), bins - 1);
        const binB = Math.min(Math.floor(linear.b * bins), bins - 1);
        const binL = Math.min(Math.floor(luminance * bins), bins - 1);
        
        histogramR[binR]++;
        histogramG[binG]++;
        histogramB[binB]++;
        histogramLuminance[binL]++;
    }
    
    // Normalize histograms (convert to percentages)
    const normalize = (hist) => hist.map(count => (count / totalPixels) * 100);
    
    return {
        r: normalize(histogramR),
        g: normalize(histogramG),
        b: normalize(histogramB),
        luminance: normalize(histogramLuminance),
        bins: bins,
        binWidth: 1 / bins
    };
}

// Update graphs
function updateGraphs() {
    if (transferMode === 'eotf') {
        updateEOTFGraphs();
    } else {
        updateOETFGraphs();
    }
}

function updateEOTFGraphs() {
    const showCurves = document.getElementById('showCurves').checked;
    const showHistogram = document.getElementById('showHistogram') ? document.getElementById('showHistogram').checked : false;
    
    // Generate brightness values on log scale
    const numPoints = 100;
    const minBrightness = 0.01;
    
    // Common layout settings
    const darkLayout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 30, r: 30, b: 60, l: 70 },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        }
    };
    
    // Generate signal values (0-1)
    const signalValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // sRGB EOTF - SDR standard is 100 nits
    const srgbPeak = 100; // sRGB is SDR, always 100 nits
    const srgbTraces = [];
    
    // Add histogram if available and enabled - for EOTF, histogram shows signal distribution
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [0, 188, 212]); // Consistent base scale
        if (histTrace) {
            // Use secondary y-axis for histogram with linear scale
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            srgbTraces.push(histTrace);
        }
    }
    
    if (showCurves) {
        srgbTraces.push({
            x: signalValues,
            y: signalValues.map(signal => {
                const linear = TransferFunctions.sRGB.decode(signal);
                return linear * srgbPeak;
            }),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
        });
    }
    
    const srgbLayout = {
        ...darkLayout,
        title: 'sRGB EOTF (100 nits SDR)',
        xaxis: {
            title: 'Input Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            type: 'log',
            range: [-1, Math.log10(srgbPeak) + 0.5],
            tickmode: 'array',
            tickvals: [0.1, 1, 10, 100],
            ticktext: ['0.1', '1', '10', '100']
        },
        yaxis2: {
            // title: 'Histogram (%)',
            // titlefont: { color: '#888' },
            // tickfont: { color: '#888' },
            overlaying: 'y',
            side: 'right',
            range: [0, 0.9],  // Increased range to make histogram 1/3 height
            showgrid: false,
            zeroline: false,
            showticklabels: false,  // Hide tick labels
            showline: false          // Hide axis line
        }
    };
    Plotly.react('srgbGraph', srgbTraces, srgbLayout);
    
    // PQ EOTF
    const pqTraces = [];
    
    // Add histogram for PQ EOTF
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [255, 152, 0]); // Consistent base scale
        if (histTrace) {
            // Use secondary y-axis for histogram with linear scale
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            pqTraces.push(histTrace);
        }
    }
    
    if (showCurves) {
        pqTraces.push({
            x: signalValues,
            y: signalValues.map(signal => {
                // PQ.decode returns value where 1.0 = 100 nits
                return TransferFunctions.PQ.decode(signal);
            }),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
        });
    }
    
    const pqLayout = {
        ...darkLayout,
        title: 'PQ EOTF (ST.2084)',
        xaxis: {
            title: 'Input Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            type: 'log',
            range: [-1, 4],  // 0.1 to 10000 nits
            tickmode: 'array',
            tickvals: [0.1, 1, 10, 100, 1000, 10000],
            ticktext: ['0.1', '1', '10', '100', '1k', '10k']
        },
        yaxis2: {
            // title: 'Histogram (%)',
            // titlefont: { color: '#888' },
            // tickfont: { color: '#888' },
            overlaying: 'y',
            side: 'right',
            range: [0, 0.9],  // Increased range to make histogram 1/3 height
            showgrid: false,
            zeroline: false,
            showticklabels: false,  // Hide tick labels
            showline: false          // Hide axis line
        }
    };
    Plotly.react('pqGraph', pqTraces, pqLayout);
    
    // HLG EOTF
    const hlgTraces = [];
    
    // Add histogram for HLG EOTF
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [156, 39, 176]); // Consistent base scale
        if (histTrace) {
            // Use secondary y-axis for histogram with linear scale
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            hlgTraces.push(histTrace);
        }
    }
    
    if (showCurves) {
        hlgTraces.push({
            x: signalValues,
            y: signalValues.map(signal => {
                // HLG EOTF: Signal → Inverse OETF → Scene light → System gamma → Display light
                const sceneLight = TransferFunctions.HLG.decode(signal);
                const normalizedDisplay = Math.pow(sceneLight, 1.2); // Apply system gamma
                return normalizedDisplay * peakBrightness; // Scale to peak brightness
            }),
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
        });
    }
    
    const hlgLayout = {
        ...darkLayout,
        title: `HLG EOTF (Peak: ${peakBrightness} cd/m²)`,
        xaxis: {
            title: 'Input Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            type: 'log',
            range: [-1, Math.log10(peakBrightness) + 0.5],
            tickmode: 'array',
            tickvals: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10),
            ticktext: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10).map(v => v < 1000 ? String(v) : `${v/1000}k`)
        },
        yaxis2: {
            // title: 'Histogram (%)',
            // titlefont: { color: '#888' },
            // tickfont: { color: '#888' },
            overlaying: 'y',
            side: 'right',
            range: [0, 0.9],  // Increased range to make histogram 1/3 height
            showgrid: false,
            zeroline: false,
            showticklabels: false,  // Hide tick labels
            showline: false          // Hide axis line
        }
    };
    Plotly.react('hlgGraph', hlgTraces, hlgLayout);
    
    // Update combined graph if needed
    if (viewMode === 'combined') {
        updateCombinedGraph();
    }
}

function updateOETFGraphs() {
    const showCurves = document.getElementById('showCurves').checked;
    const showHistogram = document.getElementById('showHistogram') ? document.getElementById('showHistogram').checked : false;
    
    const numPoints = 100; // Reduced for better performance
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // sRGB
    const srgbTraces = [];
    
    // Add histogram if available and enabled
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [0, 188, 212]); // Consistent base scale
        if (histTrace) {
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            srgbTraces.push(histTrace);
        }
    }
    
    if (showCurves) {
        srgbTraces.push({
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.sRGB.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
        });
    }
    
    const darkLayout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 30, r: 50, b: 40, l: 50 },
        xaxis: {
            title: 'Linear Input',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1],
            rangemode: 'tozero',
            fixedrange: false
        },
        yaxis: {
            title: 'Encoded Output',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1],
            rangemode: 'tozero',
            fixedrange: false
        },
        yaxis2: {
            // title: 'Histogram (%)',
            // titlefont: { color: '#888' },
            // tickfont: { color: '#888' },
            overlaying: 'y',
            side: 'right',
            range: [0, 0.9],  // Increased range to make histogram 1/3 height
            showgrid: false,
            zeroline: false,
            showticklabels: false,  // Hide tick labels
            showline: false          // Hide axis line
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        title: 'sRGB OETF (100 nits SDR)',
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        }
    };
    
    Plotly.react('srgbGraph', srgbTraces, darkLayout);
    
    // PQ
    const pqTraces = [];
    
    // Add histogram for PQ
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [255, 152, 0]); // No transform function
        if (histTrace) {
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            pqTraces.push(histTrace);
        }
    }
    
    if (showCurves) {
        pqTraces.push({
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.PQ.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
        });
    }
    
    const pqLayout = {
        ...darkLayout, 
        title: 'PQ OETF (ST.2084)',
        xaxis: {
            ...darkLayout.xaxis,
            title: 'Linear Light Input (0=black, 1=SDR ref, 2.5=HDR peak)',
            range: [0, 2.5]
        },
        yaxis: {
            ...darkLayout.yaxis,
            range: [0, 1.2]
        },
        yaxis2: {
            ...darkLayout.yaxis2
            // range kept at [0, 0.5] from darkLayout
        }
    };
    Plotly.react('pqGraph', pqTraces, pqLayout);
    
    // HLG
    const hlgTraces = [];
    
    // Create extended linear range for HLG (0-12)
    const hlgLinearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 12);
    
    // Add histogram for HLG
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [156, 39, 176]); // No transform function
        if (histTrace) {
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            hlgTraces.push(histTrace);
        }
    }
    
    if (showCurves) {
        hlgTraces.push({
            x: hlgLinearValues,
            y: hlgLinearValues.map(v => TransferFunctions.HLG.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
        });
    }
    
    const hlgLayout = {
        ...darkLayout, 
        title: 'HLG OETF (BT.2100)',
        xaxis: {
            ...darkLayout.xaxis,
            title: 'Linear Light Input (0=black, 1=ref white, 12=peak)',
            range: [0, 6],
            // dtick removed - auto-adjusts with zoom
            rangemode: 'tozero',
            fixedrange: false
        },
        yaxis: {
            ...darkLayout.yaxis,
            range: [0, 1.05],
            rangemode: 'tozero',
            fixedrange: false
        },
        yaxis2: {
            ...darkLayout.yaxis2
            // range kept at [0, 0.5] from darkLayout
        }
    };
    Plotly.react('hlgGraph', hlgTraces, hlgLayout);
    
    // Update combined graph if needed
    if (viewMode === 'combined') {
        updateCombinedGraph();
    }
}

// Highlight pixel on graphs - optimized version
function highlightPixelOnGraphs(pixel) {
    currentHoverPixel = pixel;
    
    // Skip if in combined view - update only combined graph
    if (viewMode === 'combined') {
        updateCombinedGraphHighlight(pixel);
        return;
    }
    
    // Update individual graphs with highlight
    const graphIds = ['srgbGraph', 'pqGraph', 'hlgGraph'];
    const functions = [TransferFunctions.sRGB, TransferFunctions.PQ, TransferFunctions.HLG];
    
    graphIds.forEach((graphId, idx) => {
        const graphDiv = document.getElementById(graphId);
        if (!graphDiv || !graphDiv.data) return;
        
        // Use Plotly.restyle for better performance - just update the hover traces
        const baseTraceCount = graphDiv.data.filter(trace => !trace.name || !trace.name.includes('Hover')).length;
        
        if (pixel) {
            let rData, gData, bData, rY, gY, bY;
            
            if (transferMode === 'eotf') {
                // EOTF mode: show encoded RGB values on X-axis, brightness on Y-axis
                rData = [pixel.srgb.r];
                gData = [pixel.srgb.g];
                bData = [pixel.srgb.b];
                
                // Calculate brightness output for each channel
                if (idx === 0) { // sRGB
                    rY = [pixel.linear.r * 100]; // Convert to nits
                    gY = [pixel.linear.g * 100];
                    bY = [pixel.linear.b * 100];
                } else if (idx === 1) { // PQ
                    rY = [TransferFunctions.PQ.decode(pixel.srgb.r) * 100];
                    gY = [TransferFunctions.PQ.decode(pixel.srgb.g) * 100];
                    bY = [TransferFunctions.PQ.decode(pixel.srgb.b) * 100];
                } else { // HLG
                    const rScene = TransferFunctions.HLG.decode(pixel.srgb.r);
                    const gScene = TransferFunctions.HLG.decode(pixel.srgb.g);
                    const bScene = TransferFunctions.HLG.decode(pixel.srgb.b);
                    rY = [Math.pow(rScene, 1.2) * peakBrightness];
                    gY = [Math.pow(gScene, 1.2) * peakBrightness];
                    bY = [Math.pow(bScene, 1.2) * peakBrightness];
                }
            } else {
                // OETF mode: show linear values on X-axis, encoded on Y-axis
                rData = [pixel.linear.r];
                gData = [pixel.linear.g];
                bData = [pixel.linear.b];
                rY = [functions[idx].encode(pixel.linear.r)];
                gY = [functions[idx].encode(pixel.linear.g)];
                bY = [functions[idx].encode(pixel.linear.b)];
            }
            
            // Check if we need to add or update traces
            if (graphDiv.data.length === baseTraceCount) {
                // Add new hover traces
                const hoverTraces = [
                    {
                        x: rData,
                        y: rY,
                        type: 'scatter',
                        mode: 'markers',
                        name: 'Hover R',
                        marker: { color: '#ff0000', size: 12, line: { color: 'white', width: 2 } },
                        hovertemplate: 'Hover R<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>',
                        showlegend: false
                    },
                    {
                        x: gData,
                        y: gY,
                        type: 'scatter',
                        mode: 'markers',
                        name: 'Hover G',
                        marker: { color: '#00ff00', size: 12, line: { color: 'white', width: 2 } },
                        hovertemplate: 'Hover G<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>',
                        showlegend: false
                    },
                    {
                        x: bData,
                        y: bY,
                        type: 'scatter',
                        mode: 'markers',
                        name: 'Hover B',
                        marker: { color: '#0000ff', size: 12, line: { color: 'white', width: 2 } },
                        hovertemplate: 'Hover B<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>',
                        showlegend: false
                    }
                ];
                Plotly.addTraces(graphId, hoverTraces);
            } else {
                // Update existing hover traces using restyle (much faster)
                Plotly.restyle(graphId, {
                    x: [rData, gData, bData],
                    y: [rY, gY, bY]
                }, [baseTraceCount, baseTraceCount + 1, baseTraceCount + 2]);
            }
        } else {
            // Remove hover traces if they exist
            if (graphDiv.data.length > baseTraceCount) {
                const indicesToRemove = [];
                for (let i = baseTraceCount; i < graphDiv.data.length; i++) {
                    indicesToRemove.push(i);
                }
                Plotly.deleteTraces(graphId, indicesToRemove);
            }
        }
    });
}

// Optimized combined graph highlight update
function updateCombinedGraphHighlight(pixel) {
    const graphDiv = document.getElementById('combinedGraph');
    if (!graphDiv || !graphDiv.data) return;
    
    const baseTraceCount = graphDiv.data.filter(trace => !trace.name || !trace.name.includes('Hover')).length;
    
    if (pixel) {
        const updates = {
            x: [],
            y: []
        };
        
        if (transferMode === 'eotf') {
            // EOTF mode: signal -> brightness
            ['sRGB', 'PQ', 'HLG'].forEach((type) => {
                // X-axis: encoded signal values
                updates.x.push([pixel.srgb.r], [pixel.srgb.g], [pixel.srgb.b]);
                
                // Y-axis: brightness output
                if (type === 'sRGB') {
                    updates.y.push(
                        [pixel.linear.r * 100],
                        [pixel.linear.g * 100],
                        [pixel.linear.b * 100]
                    );
                } else if (type === 'PQ') {
                    updates.y.push(
                        [TransferFunctions.PQ.decode(pixel.srgb.r) * 100],
                        [TransferFunctions.PQ.decode(pixel.srgb.g) * 100],
                        [TransferFunctions.PQ.decode(pixel.srgb.b) * 100]
                    );
                } else { // HLG
                    const rScene = TransferFunctions.HLG.decode(pixel.srgb.r);
                    const gScene = TransferFunctions.HLG.decode(pixel.srgb.g);
                    const bScene = TransferFunctions.HLG.decode(pixel.srgb.b);
                    updates.y.push(
                        [Math.pow(rScene, 1.2) * peakBrightness],
                        [Math.pow(gScene, 1.2) * peakBrightness],
                        [Math.pow(bScene, 1.2) * peakBrightness]
                    );
                }
            });
        } else {
            // OETF mode: linear -> encoded
            ['sRGB', 'PQ', 'HLG'].forEach((type) => {
                const func = type === 'sRGB' ? TransferFunctions.sRGB :
                             type === 'PQ' ? TransferFunctions.PQ : TransferFunctions.HLG;
                
                updates.x.push([pixel.linear.r], [pixel.linear.g], [pixel.linear.b]);
                updates.y.push(
                    [func.encode(pixel.linear.r)],
                    [func.encode(pixel.linear.g)],
                    [func.encode(pixel.linear.b)]
                );
            });
        }
        
        if (graphDiv.data.length === baseTraceCount) {
            // Need to add traces - do full update
            updateCombinedGraph();
        } else {
            // Just update positions using restyle
            const indices = [];
            for (let i = baseTraceCount; i < graphDiv.data.length; i++) {
                indices.push(i);
            }
            Plotly.restyle('combinedGraph', {
                x: updates.x,
                y: updates.y
            }, indices);
        }
    } else {
        // Remove hover traces
        if (graphDiv.data.length > baseTraceCount) {
            const indicesToRemove = [];
            for (let i = baseTraceCount; i < graphDiv.data.length; i++) {
                indicesToRemove.push(i);
            }
            Plotly.deleteTraces('combinedGraph', indicesToRemove);
        }
    }
}

// Update combined graph
function updateCombinedGraph() {
    if (transferMode === 'eotf') {
        updateCombinedEOTFGraph();
    } else {
        updateCombinedOETFGraph();
    }
}

function updateCombinedEOTFGraph() {
    const showCurves = document.getElementById('showCurves').checked;
    const showHistogram = document.getElementById('showHistogram') ? document.getElementById('showHistogram').checked : false;
    
    // Generate signal values (0-1)
    const numPoints = 100;
    const signalValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    const traces = [];
    
    // Add histogram if enabled for EOTF mode
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [255, 255, 255]); // Consistent base scale
        if (histTrace) {
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            histTrace.showlegend = true;
            histTrace.name = 'Histogram';
            traces.push(histTrace);
        }
    }
    
    if (showCurves) {
        traces.push(
            {
                x: signalValues,
                y: signalValues.map(signal => {
                    // sRGB EOTF: signal -> linear -> brightness
                    const linear = TransferFunctions.sRGB.decode(signal);
                    return linear * 100; // sRGB peak is 100 nits
                }),
                type: 'scatter',
                mode: 'lines',
                name: 'sRGB (100 nits SDR)',
                line: { color: '#00bcd4', width: 2 },
                hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
            },
            {
                x: signalValues,
                y: signalValues.map(signal => {
                    // PQ EOTF: signal -> brightness (decode returns nits)
                    return TransferFunctions.PQ.decode(signal);
                }),
                type: 'scatter',
                mode: 'lines',
                name: 'PQ (10000 nits)',
                line: { color: '#ff9800', width: 2 },
                hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
            },
            {
                x: signalValues,
                y: signalValues.map(signal => {
                    // HLG EOTF: signal -> scene light -> system gamma -> brightness
                    const sceneLight = TransferFunctions.HLG.decode(signal);
                    const normalizedDisplay = Math.pow(sceneLight, 1.2); // Apply system gamma
                    return normalizedDisplay * peakBrightness;
                }),
                type: 'scatter',
                mode: 'lines',
                name: `HLG (${peakBrightness} nits)`,
                line: { color: '#9c27b0', width: 2 },
                hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>'
            }
        );
    }
    
    // Add hover pixel if exists for EOTF mode
    if (currentHoverPixel) {
        ['sRGB', 'PQ', 'HLG'].forEach((type) => {
            const symbol = type === 'sRGB' ? 'circle' :
                          type === 'PQ' ? 'square' : 'diamond';
            
            let xR = currentHoverPixel.srgb.r;
            let xG = currentHoverPixel.srgb.g;
            let xB = currentHoverPixel.srgb.b;
            let yR, yG, yB;
            
            if (type === 'sRGB') {
                yR = currentHoverPixel.linear.r * 100;
                yG = currentHoverPixel.linear.g * 100;
                yB = currentHoverPixel.linear.b * 100;
            } else if (type === 'PQ') {
                yR = TransferFunctions.PQ.decode(currentHoverPixel.srgb.r) * 100;
                yG = TransferFunctions.PQ.decode(currentHoverPixel.srgb.g) * 100;
                yB = TransferFunctions.PQ.decode(currentHoverPixel.srgb.b) * 100;
            } else { // HLG
                const rScene = TransferFunctions.HLG.decode(currentHoverPixel.srgb.r);
                const gScene = TransferFunctions.HLG.decode(currentHoverPixel.srgb.g);
                const bScene = TransferFunctions.HLG.decode(currentHoverPixel.srgb.b);
                yR = Math.pow(rScene, 1.2) * peakBrightness;
                yG = Math.pow(gScene, 1.2) * peakBrightness;
                yB = Math.pow(bScene, 1.2) * peakBrightness;
            }
            
            traces.push(
                {
                    x: [xR],
                    y: [yR],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} R`,
                    marker: { color: '#ff0000', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} R<br>Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>`,
                    showlegend: false
                },
                {
                    x: [xG],
                    y: [yG],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} G`,
                    marker: { color: '#00ff00', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} G<br>Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>`,
                    showlegend: false
                },
                {
                    x: [xB],
                    y: [yB],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} B`,
                    marker: { color: '#0000ff', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} B<br>Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>`,
                    showlegend: false
                }
            );
        });
    }
    
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 40, r: 50, b: 60, l: 70 },
        xaxis: {
            title: 'Input Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05],
            dtick: 0.2
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            type: 'log',
            range: [-1, 4],  // Log scale: 10^-1 (0.1) to 10^4 (10000)
            tickmode: 'array',
            tickvals: [0.1, 1, 10, 100, 1000, 10000],
            ticktext: ['0.1', '1', '10', '100', '1k', '10k']
        },
        yaxis2: {
            // title: 'Histogram (%)',
            // titlefont: { color: '#888' },
            // tickfont: { color: '#888' },
            overlaying: 'y',
            side: 'right',
            range: [0, 0.9],  // Increased range to make histogram 1/3 height
            showgrid: false,
            zeroline: false,
            showticklabels: false,  // Hide tick labels
            showline: false          // Hide axis line
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        title: 'EOTF (Display Response Curves)',
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        }
    };
    
    Plotly.react('combinedGraph', traces, layout);
}

function updateCombinedOETFGraph() {
    const showCurves = document.getElementById('showCurves').checked;
    const showHistogram = document.getElementById('showHistogram') ? document.getElementById('showHistogram').checked : false;
    
    const numPoints = 200;
    // Create linear points from 0 to 12 (relative intensity where 1.0 = 100 nits SDR)
    const xLinear = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 12);
    
    const traces = [];
    
    // Add histogram if enabled
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [255, 255, 255]); // No transform function
        if (histTrace) {
            histTrace.yaxis = 'y2';
            histTrace.opacity = 0.3;
            histTrace.showlegend = true;
            histTrace.name = 'Histogram';
            traces.push(histTrace);
        }
    }
    
    if (showCurves) {
        // sRGB: Only defined for 0-1 range
        const srgbX = xLinear.filter(v => v <= 1);
        const srgbY = srgbX.map(v => TransferFunctions.sRGB.encode(v));
        
        // HLG: Hybrid log-gamma, designed for HDR
        const hlgY = xLinear.map(v => {
            // HLG can handle extended range
            return TransferFunctions.HLG.encode(v);
        });
        
        // PQ: Perceptual Quantizer, maps 0-10000 nits to 0-1
        // PQ reaches y=1 at input=100 (10000 nits)
        // Create extended range for PQ to show full curve
        const pqXExtended = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 100);
        const pqYExtended = pqXExtended.map(v => {
            // v is in units where 1.0 = 100 nits
            return TransferFunctions.PQ.encode(v);
        });
        
        traces.push(
            {
                x: srgbX,
                y: srgbY,
                type: 'scatter',
                mode: 'lines',
                name: 'sRGB',
                line: { color: '#00bcd4', width: 2 },
                hovertemplate: 'sRGB<br>Linear: %{x:.2f}<br>Signal: %{y:.3f}<extra></extra>'
            },
            {
                x: xLinear,
                y: hlgY,
                type: 'scatter',
                mode: 'lines',
                name: 'HLG',
                line: { color: '#9c27b0', width: 2 },
                hovertemplate: 'HLG<br>Linear: %{x:.2f}<br>Signal: %{y:.3f}<extra></extra>'
            },
            {
                x: pqXExtended,
                y: pqYExtended,
                type: 'scatter',
                mode: 'lines',
                name: 'PQ (ST.2084)',
                line: { color: '#ff9800', width: 2 },
                hovertemplate: 'PQ<br>Linear: %{x:.2f} (~%{text})<br>Signal: %{y:.3f}<extra></extra>',
                text: pqXExtended.map(v => `${(v * 100).toFixed(0)} nits`)
            }
        );
    }
    
    // Add hover pixel if exists
    if (currentHoverPixel) {
        ['sRGB', 'HLG', 'PQ'].forEach((type) => {
            const func = type === 'sRGB' ? TransferFunctions.sRGB : 
                         type === 'HLG' ? TransferFunctions.HLG : TransferFunctions.PQ;
            const symbol = type === 'sRGB' ? 'circle' : 
                           type === 'HLG' ? 'diamond' : 'square';
            
            traces.push(
                {
                    x: [currentHoverPixel.linear.r],
                    y: [type === 'sRGB' && currentHoverPixel.linear.r > 1 ? 1.0 : func.encode(currentHoverPixel.linear.r)],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} R`,
                    marker: { color: '#ff0000', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} R<br>Linear: %{x:.3f}<br>Signal: %{y:.3f}<extra></extra>`,
                    showlegend: false
                },
                {
                    x: [currentHoverPixel.linear.g],
                    y: [type === 'sRGB' && currentHoverPixel.linear.g > 1 ? 1.0 : func.encode(currentHoverPixel.linear.g)],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} G`,
                    marker: { color: '#00ff00', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} G<br>Linear: %{x:.3f}<br>Signal: %{y:.3f}<extra></extra>`,
                    showlegend: false
                },
                {
                    x: [currentHoverPixel.linear.b],
                    y: [type === 'sRGB' && currentHoverPixel.linear.b > 1 ? 1.0 : func.encode(currentHoverPixel.linear.b)],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} B`,
                    marker: { color: '#0000ff', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} B<br>Linear: %{x:.3f}<br>Signal: %{y:.3f}<extra></extra>`,
                    showlegend: false
                }
            );
        });
    }
    
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { 
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#e0e0e0', 
            size: 11 
        },
        margin: { t: 40, r: 50, b: 60, l: 60 },
        xaxis: {
            title: 'Linear Intensity',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 6],
            // dtick removed - Plotly will auto-adjust based on zoom
            autorange: false,
            fixedrange: false  // Allow zooming via axis drag
        },
        yaxis: {
            title: 'Encoded Signal (0-1)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.05],
            // dtick removed - Plotly will auto-adjust based on zoom
            autorange: false,
            fixedrange: false  // Allow zooming via axis drag
        },
        yaxis2: {
            // title: 'Histogram (%)',
            // titlefont: { color: '#888' },
            // tickfont: { color: '#888' },
            overlaying: 'y',
            side: 'right',
            range: [0, 0.9],  // Increased range to make histogram 1/3 height
            showgrid: false,
            zeroline: false,
            showticklabels: false,  // Hide tick labels
            showline: false          // Hide axis line
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {
                family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: 'white'
            }
        },
        title: 'OETF (Camera Encoding Curves)'
    };
    
    const config = {
        responsive: true,
        displayModeBar: true,
        scrollZoom: true,  // Enable scroll zoom
        doubleClick: 'reset',  // Double-click resets to original view
        modeBarButtonsToRemove: ['pan2d', 'select2d', 'lasso2d'],  // Remove pan tool but keep zoom
        modeBarButtonsToAdd: [],
        displaylogo: false
    };
    
    Plotly.react('combinedGraph', traces, layout, config).then(function() {
        // Add event handler to constrain axis ranges (as backup for zoom operations)
        const graphDiv = document.getElementById('combinedGraph');
        graphDiv.on('plotly_relayout', function(eventdata) {
            let update = {};
            let needsUpdate = false;
            
            // Check and constrain x-axis (for zoom operations)
            if (eventdata['xaxis.range[0]'] !== undefined && eventdata['xaxis.range[0]'] < 0) {
                update['xaxis.range[0]'] = 0;
                if (eventdata['xaxis.range[1]'] !== undefined) {
                    update['xaxis.range[1]'] = eventdata['xaxis.range[1]'];
                }
                needsUpdate = true;
            }
            
            // Check and constrain y-axis (for zoom operations)
            if (eventdata['yaxis.range[0]'] !== undefined && eventdata['yaxis.range[0]'] < 0) {
                update['yaxis.range[0]'] = 0;
                if (eventdata['yaxis.range[1]'] !== undefined) {
                    update['yaxis.range[1]'] = eventdata['yaxis.range[1]'];
                }
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                Plotly.relayout('combinedGraph', update);
            }
        });
    });
}

// Generate synthetic test patterns
function generateTestPattern(type) {
    const width = 512;
    const height = 512;
    canvas.width = width;
    canvas.height = height;
    
    const img = document.getElementById('uploadedImage');
    
    switch(type) {
        case 'red':
            ctx.fillStyle = 'rgb(255, 0, 0)';
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'green':
            ctx.fillStyle = 'rgb(0, 255, 0)';
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'blue':
            ctx.fillStyle = 'rgb(0, 0, 255)';
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'gradient':
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, 'rgb(0, 0, 0)');
            gradient.addColorStop(1, 'rgb(255, 255, 255)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'white':
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'black':
            ctx.fillStyle = 'rgb(0, 0, 0)';
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'radialGradient':
            const radialGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.min(width, height)/2);
            radialGrad.addColorStop(0, 'rgb(255, 255, 255)');
            radialGrad.addColorStop(1, 'rgb(0, 0, 0)');
            ctx.fillStyle = radialGrad;
            ctx.fillRect(0, 0, width, height);
            break;
            
        case 'graySteps':
            const steps = 10;
            const stepWidth = width / steps;
            for (let i = 0; i < steps; i++) {
                const gray = Math.round((i / (steps - 1)) * 255);
                ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
                ctx.fillRect(i * stepWidth, 0, stepWidth, height);
            }
            break;
            
        case 'colorBars':
            const colors = [
                'rgb(255, 255, 255)', // white
                'rgb(255, 255, 0)',   // yellow
                'rgb(0, 255, 255)',   // cyan
                'rgb(0, 255, 0)',     // green
                'rgb(255, 0, 255)',   // magenta
                'rgb(255, 0, 0)',     // red
                'rgb(0, 0, 255)',     // blue
                'rgb(0, 0, 0)'        // black
            ];
            const barWidth = width / colors.length;
            colors.forEach((color, i) => {
                ctx.fillStyle = color;
                ctx.fillRect(i * barWidth, 0, barWidth, height);
            });
            break;
    }
    
    // Convert canvas to image
    img.src = canvas.toDataURL();
    img.style.display = 'block';
    img.onload = function() {
        imageData = ctx.getImageData(0, 0, width, height);
        document.getElementById('imageInfo').innerHTML = `
            <strong>Test Pattern:</strong> ${type}<br>
            <strong>Dimensions:</strong> ${width} × ${height}<br>
            <strong>Type:</strong> Synthetic
        `;
        histogram = calculateHistogram(imageData);
        updateGraphs();
        
        // Save to localStorage
        saveImageState({
            dataUrl: canvas.toDataURL('image/png'),
            name: `Test Pattern - ${type}`,
            width: width,
            height: height,
            size: null, // Synthetic images don't have file size
            type: 'Test Pattern'
        });
    };
}

// Generate sample real images using canvas gradients and patterns
function generateSampleImage(type) {
    const width = 512;
    const height = 512;
    canvas.width = width;
    canvas.height = height;
    
    const img = document.getElementById('uploadedImage');
    
    switch(type) {
        case 'landscape':
            // Sky gradient
            const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.6);
            skyGradient.addColorStop(0, 'rgb(135, 206, 235)');
            skyGradient.addColorStop(1, 'rgb(255, 255, 200)');
            ctx.fillStyle = skyGradient;
            ctx.fillRect(0, 0, width, height * 0.6);
            
            // Ground
            const groundGradient = ctx.createLinearGradient(0, height * 0.6, 0, height);
            groundGradient.addColorStop(0, 'rgb(34, 139, 34)');
            groundGradient.addColorStop(1, 'rgb(20, 80, 20)');
            ctx.fillStyle = groundGradient;
            ctx.fillRect(0, height * 0.6, width, height * 0.4);
            
            // Sun
            ctx.fillStyle = 'rgb(255, 220, 100)';
            ctx.beginPath();
            ctx.arc(width * 0.8, height * 0.2, 40, 0, Math.PI * 2);
            ctx.fill();
            break;
            
        case 'sunset':
            const sunsetGradient = ctx.createLinearGradient(0, 0, 0, height);
            sunsetGradient.addColorStop(0, 'rgb(255, 94, 77)');
            sunsetGradient.addColorStop(0.3, 'rgb(255, 154, 77)');
            sunsetGradient.addColorStop(0.6, 'rgb(255, 206, 84)');
            sunsetGradient.addColorStop(0.8, 'rgb(237, 117, 57)');
            sunsetGradient.addColorStop(1, 'rgb(95, 39, 205)');
            ctx.fillStyle = sunsetGradient;
            ctx.fillRect(0, 0, width, height);
            
            // Sun
            ctx.fillStyle = 'rgb(255, 200, 50)';
            ctx.beginPath();
            ctx.arc(width * 0.5, height * 0.7, 60, 0, Math.PI * 2);
            ctx.fill();
            break;
            
        case 'neon':
            // Dark background
            ctx.fillStyle = 'rgb(10, 10, 30)';
            ctx.fillRect(0, 0, width, height);
            
            // Neon lights effect
            for (let i = 0; i < 20; i++) {
                const x = Math.random() * width;
                const y = Math.random() * height;
                const r = Math.random() * 255;
                const g = Math.random() * 255;
                const b = Math.random() * 255;
                
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, 50);
                gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
                gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.5)`);
                gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x - 50, y - 50, 100, 100);
            }
            break;
            
        case 'city':
            // Dark sky
            const nightGradient = ctx.createLinearGradient(0, 0, 0, height);
            nightGradient.addColorStop(0, 'rgb(10, 10, 40)');
            nightGradient.addColorStop(1, 'rgb(30, 30, 60)');
            ctx.fillStyle = nightGradient;
            ctx.fillRect(0, 0, width, height);
            
            // Buildings with windows
            for (let i = 0; i < 8; i++) {
                const bHeight = Math.random() * height * 0.6 + height * 0.2;
                const bWidth = width / 10;
                const bX = i * (width / 8);
                
                // Building
                ctx.fillStyle = `rgb(${20 + i * 5}, ${20 + i * 5}, ${30 + i * 5})`;
                ctx.fillRect(bX, height - bHeight, bWidth, bHeight);
                
                // Windows
                for (let w = 0; w < 4; w++) {
                    for (let h = 0; h < Math.floor(bHeight / 30); h++) {
                        if (Math.random() > 0.3) {
                            ctx.fillStyle = `rgb(${255}, ${200 + Math.random() * 55}, ${100})`;
                            ctx.fillRect(bX + w * 15 + 10, height - bHeight + h * 30 + 10, 10, 15);
                        }
                    }
                }
            }
            break;
            
        case 'fire':
            // Dark background
            ctx.fillStyle = 'rgb(10, 5, 0)';
            ctx.fillRect(0, 0, width, height);
            
            // Fire gradient effect
            for (let i = 0; i < 30; i++) {
                const fireGrad = ctx.createRadialGradient(
                    width/2 + (Math.random() - 0.5) * 100,
                    height * 0.7 + (Math.random() - 0.5) * 50,
                    0,
                    width/2,
                    height * 0.7,
                    100 + Math.random() * 50
                );
                fireGrad.addColorStop(0, `rgba(255, ${200 + Math.random() * 55}, 0, 0.8)`);
                fireGrad.addColorStop(0.5, `rgba(255, ${100 + Math.random() * 50}, 0, 0.4)`);
                fireGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
                ctx.fillStyle = fireGrad;
                ctx.fillRect(0, 0, width, height);
            }
            break;
            
        case 'ocean':
            // Ocean gradient
            const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
            oceanGrad.addColorStop(0, 'rgb(135, 206, 250)'); // sky blue
            oceanGrad.addColorStop(0.4, 'rgb(100, 180, 220)');
            oceanGrad.addColorStop(0.5, 'rgb(0, 119, 190)'); // ocean blue
            oceanGrad.addColorStop(1, 'rgb(0, 50, 100)'); // deep ocean
            ctx.fillStyle = oceanGrad;
            ctx.fillRect(0, 0, width, height);
            
            // Wave patterns
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                const y = height * 0.4 + i * 20;
                for (let x = 0; x < width; x += 10) {
                    const waveY = y + Math.sin((x + i * 50) * 0.02) * 10;
                    if (x === 0) {
                        ctx.moveTo(x, waveY);
                    } else {
                        ctx.lineTo(x, waveY);
                    }
                }
                ctx.stroke();
            }
            break;
    }
    
    // Convert canvas to image
    img.src = canvas.toDataURL();
    img.style.display = 'block';
    img.onload = function() {
        imageData = ctx.getImageData(0, 0, width, height);
        document.getElementById('imageInfo').innerHTML = `
            <strong>Sample:</strong> ${type}<br>
            <strong>Dimensions:</strong> ${width} × ${height}<br>
            <strong>Type:</strong> Generated
        `;
        histogram = calculateHistogram(imageData);
        updateGraphs();
        
        // Save to localStorage
        saveImageState({
            dataUrl: canvas.toDataURL('image/png'),
            name: `Sample - ${type}`,
            width: width,
            height: height,
            size: null, // Generated images don't have file size
            type: 'Generated Sample'
        });
    };
}

// localStorage helper functions for image persistence
function saveImageState(imageInfo) {
    try {
        const imageState = {
            dataUrl: imageInfo.dataUrl,
            name: imageInfo.name,
            width: imageInfo.width,
            height: imageInfo.height,
            size: imageInfo.size,
            type: imageInfo.type || 'Generated',
            timestamp: Date.now()
        };
        localStorage.setItem('hdr_analyzer_image', JSON.stringify(imageState));
        console.log('Image state saved to localStorage:', imageInfo.name);
    } catch (e) {
        console.warn('Failed to save image state to localStorage:', e);
    }
}

function loadImageState() {
    try {
        const stored = localStorage.getItem('hdr_analyzer_image');
        if (!stored) return null;
        
        const imageState = JSON.parse(stored);
        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
        
        // Check if image is less than 7 days old
        if (now - imageState.timestamp > sevenDaysMs) {
            console.log('Stored image is older than 7 days, clearing...');
            clearImageState();
            return null;
        }
        
        return imageState;
    } catch (e) {
        console.warn('Failed to load image state from localStorage:', e);
        return null;
    }
}

function clearImageState() {
    try {
        localStorage.removeItem('hdr_analyzer_image');
        console.log('Image state cleared from localStorage');
    } catch (e) {
        console.warn('Failed to clear image state from localStorage:', e);
    }
}

// Handle image upload
function handleImageUpload(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const img = document.getElementById('uploadedImage');
        img.onload = function() {
            // Show image
            img.style.display = 'block';
            
            // Draw to canvas for pixel data extraction
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            
            // Get image data
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Update info
            document.getElementById('imageInfo').innerHTML = `
                <strong>Image:</strong> ${file.name}<br>
                <strong>Dimensions:</strong> ${img.naturalWidth} × ${img.naturalHeight}<br>
                <strong>Size:</strong> ${(file.size / 1024).toFixed(1)} KB
            `;
            
            // Calculate histogram
            histogram = calculateHistogram(imageData);
            
            // Update graphs
            updateGraphs();
            
            // Save to localStorage
            saveImageState({
                dataUrl: e.target.result,
                name: file.name,
                width: img.naturalWidth,
                height: img.naturalHeight,
                size: file.size,
                type: 'Uploaded'
            });
        };
        img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize canvas and context
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    // Set initial UI state based on saved transfer mode
    const oetfMode = document.getElementById('oetfMode');
    const eotfMode = document.getElementById('eotfMode');
    
    if (transferMode === 'oetf') {
        oetfMode.classList.add('bg-brand-blue', 'text-white', 'font-semibold');
        oetfMode.classList.remove('bg-transparent', 'text-dark-text-muted', 'font-medium');
        eotfMode.classList.remove('bg-brand-blue', 'text-white', 'font-semibold');
        eotfMode.classList.add('bg-transparent', 'text-dark-text-muted', 'font-medium');
    } else {
        eotfMode.classList.add('bg-brand-blue', 'text-white', 'font-semibold');
        eotfMode.classList.remove('bg-transparent', 'text-dark-text-muted', 'font-medium');
        oetfMode.classList.remove('bg-brand-blue', 'text-white', 'font-semibold');
        oetfMode.classList.add('bg-transparent', 'text-dark-text-muted', 'font-medium');
    }
    
    initializeGraphs();
    
    // Add histogram visualization controls
    if (typeof addHistogramControls === 'function') {
        addHistogramControls();
    }
    
    // Try to restore saved image from localStorage
    const savedImageState = loadImageState();
    if (savedImageState) {
        // Restore saved image
        console.log('Restoring saved image:', savedImageState.name);
        const img = document.getElementById('uploadedImage');
        img.src = savedImageState.dataUrl;
        img.style.display = 'block';
        
        img.onload = function() {
            // Draw to canvas for analysis
            canvas.width = savedImageState.width;
            canvas.height = savedImageState.height;
            ctx.drawImage(img, 0, 0);
            
            // Get image data
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Update info display
            document.getElementById('imageInfo').innerHTML = `
                <strong>Restored:</strong> ${savedImageState.type}<br>
                <strong>File:</strong> ${savedImageState.name.substring(0, 30)}${savedImageState.name.length > 30 ? '...' : ''}<br>
                <strong>Dimensions:</strong> ${savedImageState.width} × ${savedImageState.height}
            `;
            
            // Calculate histogram
            histogram = calculateHistogram(imageData);
            
            // Update graphs
            updateGraphs();
        };
    } else {
        // No saved image, load Linear Gradient as default
        console.log('No saved image found, loading Linear Gradient as default');
        generateTestPattern('gradient');
        // samplesTrigger will be initialized later, update it after DOM is ready
        setTimeout(() => {
            const trigger = document.getElementById('samplesTrigger');
            if (trigger) {
                trigger.innerHTML = '<span>▼</span> Linear Gradient';
            }
        }, 0);
    }
    
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const showCurves = document.getElementById('showCurves');
    const showHistogram = document.getElementById('showHistogram');
    const uploadedImage = document.getElementById('uploadedImage');
    const hoverIndicator = document.getElementById('hoverIndicator');
    const separateView = document.getElementById('separateView');
    const combinedView = document.getElementById('combinedView');
    const graphsContainer = document.getElementById('graphsContainer');
    const combinedGraph = document.getElementById('combinedGraph');
    const peakBrightnessSelect = document.getElementById('peakBrightness');
    
    // Load Image dropdown functionality
    const loadImageTrigger = document.getElementById('loadImageTrigger');
    const loadImageMenu = document.getElementById('loadImageMenu');
    const uploadCard = document.getElementById('uploadCard');
    const closeLoadMenu = document.getElementById('closeLoadMenu');
    const urlInputCard = document.getElementById('urlInputCard');
    const loadUrlBtnCard = document.getElementById('loadUrlBtnCard');
    
    // Toggle load image menu
    if (loadImageTrigger) {
        loadImageTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            loadImageMenu.classList.toggle('hidden');
        });
    }
    
    // Close button
    if (closeLoadMenu) {
        closeLoadMenu.addEventListener('click', () => {
            loadImageMenu.classList.add('hidden');
        });
    }
    
    // Handle upload card click
    if (uploadCard) {
        uploadCard.addEventListener('click', function(e) {
            e.stopPropagation();
            fileInput.click();
            loadImageMenu.classList.add('hidden');
        });
    }
    
    // Handle URL input in card
    if (urlInputCard) {
        // Load URL when Enter pressed
        urlInputCard.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.trim()) {
                if (typeof loadImageFromURL === 'function') {
                    loadImageFromURL(this.value);
                    loadImageMenu.classList.add('hidden');
                }
            }
        });
    }
    
    // Handle sample cards
    document.querySelectorAll('.sample-card').forEach(card => {
        card.addEventListener('click', function(e) {
            e.stopPropagation();
            const sampleType = this.dataset.sample;
            if (sampleType) {
                // Test patterns use different function than scenes
                const testPatterns = ['red', 'green', 'blue', 'white', 'black', 'gradient', 'radialGradient', 'colorBars', 'graySteps'];
                const scenes = ['landscape', 'sunset', 'neon', 'city', 'fire', 'ocean'];
                
                if (testPatterns.includes(sampleType)) {
                    generateTestPattern(sampleType);
                } else if (scenes.includes(sampleType)) {
                    generateSampleImage(sampleType);
                }
                loadImageMenu.classList.add('hidden');
            }
        });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (loadImageMenu && !loadImageMenu.contains(e.target)) {
            loadImageMenu.classList.add('hidden');
        }
    });
    
    // File input change
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            handleImageUpload(e.target.files[0]);
        }
    });
    
    // Drag and drop on image container for better UX
    const imageContainer = document.getElementById('imageContainer');
    
    // Prevent default drag behaviors on document
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    
    document.addEventListener('drop', function(e) {
        e.preventDefault();
    });
    
    // Handle drop on image container
    if (imageContainer) {
        imageContainer.addEventListener('dragover', function(e) {
            e.preventDefault();
            imageContainer.classList.add('ring-2', 'ring-brand-blue');
        });
        
        imageContainer.addEventListener('dragleave', function(e) {
            e.preventDefault();
            imageContainer.classList.remove('ring-2', 'ring-brand-blue');
        });
        
        imageContainer.addEventListener('drop', function(e) {
            e.preventDefault();
            imageContainer.classList.remove('ring-2', 'ring-brand-blue');
            
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    handleImageUpload(file);
                }
            }
        });
    }
    
    // Show/hide toggles
    showCurves.addEventListener('change', updateGraphs);
    showHistogram.addEventListener('change', updateGraphs);
    
    // Samples dropdown functionality
    const samplesTrigger = document.getElementById('samplesTrigger');
    const samplesMenu = document.getElementById('samplesMenu');
    
    if (samplesTrigger && samplesMenu) {
        // Toggle dropdown
        samplesTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            samplesMenu.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            samplesMenu.classList.remove('active');
        });
        
        // Handle sample selection
        document.querySelectorAll('.sample-item').forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const sample = this.dataset.sample;
                
                // Update button text
                samplesTrigger.innerHTML = `<span>▼</span> ${this.textContent.substring(2)}`;
                
                // Close menu
                samplesMenu.classList.remove('active');
                
                // Generate sample
                if (['red', 'green', 'blue', 'white', 'black', 'gradient', 'radialGradient', 'colorBars', 'graySteps'].includes(sample)) {
                    generateTestPattern(sample);
                } else if (['landscape', 'sunset', 'neon', 'city', 'fire', 'ocean'].includes(sample)) {
                    generateSampleImage(sample);
                }
            });
        });
    }
    
    // View toggle buttons
    separateView.addEventListener('click', () => {
        viewMode = 'separate';
        separateView.classList.add('toolbar-btn-active');
        combinedView.classList.remove('toolbar-btn-active');
        
        // Show separate graphs, hide combined
        document.querySelectorAll('.graph').forEach(g => g.classList.remove('hidden'));
        document.querySelector('.combined-graph').classList.add('hidden');
        document.querySelector('.combined-graph').classList.remove('block');
        // Re-initialize for separate view if needed
        if (transferMode === 'eotf') {
            initializeSeparateEOTFGraphs();
        } else {
            initializeSeparateOETFGraphs();
        }
        // Always update graphs to include histogram
        if (histogram) {
            updateGraphs();
        }
    });
    
    combinedView.addEventListener('click', () => {
        viewMode = 'combined';
        combinedView.classList.add('toolbar-btn-active');
        separateView.classList.remove('toolbar-btn-active');
        
        // Hide separate graphs, show combined
        document.querySelectorAll('.graph').forEach(g => g.classList.add('hidden'));
        document.querySelector('.combined-graph').classList.remove('hidden');
        document.querySelector('.combined-graph').classList.add('block');
        // Re-initialize for combined view
        if (transferMode === 'eotf') {
            initializeCombinedEOTFGraph();
        } else {
            initializeCombinedGraph();
        }
        // Always update combined graph to include histogram
        if (histogram) {
            updateCombinedGraph();
        }
        setTimeout(() => {
            const combinedGraphDiv = document.getElementById('combinedGraph');
            if (combinedGraphDiv && combinedGraphDiv.offsetParent !== null) {
                Plotly.Plots.resize('combinedGraph');
            }
        }, 100);
    });
    
    // Transfer mode toggles (OETF vs EOTF)
    oetfMode.addEventListener('click', function() {
        console.log('[DEBUG] OETF mode clicked');
        transferMode = 'oetf';
        localStorage.setItem('transferMode', 'oetf');
        oetfMode.classList.add('bg-brand-blue', 'text-white', 'font-semibold');
        oetfMode.classList.remove('bg-transparent', 'text-dark-text-muted', 'font-medium');
        eotfMode.classList.remove('bg-brand-blue', 'text-white', 'font-semibold');
        eotfMode.classList.add('bg-transparent', 'text-dark-text-muted', 'font-medium');
        // Re-initialize graphs when switching transfer modes
        initializeGraphs();
        // Update graphs to include histogram if available
        if (histogram) {
            updateGraphs();
        }
    });
    
    eotfMode.addEventListener('click', function() {
        console.log('[DEBUG] EOTF mode clicked');
        transferMode = 'eotf';
        localStorage.setItem('transferMode', 'eotf');
        eotfMode.classList.add('bg-brand-blue', 'text-white', 'font-semibold');
        eotfMode.classList.remove('bg-transparent', 'text-dark-text-muted', 'font-medium');
        oetfMode.classList.remove('bg-brand-blue', 'text-white', 'font-semibold');
        oetfMode.classList.add('bg-transparent', 'text-dark-text-muted', 'font-medium');
        // Re-initialize graphs when switching transfer modes
        initializeGraphs();
        // Update graphs to include histogram if available
        if (histogram) {
            updateGraphs();
        }
    });
    
    // Peak brightness selector
    peakBrightnessSelect.addEventListener('change', function() {
        peakBrightness = parseInt(peakBrightnessSelect.value);
        updateGraphs();
    });
    
    // Initialize with combined view
    if (viewMode === 'combined') {
        combinedView.classList.add('toolbar-btn-active');
        separateView.classList.remove('toolbar-btn-active');
        
        // Hide separate graphs, show combined
        document.querySelectorAll('.graph').forEach(g => g.classList.add('hidden'));
        document.querySelector('.combined-graph').classList.remove('hidden');
        document.querySelector('.combined-graph').classList.add('block');
        // Ensure combined graph resizes properly on initial load
        setTimeout(() => {
            const combinedGraphDiv = document.getElementById('combinedGraph');
            if (combinedGraphDiv && combinedGraphDiv.offsetParent !== null) {
                Plotly.Plots.resize('combinedGraph');
            }
        }, 100);
    }
    
    // Image hover interaction - optimized for performance
    uploadedImage.addEventListener('mousemove', function(e) {
        if (!imageData) return;
        
        // IMMEDIATE: Update hover indicator position (P0 - instant response)
        hoverIndicator.style.display = 'block';
        hoverIndicator.style.left = e.clientX + 'px';
        hoverIndicator.style.top = e.clientY + 'px';
        
        // Get image position and dimensions
        const rect = this.getBoundingClientRect();
        const scaleX = this.naturalWidth / rect.width;
        const scaleY = this.naturalHeight / rect.height;
        
        // Calculate pixel coordinates
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);
        
        // Ensure within bounds
        if (x >= 0 && x < imageData.width && y >= 0 && y < imageData.height) {
            // Get pixel data
            const idx = (y * imageData.width + x) * 4;
            const srgb = {
                r: imageData.data[idx] / 255,
                g: imageData.data[idx + 1] / 255,
                b: imageData.data[idx + 2] / 255
            };
            
            // Convert to linear
            const linear = {
                r: TransferFunctions.sRGB.decode(srgb.r),
                g: TransferFunctions.sRGB.decode(srgb.g),
                b: TransferFunctions.sRGB.decode(srgb.b)
            };
            
            const pixel = { x, y, srgb, linear };
            
            // THROTTLED: Update graphs (P1 - fast but not instant)
            // Use requestAnimationFrame for smooth updates
            const now = Date.now();
            if (now - lastUpdateTime > 16) { // ~60fps throttle
                lastUpdateTime = now;
                requestAnimationFrame(() => {
                    highlightPixelOnGraphs(pixel);
                });
            }
        } else {
            // Hide indicator if out of bounds
            hoverIndicator.style.display = 'none';
        }
    });
    
    uploadedImage.addEventListener('mouseleave', function() {
        hoverIndicator.style.display = 'none';
        highlightPixelOnGraphs(null);
    });
    
    // Layout Switcher and Splitter functionality
    const sideLayoutBtn = document.getElementById('sideLayout');
    const topLayoutBtn = document.getElementById('topLayout');
    const mainContainer = document.getElementById('mainContainer');
    const leftPane = document.getElementById('leftPane');
    const rightPane = document.getElementById('rightPane');
    const splitter = document.getElementById('splitter');
    
    // Splitter functionality
    let isDragging = false;
    let currentLayout = 'side'; // Track current layout
    
    // Initialize pane sizes
    let sideSplitRatio = 0.5; // 50% split for side-by-side
    let topSplitRatio = 0.5;  // 50% split for top-bottom
    
    function updatePaneSizes() {
        if (currentLayout === 'side') {
            const containerWidth = mainContainer.clientWidth;
            const leftWidth = containerWidth * sideSplitRatio - 2; // Account for splitter width
            const rightWidth = containerWidth * (1 - sideSplitRatio) - 2;
            
            leftPane.style.width = `${leftWidth}px`;
            leftPane.style.flex = 'none';
            rightPane.style.width = `${rightWidth}px`;
            rightPane.style.flex = 'none';
        } else {
            const containerHeight = mainContainer.clientHeight;
            const topHeight = containerHeight * topSplitRatio - 2; // Account for splitter height
            const bottomHeight = containerHeight * (1 - topSplitRatio) - 2;
            
            leftPane.style.height = `${topHeight}px`;
            leftPane.style.maxHeight = `${topHeight}px`;
            leftPane.style.flex = 'none';
            rightPane.style.height = `${bottomHeight}px`;
            rightPane.style.maxHeight = `${bottomHeight}px`;
            rightPane.style.flex = 'none';
        }
    }
    
    // Mouse down on splitter
    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        mainContainer.classList.add('resizing');
        splitter.classList.add('dragging');
        e.preventDefault();
    });
    
    // Mouse move
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        if (currentLayout === 'side') {
            const containerRect = mainContainer.getBoundingClientRect();
            const mouseX = e.clientX - containerRect.left;
            sideSplitRatio = Math.max(0.2, Math.min(0.8, mouseX / containerRect.width));
            updatePaneSizes();
        } else {
            const containerRect = mainContainer.getBoundingClientRect();
            const mouseY = e.clientY - containerRect.top;
            topSplitRatio = Math.max(0.2, Math.min(0.8, mouseY / containerRect.height));
            updatePaneSizes();
        }
        
        // Trigger graph resize
        window.dispatchEvent(new Event('resize'));
    });
    
    // Mouse up
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            mainContainer.classList.remove('resizing');
            splitter.classList.remove('dragging');
        }
    });
    
    // Handle layout button clicks
    function setLayout(layout) {
        // Reset pane styles before switching
        leftPane.style.width = '';
        leftPane.style.height = '';
        leftPane.style.maxHeight = '';
        leftPane.style.flex = '';
        rightPane.style.width = '';
        rightPane.style.height = '';
        rightPane.style.maxHeight = '';
        rightPane.style.flex = '';
        
        // Update container classes and button states
        if (layout === 'top') {
            mainContainer.classList.remove('layout-side');
            mainContainer.classList.add('layout-top');
            topLayoutBtn.classList.add('toolbar-btn-active');
            sideLayoutBtn.classList.remove('toolbar-btn-active');
            currentLayout = 'top';
        } else {
            mainContainer.classList.remove('layout-top');
            mainContainer.classList.add('layout-side');
            sideLayoutBtn.classList.add('toolbar-btn-active');
            topLayoutBtn.classList.remove('toolbar-btn-active');
            currentLayout = 'side';
        }
        
        // Apply saved split ratio for new layout
        updatePaneSizes();
        
        // Trigger resize for graphs after layout change
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 350); // Wait for transition to complete
    }
    
    // Layout button event listeners
    if (sideLayoutBtn) {
        sideLayoutBtn.addEventListener('click', () => setLayout('side'));
    }
    
    if (topLayoutBtn) {
        topLayoutBtn.addEventListener('click', () => setLayout('top'));
    }
    
    // Initialize with default split
    updatePaneSizes();
    
    // Window resize
    window.addEventListener('resize', () => {
        // Only resize graphs that are visible
        if (viewMode === 'combined') {
            const combinedGraphDiv = document.getElementById('combinedGraph');
            if (combinedGraphDiv && combinedGraphDiv.offsetParent !== null) {
                Plotly.Plots.resize('combinedGraph');
            }
        } else {
            ['srgbGraph', 'pqGraph', 'hlgGraph'].forEach(id => {
                const graphDiv = document.getElementById(id);
                if (graphDiv && graphDiv.offsetParent !== null) {
                    Plotly.Plots.resize(id);
                }
            });
        }
    });
});