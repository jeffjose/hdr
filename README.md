# HDR Image Analyzer

An advanced HDR (High Dynamic Range) image analysis tool that provides real-time visualization of various HDR transfer functions and color analysis capabilities.

## Features

- **Multi-format image support** (PNG, JPG, JPEG, AVIF, HEIC, HEIF)
- **Real-time pixel analysis** with sRGB and linear color space values
- **Transfer function visualization** for sRGB, PQ (ST.2084), and HLG (BT.2100)
- **Interactive graphs** with hover tracking and histogram overlays
- **Test patterns** for validation and testing

## Prerequisites

- Node.js (v18 or higher recommended)
- pnpm package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd hdr
```

2. Install dependencies:
```bash
pnpm install
```

## Running the Development Server

Start the development server with hot reload:

```bash
pnpm run dev
```

The application will be available at:
- Local: `http://localhost:5173`
- Network: `http://<your-ip>:5173`

Press `h` in the terminal to see all available keyboard shortcuts.

## Building for Production

Create an optimized production build:

```bash
pnpm run build
```

The built files will be in the `dist/` directory.

## Preview Production Build

To preview the production build locally:

```bash
pnpm run preview
```

## Project Structure

```
hdr/
├── index.html          # Main HTML file with application logic
├── url-loader.js       # URL handling utilities
├── package.json        # Project dependencies and scripts
├── pnpm-lock.yaml      # Locked dependency versions
├── CLAUDE.md           # Detailed project documentation
└── README.md           # This file
```

## Browser Requirements

- Modern browser with WebGL2 support
- Chrome 131+ recommended for HDR video features
- May require enabling experimental web platform features for advanced HDR functionality

## Documentation

For detailed technical documentation, architecture details, and development roadmap, see [CLAUDE.md](./CLAUDE.md).

## License

[Add your license information here]