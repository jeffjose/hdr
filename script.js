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
let pixelSamples = [];
let canvas = null;
let ctx = null;

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
        }
    };
    
    const config = {
        responsive: true,
        displayModeBar: false
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
        line: { color: '#4a9eff', width: 2 }
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
        line: { color: '#ff6b6b', width: 2 }
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
        line: { color: '#51cf66', width: 2 }
    }], hlgLayout, config);
}

// Update graphs with pixel data
function updateGraphsWithPixels() {
    if (!pixelSamples.length) return;
    
    const showCurves = document.getElementById('showCurves').checked;
    const showPixels = document.getElementById('showPixels').checked;
    
    const numPoints = 256;
    const linearValues = Array.from({length: numPoints}, (_, i) => i / (numPoints - 1));
    
    // Prepare pixel data for plotting
    const pixelLinearR = pixelSamples.map(p => p.linear.r);
    const pixelLinearG = pixelSamples.map(p => p.linear.g);
    const pixelLinearB = pixelSamples.map(p => p.linear.b);
    
    // sRGB
    const srgbTraces = [];
    if (showCurves) {
        srgbTraces.push({
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.sRGB.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'sRGB',
            line: { color: '#4a9eff', width: 2 }
        });
    }
    if (showPixels) {
        srgbTraces.push(
            {
                x: pixelLinearR,
                y: pixelLinearR.map(v => TransferFunctions.sRGB.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'R pixels',
                marker: { color: '#ff4444', size: 6, opacity: 0.7 }
            },
            {
                x: pixelLinearG,
                y: pixelLinearG.map(v => TransferFunctions.sRGB.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'G pixels',
                marker: { color: '#44ff44', size: 6, opacity: 0.7 }
            },
            {
                x: pixelLinearB,
                y: pixelLinearB.map(v => TransferFunctions.sRGB.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'B pixels',
                marker: { color: '#4444ff', size: 6, opacity: 0.7 }
            }
        );
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
        title: 'sRGB Transfer Function'
    };
    
    Plotly.react('srgbGraph', srgbTraces, darkLayout);
    
    // PQ
    const pqTraces = [];
    if (showCurves) {
        pqTraces.push({
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.PQ.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'PQ',
            line: { color: '#ff6b6b', width: 2 }
        });
    }
    if (showPixels) {
        pqTraces.push(
            {
                x: pixelLinearR,
                y: pixelLinearR.map(v => TransferFunctions.PQ.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'R pixels',
                marker: { color: '#ff4444', size: 6, opacity: 0.7 }
            },
            {
                x: pixelLinearG,
                y: pixelLinearG.map(v => TransferFunctions.PQ.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'G pixels',
                marker: { color: '#44ff44', size: 6, opacity: 0.7 }
            },
            {
                x: pixelLinearB,
                y: pixelLinearB.map(v => TransferFunctions.PQ.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'B pixels',
                marker: { color: '#4444ff', size: 6, opacity: 0.7 }
            }
        );
    }
    const pqLayout = {...darkLayout, title: 'PQ (ST.2084) Transfer Function'};
    Plotly.react('pqGraph', pqTraces, pqLayout);
    
    // HLG
    const hlgTraces = [];
    if (showCurves) {
        hlgTraces.push({
            x: linearValues,
            y: linearValues.map(v => TransferFunctions.HLG.encode(v)),
            type: 'scatter',
            mode: 'lines',
            name: 'HLG',
            line: { color: '#51cf66', width: 2 }
        });
    }
    if (showPixels) {
        hlgTraces.push(
            {
                x: pixelLinearR,
                y: pixelLinearR.map(v => TransferFunctions.HLG.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'R pixels',
                marker: { color: '#ff4444', size: 6, opacity: 0.7 }
            },
            {
                x: pixelLinearG,
                y: pixelLinearG.map(v => TransferFunctions.HLG.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'G pixels',
                marker: { color: '#44ff44', size: 6, opacity: 0.7 }
            },
            {
                x: pixelLinearB,
                y: pixelLinearB.map(v => TransferFunctions.HLG.encode(v)),
                type: 'scatter',
                mode: 'markers',
                name: 'B pixels',
                marker: { color: '#4444ff', size: 6, opacity: 0.7 }
            }
        );
    }
    const hlgLayout = {...darkLayout, title: 'HLG (BT.2100) Transfer Function'};
    Plotly.react('hlgGraph', hlgTraces, hlgLayout);
}

// Sample random pixels from the image
function sampleRandomPixels(numSamples = 100) {
    if (!imageData) return;
    
    pixelSamples = [];
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    for (let i = 0; i < numSamples; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const idx = (y * width + x) * 4;
        
        // Get sRGB values (0-255)
        const srgb = {
            r: data[idx] / 255,
            g: data[idx + 1] / 255,
            b: data[idx + 2] / 255
        };
        
        // Convert to linear
        const linear = {
            r: TransferFunctions.sRGB.decode(srgb.r),
            g: TransferFunctions.sRGB.decode(srgb.g),
            b: TransferFunctions.sRGB.decode(srgb.b)
        };
        
        pixelSamples.push({
            x, y,
            srgb,
            linear
        });
    }
    
    updateGraphsWithPixels();
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
        sampleRandomPixels();
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
        sampleRandomPixels();
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
            
            // Sample and plot pixels
            sampleRandomPixels();
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
    
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const sampleButton = document.getElementById('sampleButton');
    const showCurves = document.getElementById('showCurves');
    const showPixels = document.getElementById('showPixels');
    
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
    
    // Sample button
    sampleButton.addEventListener('click', () => {
        if (imageData) {
            sampleRandomPixels();
        }
    });
    
    // Show/hide toggles
    showCurves.addEventListener('change', updateGraphsWithPixels);
    showPixels.addEventListener('change', updateGraphsWithPixels);
    
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
    
    // Window resize
    window.addEventListener('resize', () => {
        Plotly.Plots.resize('srgbGraph');
        Plotly.Plots.resize('pqGraph');
        Plotly.Plots.resize('hlgGraph');
    });
});