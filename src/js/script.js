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
        // PQ expects normalized input (0-1) but we'll support extended range
        // Input: relative linear light (0-1 SDR, >1 for HDR)
        // Output: PQ signal value (0-1 for SDR, can exceed 1 for HDR)
        encode: (linear) => {
            // PQ constants
            const m1 = 0.1593017578125;
            const m2 = 78.84375;
            const c1 = 0.8359375;
            const c2 = 18.8515625;
            const c3 = 18.6875;
            
            // Don't clamp - allow HDR values
            const Y = Math.max(0, linear);
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
            return Math.pow(num / den, 1/m1);
        }
    },
    
    // HLG (Hybrid Log-Gamma) - BT.2100
    HLG: {
        // HLG system gamma = 1.2, reference white = 1.0
        // Input: relative linear light (0-1 SDR, up to ~12 for HDR)
        // Output: HLG signal value (0-1 for SDR, up to ~1.5 for HDR)
        encode: (linear) => {
            const a = 0.17883277;
            const b = 0.28466892;
            const c = 0.55991073;
            
            if (linear <= 0) return 0;
            if (linear <= 1/12) {
                return Math.sqrt(3 * linear);
            } else {
                return a * Math.log(12 * linear - b) + c;
            }
        },
        decode: (hlg) => {
            const a = 0.17883277;
            const b = 0.28466892;
            const c = 0.55991073;
            
            if (hlg <= 0) return 0;
            if (hlg <= 0.5) {
                return Math.pow(hlg, 2) / 3;
            } else {
                return (Math.exp((hlg - c) / a) + b) / 12;
            }
        }
    }
};

