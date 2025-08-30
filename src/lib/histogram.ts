// sRGB decode function for histogram calculation
function srgbDecode(value: number): number {
  if (value <= 0.04045) {
    return value / 12.92;
  } else {
    return Math.pow((value + 0.055) / 1.055, 2.4);
  }
}

export function calculateHistogram(imageData: ImageData): { 
  r: number[], 
  g: number[], 
  b: number[], 
  luminance: number[],
  bins: number,
  binWidth: number
} {
  const bins = 100; // Number of histogram bins (matching reference)
  const binWidth = 1 / bins;
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
    
    // Convert to linear space
    const linear = {
      r: srgbDecode(srgb.r),
      g: srgbDecode(srgb.g),
      b: srgbDecode(srgb.b)
    };
    
    // Calculate luminance using BT.709 coefficients
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
  const normalize = (hist: number[]) => hist.map(count => (count / totalPixels) * 100);
  
  return {
    r: normalize(histogramR),
    g: normalize(histogramG),
    b: normalize(histogramB),
    luminance: normalize(histogramLuminance),
    bins,
    binWidth
  };
}