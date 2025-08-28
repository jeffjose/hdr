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
        encode: (linear) => {
            // PQ constants
            const m1 = 0.1593017578125;
            const m2 = 78.84375;
            const c1 = 0.8359375;
            const c2 = 18.8515625;
            const c3 = 18.6875;
            
            // Normalize to 0-1 range (assuming peak luminance of 10000 nits)
            const Y = Math.max(0, Math.min(1, linear));
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
            
            const E = Math.max(0, Math.min(1, pq));
            const Em1 = Math.pow(E, 1/m2);
            const num = Math.max(0, Em1 - c1);
            const den = c2 - c3 * Em1;
            if (den === 0) return 0;
            return Math.pow(num / den, 1/m1);
        }
    },
    
    // HLG (Hybrid Log-Gamma) - BT.2100
    HLG: {
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
let viewMode = 'separate'; // 'separate' or 'combined'
let histogram = null; // Store histogram data
let updateGraphTimeout = null; // For debouncing graph updates
let lastUpdateTime = 0; // For throttling

// Initialize graphs
function initializeGraphs() {
    const layout = {
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
    
    // sRGB graph
    const srgbLayout = {...layout, title: 'sRGB Transfer Function'};
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
    
    // PQ graph
    const pqLayout = {...layout, title: 'PQ (ST.2084) Transfer Function'};
    const pqCurve = linearValues.map(v => TransferFunctions.PQ.encode(v));
    Plotly.newPlot('pqGraph', [{
        x: linearValues,
        y: pqCurve,
        type: 'scatter',
        mode: 'lines',
        name: 'PQ',
        line: { color: '#ff9800', width: 2 },
        hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
    }], pqLayout, config);
    
    // HLG graph
    const hlgLayout = {...layout, title: 'HLG (BT.2100) Transfer Function'};
    const hlgCurve = linearValues.map(v => TransferFunctions.HLG.encode(v));
    Plotly.newPlot('hlgGraph', [{
        x: linearValues,
        y: hlgCurve,
        type: 'scatter',
        mode: 'lines',
        name: 'HLG',
        line: { color: '#9c27b0', width: 2 },
        hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
    }], hlgLayout, config);
    
    // Initialize combined graph
    initializeCombinedGraph();
}

// Initialize combined graph
function initializeCombinedGraph() {
    const layout = {
        paper_bgcolor: '#0a0a0a',
        plot_bgcolor: '#0a0a0a',
        font: { color: '#e0e0e0', size: 11 },
        margin: { t: 40, r: 30, b: 40, l: 50 },
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
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    const traces = [
        {
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.sRGB.encode(v)),
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
    
    const pqLayout = {...darkLayout, title: 'PQ (ST.2084) Transfer Function'};
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
    
    const hlgLayout = {...darkLayout, title: 'HLG (BT.2100) Transfer Function'};
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
    const showCurves = document.getElementById('showCurves').checked;
    const showHistogram = document.getElementById('showHistogram') ? document.getElementById('showHistogram').checked : false;
    
    const numPoints = 256;
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
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
                y: linearValues.map(v => TransferFunctions.sRGB.encode(v)),
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
        margin: { t: 40, r: 30, b: 40, l: 50 },
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
    
    // Sample image buttons
    document.querySelectorAll('.sample-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sample = this.dataset.sample;
            
            // Test patterns
            if (['red', 'green', 'blue', 'gradient', 'colorBars'].includes(sample)) {
                generateTestPattern(sample);
            } 
            // Sample images
            else if (['landscape', 'sunset', 'neon'].includes(sample)) {
                generateSampleImage(sample);
            }
        });
    });
    
    // View toggle buttons
    separateView.addEventListener('click', () => {
        viewMode = 'separate';
        separateView.classList.add('active');
        combinedView.classList.remove('active');
        graphsContainer.classList.remove('combined-view');
        combinedGraph.classList.remove('active');
    });
    
    combinedView.addEventListener('click', () => {
        viewMode = 'combined';
        combinedView.classList.add('active');
        separateView.classList.remove('active');
        graphsContainer.classList.add('combined-view');
        combinedGraph.classList.add('active');
        updateCombinedGraph();
        setTimeout(() => {
            Plotly.Plots.resize('combinedGraph');
        }, 100);
    });
    
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
        Plotly.Plots.resize('srgbGraph');
        Plotly.Plots.resize('pqGraph');
        Plotly.Plots.resize('hlgGraph');
        if (viewMode === 'combined') {
            Plotly.Plots.resize('combinedGraph');
        }
    });
});