// Global variables
let imageData = null;
let canvas = null;
let ctx = null;
let currentHoverPixel = null;
let viewMode = 'combined'; // 'separate' or 'combined'
let transferMode = 'eotf'; // 'oetf' or 'eotf'
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
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 30, r: 30, b: 50, l: 60 },
        xaxis: {
            title: 'Encoded Signal Input (0=black, 1=max code)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, peakBrightness]
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
            font: {color: 'white'}
        }
    };
    
    const config = {
        responsive: true,
        displayModeBar: false,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage']
    };
    
    // Generate transfer curves for EOTF
    const numPoints = 256;
    const encodedValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // sRGB EOTF (gamma 2.2 approximation)
    const srgbLayout = {...sdrLayout, title: 'sRGB EOTF (Display Response)'};
    const srgbEOTF = encodedValues.map(v => {
        // sRGB EOTF: decode then scale to display peak
        const linear = TransferFunctions.sRGB.decode(v);
        return linear * peakBrightness;
    });
    Plotly.newPlot('srgbGraph', [{
        x: encodedValues,
        y: srgbEOTF,
        type: 'scatter',
        mode: 'lines',
        name: 'sRGB',
        line: { color: '#00bcd4', width: 2 },
        hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
    }], srgbLayout, config);
    
    // PQ EOTF (absolute brightness)
    const pqLayout = {
        ...sdrLayout,
        title: 'PQ EOTF (ST.2084)',
        yaxis: {
            ...sdrLayout.yaxis,
            range: [0.1, Math.min(10000, peakBrightness * 1.2)],
            type: 'log',
            dtick: 1
        }
    };
    const pqEOTF = encodedValues.map(v => {
        // PQ EOTF: decode gives normalized 0-1, scale to 10000 nits
        const normalized = TransferFunctions.PQ.decode(v);
        return normalized * 10000; // PQ is absolute, always 10000 nits max
    });
    Plotly.newPlot('pqGraph', [{
        x: encodedValues,
        y: pqEOTF,
        type: 'scatter',
        mode: 'lines',
        name: 'PQ',
        line: { color: '#ff9800', width: 2 },
        hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
    }], pqLayout, config);
    
    // HLG EOTF (relative to display peak)
    const hlgLayout = {
        ...sdrLayout,
        title: `HLG EOTF (Peak: ${peakBrightness} cd/m²)`,
        yaxis: {
            ...sdrLayout.yaxis,
            range: [0, peakBrightness * 1.2]
        }
    };
    const hlgEOTF = encodedValues.map(v => {
        // HLG EOTF: decode then apply system gamma and scale to display peak
        const scene = TransferFunctions.HLG.decode(v);
        // Apply system gamma (1.2 is typical)
        const display = Math.pow(scene, 1.2);
        return display * peakBrightness;
    });
    Plotly.newPlot('hlgGraph', [{
        x: encodedValues,
        y: hlgEOTF,
        type: 'scatter',
        mode: 'lines',
        name: 'HLG',
        line: { color: '#9c27b0', width: 2 },
        hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
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
    const sdrLayout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 30, r: 30, b: 50, l: 60 },
        xaxis: {
            title: 'Linear Light Input (0=black, 1=SDR white)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        yaxis: {
            title: 'Encoded Signal Output',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
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
            font: {color: 'white'}
        }
    };
    
    const config = {
        responsive: true,
        displayModeBar: false,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage']
    };
    
    // Generate transfer curves
    const numPoints = 256;
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // sRGB graph (SDR only)
    const srgbLayout = {...sdrLayout, title: 'sRGB Transfer Function (SDR)'};
    const srgbCurve = linearValues.map(v => TransferFunctions.sRGB.encode(v));
    Plotly.newPlot('srgbGraph', [{
        x: linearValues,
        y: srgbCurve,
        type: 'scatter',
        mode: 'lines',
        name: 'sRGB',
        line: { color: '#00bcd4', width: 2 },
        hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
    }], srgbLayout, config);
    
    // PQ graph (HDR - extends to 2.5x SDR)
    const pqLayout = {
        ...sdrLayout,
        title: 'PQ (ST.2084) Transfer Function (HDR)',
        xaxis: {
            ...sdrLayout.xaxis,
            title: 'Linear Light Input (0=black, 1=SDR ref, 2.5=HDR peak)',
            range: [0, 2.5]
        },
        yaxis: {
            ...sdrLayout.yaxis,
            range: [0, 1.2]
        }
    };
    const pqLinearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 2.5);
    const pqCurve = pqLinearValues.map(v => TransferFunctions.PQ.encode(v));
    Plotly.newPlot('pqGraph', [{
        x: pqLinearValues,
        y: pqCurve,
        type: 'scatter',
        mode: 'lines',
        name: 'PQ',
        line: { color: '#ff9800', width: 2 },
        hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
    }], pqLayout, config);
    
    // HLG graph (HDR - extends to 5x SDR)
    const hlgLayout = {
        ...sdrLayout,
        title: 'HLG (BT.2100) Transfer Function (HDR)',
        xaxis: {
            ...sdrLayout.xaxis,
            title: 'Linear Light Input (0=black, 1=SDR ref, 5=HDR peak)',
            range: [0, 5]
        },
        yaxis: {
            ...sdrLayout.yaxis,
            range: [0, 1.3]
        }
    };
    const hlgLinearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 5);
    const hlgCurve = hlgLinearValues.map(v => TransferFunctions.HLG.encode(v));
    Plotly.newPlot('hlgGraph', [{
        x: hlgLinearValues,
        y: hlgCurve,
        type: 'scatter',
        mode: 'lines',
        name: 'HLG',
        line: { color: '#9c27b0', width: 2 },
        hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
    }], hlgLayout, config);
}

// Initialize combined EOTF graph
function initializeCombinedEOTFGraph() {
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 40, r: 30, b: 50, l: 60 },
        xaxis: {
            title: 'Encoded Signal Input (0=black, 1=max code)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1],
            dtick: 0.2
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0.1, Math.max(peakBrightness, 1000)],
            type: 'log',
            dtick: 1
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
            font: {color: 'white'}
        },
        title: 'EOTF Comparison (Display Response Curves)'
    };
    
    const config = {
        responsive: true,
        displayModeBar: false
    };
    
    const numPoints = 256;
    const encodedValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    const traces = [
        {
            x: encodedValues,
            y: encodedValues.map(v => TransferFunctions.sRGB.decode(v) * peakBrightness),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
        },
        {
            x: encodedValues,
            y: encodedValues.map(v => TransferFunctions.PQ.decode(v) * 10000),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ (10000 nits)',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
        },
        {
            x: encodedValues,
            y: encodedValues.map(v => Math.pow(TransferFunctions.HLG.decode(v), 1.2) * peakBrightness),
            type: 'scatter',
            mode: 'lines',
            name: `HLG (${peakBrightness} nits)`,
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
        }
    ];
    
    Plotly.newPlot('combinedGraph', traces, layout, config);
}

