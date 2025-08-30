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
      // Dark night sky gradient
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
              ctx.fillStyle = `rgb(255, ${200 + Math.random() * 55}, 100)`;
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

  return ctx.getImageData(0, 0, width, height);
}