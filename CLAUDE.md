# HDR Image Analyzer - Project Documentation

## Overview
This is an advanced HDR (High Dynamic Range) image analysis tool that provides real-time visualization of various HDR transfer functions and color analysis capabilities. The application is designed for professionals working with HDR content, color grading, and display calibration.

## Current Features

### Image Analysis
- **Multi-format Support**: Upload and analyze images in various formats (PNG, JPG, JPEG, AVIF, HEIC, HEIF)
- **Real-time Pixel Analysis**: Hover over images to see instant pixel values in both sRGB and linear color spaces
- **Histogram Calculation**: Automatic luminance distribution analysis with 100-bin precision

### Transfer Function Visualization
- **sRGB Transfer Function**: Standard gamma 2.2 encoding/decoding with proper linearization
- **PQ (Perceptual Quantizer)**: ST.2084 implementation for HDR10/Dolby Vision content
- **HLG (Hybrid Log-Gamma)**: BT.2100 implementation for broadcast HDR

### Interactive Graphs
- **Dual View Modes**: 
  - Separate graphs for each transfer function
  - Combined view for comparative analysis
- **Dynamic Overlays**: Real-time pixel highlighting on curves
- **Histogram Integration**: Luminance distribution overlay on transfer curves

### Test Patterns
- **Synthetic Patterns**: Pure colors (R/G/B), gradients, color bars
- **Sample Images**: Landscape, sunset, neon effects for testing

## Architecture

### Core Components
1. **TransferFunctions Object**: Mathematical implementations of sRGB, PQ, and HLG
2. **Canvas-based Processing**: Efficient pixel data extraction and manipulation
3. **Plotly.js Integration**: High-performance interactive graphing
4. **Event-driven Updates**: Optimized with throttling and requestAnimationFrame

### Performance Optimizations
- **Throttled Graph Updates**: 60fps cap on hover interactions
- **Plotly.restyle**: Efficient trace updates without full redraws
- **Histogram Caching**: Pre-calculated distributions to avoid redundant processing
- **Debounced Resize Handlers**: Prevents excessive recalculation on window resize

## Potential Enhancements from AGTM Demo

### Priority 1 - Core HDR Features
1. **WebGL2 Rendering Pipeline**
   - Hardware acceleration for real-time HDR preview
   - Extended dynamic range support via canvas.configureHighDynamicRange()
   - GPU-based tone mapping

2. **Adaptive Tone Mapping**
   - Interactive curve editor with control points
   - Piecewise cubic interpolation
   - Multiple tone curves for different headroom levels

3. **Metadata System**
   - JSON-based configuration for HDR parameters
   - HDR reference white point (100-10000 nits)
   - Gain application space configuration

### Priority 2 - Professional Features
1. **Video Support**
   - Frame-by-frame analysis
   - Timeline scrubbing
   - Export capabilities

2. **Advanced Color Spaces**
   - P3 and Rec.2020 primaries support
   - White Surround Transform for viewing conditions
   - Color space conversion matrices

3. **Display Integration**
   - Query actual display HDR capabilities
   - Simulated headroom for SDR preview
   - Background brightness adjustment

### Priority 3 - Analysis Tools
1. **Statistical Analysis**
   - Percentile markers (50%, 75%, 90%, 95%, 99%)
   - CDF visualization
   - Component mix parameters

2. **Export/Import**
   - Save/load metadata profiles
   - Export tone-mapped images
   - Batch processing support

## Technical Considerations

### Browser Requirements
- WebGL2 support required for advanced features
- Chrome 131+ recommended for HDR video import
- Experimental Web Platform Features may need to be enabled

### Performance Targets
- 60fps interaction on hover
- <100ms graph update latency
- <500ms for full histogram calculation
- Real-time tone mapping preview

### Memory Management
- Efficient ImageBitmap usage
- Canvas recycling for test patterns
- Proper cleanup of WebGL resources

## Implementation Roadmap

### Phase 1: WebGL Foundation
- [ ] Set up WebGL2 context
- [ ] Implement basic shader pipeline
- [ ] Add HDR canvas configuration

### Phase 2: Tone Mapping
- [ ] Port AGTM curve editor
- [ ] Implement piecewise cubic interpolation
- [ ] Add metadata management

### Phase 3: Video Support
- [ ] Add video upload/playback
- [ ] Implement frame extraction
- [ ] Timeline controls

### Phase 4: Advanced Analysis
- [ ] Percentile calculations
- [ ] CDF visualization
- [ ] Export capabilities

## Code Style Guidelines

### JavaScript
- Use const/let, avoid var
- Descriptive function names
- Comment complex algorithms
- Group related functions

### CSS
- Mobile-first responsive design
- Dark theme optimized for HDR viewing
- Smooth transitions for UI elements
- Consistent spacing and typography

### Performance
- Debounce expensive operations
- Use requestAnimationFrame for animations
- Cache calculated values
- Minimize DOM manipulations

## Testing Checklist

### Functionality
- [ ] All transfer functions calculate correctly
- [ ] Histogram matches image content
- [ ] Hover interactions work smoothly
- [ ] View modes switch properly

### Performance
- [ ] 60fps hover tracking
- [ ] No memory leaks on image changes
- [ ] Smooth graph updates
- [ ] Responsive on mobile devices

### Browser Compatibility
- [ ] Chrome/Edge (latest)
- [ ] Safari (with limitations)
- [ ] Firefox (basic features)
- [ ] Mobile browsers (view only)

## Known Limitations

1. **HDR Display Required**: Full HDR preview requires compatible display
2. **Browser Support**: Some features require experimental flags
3. **Large Images**: Performance may degrade with >4K images
4. **Video Codecs**: Limited by browser codec support

## Future Vision

This tool aims to become a comprehensive HDR analysis suite for:
- Content creators working with HDR video
- Display calibration professionals
- Color scientists and researchers
- Game developers implementing HDR
- Web developers testing HDR content

The ultimate goal is to provide professional-grade HDR analysis capabilities directly in the browser, eliminating the need for expensive desktop software for many common tasks.