// Initialize combined OETF graph
function initializeCombinedGraph() {
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 40, r: 30, b: 50, l: 60 },
        xaxis: {
            title: 'Linear Light Input (0=black, 1=SDR white, >1=HDR)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 3],
            dtick: 0.5
        },
        yaxis: {
            title: 'Encoded Signal Output',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.3]
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
            font: {color: 'white'}
        },
        title: 'All Transfer Functions'
    };
    
    const config = {
        responsive: true,
        displayModeBar: false
    };
    
    const numPoints = 256;
    // Use extended range for combined view to show HDR capabilities
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 3);
    
    const traces = [
        {
            x: linearValues,
            // sRGB only valid up to 1.0, clamp beyond that
            y: linearValues.map(v => v <= 1 ? TransferFunctions.sRGB.encode(v) : 1),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'sRGB<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
        },
        {
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.PQ.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'PQ<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
        },
        {
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.HLG.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'HLG<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
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
    
    const numPoints = 256;
    const encodedValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // Common layout settings
    const darkLayout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 30, r: 30, b: 50, l: 70 },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {color: 'white'}
        }
    };
    
    // sRGB EOTF
    const srgbTraces = [];
    if (showCurves) {
        srgbTraces.push({
            x: encodedValues,
            y: encodedValues.map(v => TransferFunctions.sRGB.decode(v) * peakBrightness),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#00bcd4', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
        });
    }
    
    const srgbLayout = {
        ...darkLayout,
        title: 'sRGB EOTF',
        xaxis: {
            title: 'Encoded Signal Input',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, peakBrightness]
        }
    };
    Plotly.react('srgbGraph', srgbTraces, srgbLayout);
    
    // PQ EOTF
    const pqTraces = [];
    if (showCurves) {
        pqTraces.push({
            x: encodedValues,
            y: encodedValues.map(v => TransferFunctions.PQ.decode(v) * 10000),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ',
            line: { color: '#ff9800', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
        });
    }
    
    const pqLayout = {
        ...darkLayout,
        title: 'PQ EOTF (ST.2084)',
        xaxis: {
            title: 'Encoded Signal Input',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0.1, 10000],
            type: 'log'
        }
    };
    Plotly.react('pqGraph', pqTraces, pqLayout);
    
    // HLG EOTF
    const hlgTraces = [];
    if (showCurves) {
        hlgTraces.push({
            x: encodedValues,
            y: encodedValues.map(v => Math.pow(TransferFunctions.HLG.decode(v), 1.2) * peakBrightness),
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
        });
    }
    
    const hlgLayout = {
        ...darkLayout,
        title: `HLG EOTF (Peak: ${peakBrightness} cd/m²)`,
        xaxis: {
            title: 'Encoded Signal Input',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, peakBrightness * 1.1]
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
    
    const numPoints = 256;
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // sRGB
    const srgbTraces = [];
    
    // Add histogram if available and enabled
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [0, 188, 212]);
        if (histTrace) srgbTraces.push(histTrace);
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
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 30, r: 30, b: 40, l: 50 },
        xaxis: {
            title: 'Linear Input',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        yaxis: {
            title: 'Encoded Output',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1]
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        title: 'sRGB Transfer Function',
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {color: 'white'}
        }
    };
    
    Plotly.react('srgbGraph', srgbTraces, darkLayout);
    
    // PQ
    const pqTraces = [];
    
    // Add histogram for PQ
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [255, 152, 0], 
            (x) => TransferFunctions.PQ.encode(x));
        if (histTrace) pqTraces.push(histTrace);
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
        title: 'PQ (ST.2084) Transfer Function (HDR)',
        xaxis: {
            ...darkLayout.xaxis,
            title: 'Linear Light Input (0=black, 1=SDR ref, 2.5=HDR peak)',
            range: [0, 2.5]
        },
        yaxis: {
            ...darkLayout.yaxis,
            range: [0, 1.2]
        }
    };
    Plotly.react('pqGraph', pqTraces, pqLayout);
    
    // HLG
    const hlgTraces = [];
    
    // Add histogram for HLG
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.3, [156, 39, 176], 
            (x) => TransferFunctions.HLG.encode(x));
        if (histTrace) hlgTraces.push(histTrace);
    }
    
    if (showCurves) {
        hlgTraces.push({
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.HLG.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#9c27b0', width: 2 },
            hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
        });
    }
    
    const hlgLayout = {
        ...darkLayout, 
        title: 'HLG (BT.2100) Transfer Function (HDR)',
        xaxis: {
            ...darkLayout.xaxis,
            title: 'Linear Light Input (0=black, 1=SDR ref, 5=HDR peak)',
            range: [0, 5]
        },
        yaxis: {
            ...darkLayout.yaxis,
            range: [0, 1.3]
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
            const rData = [pixel.linear.r];
            const gData = [pixel.linear.g];
            const bData = [pixel.linear.b];
            const rY = [functions[idx].encode(pixel.linear.r)];
            const gY = [functions[idx].encode(pixel.linear.g)];
            const bY = [functions[idx].encode(pixel.linear.b)];
            
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
    
    const numPoints = 256;
    const encodedValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    const traces = [];
    
    if (showCurves) {
        traces.push(
            {
                x: encodedValues,
                y: encodedValues.map(v => TransferFunctions.sRGB.decode(v) * peakBrightness),
                type: 'scatter',
                mode: 'lines',
                name: `sRGB (${peakBrightness} nits)`,
                line: { color: '#00bcd4', width: 2 },
                hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
            },
            {
                x: encodedValues,
                y: encodedValues.map(v => TransferFunctions.PQ.decode(v) * 10000),
                type: 'scatter',
                mode: 'lines',
                name: 'PQ (10000 nits)',
                line: { color: '#ff9800', width: 2 },
                hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
            },
            {
                x: encodedValues,
                y: encodedValues.map(v => Math.pow(TransferFunctions.HLG.decode(v), 1.2) * peakBrightness),
                type: 'scatter',
                mode: 'lines',
                name: `HLG (${peakBrightness} nits)`,
                line: { color: '#9c27b0', width: 2 },
                hovertemplate: 'Signal: %{x:.3f}<br>Brightness: %{y:.0f} cd/m²<extra></extra>'
            }
        );
    }
    
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 40, r: 30, b: 50, l: 70 },
        xaxis: {
            title: 'Encoded Signal Input (0=black, 1=max code)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1],
            dtick: 0.2
        },
        yaxis: {
            title: 'Output Brightness (cd/m²)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0.1, Math.max(peakBrightness * 1.5, 10000)],
            type: 'log'
        },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(0,0,0,0.5)'
        },
        title: 'EOTF Comparison',
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: 'rgba(0,0,0,0.8)',
            font: {color: 'white'}
        }
    };
    
    Plotly.react('combinedGraph', traces, layout);
}

