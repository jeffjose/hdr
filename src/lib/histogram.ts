export function calculateHistogram(imageData: ImageData): { r: number[], g: number[], b: number[], luminance: number[] } {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const luminance = new Array(256).fill(0);

  const data = imageData.data;
  const pixelCount = imageData.width * imageData.height;

  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    
    r[red]++;
    g[green]++;
    b[blue]++;
    
    const lum = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
    luminance[lum]++;
  }

  const normalize = (arr: number[]) => arr.map(v => v / pixelCount);
  
  return {
    r: normalize(r),
    g: normalize(g),
    b: normalize(b),
    luminance: normalize(luminance)
  };
}