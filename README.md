# OA Coder

An Electron application for screen capture and AI analysis.

## Installation

```bash
npm install
npm start
```

## Building for Distribution

This project supports building distributable applications for Windows, macOS, and Linux.

### Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install electron-builder** (if not already installed):
   ```bash
   npm install --save-dev electron-builder
   ```

3. **Prepare icons** (optional but recommended):
   - Place `icon.ico` (256x256) in `assets/` for Windows
   - Place `icon.icns` (512x512) in `assets/` for macOS  
   - Place `icon.png` (512x512) in `assets/` for Linux

### Build Commands

#### Quick Build (Recommended)
For convenience, you can use the provided build scripts:

**Linux/macOS:**
```bash
./build.sh          # Auto-detects platform and builds
```

**Windows:**
```cmd
build.bat            # Builds for Windows
```

#### Build for Current Platform
```bash
npm run build         # Build for current platform
npm run dist          # Same as build
```

#### Build for Specific Platforms
```bash
npm run build:win     # Build Windows installer (.exe)
npm run build:mac     # Build macOS app (.dmg)
npm run build:linux   # Build Linux packages (.AppImage, .deb, .rpm)
npm run build:all     # Build for all platforms
```

#### Create Unpacked Apps (for testing)
```bash
npm run pack          # Pack for current platform (no installer)
npm run pack:win      # Pack Windows app
npm run pack:mac      # Pack macOS app  
npm run pack:linux    # Pack Linux app
```

### Output

Built applications will be saved in the `dist/` directory:

- **Windows**: `OA Coder Setup.exe` (installer) + `OA Coder.exe` (portable)
- **macOS**: `OA Coder.dmg` (disk image)
- **Linux**: `OA Coder-1.0.0.AppImage` (universal Linux application)

### Cross-Platform Building

To build for platforms other than your current OS:

- **From macOS**: Can build for all platforms (Windows, macOS, Linux)
- **From Windows**: Can build for Windows and Linux only
- **From Linux**: Can build for Windows and Linux only

**Note**: Building for macOS requires macOS or CI/CD services like GitHub Actions.

### Distribution Tips

1. **Code Signing**: For production releases, consider code signing your applications
2. **Auto-Updates**: Consider integrating `electron-updater` for automatic updates
3. **CI/CD**: Use GitHub Actions or similar for automated building and releasing

### Example Release Workflow

```bash
# 1. Update version in package.json
# 2. Build for all platforms
npm run build:all

# 3. Test the built applications
# 4. Upload to your distribution platform
```

## Controls

- `Alt+L`: Add screenshot to collection
- `Alt+Enter`: Process all collected screenshots with AI
- `Alt+N`: Clear chat and screenshots
- `Alt+H`: Hide/show window
- `Alt+Q`: Quit application
- `Alt+Arrow Keys`: Move window around screen
- `Alt+Shift+X`: Sign in
- `Alt+Shift+Z`: Sign out
- `Alt+M`: Switch AI model

## Screen Capture Protection

This application includes built-in protection to hide the window from screen sharing software like Google Meet, Zoom, and other screen recording tools.

### Protection Levels

- **Off**: No protection - window will be visible in screen shares
- **Medium**: Basic content protection enabled
- **High** (default): Enhanced protection with taskbar hiding
- **Maximum**: Maximum protection with additional platform-specific features

### How It Works

The application uses several Electron features to prevent capture:
- `contentProtection: true` - Prevents window content from being captured
- `skipTaskbar: true` - Hides window from taskbar (reduces visibility in some screen sharing software)
- `type: 'toolbar'` - Sets window type to be less likely to be captured
- Platform-specific optimizations for Windows and macOS

### Effectiveness

Screen capture protection effectiveness varies by:
- **Operating System**: Generally more effective on macOS and Windows
- **Screen Sharing Software**: Some software may still capture protected windows
- **Display Method**: May work better with certain display drivers/configurations

**Note**: While this provides good protection against most screen sharing software, it's not 100% guaranteed depending on the specific software and system configuration being used.

## Troubleshooting Screenshot Issues

### Linux Systems

If you're experiencing screenshot capture failures on Linux, try the following:

1. **Install required system packages:**
   ```bash
   # For Ubuntu/Debian:
   sudo apt-get install xvfb imagemagick

   # For Arch Linux:
   sudo pacman -S xorg-server-xvfb imagemagick
   ```

2. **Check display permissions:**
   - Ensure your user has permission to capture screen content
   - On Wayland systems, you may need to switch to X11 for screen capture to work properly

3. **Verify display availability:**
   - Make sure you're running in a graphical environment
   - Check that `$DISPLAY` environment variable is set properly

4. **Run with debugging:**
   ```bash
   npm start
   ```
   Check the console output for detailed error messages about screenshot capture.

### Common Issues

- **Permission denied**: Ensure your user has screen capture permissions
- **No displays found**: Make sure you're running in a graphical environment
- **Module not found**: Run `npm install` to ensure all dependencies are installed

## Configuration

Make sure you have a valid `config.json` file with your OpenAI API key:

```json
{
  "apiKey": "your-openai-api-key-here",
  "model": "gpt-4o-mini"
}
```