function updateCombinedOETFGraph() {
    const showCurves = document.getElementById('showCurves').checked;
    const showHistogram = document.getElementById('showHistogram') ? document.getElementById('showHistogram').checked : false;
    
    const numPoints = 256;
    // Use extended range for combined view to show HDR capabilities
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1) * 3);
    
    const traces = [];
    
    // Add histogram if enabled
    if (showHistogram && histogram) {
        const histTrace = createHistogramTrace(histogram, 0.25, [255, 255, 255], 
            (x) => {
                // Use average of all transfer functions for combined view
                const srgbValue = TransferFunctions.sRGB.encode(x);
                const pqValue = TransferFunctions.PQ.encode(x);
                const hlgValue = TransferFunctions.HLG.encode(x);
                return (srgbValue + pqValue + hlgValue) / 3;
            });
        if (histTrace) {
            histTrace.showlegend = true;
            traces.push(histTrace);
        }
    }
    
    if (showCurves) {
        traces.push(
            {
                x: linearValues,
                // sRGB only valid up to 1.0, clamp beyond that
                y: linearValues.map(v => v <= 1 ? TransferFunctions.sRGB.encode(v) : 1),
                type: 'scatter',
                mode: 'lines',
                name: 'sRGB',
                line: { color: '#00bcd4', width: 2 },
                hovertemplate: 'sRGB<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
            },
            {
                x: linearValues,
                y: linearValues.map(v => TransferFunctions.PQ.encode(v)),
                type: 'scatter',
                mode: 'lines',
                name: 'PQ',
                line: { color: '#ff9800', width: 2 },
                hovertemplate: 'PQ<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
            },
            {
                x: linearValues,
                y: linearValues.map(v => TransferFunctions.HLG.encode(v)),
                type: 'scatter',
                mode: 'lines',
                name: 'HLG',
                line: { color: '#9c27b0', width: 2 },
                hovertemplate: 'HLG<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
            }
        );
    }
    
    // Add hover pixel if exists
    if (currentHoverPixel) {
        ['sRGB', 'PQ', 'HLG'].forEach((type) => {
            const func = type === 'sRGB' ? TransferFunctions.sRGB :
                         type === 'PQ' ? TransferFunctions.PQ : TransferFunctions.HLG;
            const symbol = type === 'sRGB' ? 'circle' :
                          type === 'PQ' ? 'square' : 'diamond';
            
            traces.push(
                {
                    x: [currentHoverPixel.linear.r],
                    y: [func.encode(currentHoverPixel.linear.r)],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} R`,
                    marker: { color: '#ff0000', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} R<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>`,
                    showlegend: false
                },
                {
                    x: [currentHoverPixel.linear.g],
                    y: [func.encode(currentHoverPixel.linear.g)],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} G`,
                    marker: { color: '#00ff00', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} G<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>`,
                    showlegend: false
                },
                {
                    x: [currentHoverPixel.linear.b],
                    y: [func.encode(currentHoverPixel.linear.b)],
                    type: 'scatter',
                    mode: 'markers',
                    name: `Hover ${type} B`,
                    marker: { color: '#0000ff', size: 12, line: { color: 'white', width: 2 }, symbol },
                    hovertemplate: `Hover ${type} B<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>`,
                    showlegend: false
                }
            );
        });
    }
    
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 40, r: 30, b: 50, l: 60 },
        xaxis: {
            title: 'Linear Light Input (0=black, 1=SDR white, >1=HDR)',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 3],
            dtick: 0.5
        },
        yaxis: {
            title: 'Encoded Signal Output',
            gridcolor: '#333',
            zerolinecolor: '#555',
            range: [0, 1.3]
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
            font: {color: 'white'}
        },
        title: 'All Transfer Functions'
    };
    
    Plotly.react('combinedGraph', traces, layout);
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
    };
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
    
    initializeGraphs();
    
    // Add histogram visualization controls
    if (typeof addHistogramControls === 'function') {
        addHistogramControls();
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
    const oetfMode = document.getElementById('oetfMode');
    const eotfMode = document.getElementById('eotfMode');
    const peakBrightnessSelect = document.getElementById('peakBrightness');
    
    // File upload click
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            handleImageUpload(e.target.files[0]);
        }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    });
    
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
        separateView.classList.add('active');
        combinedView.classList.remove('active');
        graphsContainer.classList.remove('combined-view');
        combinedGraph.classList.remove('active');
        // Re-initialize for separate view if needed
        if (transferMode === 'eotf') {
            initializeSeparateEOTFGraphs();
        } else {
            initializeSeparateOETFGraphs();
        }
        updateGraphs();
    });
    
    combinedView.addEventListener('click', () => {
        viewMode = 'combined';
        combinedView.classList.add('active');
        separateView.classList.remove('active');
        graphsContainer.classList.add('combined-view');
        combinedGraph.classList.add('active');
        // Re-initialize for combined view
        if (transferMode === 'eotf') {
            initializeCombinedEOTFGraph();
        } else {
            initializeCombinedGraph();
        }
        updateCombinedGraph();
        setTimeout(() => {
            const combinedGraphDiv = document.getElementById('combinedGraph');
            if (combinedGraphDiv && combinedGraphDiv.offsetParent !== null) {
                Plotly.Plots.resize('combinedGraph');
            }
        }, 100);
    });
    
    // Transfer mode toggles (OETF vs EOTF)
    oetfMode.addEventListener('click', function() {
        transferMode = 'oetf';
        oetfMode.classList.add('active');
        eotfMode.classList.remove('active');
        updateGraphs();
    });
    
    eotfMode.addEventListener('click', function() {
        transferMode = 'eotf';
        eotfMode.classList.add('active');
        oetfMode.classList.remove('active');
        updateGraphs();
    });
    
    // Peak brightness selector
    peakBrightnessSelect.addEventListener('change', function() {
        peakBrightness = parseInt(peakBrightnessSelect.value);
        updateGraphs();
    });
    
    // Initialize with combined view
    if (viewMode === 'combined') {
        combinedView.classList.add('active');
        separateView.classList.remove('active');
        graphsContainer.classList.add('combined-view');
        combinedGraph.classList.add('active');
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