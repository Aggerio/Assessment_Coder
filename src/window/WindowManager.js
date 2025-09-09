const { BrowserWindow, screen } = require('electron');

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.showWindow = true;
  }

  async createMainWindow() {
    // Get the primary display's work area (screen size minus taskbar/dock)
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // Calculate responsive window dimensions
    // Use 860x530 as base dimensions, but scale down if screen is too small
    const baseWidth = 860;
    const baseHeight = 530;
    
    // Calculate scaling factor based on screen size
    // More aggressive scaling for smaller screens
    const minScreenWidth = 1000;  // Minimum screen width before scaling
    const minScreenHeight = 600;  // Minimum screen height before scaling
    
    const widthScale = Math.min(1, screenWidth / minScreenWidth);
    const heightScale = Math.min(1, screenHeight / minScreenHeight);
    const scaleFactor = Math.min(widthScale, heightScale);
    
    // Ensure minimum window dimensions for usability
    const minWindowWidth = 600;
    const minWindowHeight = 400;
    
    const windowWidth = Math.max(minWindowWidth, Math.round(baseWidth * scaleFactor));
    const windowHeight = Math.max(minWindowHeight, Math.round(baseHeight * scaleFactor));
    
    // Calculate position to center the window on screen
    const x = Math.round((screenWidth - windowWidth) / 2);
    const y = Math.round((screenHeight - windowHeight) / 2);
    
    console.log(`[WINDOW] Screen dimensions: ${screenWidth}x${screenHeight}`);
    console.log(`[WINDOW] Window dimensions: ${windowWidth}x${windowHeight}`);
    console.log(`[WINDOW] Window position: ${x},${y}`);
    
    this.mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      paintWhenInitiallyHidden: true,
      contentProtection: true,
      type: 'toolbar',
      // Enhanced stealth options
      skipTaskbar: true,           // Hide from taskbar (helps with some screen sharing)
      show: false,                 // Start hidden, then show when ready
      minimizable: false,          // Prevent minimizing
      maximizable: false,          // Prevent maximizing
      fullscreenable: false,       // Prevent fullscreen
      kiosk: false,               // Ensure not in kiosk mode
      webSecurity: true,          // Enable web security
      nodeIntegrationInWorker: false,
      enableRemoteModule: false,
      experimentalFeatures: false,
      vibrancy: 'ultra-dark',      // macOS vibrancy effect
      backgroundMaterial: 'acrylic', // Windows acrylic effect
      focusable: false,           // Prevent stealing focus from other windows
      // Additional stealth options
      hiddenInMissionControl: true, // macOS: Hide from Mission Control
      thickFrame: false,          // Windows: Remove thick frame
      hasShadow: false,           // Remove window shadow
      opacity: 0.80,              // Slight transparency for stealth
      resizable: true,            // Allow resizing (we handle this with hotkeys)
      movable: true,              // Allow moving (we handle this with hotkeys)
      closable: false,            // Prevent closing via window controls
      titleBarStyle: 'hidden',    // Hide title bar completely
      roundedCorners: true,       // Enable rounded corners
      acceptFirstMouse: false,    // Don't accept first mouse click
      disableAutoHideCursor: true, // Keep cursor visible
      autoHideMenuBar: true,      // Hide menu bar
      enableLargerThanScreen: true,
      useContentSize: true,
      zoomToPageWidth: false,
      webgl: false,               // Disable WebGL for stealth
      plugins: false,             // Disable plugins
      experimentalCanvasFeatures: false,
      scrollBounce: false,
      enableBlinkFeatures: '',
      disableBlinkFeatures: 'Accelerated2dCanvas,AcceleratedSmallCanvases'
    });

    // Always enable click-through mode (completely undetectable)
    this.mainWindow.setFocusable(false);
    this.mainWindow.setIgnoreMouseEvents(true);
    // Load the HTML file
    this.mainWindow.loadFile('index.html');

    // Additional window behavior for screen sharing protection and fullscreen handling
    this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Platform-specific window level management
    if (process.platform === 'darwin') {
      // macOS: Use screen-saver level (highest) for true fullscreen overlay capability
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    // Hide from screen capture on macOS specifically
    if (process.platform === 'darwin') {
      this.mainWindow.setWindowButtonVisibility(false);
    }

    // Show window after configuration without stealing focus
    this.mainWindow.showInactive();

    return this.mainWindow;
  }

  getMainWindow() {
    return this.mainWindow;
  }

  // Method to recalculate window dimensions based on current screen
  recalculateWindowDimensions() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // Use 860x530 as base dimensions, but scale down if screen is too small
    const baseWidth = 860;
    const baseHeight = 530;
    
    // Calculate scaling factor based on screen size
    // More aggressive scaling for smaller screens
    const minScreenWidth = 1200;  // Minimum screen width before scaling
    const minScreenHeight = 800;  // Minimum screen height before scaling
    
    const widthScale = Math.min(1, screenWidth / minScreenWidth);
    const heightScale = Math.min(1, screenHeight / minScreenHeight);
    const scaleFactor = Math.min(widthScale, heightScale);
    
    // Ensure minimum window dimensions for usability
    const minWindowWidth = 600;
    const minWindowHeight = 400;
    
    const windowWidth = Math.max(minWindowWidth, Math.round(baseWidth * scaleFactor));
    const windowHeight = Math.max(minWindowHeight, Math.round(baseHeight * scaleFactor));
    
    // Calculate position to center the window on screen
    const x = Math.round((screenWidth - windowWidth) / 2);
    const y = Math.round((screenHeight - windowHeight) / 2);
    
    // Set new bounds
    this.mainWindow.setBounds({ x, y, width: windowWidth, height: windowHeight });
  }

  // Method to get current screen dimensions
  getScreenDimensions() {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      workArea: primaryDisplay.workAreaSize,
      bounds: primaryDisplay.bounds,
      scaleFactor: primaryDisplay.scaleFactor
    };
  }

  showMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    // Actually show the window
    this.mainWindow.showInactive(); // Show without stealing focus
    this.showWindow = true;
    
    console.log('[WINDOW] Window shown');
  }

  hideMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    // Actually hide the window completely
    this.mainWindow.hide();
    this.showWindow = false;
    
    console.log('[WINDOW] Window hidden');
  }

  toggleMainWindow() {
    if (this.showWindow) {
      this.hideMainWindow();
    } else {
      this.showMainWindow();
    }
  }

  // Function to move the window in specified direction
  moveWindow(direction) {
    if (!this.mainWindow) return;
    
    const moveDistance = 100; // pixels to move per key press
    const [currentX, currentY] = this.mainWindow.getPosition();
    const [windowWidth, windowHeight] = this.mainWindow.getSize();
    
    // Get screen dimensions
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const { x: screenX, y: screenY } = primaryDisplay.workArea;
    
    let newX = currentX;
    let newY = currentY;
    
    // Calculate new position based on direction
    switch (direction) {
      case 'up':
        newY = Math.max(screenY, currentY - moveDistance);
        break;
      case 'down':
        newY = Math.min(screenY + screenHeight - windowHeight, currentY + moveDistance);
        break;
      case 'left':
        newX = Math.max(screenX, currentX - moveDistance);
        break;
      case 'right':
        newX = Math.min(screenX + screenWidth - windowWidth, currentX + moveDistance);
        break;
    }
    
    // Move the window to new position
    this.mainWindow.setPosition(newX, newY);
  }

  // Function to scale window size up or down
  scaleWindow(direction) {
    if (!this.mainWindow) return;

    // Get screen dimensions for intelligent scaling
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const { x: screenX, y: screenY } = primaryDisplay.workArea;

    // Dynamic scale step based on current window size (smaller windows = smaller steps)
    const [currentWidth, currentHeight] = this.mainWindow.getSize();
    const currentArea = currentWidth * currentHeight;
    const baseStep = 25; // Reduced base step for more precision
    const sizeFactor = Math.sqrt(currentArea) / 80; // Size-based scaling factor
    const scaleStep = Math.max(15, Math.min(60, Math.round(baseStep + sizeFactor))); // Dynamic step 15-60px

    const minWidth = 400;   // minimum window width
    const minHeight = 250;  // minimum window height
    const maxWidth = Math.min(2160, screenWidth + 200);  // 4K or screen+200px
    const maxHeight = Math.min(1800, screenHeight + 150); // 4K or screen+150px

    const [currentX, currentY] = this.mainWindow.getPosition();

    let newWidth = currentWidth;
    let newHeight = currentHeight;
    let newX = currentX;
    let newY = currentY;

    // Calculate aspect ratio more precisely
    const aspectRatio = currentWidth / currentHeight;

    if (direction === 'up') {
      // Intelligent scaling with approach to limits
      const remainingWidth = maxWidth - currentWidth;
      const remainingHeight = maxHeight - currentHeight;

      if (remainingWidth <= scaleStep * 2 || remainingHeight <= scaleStep * 1.5) {
        // Near maximum - use smaller steps for precision
        const smallStep = Math.round(scaleStep * 0.3);
        newWidth = Math.min(maxWidth, currentWidth + smallStep);
        newHeight = Math.min(maxHeight, Math.round(newWidth / aspectRatio));
      } else {
        // Normal scaling with precise aspect ratio
        newWidth = Math.min(maxWidth, currentWidth + scaleStep);
        newHeight = Math.min(maxHeight, Math.round(newWidth / aspectRatio));
      }

      // Smooth centering with boundary awareness
      const widthChange = newWidth - currentWidth;
      const heightChange = newHeight - currentHeight;

      newX = currentX - Math.round(widthChange / 2);
      newY = currentY - Math.round(heightChange / 2);

    } else if (direction === 'down') {
      // Intelligent downscaling with approach to minimum
      const widthToMin = currentWidth - minWidth;
      const heightToMin = currentHeight - minHeight;

      if (widthToMin <= scaleStep * 2 || heightToMin <= scaleStep * 1.5) {
        // Near minimum - use smaller steps for precision
        const smallStep = Math.round(scaleStep * 0.3);
        newWidth = Math.max(minWidth, currentWidth - smallStep);
        newHeight = Math.max(minHeight, Math.round(newWidth / aspectRatio));
      } else {
        // Normal scaling with precise aspect ratio
        newWidth = Math.max(minWidth, currentWidth - scaleStep);
        newHeight = Math.max(minHeight, Math.round(newWidth / aspectRatio));
      }

      // Smooth centering when scaling down
      const widthChange = currentWidth - newWidth;
      const heightChange = currentHeight - newHeight;

      newX = currentX + Math.round(widthChange / 2);
      newY = currentY + Math.round(heightChange / 2);
    }
    

    
    // Ensure window stays within screen bounds with improved boundary handling
    newX = Math.max(screenX, Math.min(newX, screenX + screenWidth - newWidth));
    newY = Math.max(screenY, Math.min(newY, screenY + screenHeight - newHeight));
    
    // Apply the new size and position
    this.mainWindow.setBounds({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    });
    
    console.log(`[WINDOW] Scaled ${direction}: ${currentWidth}x${currentHeight} → ${newWidth}x${newHeight} (step: ${scaleStep}px)`);
    
    // Send update to renderer about the new size
    this.sendToRenderer('window-scaled', {
      width: newWidth,
      height: newHeight,
      direction: direction
    });
  }

  updateInstruction(instruction) {
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('update-instruction', instruction);
    }
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  isWindowVisible() {
    return this.showWindow;
  }

  setupMacOSFullscreenHandling() {
    if (process.platform !== 'darwin' || !this.mainWindow) return;
    
    const { screen } = require('electron');
    
    const handleWorkspaceChange = () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      
      // If window should be visible but isn't, restore it
      if (this.showWindow && !this.mainWindow.isVisible()) {
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
            this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            this.mainWindow.showInactive();
            
            // Re-apply stealth
            this.mainWindow.setHiddenInMissionControl(true);
            this.mainWindow.setSkipTaskbar(true);
            
            console.log('[STEALTH] Window restored to current workspace with fullscreen capability');
          }
        }, 100);
      }
    };
    
    // Monitor workspace changes
    setInterval(handleWorkspaceChange, 1000);
    
    // Monitor for display changes and re-apply settings
    screen.on('display-metrics-changed', () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      
      // Ensure we maintain the proper window level and visibility
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      // Keep stealth features active
      this.mainWindow.setHiddenInMissionControl(true);
      this.mainWindow.setSkipTaskbar(true);
    });
  }

  cleanup() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
    }
    this.mainWindow = null;
  }
}

module.exports = WindowManager; 