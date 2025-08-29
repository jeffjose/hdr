// URL Image Loading functionality

// Handle image loading from URL
function loadImageFromURL(url) {
    const img = document.getElementById('uploadedImage');
    const urlError = document.getElementById('urlError');
    const loadBtn = document.getElementById('loadUrlBtn');
    
    // Hide error message
    if (urlError) {
        urlError.style.display = 'none';
        urlError.textContent = '';
    }
    
    // Validate URL
    if (!url || !url.trim()) {
        if (urlError) {
            urlError.textContent = 'Please enter a valid URL';
            urlError.style.display = 'block';
        }
        return;
    }
    
    // Show loading state
    if (loadBtn) {
        loadBtn.textContent = 'Loading...';
        loadBtn.disabled = true;
    }
    
    // Create a new image with CORS enabled
    const proxyImg = new Image();
    proxyImg.crossOrigin = 'anonymous';
    
    proxyImg.onload = function() {
        // Show image
        img.src = proxyImg.src;
        img.style.display = 'block';
        
        // Draw to canvas for pixel data extraction
        canvas.width = proxyImg.naturalWidth;
        canvas.height = proxyImg.naturalHeight;
        ctx.drawImage(proxyImg, 0, 0);
        
        try {
            // Get image data
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Extract filename from URL or use default
            const urlParts = url.split('/');
            const filename = urlParts[urlParts.length - 1].split('?')[0] || 'image';
            
            // Update info
            document.getElementById('imageInfo').innerHTML = `
                <strong>Source:</strong> URL<br>
                <strong>File:</strong> ${filename.substring(0, 30)}${filename.length > 30 ? '...' : ''}<br>
                <strong>Dimensions:</strong> ${proxyImg.naturalWidth} × ${proxyImg.naturalHeight}
            `;
            
            // Calculate histogram
            if (typeof calculateHistogram === 'function') {
                histogram = calculateHistogram(imageData);
            }
            
            // Update graphs
            if (typeof updateGraphs === 'function') {
                updateGraphs();
            }
            
            // Save to localStorage
            if (typeof saveImageState === 'function') {
                saveImageState({
                    dataUrl: canvas.toDataURL('image/png'),
                    name: filename,
                    width: proxyImg.naturalWidth,
                    height: proxyImg.naturalHeight,
                    size: null, // URL images don't have file size
                    type: 'URL'
                });
            }
            
            // Reset button
            if (loadBtn) {
                loadBtn.textContent = 'Load URL';
                loadBtn.disabled = false;
            }
        } catch (e) {
            // CORS error
            if (urlError) {
                urlError.textContent = 'CORS error: Cannot access image data. The image is displayed but cannot be analyzed.';
                urlError.style.display = 'block';
            }
            if (loadBtn) {
                loadBtn.textContent = 'Load URL';
                loadBtn.disabled = false;
            }
            
            // Still show the image even if we can't analyze it
            document.getElementById('imageInfo').innerHTML = `
                <strong>Error:</strong> Cannot analyze due to CORS<br>
                <strong>Solution:</strong> Download and upload the image locally
            `;
        }
    };
    
    proxyImg.onerror = function() {
        // Try without CORS as fallback
        img.onerror = function() {
            if (urlError) {
                urlError.textContent = 'Failed to load image. Check the URL and try again.';
                urlError.style.display = 'block';
            }
            if (loadBtn) {
                loadBtn.textContent = 'Load URL';
                loadBtn.disabled = false;
            }
        };
        
        img.onload = function() {
            img.style.display = 'block';
            if (urlError) {
                urlError.textContent = 'Image loaded but cannot be analyzed due to CORS restrictions.';
                urlError.style.display = 'block';
            }
            document.getElementById('imageInfo').innerHTML = `
                <strong>Warning:</strong> Image visible but not analyzable<br>
                <strong>Reason:</strong> Cross-origin restrictions<br>
                <strong>Solution:</strong> Download and upload locally
            `;
            if (loadBtn) {
                loadBtn.textContent = 'Load URL';
                loadBtn.disabled = false;
            }
        };
        
        img.src = url;
    };
    
    // Start loading
    proxyImg.src = url;
}

// Add event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const urlInput = document.getElementById('urlInput');
    const loadUrlBtn = document.getElementById('loadUrlBtn');
    
    if (loadUrlBtn) {
        loadUrlBtn.addEventListener('click', function() {
            if (urlInput) {
                loadImageFromURL(urlInput.value);
            }
        });
    }
    
    // Allow pressing Enter in URL input to load
    if (urlInput) {
        urlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                loadImageFromURL(urlInput.value);
            }
        });
    }
});