// Additional sample image generators

function generateAdditionalSamples(type, ctx, width, height) {
    switch(type) {
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
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateAdditionalSamples };
}