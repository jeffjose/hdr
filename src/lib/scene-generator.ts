export function generateSampleImage(type: string, width: number = 800, height: number = 600): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  switch (type) {
    case 'landscape':
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
      sky.addColorStop(0, '#87CEEB');
      sky.addColorStop(1, '#FFE4B5');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height * 0.7);
      
      // Ground
      ctx.fillStyle = '#228B22';
      ctx.fillRect(0, height * 0.7, width, height * 0.3);
      
      // Sun
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(width * 0.8, height * 0.3, 40, 0, Math.PI * 2);
      ctx.fill();
      
      // Mountains
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.7);
      ctx.lineTo(width * 0.3, height * 0.4);
      ctx.lineTo(width * 0.5, height * 0.7);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(width * 0.4, height * 0.7);
      ctx.lineTo(width * 0.7, height * 0.35);
      ctx.lineTo(width, height * 0.7);
      ctx.closePath();
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
      
      // Sun
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.7, 60, 0, Math.PI * 2);
      ctx.fill();
      
      // Clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, Math.PI * 2);
        ctx.arc(x + 20, y, 35, 0, Math.PI * 2);
        ctx.arc(x + 40, y, 30, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'neon':
      // Dark background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      // Neon lines
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
      
      // Neon circles
      ctx.strokeStyle = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur = 30;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 50 + 20, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;

    case 'city':
      // Night sky
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
      
      // Stars
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 50; i++) {
        ctx.fillRect(Math.random() * width, Math.random() * height * 0.5, 1, 1);
      }
      
      // Buildings
      const buildings = 15;
      for (let i = 0; i < buildings; i++) {
        const bWidth = Math.random() * 60 + 30;
        const bHeight = Math.random() * height * 0.6 + height * 0.2;
        const x = Math.random() * (width - bWidth);
        
        // Building
        ctx.fillStyle = `hsl(${Math.random() * 60 + 200}, 30%, 20%)`;
        ctx.fillRect(x, height - bHeight, bWidth, bHeight);
        
        // Windows
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
      
      // Smoke
      ctx.fillStyle = 'rgba(50, 50, 50, 0.3)';
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.arc(width / 2 + (Math.random() - 0.5) * 200, height * 0.2 + Math.random() * 100, Math.random() * 40 + 20, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'ocean':
      const ocean = ctx.createLinearGradient(0, 0, 0, height);
      ocean.addColorStop(0, '#001f3f');
      ocean.addColorStop(0.5, '#003d7a');
      ocean.addColorStop(1, '#007acc');
      ctx.fillStyle = ocean;
      ctx.fillRect(0, 0, width, height);
      
      // Waves
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
      
      // Foam
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * width, height * 0.3 + Math.random() * height * 0.4, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }

  return ctx.getImageData(0, 0, width, height);
}