<script lang="ts">
  console.log('[HDR] Component script loading...');
  
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { sRGB } from '$lib/transfer-functions/srgb';
  import { PQ } from '$lib/transfer-functions/pq';
  import { HLG } from '$lib/transfer-functions/hlg';
  import { generateTestPattern } from '$lib/test-patterns';
  import { generateSampleImage } from '$lib/scene-generator';
  import { calculateHistogram } from '$lib/histogram';
  
  // Plotly will be loaded dynamically
  let Plotly: any;
  
  // Plotly types
  type Data = any;
  type Layout = any;
  type Config = any;

  // State variables using Svelte 5 runes
  let imageData = $state<ImageData | null>(null);
  let currentHoverPixel = $state<{x: number, y: number, r: number, g: number, b: number} | null>(null);
  let viewMode = $state<'separate' | 'combined'>('combined');
  let transferMode = $state<'oetf' | 'eotf'>(
    (typeof localStorage !== 'undefined' && localStorage.getItem('transferMode') as 'oetf' | 'eotf') || 'eotf'
  );
  let peakBrightness = $state(1000);
  let histogram = $state<ReturnType<typeof calculateHistogram> | null>(null);
  let hdrMode = $state(false);
  let showCurves = $state(true);
  let showHistogram = $state(true);
  let layoutMode = $state<'side' | 'top'>('side');
  let showLoadImageMenu = $state(false);
  let isDraggingFile = $state(false);
  let currentSampleType = $state<string>('');

  // DOM references
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let fileInput: HTMLInputElement;
  let uploadedImage: HTMLImageElement;
  let imageContainer: HTMLDivElement;
  let leftPane: HTMLDivElement;
  let rightPane: HTMLDivElement;
  let splitter: HTMLDivElement;
  let mainContainer: HTMLDivElement;
  let hoverIndicator: HTMLDivElement;
  let imageInfo: HTMLDivElement;
  let urlInput: HTMLInputElement;

  // Graph containers
  let srgbGraph: HTMLDivElement & any;
  let pqGraph: HTMLDivElement & any;
  let hlgGraph: HTMLDivElement & any;
  let combinedGraph: HTMLDivElement & any;

  // Drag state
  let isDragging = $state(false);
  let startX = $state(0);
  let startLeftWidth = $state(0);
  
  // Throttling for graph updates
  let updateGraphTimeout: number | null = null;
  let lastUpdateTime = 0;
  const THROTTLE_DELAY = 16; // ~60fps

  // Transfer functions wrapper
  const TransferFunctions = {
    sRGB: sRGB,
    PQ: PQ,
    HLG: {
      encode: HLG.encode,
      decode: HLG.decode,
      signalToNits: (signal: number) => HLG.signalToNits(signal, peakBrightness),
      nitsToSignal: (nits: number) => HLG.nitsToSignal(nits, peakBrightness)
    }
  };

  onMount(async () => {
    console.log('[HDR] onMount started');
    if (browser) {
      console.log('[HDR] Browser environment detected, loading Plotly...');
      try {
        // Load Plotly dynamically on client side only
        const plotlyModule = await import('plotly.js-dist-min');
        Plotly = plotlyModule.default;
        console.log('[HDR] Plotly loaded successfully');
        
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d')!;
        console.log('[HDR] Canvas created');
        
        console.log('[HDR] Initializing graphs...');
        initializeGraphs();
        
        console.log('[HDR] Setting up event listeners...');
        setupEventListeners();
        
        // Delay initial sample load to ensure graphs are fully ready
        setTimeout(() => {
          console.log('[HDR] Loading initial sample image...');
          loadSampleImage('gradient');
        }, 200);
        
        console.log('[HDR] onMount completed successfully');
      } catch (error) {
        console.error('[HDR] Error in onMount:', error);
      }
    }
  });

  onDestroy(() => {
    // Cleanup event listeners
    if (browser) {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    }
  });

  function initializeGraphs() {
    console.log('[HDR] initializeGraphs called, Plotly available:', !!Plotly);
    if (!Plotly) {
      console.warn('[HDR] Plotly not available, skipping graph initialization');
      return; // Guard against SSR
    }
    
    console.log('[HDR] Transfer mode:', transferMode);
    if (transferMode === 'eotf') {
      initializeEOTFGraphs();
    } else {
      initializeOETFGraphs();
    }
  }

  function initializeEOTFGraphs() {
    if (viewMode === 'combined') {
      initializeCombinedEOTFGraph();
    } else {
      initializeSeparateEOTFGraphs();
    }
  }

  function initializeSeparateEOTFGraphs() {
    const sdrLayout: Partial<Layout> = {
      paper_bgcolor: "#0a0a0a",
      plot_bgcolor: "#0a0a0a",
      font: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: "#e0e0e0",
        size: 11
      },
      margin: { t: 30, r: 30, b: 60, l: 60 },
      xaxis: {
        title: "Input Signal (0-1)",
        gridcolor: "#333",
        zerolinecolor: "#555",
        range: [0, 1.05]
      },
      yaxis: {
        title: "Output Brightness (cd/m²)",
        gridcolor: "#333",
        zerolinecolor: "#555",
        type: "log",
        range: [-1, Math.log10(peakBrightness) + 0.5],
        tickmode: "array",
        tickvals: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10),
        ticktext: [0.1, 1, 10, 100, 1000, 10000]
          .filter(v => v <= peakBrightness * 10)
          .map(v => (v < 1000 ? String(v) : `${v / 1000}k`))
      },
      showlegend: true,
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: "rgba(0,0,0,0.5)"
      },
      hovermode: "closest",
      hoverlabel: {
        bgcolor: "rgba(0,0,0,0.8)",
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "white"
        }
      }
    };

    const config: Partial<Config> = {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    };

    const numPoints = 100;
    const signalValues = Array.from({ length: numPoints }, (_, i) => i / (numPoints - 1));

    // sRGB EOTF
    const srgbPeak = 100;
    const srgbLayout: Partial<Layout> = {
      ...sdrLayout,
      title: "sRGB EOTF (100 nits SDR)",
      yaxis: {
        ...sdrLayout.yaxis,
        range: [-1, Math.log10(srgbPeak) + 0.5],
        tickvals: [0.1, 1, 10, 100],
        ticktext: ["0.1", "1", "10", "100"]
      }
    };
    
    const srgbData: Data[] = [{
      x: signalValues,
      y: signalValues.map(signal => {
        const linear = TransferFunctions.sRGB.decode(signal);
        return linear * srgbPeak;
      }),
      type: "scatter",
      mode: "lines",
      name: "sRGB",
      line: { color: "#00bcd4", width: 2 },
      hovertemplate: "Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>"
    }];
    
    Plotly.newPlot(srgbGraph, srgbData, srgbLayout, config);

    // PQ EOTF
    const pqLayout: Partial<Layout> = {
      ...sdrLayout,
      title: "PQ EOTF (ST.2084)",
      yaxis: {
        ...sdrLayout.yaxis,
        range: [-1, 4],
        tickvals: [0.1, 1, 10, 100, 1000, 10000],
        ticktext: ["0.1", "1", "10", "100", "1k", "10k"]
      }
    };
    
    const pqData: Data[] = [{
      x: signalValues,
      y: signalValues.map(signal => TransferFunctions.PQ.decode(signal) * 100),
      type: "scatter",
      mode: "lines",
      name: "PQ",
      line: { color: "#ff9800", width: 2 },
      hovertemplate: "Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>"
    }];
    
    Plotly.newPlot(pqGraph, pqData, pqLayout, config);

    // HLG EOTF
    const hlgLayout: Partial<Layout> = {
      ...sdrLayout,
      title: `HLG EOTF (Peak: ${peakBrightness} cd/m²)`,
      yaxis: {
        ...sdrLayout.yaxis,
        range: [-1, Math.log10(peakBrightness) + 0.5],
        tickvals: [0.1, 1, 10, 100, 1000, 10000].filter(v => v <= peakBrightness * 10),
        ticktext: [0.1, 1, 10, 100, 1000, 10000]
          .filter(v => v <= peakBrightness * 10)
          .map(v => (v < 1000 ? String(v) : `${v / 1000}k`))
      }
    };
    
    const hlgData: Data[] = [{
      x: signalValues,
      y: signalValues.map(signal => TransferFunctions.HLG.signalToNits(signal)),
      type: "scatter",
      mode: "lines",
      name: "HLG",
      line: { color: "#9c27b0", width: 2 },
      hovertemplate: "Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>"
    }];
    
    Plotly.newPlot(hlgGraph, hlgData, hlgLayout, config);
  }

  function initializeCombinedEOTFGraph() {
    console.log('[HDR] initializeCombinedEOTFGraph called');
    
    if (!combinedGraph || !Plotly) {
      console.warn('[HDR] combinedGraph element or Plotly not ready, waiting...');
      setTimeout(() => {
        if (combinedGraph && Plotly) {
          console.log('[HDR] Retrying graph initialization...');
          initializeCombinedEOTFGraph();
        }
      }, 100);
      return;
    }
    
    const layout: Partial<Layout> = {
      paper_bgcolor: "#0a0a0a",
      plot_bgcolor: "#0a0a0a",
      font: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: "#e0e0e0",
        size: 11
      },
      margin: { t: 40, r: 30, b: 60, l: 70 },
      xaxis: {
        title: "Input Signal (0-1)",
        gridcolor: "#333",
        zerolinecolor: "#555",
        range: [0, 1.05],
        autorange: false,
        fixedrange: false
      },
      yaxis: {
        title: "Output Brightness (cd/m²)",
        gridcolor: "#333",
        zerolinecolor: "#555",
        type: "linear",
        range: [0, 3000],
        autorange: false,
        fixedrange: false
      },
      showlegend: true,
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: "rgba(0,0,0,0.5)"
      },
      hovermode: "closest",
      hoverlabel: {
        bgcolor: "rgba(0,0,0,0.8)",
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "white"
        }
      },
      title: "EOTF (Display Response Curves)",
      shapes: [{
        type: "line",
        x0: 0,
        x1: 1.05,
        y0: peakBrightness,
        y1: peakBrightness,
        line: {
          color: "#666",
          width: 1,
          dash: "dash"
        }
      }],
      annotations: [{
        x: 0.98,
        y: peakBrightness,
        xref: "x",
        yref: "y",
        text: `Peak: ${peakBrightness} nits`,
        showarrow: false,
        font: {
          size: 10,
          color: "#999"
        },
        xanchor: "right",
        yanchor: "bottom",
        yshift: 5
      }]
    };

    const config: Partial<Config> = {
      responsive: true,
      displayModeBar: false
    };

    const numPoints = 100;
    const signalValues = Array.from({ length: numPoints }, (_, i) => i / (numPoints - 1));

    const traces: Data[] = [
      {
        x: signalValues,
        y: signalValues.map(signal => {
          const linear = TransferFunctions.sRGB.decode(signal);
          return linear * 100;
        }),
        type: "scatter",
        mode: "lines",
        name: "sRGB (100 nits SDR)",
        line: { color: "#00bcd4", width: 2 },
        hovertemplate: "Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>"
      },
      {
        x: signalValues,
        y: signalValues.map(signal => TransferFunctions.PQ.decode(signal) * 100),
        type: "scatter",
        mode: "lines",
        name: "PQ (10000 nits)",
        line: { color: "#ff9800", width: 2 },
        hovertemplate: "Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>"
      },
      {
        x: signalValues,
        y: signalValues.map(signal => TransferFunctions.HLG.signalToNits(signal)),
        type: "scatter",
        mode: "lines",
        name: `HLG (${peakBrightness} nits)`,
        line: { color: "#9c27b0", width: 2 },
        hovertemplate: "Signal: %{x:.3f}<br>Brightness: %{y:.1f} cd/m²<extra></extra>"
      }
    ];

    Plotly.newPlot(combinedGraph, traces, layout, config);
  }

  function initializeOETFGraphs() {
    if (viewMode === 'combined') {
      initializeCombinedOETFGraph();
    } else {
      initializeSeparateOETFGraphs();
    }
  }

  function initializeSeparateOETFGraphs() {
    const baseLayout: Partial<Layout> = {
      paper_bgcolor: "#0a0a0a",
      plot_bgcolor: "#0a0a0a",
      font: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: "#e0e0e0",
        size: 11
      },
      margin: { t: 30, r: 30, b: 60, l: 60 },
      xaxis: {
        title: "Scene Light Intensity (Linear)",
        gridcolor: "#333",
        zerolinecolor: "#555"
      },
      yaxis: {
        title: "Encoded Signal (0-1)",
        gridcolor: "#333",
        zerolinecolor: "#555",
        range: [0, 1.05]
      },
      showlegend: true,
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: "rgba(0,0,0,0.5)"
      },
      hovermode: "closest",
      hoverlabel: {
        bgcolor: "rgba(0,0,0,0.8)",
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "white"
        }
      }
    };

    const config: Partial<Config> = {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    };

    const numPoints = 100;

    // sRGB OETF - SDR standard, linear values 0-1
    const srgbLayout: Partial<Layout> = {
      ...baseLayout,
      title: "sRGB OETF (100 nits SDR)",
      xaxis: {
        ...baseLayout.xaxis,
        title: "Linear Input",
        range: [0, 1],
        fixedrange: false
      },
      yaxis: {
        ...baseLayout.yaxis,
        range: [0, 1],
        fixedrange: false
      }
    };
    const linearValues = Array.from({ length: numPoints }, (_, i) => i / (numPoints - 1));
    const srgbY = linearValues.map(v => TransferFunctions.sRGB.encode(v));

    const srgbData: Data[] = [{
      x: linearValues,
      y: srgbY,
      type: "scatter",
      mode: "lines",
      name: "sRGB",
      line: { color: "#00bcd4", width: 2 },
      hovertemplate: "X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>"
    }];

    Plotly.newPlot(srgbGraph, srgbData, srgbLayout, config);

    // PQ OETF - uses absolute scale where 1.0 = 100 nits, 100 = 10,000 nits
    const pqLayout: Partial<Layout> = {
      ...baseLayout,
      title: "PQ OETF (ST.2084)",
      xaxis: {
        ...baseLayout.xaxis,
        title: "Linear Light Input (0=black, 1=100 nits, 100=10,000 nits)",
        range: [0, 6], // Default view 0-600 nits
        fixedrange: false
      }
    };
    const pqLinearValues = Array.from({ length: numPoints }, (_, i) => (i / (numPoints - 1)) * 100);
    const pqY = pqLinearValues.map(v => TransferFunctions.PQ.encode(v));

    const pqData: Data[] = [{
      x: pqLinearValues,
      y: pqY,
      type: "scatter",
      mode: "lines",
      name: "PQ",
      line: { color: "#ff9800", width: 2 },
      hovertemplate: "X: %{x:.3f} (~%{text})<br>Y: %{y:.3f}<extra></extra>",
      text: pqLinearValues.map(v => `${(v * 100).toFixed(0)} nits`)
    }];

    Plotly.newPlot(pqGraph, pqData, pqLayout, config);

    // HLG OETF - relative scale where 1.0 = reference white, 12 = peak
    const hlgLayout: Partial<Layout> = {
      ...baseLayout,
      title: "HLG OETF (BT.2100)",
      xaxis: {
        ...baseLayout.xaxis,
        title: "Linear Light Input (0=black, 1=ref white, 12=peak)",
        range: [0, 6],
        fixedrange: false
      }
    };
    const hlgLinearValues = Array.from({ length: numPoints }, (_, i) => (i / (numPoints - 1)) * 12);
    const hlgY = hlgLinearValues.map(v => TransferFunctions.HLG.encode(v));

    const hlgData: Data[] = [{
      x: hlgLinearValues,
      y: hlgY,
      type: "scatter",
      mode: "lines",
      name: "HLG",
      line: { color: "#9c27b0", width: 2 },
      hovertemplate: "X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>"
    }];

    Plotly.newPlot(hlgGraph, hlgData, hlgLayout, config);
  }

  function initializeCombinedOETFGraph() {
    const layout: Partial<Layout> = {
      paper_bgcolor: "#0a0a0a",
      plot_bgcolor: "#0a0a0a",
      font: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: "#e0e0e0",
        size: 11
      },
      margin: { t: 40, r: 30, b: 60, l: 70 },
      xaxis: {
        title: "Linear Intensity",
        gridcolor: "#333",
        zerolinecolor: "#555",
        range: [0, 6],
        autorange: false,
        fixedrange: false
      },
      yaxis: {
        title: "Encoded Signal (0-1)",
        gridcolor: "#333",
        zerolinecolor: "#555",
        range: [0, 1.05],
        autorange: false,
        fixedrange: false
      },
      showlegend: true,
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: "rgba(0,0,0,0.5)"
      },
      hovermode: "closest",
      hoverlabel: {
        bgcolor: "rgba(0,0,0,0.8)",
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "white"
        }
      },
      title: "OETF (Opto-Electronic Transfer Functions)",
      annotations: [{
        x: 1,
        y: 1.0,
        xref: "x",
        yref: "y",
        text: "Reference<br>White",
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1,
        arrowwidth: 1,
        arrowcolor: "#666",
        ax: 30,
        ay: -30,
        font: { size: 10, color: "#999" }
      }]
    };

    const config: Partial<Config> = {
      responsive: true,
      displayModeBar: false
    };

    const numPoints = 200;
    // Create linear points from 0 to 12 (relative intensity)
    const xLinear = Array.from({ length: numPoints }, (_, i) => (i / (numPoints - 1)) * 12);

    // sRGB: Clips at 1.0
    const srgbY = xLinear.map(v => v <= 1 ? TransferFunctions.sRGB.encode(v) : 1.0);

    // HLG: Can encode the full range
    const hlgY = xLinear.map(v => TransferFunctions.HLG.encode(v));

    // PQ: For comparison, though it uses absolute scale
    const pqY = xLinear.map(v => TransferFunctions.PQ.encode(v));

    const traces: Data[] = [
      {
        x: xLinear,
        y: srgbY,
        type: "scatter",
        mode: "lines",
        name: "sRGB",
        line: { color: "#00bcd4", width: 2 },
        hovertemplate: "sRGB<br>Linear: %{x:.2f}<br>Signal: %{y:.3f}<extra></extra>"
      },
      {
        x: xLinear,
        y: hlgY,
        type: "scatter",
        mode: "lines",
        name: "HLG",
        line: { color: "#9c27b0", width: 2 },
        hovertemplate: "HLG<br>Linear: %{x:.2f}<br>Signal: %{y:.3f}<extra></extra>"
      },
      {
        x: xLinear,
        y: pqY,
        type: "scatter",
        mode: "lines",
        name: "PQ (ST.2084)",
        line: { color: "#ff9800", width: 2 },
        hovertemplate: "PQ<br>Linear: %{x:.2f} (~%{text})<br>Signal: %{y:.3f}<extra></extra>",
        text: xLinear.map(v => `${(v * 100).toFixed(0)} nits`)
      }
    ];

    Plotly.newPlot(combinedGraph, traces, layout, config);
  }

  function setupEventListeners() {
    // Splitter drag functionality will be added inline
  }

  function handleSplitterMouseDown(e: MouseEvent) {
    isDragging = true;
    startX = layoutMode === 'side' ? e.clientX : e.clientY;
    startLeftWidth = layoutMode === 'side' ? leftPane.offsetWidth : leftPane.offsetHeight;
    splitter.classList.add('dragging');
    document.body.style.cursor = layoutMode === 'side' ? 'col-resize' : 'row-resize';
    e.preventDefault();
    
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
  }

  function handleDocumentMouseMove(e: MouseEvent) {
    if (!isDragging) return;

    if (layoutMode === 'side') {
      const deltaX = e.clientX - startX;
      const newLeftWidth = startLeftWidth + deltaX;
      const containerWidth = mainContainer.offsetWidth;
      const percentage = (newLeftWidth / containerWidth) * 100;
      
      if (percentage > 20 && percentage < 80) {
        leftPane.style.flex = `0 0 ${percentage}%`;
        rightPane.style.flex = '1';
      }
    } else {
      const deltaY = e.clientY - startX;
      const newTopHeight = startLeftWidth + deltaY;
      const containerHeight = mainContainer.offsetHeight;
      const percentage = (newTopHeight / containerHeight) * 100;
      
      if (percentage > 20 && percentage < 80) {
        leftPane.style.flex = `0 0 ${percentage}%`;
        rightPane.style.flex = '1';
      }
    }
    
    // Resize graphs
    if (Plotly) {
      if (combinedGraph) Plotly.Plots.resize(combinedGraph);
      if (viewMode === 'separate') {
        if (srgbGraph) Plotly.Plots.resize(srgbGraph);
        if (pqGraph) Plotly.Plots.resize(pqGraph);
        if (hlgGraph) Plotly.Plots.resize(hlgGraph);
      }
    }
  }

  function handleDocumentMouseUp() {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
    }
  }

  function loadSampleImage(type: string) {
    console.log('[HDR] loadSampleImage called with type:', type);
    currentSampleType = type;
    const testPatterns = ['red', 'green', 'blue', 'white', 'black', 'gradient', 'radialGradient', 'colorBars', 'graySteps'];
    const scenes = ['landscape', 'sunset', 'neon', 'city', 'fire', 'ocean'];
    
    let testImageData: ImageData;
    try {
      if (testPatterns.includes(type)) {
        console.log('[HDR] Generating test pattern:', type);
        testImageData = generateTestPattern(type, 800, 600);
      } else if (scenes.includes(type)) {
        console.log('[HDR] Generating scene:', type);
        testImageData = generateSampleImage(type, 800, 600);
      } else {
        console.warn('[HDR] Unknown sample type:', type);
        return;
      }
      
      console.log('[HDR] Image data generated, processing...');
      processImage(testImageData, type);
      showLoadImageMenu = false;
    } catch (error) {
      console.error('[HDR] Error in loadSampleImage:', error);
    }
  }

  function processImage(imgData: ImageData, source?: string) {
    imageData = imgData;
    histogram = calculateHistogram(imgData);
    
    // Create display canvas
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = imgData.width;
    displayCanvas.height = imgData.height;
    const displayCtx = displayCanvas.getContext('2d')!;
    displayCtx.putImageData(imgData, 0, 0);
    
    uploadedImage.src = displayCanvas.toDataURL();
    uploadedImage.style.display = 'block';
    
    updateImageInfo(source);
    
    // Delay histogram update to ensure graphs are ready
    setTimeout(() => {
      updateGraphsWithHistogram();
    }, 100);
  }

  function updateImageInfo(source?: string) {
    if (!imageData) {
      imageInfo.innerHTML = '<span class="text-dark-text-muted">No image loaded</span>';
      return;
    }
    
    const format = hdrMode ? 'HDR' : 'SDR';
    const encoding = transferMode === 'eotf' ? 'Display' : 'Scene';
    let sourceInfo = '';
    
    if (source) {
      const testPatterns = ['red', 'green', 'blue', 'white', 'black', 'gradient', 'radialGradient', 'colorBars', 'graySteps'];
      if (testPatterns.includes(source)) {
        sourceInfo = `<span class="text-dark-text-muted">Test Pattern:</span> ${source} | `;
      } else {
        sourceInfo = `<span class="text-dark-text-muted">Sample:</span> ${source} | `;
      }
    }
    
    imageInfo.innerHTML = `
      ${sourceInfo}
      <span class="text-dark-text-muted">Size:</span> ${imageData.width}×${imageData.height} | 
      <span class="text-dark-text-muted">Format:</span> ${format} | 
      <span class="text-dark-text-muted">Mode:</span> ${encoding} | 
      <span class="text-dark-text-muted">Peak:</span> ${peakBrightness} nits
    `;
  }

  function handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        processImage(imgData);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleImageHover(e: MouseEvent) {
    if (!imageData) return;
    
    const rect = uploadedImage.getBoundingClientRect();
    const scaleX = imageData.width / rect.width;
    const scaleY = imageData.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    if (x >= 0 && x < imageData.width && y >= 0 && y < imageData.height) {
      const index = (y * imageData.width + x) * 4;
      currentHoverPixel = {
        x, y,
        r: imageData.data[index],
        g: imageData.data[index + 1],
        b: imageData.data[index + 2]
      };
      
      // Update hover indicator position
      hoverIndicator.style.left = `${e.clientX}px`;
      hoverIndicator.style.top = `${e.clientY}px`;
      hoverIndicator.style.display = 'block';
      
      // Throttle graph updates to 60fps
      const now = Date.now();
      if (now - lastUpdateTime > THROTTLE_DELAY) {
        lastUpdateTime = now;
        updateGraphsWithHover();
      } else {
        if (updateGraphTimeout) clearTimeout(updateGraphTimeout);
        updateGraphTimeout = setTimeout(() => {
          updateGraphsWithHover();
          lastUpdateTime = Date.now();
        }, THROTTLE_DELAY) as unknown as number;
      }
    }
  }

  function handleImageLeave() {
    currentHoverPixel = null;
    hoverIndicator.style.display = 'none';
    
    // Clear any pending graph update
    if (updateGraphTimeout) {
      clearTimeout(updateGraphTimeout);
      updateGraphTimeout = null;
    }
    
    // Clear hover markers from graphs
    if (Plotly) {
      try {
        if (viewMode === 'combined' && combinedGraph?.data) {
          const markerIndices: number[] = [];
          combinedGraph.data.forEach((trace: any, index: number) => {
            if (['R', 'G', 'B'].includes(trace.name)) {
              markerIndices.push(index);
            }
          });
          if (markerIndices.length > 0) {
            Plotly.deleteTraces(combinedGraph, markerIndices);
          }
        } else {
          [srgbGraph, pqGraph, hlgGraph].forEach(graph => {
            if (graph?.data) {
              const markerIndices: number[] = [];
              graph.data.forEach((trace: any, index: number) => {
                if (['R', 'G', 'B'].includes(trace.name)) {
                  markerIndices.push(index);
                }
              });
              if (markerIndices.length > 0) {
                Plotly.deleteTraces(graph, markerIndices);
              }
            }
          });
        }
      } catch (error) {
        console.error('[HDR] Error clearing hover markers:', error);
      }
    }
  }

  function toggleTransferMode(mode: 'oetf' | 'eotf') {
    transferMode = mode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('transferMode', mode);
    }
    initializeGraphs();
    updateImageInfo(currentSampleType);
    if (histogram) {
      updateGraphsWithHistogram();
    }
  }

  function toggleViewMode(mode: 'separate' | 'combined') {
    viewMode = mode;
    initializeGraphs();
    if (histogram) {
      updateGraphsWithHistogram();
    }
  }

  function toggleLayoutMode(mode: 'side' | 'top') {
    layoutMode = mode;
  }

  function handlePeakBrightnessChange() {
    // Update HLG wrapper
    TransferFunctions.HLG.signalToNits = (signal: number) => HLG.signalToNits(signal, peakBrightness);
    TransferFunctions.HLG.nitsToSignal = (nits: number) => HLG.nitsToSignal(nits, peakBrightness);
    
    initializeGraphs();
    updateImageInfo(currentSampleType);
    if (histogram) {
      updateGraphsWithHistogram();
    }
  }

  function handleUrlLoad() {
    const url = urlInput.value;
    if (!url) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      try {
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        processImage(imgData, 'URL');
        showLoadImageMenu = false;
        urlInput.value = '';
      } catch (e) {
        // CORS error
        alert('Cannot analyze image due to CORS restrictions. Please download and upload the image locally.');
      }
    };
    
    img.onerror = () => {
      alert('Failed to load image. Check the URL and try again.');
    };
    
    img.src = url;
  }

  function updateGraphsWithHistogram() {
    if (!histogram || !showHistogram || !Plotly) return;
    
    // Ensure graphs are initialized
    if (viewMode === 'combined' && !combinedGraph?.data) return;
    if (viewMode === 'separate' && (!srgbGraph?.data || !pqGraph?.data || !hlgGraph?.data)) return;
    
    // Create histogram trace
    const maxValue = Math.max(...histogram.luminance);
    if (maxValue === 0) return; // Avoid division by zero
    
    const histogramTrace = {
      x: Array.from({ length: histogram.bins }, (_, i) => i / histogram.bins),
      y: histogram.luminance.map(v => v / maxValue * 0.3), // Scale to 30% of graph height
      type: 'scatter',
      mode: 'lines',
      fill: 'tozeroy',
      fillcolor: 'rgba(255, 255, 255, 0.1)',
      line: {
        color: 'rgba(255, 255, 255, 0.3)',
        width: 1
      },
      name: 'Histogram',
      yaxis: 'y2',
      hoverinfo: 'skip'
    };
    
    try {
      // Update graphs based on view mode
      if (viewMode === 'combined' && combinedGraph) {
        // Remove existing histogram if present
        const histogramIndex = combinedGraph.data?.findIndex((trace: any) => trace.name === 'Histogram');
        if (histogramIndex !== undefined && histogramIndex >= 0) {
          Plotly.deleteTraces(combinedGraph, histogramIndex);
        }
        
        // Add new histogram trace
        Plotly.addTraces(combinedGraph, histogramTrace);
        
        // Update layout for y2 axis
        Plotly.relayout(combinedGraph, {
          'yaxis2': {
            overlaying: 'y',
            side: 'right',
            range: [0, 1],
            showgrid: false,
            zeroline: false,
            showticklabels: false,
            showline: false
          }
        });
      } else if (viewMode === 'separate') {
        // Update separate graphs
        [srgbGraph, pqGraph, hlgGraph].forEach(graph => {
          if (!graph?.data) return;
          
          // Remove existing histogram if present
          const histogramIndex = graph.data?.findIndex((trace: any) => trace.name === 'Histogram');
          if (histogramIndex !== undefined && histogramIndex >= 0) {
            Plotly.deleteTraces(graph, histogramIndex);
          }
          
          // Add new histogram trace
          Plotly.addTraces(graph, histogramTrace);
          
          // Update layout for y2 axis
          Plotly.relayout(graph, {
            'yaxis2': {
              overlaying: 'y',
              side: 'right',
              range: [0, 1],
              showgrid: false,
              zeroline: false,
              showticklabels: false,
              showline: false
            }
          });
        });
      }
    } catch (error) {
      console.error('[HDR] Error updating histogram:', error);
    }
  }
  
  function updateGraphsWithHover() {
    if (!currentHoverPixel || !Plotly) return;
    
    // Normalize RGB values to 0-1
    const r = currentHoverPixel.r / 255;
    const g = currentHoverPixel.g / 255;
    const b = currentHoverPixel.b / 255;
    
    // Create hover markers for R, G, B channels
    const createMarkers = (transform: (v: number) => number) => {
      return [
        {
          x: [transferMode === 'oetf' ? transform(r) : r],
          y: [transferMode === 'oetf' ? r : transform(r)],
          type: 'scatter',
          mode: 'markers',
          marker: { color: 'red', size: 8 },
          name: 'R',
          showlegend: false,
          hovertemplate: 'R: %{x:.3f}, %{y:.3f}<extra></extra>'
        },
        {
          x: [transferMode === 'oetf' ? transform(g) : g],
          y: [transferMode === 'oetf' ? g : transform(g)],
          type: 'scatter',
          mode: 'markers',
          marker: { color: 'green', size: 8 },
          name: 'G',
          showlegend: false,
          hovertemplate: 'G: %{x:.3f}, %{y:.3f}<extra></extra>'
        },
        {
          x: [transferMode === 'oetf' ? transform(b) : b],
          y: [transferMode === 'oetf' ? b : transform(b)],
          type: 'scatter',
          mode: 'markers',
          marker: { color: 'blue', size: 8 },
          name: 'B',
          showlegend: false,
          hovertemplate: 'B: %{x:.3f}, %{y:.3f}<extra></extra>'
        }
      ];
    };
    
    try {
      if (viewMode === 'combined' && combinedGraph) {
        // Use Plotly.addTraces/deleteTraces instead of react to avoid circular references
        const graphDiv = combinedGraph;
        
        // Get current trace count
        const currentTraces = graphDiv.data || [];
        const markerIndices: number[] = [];
        
        // Find and remove existing RGB markers
        currentTraces.forEach((trace: any, index: number) => {
          if (['R', 'G', 'B'].includes(trace.name)) {
            markerIndices.push(index);
          }
        });
        
        if (markerIndices.length > 0) {
          Plotly.deleteTraces(graphDiv, markerIndices);
        }
        
        // Add new markers
        const markers = transferMode === 'oetf' 
          ? createMarkers(TransferFunctions.sRGB.decode)
          : createMarkers(TransferFunctions.sRGB.encode);
        
        Plotly.addTraces(graphDiv, markers);
      } else if (viewMode === 'separate') {
        // Update separate graphs
        const graphs = [
          { element: srgbGraph, transform: TransferFunctions.sRGB },
          { element: pqGraph, transform: TransferFunctions.PQ },
          { element: hlgGraph, transform: TransferFunctions.HLG }
        ];
        
        graphs.forEach(({ element, transform }) => {
          if (!element || !element.data) return;
          
          const currentTraces = element.data || [];
          const markerIndices: number[] = [];
          
          // Find and remove existing RGB markers
          currentTraces.forEach((trace: any, index: number) => {
            if (['R', 'G', 'B'].includes(trace.name)) {
              markerIndices.push(index);
            }
          });
          
          if (markerIndices.length > 0) {
            Plotly.deleteTraces(element, markerIndices);
          }
          
          // Add new markers
          const markers = transferMode === 'oetf'
            ? createMarkers(transform.decode)
            : createMarkers(transform.encode);
          
          Plotly.addTraces(element, markers);
        });
      }
    } catch (error) {
      console.error('[HDR] Error updating hover markers:', error);
    }
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDraggingFile = true;
  }
  
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDraggingFile = false;
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingFile = false;
    
    if (e.dataTransfer?.files.length) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleFileUpload({ target: { files: [file] } } as any);
      }
    }
  }
  
  // Handle HDR mode toggle
  function handleHdrToggle() {
    // If we have a sample loaded, regenerate it with new HDR mode
    if (currentSampleType && imageData) {
      loadSampleImage(currentSampleType);
    }
  }
  
  // Test pattern samples
  const testPatterns = [
    { id: 'red', emoji: '🔴', label: 'Red' },
    { id: 'green', emoji: '🟢', label: 'Green' },
    { id: 'blue', emoji: '🔵', label: 'Blue' },
    { id: 'white', emoji: '⚪', label: 'White' },
    { id: 'black', emoji: '⚫', label: 'Black' },
    { id: 'gradient', emoji: '🌈', label: 'Gradient' },
    { id: 'radialGradient', emoji: '🎯', label: 'Radial' },
    { id: 'colorBars', emoji: '📊', label: 'Bars' },
    { id: 'graySteps', emoji: '📶', label: 'Steps' }
  ];

  const scenes = [
    { id: 'landscape', emoji: '🏞️', label: 'Nature' },
    { id: 'sunset', emoji: '🌅', label: 'Sunset' },
    { id: 'neon', emoji: '💫', label: 'Neon' },
    { id: 'city', emoji: '🌃', label: 'City' },
    { id: 'fire', emoji: '🔥', label: 'Fire' },
    { id: 'ocean', emoji: '🌊', label: 'Ocean' }
  ];
