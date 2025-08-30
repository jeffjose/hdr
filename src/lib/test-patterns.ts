export function generateTestPattern(type: string, width: number = 800, height: number = 600): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  switch (type) {
    case 'red':
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'green':
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'blue':
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'white':
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'black':
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'gradient':
      const gradientH = ctx.createLinearGradient(0, 0, width, 0);
      gradientH.addColorStop(0, '#000000');
      gradientH.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradientH;
      ctx.fillRect(0, 0, width, height);
      break;
    case 'radialGradient':
      const radialGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) / 2);
      radialGrad.addColorStop(0, '#ffffff');
      radialGrad.addColorStop(1, '#000000');
      ctx.fillStyle = radialGrad;
      ctx.fillRect(0, 0, width, height);
      break;
    case 'colorBars':
      const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
      const barWidth = width / colors.length;
      colors.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * barWidth, 0, barWidth, height);
      });
      break;
    case 'graySteps':
      const steps = 10;
      const stepWidth = width / steps;
      for (let i = 0; i < steps; i++) {
        const gray = Math.round((i / (steps - 1)) * 255);
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.fillRect(i * stepWidth, 0, stepWidth, height);
      }
      break;
    case 'landscape':
      const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
      sky.addColorStop(0, '#87CEEB');
      sky.addColorStop(1, '#FFE4B5');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height * 0.7);
      ctx.fillStyle = '#228B22';
      ctx.fillRect(0, height * 0.7, width, height * 0.3);
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(width * 0.8, height * 0.3, 40, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'sunset':
      const sunset = ctx.createLinearGradient(0, 0, 0, height);
      sunset.addColorStop(0, '#FF6B35');
      sunset.addColorStop(0.3, '#F77737');
      sunset.addColorStop(0.6, '#FFA500');
      sunset.addColorStop(1, '#4B0082');
      ctx.fillStyle = sunset;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.7, 60, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'neon':
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 20;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.stroke();
      }
      ctx.strokeStyle = '#ff00ff';
      ctx.shadowColor = '#ff00ff';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.stroke();
      }
      break;
    case 'city':
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
      const buildings = 15;
      for (let i = 0; i < buildings; i++) {
        const bWidth = Math.random() * 60 + 30;
        const bHeight = Math.random() * height * 0.6 + height * 0.2;
        const x = Math.random() * (width - bWidth);
        ctx.fillStyle = `hsl(${Math.random() * 60 + 200}, 30%, 20%)`;
        ctx.fillRect(x, height - bHeight, bWidth, bHeight);
        const windowRows = Math.floor(bHeight / 20);
        const windowCols = Math.floor(bWidth / 15);
        ctx.fillStyle = '#ffff99';
        for (let r = 0; r < windowRows; r++) {
          for (let c = 0; c < windowCols; c++) {
            if (Math.random() > 0.3) {
              ctx.fillRect(x + c * 15 + 3, height - bHeight + r * 20 + 5, 8, 10);
            }
          }
        }
      }
      break;
    case 'fire':
      const fire = ctx.createRadialGradient(width / 2, height * 0.8, 0, width / 2, height * 0.8, width / 2);
      fire.addColorStop(0, '#ffff00');
      fire.addColorStop(0.3, '#ff8800');
      fire.addColorStop(0.6, '#ff0000');
      fire.addColorStop(1, '#330000');
      ctx.fillStyle = fire;
      ctx.fillRect(0, 0, width, height);
      break;
    case 'ocean':
      const ocean = ctx.createLinearGradient(0, 0, 0, height);
      ocean.addColorStop(0, '#001f3f');
      ocean.addColorStop(0.5, '#003d7a');
      ocean.addColorStop(1, '#007acc');
      ctx.fillStyle = ocean;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(0, height * 0.3 + i * 20 + Math.sin(i) * 10);
        for (let x = 0; x <= width; x += 10) {
          ctx.lineTo(x, height * 0.3 + i * 20 + Math.sin(x / 50 + i) * 10);
        }
        ctx.stroke();
      }
      break;
  }

  return ctx.getImageData(0, 0, width, height);
}