</script>

<div class="bg-dark-panel text-dark-text h-screen overflow-hidden font-sans">
  <div bind:this={mainContainer} class="flex h-screen {layoutMode === 'side' ? 'flex-row' : 'flex-col'} transition-all duration-300 ease-in-out">
    <div bind:this={leftPane} class="flex-1 p-5 flex flex-col overflow-x-visible overflow-y-auto relative z-[1]">
      <!-- Compact Horizontal Input Bar -->
      <div class="bg-dark-surface rounded-md p-2 mb-3 flex flex-wrap gap-2 items-start overflow-visible relative z-[100] toolbar-container [&>*]:flex-shrink-0">
        <!-- Logo/Branding -->
        <div class="flex items-center gap-2.5 pr-2 flex-shrink-0">
          <div class="flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hdrgradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#00bcd4;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#ff9800;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#9c27b0;stop-opacity:1" />
                </linearGradient>
              </defs>
              <path d="M4 20 Q 8 18, 12 12 T 20 4" stroke="url(#hdrgradient)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <path d="M4 24 Q 10 22, 14 16 T 24 8" stroke="#4a9eff" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>
              <circle cx="6" cy="19" r="1.5" fill="#00bcd4"/>
              <circle cx="12" cy="14" r="1.5" fill="#ff9800"/>
              <circle cx="18" cy="8" r="1.5" fill="#9c27b0"/>
            </svg>
          </div>
          <div class="flex flex-col justify-center">
            <div class="font-semibold text-[13px] text-dark-text">HDR Analyzer</div>
            <div class="text-[9px] text-dark-text-dim tracking-wider">TRANSFER FUNCTIONS</div>
          </div>
        </div>
        
        <div class="w-px bg-dark-border mx-1"></div>
        
        <!-- Layout Toggle -->
        <div class="flex items-center gap-1">
          <button 
            onclick={() => toggleLayoutMode('side')}
            class="w-6 h-6 flex items-center justify-center rounded bg-dark-surface-2 border border-dark-border-2 transition-all duration-200 cursor-pointer hover:bg-dark-hover hover:border-brand-blue {layoutMode === 'side' ? 'bg-brand-blue border-brand-blue' : ''}"
            title="Side by Side">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 {layoutMode === 'side' ? 'text-white' : 'text-dark-text-muted'}">
              <rect x="3" y="3" width="8" height="18" rx="1"/>
              <rect x="13" y="3" width="8" height="18" rx="1"/>
            </svg>
          </button>
          <button 
            onclick={() => toggleLayoutMode('top')}
            class="w-6 h-6 flex items-center justify-center rounded bg-dark-surface-2 border border-dark-border-2 transition-all duration-200 cursor-pointer hover:bg-dark-hover hover:border-brand-blue {layoutMode === 'top' ? 'bg-brand-blue border-brand-blue' : ''}"
            title="Top/Bottom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 {layoutMode === 'top' ? 'text-white' : 'text-dark-text-muted'}">
              <rect x="3" y="3" width="18" height="8" rx="1"/>
              <rect x="3" y="13" width="18" height="8" rx="1"/>
            </svg>
          </button>
        </div>
        
        <div class="w-px bg-dark-border mx-1"></div>
        
        <!-- Load Image Dropdown -->
        <div class="relative">
          <button 
            onclick={() => showLoadImageMenu = !showLoadImageMenu}
            class="w-6 h-6 flex items-center justify-center rounded bg-dark-surface-2 border border-dark-border-2 transition-all duration-200 cursor-pointer hover:bg-dark-hover hover:border-brand-blue"
            title="Load Image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-dark-text-muted hover:text-brand-blue">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          
          {#if showLoadImageMenu}
          <div class="absolute top-full left-0 mt-2 bg-dark-surface-3 border border-dark-border-2 rounded-lg shadow-2xl z-[10000]" style="width: 340px; max-width: 90vw;">
            <div class="p-3">
              <!-- Header -->
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-xs font-semibold text-dark-text uppercase tracking-wider">Load Image</h3>
                <button 
                  onclick={() => showLoadImageMenu = false}
                  class="w-6 h-6 flex items-center justify-center rounded bg-dark-surface-2 border border-dark-border-2 transition-all duration-200 cursor-pointer hover:bg-dark-hover hover:border-brand-blue"
                  title="Close">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 text-dark-text-muted hover:text-brand-blue">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              
              <!-- Input Methods Row -->
              <div class="flex gap-2 mb-3">
                <!-- Upload Card -->
                <div 
                  onclick={() => fileInput.click()}
                  class="flex-1 bg-dark-surface-2 border border-dark-border rounded p-2 cursor-pointer hover:border-brand-blue hover:bg-dark-hover transition-all duration-200 group hover:-translate-y-0.5">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-brand-blue/10 flex items-center justify-center group-hover:bg-brand-blue/20 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-brand-blue">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <div>
                      <div class="text-[11px] font-medium text-dark-text">Upload</div>
                      <div class="text-[9px] text-dark-text-dim">Browse files</div>
                    </div>
                  </div>
                </div>
                
                <!-- URL Input -->
                <div class="flex-1 bg-dark-surface-2 border border-dark-border rounded p-2">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-purple-500/10 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-purple-400">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                    </div>
                    <input 
                      bind:this={urlInput}
                      type="url" 
                      placeholder="Paste URL..."
                      onkeydown={(e) => {
                        if (e.key === 'Enter') handleUrlLoad();
                      }}
                      class="flex-1 bg-transparent border-0 text-dark-text text-[11px] focus:outline-none placeholder:text-dark-text-dim">
                  </div>
                </div>
              </div>
              
              <!-- Samples Section -->
              <div class="border-t border-dark-border pt-2">
                <div class="text-[10px] uppercase text-dark-text-dim font-medium tracking-wider mb-1.5">Samples</div>
                
                <!-- Test Patterns Grid -->
                <div class="mb-2">
                  <div class="text-[9px] text-dark-text-muted mb-1">Test Patterns</div>
                  <div class="grid grid-cols-5 gap-1.5">
                    {#each testPatterns as pattern}
                    <div 
                      onclick={() => loadSampleImage(pattern.id)}
                      class="bg-dark-surface-2 border border-dark-border rounded p-1.5 cursor-pointer hover:border-brand-blue hover:bg-dark-hover transition-all duration-200 text-center hover:-translate-y-0.5">
                      <div class="text-sm">{pattern.emoji}</div>
                      <div class="text-[8px] text-dark-text-muted">{pattern.label}</div>
                    </div>
                    {/each}
                  </div>
                </div>
                
                <!-- Generated Scenes Grid -->
                <div>
                  <div class="text-[9px] text-dark-text-muted mb-1">Scenes</div>
                  <div class="grid grid-cols-6 gap-1.5">
                    {#each scenes as scene}
                    <div 
                      onclick={() => loadSampleImage(scene.id)}
                      class="bg-dark-surface-2 border border-dark-border rounded p-1.5 cursor-pointer hover:border-brand-blue hover:bg-dark-hover transition-all duration-200 text-center hover:-translate-y-0.5">
                      <div class="text-sm">{scene.emoji}</div>
                      <div class="text-[8px] text-dark-text-muted">{scene.label}</div>
                    </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/if}
        </div>
        
        <!-- HDR Toggle -->
        <label class="relative flex items-center cursor-pointer group" title="Toggle HDR Mode">
          <input type="checkbox" bind:checked={hdrMode} onchange={handleHdrToggle} class="sr-only peer">
          <div class="w-6 h-6 rounded bg-dark-surface-3 border border-dark-border-2 flex items-center justify-center transition-all duration-200 hover:bg-dark-hover hover:border-brand-blue peer-checked:bg-brand-blue/15 peer-checked:border-brand-blue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="text-brand-blue font-bold {hdrMode ? '' : 'opacity-30'}">
              <text x="12" y="16" text-anchor="middle" fill="currentColor" font-size="12" font-weight="bold">HDR</text>
            </svg>
          </div>
        </label>
        
        <input bind:this={fileInput} type="file" accept="image/*" style="display: none;" onchange={handleFileUpload}>
      </div>
      
      <!-- Image Info -->
      <div bind:this={imageInfo} class="info p-2 px-2.5 bg-dark-surface-2 rounded-md text-xs leading-relaxed">
        <span class="text-dark-text-muted">No image loaded</span>
      </div>
      
      <!-- Image Display Area -->
      <div 
        bind:this={imageContainer} 
        class="flex-1 flex items-center justify-center bg-dark-bg rounded-lg overflow-hidden relative mt-2.5 min-h-0 {isDraggingFile ? 'ring-2 ring-brand-blue' : ''}"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}>
        <img 
          bind:this={uploadedImage} 
          style="display: none;" 
          class="max-w-full max-h-full object-contain" 
          alt="Uploaded image"
          onmousemove={handleImageHover}
          onmouseleave={handleImageLeave}>
      </div>
    </div>
    
    <!-- Draggable Separator -->
    <div 
      bind:this={splitter} 
      onmousedown={handleSplitterMouseDown}
      class="relative bg-dark-border flex-shrink-0 select-none transition-colors duration-200 hover:bg-brand-blue {isDragging ? 'bg-brand-blue' : ''} {layoutMode === 'side' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}">
      <div class="{layoutMode === 'side' ? 'splitter-handle-v' : 'splitter-handle-h'}"></div>
    </div>
    
    <div bind:this={rightPane} class="flex-1 p-5 flex flex-col overflow-x-visible overflow-y-auto relative z-[1]">
      <!-- Unified Control Panel -->
      <div class="controls p-2 bg-dark-surface-2 rounded-lg mb-2.5 flex flex-wrap gap-2 items-start overflow-visible relative z-[100] toolbar-container [&>*]:flex-shrink-0">
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Transfer Function Mode -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-dark-text-dim uppercase tracking-wider font-medium">Mode</span>
            <div class="flex bg-dark-panel border border-dark-border rounded overflow-hidden">
              <button 
                onclick={() => toggleTransferMode('oetf')}
                class="flex items-center gap-1 px-2 py-0.5 bg-transparent border-r border-dark-border text-[10px] cursor-pointer transition-all font-medium {transferMode === 'oetf' ? 'bg-brand-blue text-white font-semibold' : 'text-dark-text-muted hover:bg-brand-blue/10 hover:text-gray-300'}">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/>
                </svg>
                OETF
              </button>
              <button 
                onclick={() => toggleTransferMode('eotf')}
                class="flex items-center gap-1 px-2 py-0.5 bg-transparent text-[10px] cursor-pointer transition-all font-medium {transferMode === 'eotf' ? 'bg-brand-blue text-white font-semibold' : 'text-dark-text-muted hover:bg-brand-blue/10 hover:text-gray-300'}">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"/>
                </svg>
                EOTF
              </button>
            </div>
          </div>
          
          <!-- Peak Brightness Control -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-dark-text-dim uppercase tracking-wider font-medium">Peak</span>
            <select 
              bind:value={peakBrightness}
              onchange={handlePeakBrightnessChange}
              class="bg-dark-panel text-dark-text border border-dark-border px-1.5 py-0.5 rounded text-[10px] focus:outline-none focus:border-brand-blue" 
              style="height: 22px;">
              <option value={100}>100 nits</option>
              <option value={200}>200 nits</option>
              <option value={400}>400 nits</option>
              <option value={600}>600 nits</option>
              <option value={1000}>1000 nits</option>
              <option value={2000}>2000 nits</option>
              <option value={4000}>4000 nits</option>
              <option value={10000}>10000 nits</option>
            </select>
          </div>
          
          <div class="w-px h-5 bg-dark-border"></div>
          
          <!-- Graph Layout -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-dark-text-dim uppercase tracking-wider font-medium">View</span>
            <div class="flex items-center gap-0.5">
              <button 
                onclick={() => toggleViewMode('separate')}
                class="w-6 h-6 flex items-center justify-center rounded bg-dark-surface-2 border border-dark-border-2 transition-all duration-200 cursor-pointer hover:bg-dark-hover hover:border-brand-blue {viewMode === 'separate' ? 'bg-brand-blue border-brand-blue' : ''}"
                title="Separate View">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 {viewMode === 'separate' ? 'text-white' : 'text-dark-text-muted'}">
                  <rect x="3" y="3" width="8" height="8" rx="1"/>
                  <rect x="13" y="3" width="8" height="8" rx="1"/>
                  <rect x="3" y="13" width="8" height="8" rx="1"/>
                  <rect x="13" y="13" width="8" height="8" rx="1"/>
                </svg>
              </button>
              <button 
                onclick={() => toggleViewMode('combined')}
                class="w-6 h-6 flex items-center justify-center rounded bg-dark-surface-2 border border-dark-border-2 transition-all duration-200 cursor-pointer hover:bg-dark-hover hover:border-brand-blue {viewMode === 'combined' ? 'bg-brand-blue border-brand-blue' : ''}"
                title="Combined View">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 {viewMode === 'combined' ? 'text-white' : 'text-dark-text-muted'}">
                  <rect x="3" y="3" width="18" height="18" rx="1"/>
                  <path d="M3 12 L21 12" stroke-dasharray="2 2" opacity="0.5"/>
                  <path d="M12 3 L12 21" stroke-dasharray="2 2" opacity="0.5"/>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Display Toggles -->
          <div class="flex items-center gap-0.5">
            <!-- Transfer Curves Toggle -->
            <label class="relative flex items-center cursor-pointer group" title="Transfer Curves">
              <input type="checkbox" bind:checked={showCurves} class="sr-only peer">
              <div class="w-6 h-6 rounded bg-dark-surface-3 border border-dark-border-2 flex items-center justify-center transition-all duration-200 hover:bg-dark-hover hover:border-brand-blue peer-checked:bg-brand-blue/15 peer-checked:border-brand-blue">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-brand-blue {showCurves ? '' : 'opacity-30'}">
                  <path d="M3 20 Q 8 16, 12 10 T 21 3" stroke-linecap="round"/>
                </svg>
              </div>
            </label>
            
            <!-- Histogram Toggle -->
            <label class="relative flex items-center cursor-pointer group" title="Histogram">
              <input type="checkbox" bind:checked={showHistogram} class="sr-only peer">
              <div class="w-6 h-6 rounded bg-dark-surface-3 border border-dark-border-2 flex items-center justify-center transition-all duration-200 hover:bg-dark-hover hover:border-brand-blue peer-checked:bg-brand-blue/15 peer-checked:border-brand-blue">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="text-brand-blue {showHistogram ? '' : 'opacity-30'}">
                  <rect x="4" y="14" width="3" height="7" fill="currentColor"/>
                  <rect x="9" y="9" width="3" height="12" fill="currentColor"/>
                  <rect x="14" y="4" width="3" height="17" fill="currentColor"/>
                  <rect x="19" y="11" width="3" height="10" fill="currentColor"/>
                </svg>
              </div>
            </label>
          </div>
        </div>
      </div>
      
      <div class="flex-1 flex flex-col gap-2.5 overflow-hidden min-h-0">
        <div bind:this={srgbGraph} class="flex-1 bg-dark-bg rounded-lg {viewMode === 'separate' ? 'block' : 'hidden'} min-h-0 graph"></div>
        <div bind:this={pqGraph} class="flex-1 bg-dark-bg rounded-lg {viewMode === 'separate' ? 'block' : 'hidden'} min-h-0 graph"></div>
        <div bind:this={hlgGraph} class="flex-1 bg-dark-bg rounded-lg {viewMode === 'separate' ? 'block' : 'hidden'} min-h-0 graph"></div>
        <div bind:this={combinedGraph} class="flex-1 bg-dark-bg rounded-lg {viewMode === 'combined' ? 'block' : 'hidden'} min-h-0"></div>
      </div>
    </div>
  </div>
  
  <div bind:this={hoverIndicator} class="fixed w-5 h-5 border-2 border-brand-blue rounded-full pointer-events-none hidden -translate-x-1/2 -translate-y-1/2 z-[1000] shadow-[0_0_10px_rgba(74,158,255,0.5)] will-change-transform" style="transition: none;"></div>
</div>

<style>
  :global(body) {
    background-color: #1a1a1a;
  }

  input[type="checkbox"] {
    accent-color: #4a9eff;
  }
  
  .toolbar-container {
    container-type: inline-size;
  }
  
  @container (max-width: 600px) {
    .toolbar-container {
      gap: 6px;
    }
    .toolbar-container .w-px {
      display: none;
    }
  }
  
  @container (max-width: 400px) {
    .toolbar-container {
      gap: 4px;
    }
  }
  
  .splitter-handle-v {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 30px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
  
  .splitter-handle-h {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 30px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>