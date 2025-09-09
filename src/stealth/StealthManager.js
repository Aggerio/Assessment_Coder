const { session } = require('electron');

class StealthManager {
  constructor() {
    this.stealthMode = true; // Default to stealth mode ON
    this.windowTitleTimer = null;
    this.clickThroughEnabled = true; // Default to click-through mode ON
    this.scrollOnlyMode = true; // Default to scroll-only mode
    this.mainWindow = null;
    
    // Randomized process identity arrays
    this.randomProcessNames = [
      'System Monitor', 'Device Manager', 'Task Manager', 'Resource Monitor',
      'Windows Security', 'System Information', 'Event Viewer', 'Performance Monitor',
      'Registry Editor', 'Windows Update', 'Control Panel', 'System Configuration',
      'Services', 'Computer Management', 'Disk Management', 'Device Manager'
    ];

    this.randomAppNames = [
      'Safari', 'Finder', 'System Preferences', 'Activity Monitor', 'Console',
      'Terminal', 'TextEdit', 'Preview', 'Calculator', 'Calendar', 'Clock',
      'System Information', 'Disk Utility', 'Keychain Access', 'Mission Control'
    ];

    this.randomUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    ];

    this.innocuousWindowTitles = [
      'System Monitor', 'Device Manager', 'Task Manager', 'Resource Monitor',
      'Windows Security', 'System Information', 'Event Viewer', 'Performance Monitor',
      'Registry Editor', 'Windows Update', 'Control Panel', 'System Configuration',
      'Services', 'Computer Management', 'Disk Management', 'Network Connections',
      'Windows Defender', 'Disk Cleanup', 'System Restore', 'Administrative Tools'
    ];
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  randomizeProcessIdentity() {
    if (!this.stealthMode) return;
    
    // Randomize process title
    const randomProcessName = this.randomProcessNames[Math.floor(Math.random() * this.randomProcessNames.length)];
    process.title = randomProcessName;
    console.log(`[STEALTH] Process title set to: ${randomProcessName}`);
    
    // Randomize app name on macOS
    if (process.platform === 'darwin') {
      const { app } = require('electron');
      const randomAppName = this.randomAppNames[Math.floor(Math.random() * this.randomAppNames.length)];
      app.setName(randomAppName);
      console.log(`[STEALTH] App name set to: ${randomAppName}`);
    }
  }

  randomizeUserAgent() {
    if (!this.stealthMode) return;
    
    const randomUA = this.randomUserAgents[Math.floor(Math.random() * this.randomUserAgents.length)];
    session.defaultSession.setUserAgent(randomUA);
    console.log(`[STEALTH] User agent randomized`);
  }

  startPeriodicWindowTitleSwap() {
    if (!this.stealthMode || !this.mainWindow) return;
    
    const swapTitle = () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const randomTitle = this.innocuousWindowTitles[Math.floor(Math.random() * this.innocuousWindowTitles.length)];
        this.mainWindow.setTitle(randomTitle);
        console.log(`[STEALTH] Window title changed to: ${randomTitle}`);
      }
    };
    
    // Initial title swap
    swapTitle();
    
    // Set up periodic swapping (30-60 seconds)
    const scheduleNextSwap = () => {
      const delay = Math.random() * 30000 + 30000; // 30-60 seconds
      this.windowTitleTimer = setTimeout(() => {
        swapTitle();
        scheduleNextSwap();
      }, delay);
    };
    
    scheduleNextSwap();
  }

  setupDisplayMediaHandler() {
    if (!this.stealthMode) return;
    
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      console.log('[STEALTH] Display media request intercepted and denied');
      // Deny all display media requests (screen sharing, etc.)
      callback({ video: null, audio: null });
    });
  }

  toggleClickThrough() {
    if (!this.mainWindow) return;
    
    this.clickThroughEnabled = !this.clickThroughEnabled;
    this.scrollOnlyMode = false; // Disable scroll-only when full click-through is enabled
    
    this.mainWindow.setIgnoreMouseEvents(this.clickThroughEnabled);
    console.log(`[STEALTH] Click-through mode: ${this.clickThroughEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('update-instruction', 
        `Click-through: ${this.clickThroughEnabled ? 'ON' : 'OFF'}`);
    }
  }

  toggleScrollOnlyMode() {
    if (!this.mainWindow) return;
    
    this.scrollOnlyMode = !this.scrollOnlyMode;
    this.clickThroughEnabled = false; // Disable full click-through when scroll-only is enabled
    
    if (this.scrollOnlyMode) {
      // COMPLETELY UNDETECTABLE: Block ALL mouse events, never allow focus
      this.mainWindow.setFocusable(false);
      this.mainWindow.setIgnoreMouseEvents(true);
      if (this.mainWindow.webContents) {
        this.mainWindow.webContents.send('enable-scroll-only-mode');
      }
      console.log('[STEALTH] Scroll-only mode enabled (completely undetectable)');
    } else {
      // Even in "normal" mode, keep window non-focusable for maximum stealth
      this.mainWindow.setFocusable(false);
      this.mainWindow.setIgnoreMouseEvents(true);
      if (this.mainWindow.webContents) {
        this.mainWindow.webContents.send('disable-scroll-only-mode');
      }
      console.log('[STEALTH] Scroll-only mode disabled (still completely undetectable)');
    }
    
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('update-instruction', 
        `Scroll-only: ${this.scrollOnlyMode ? 'ON' : 'OFF'}`);
    }
  }

  hideFromTaskSwitchers() {
    if (!this.stealthMode || !this.mainWindow) return;
    
    // Windows: Hide from taskbar and Alt+Tab
    if (process.platform === 'win32') {
      this.mainWindow.setSkipTaskbar(true);
      console.log('[STEALTH] Hidden from Windows taskbar and Alt+Tab');
    }
    
    // macOS: Hide from Mission Control
    if (process.platform === 'darwin') {
      this.mainWindow.setHiddenInMissionControl(true);
      console.log('[STEALTH] Hidden from macOS Mission Control');
    }
  }

  wipeConsoleInProduction() {
    if (process.env.NODE_ENV === 'production') {
      console.log = () => {};
      console.error = () => {};
      console.warn = () => {};
      console.info = () => {};
      console.debug = () => {};
    }
  }

  async antiAnalysisStartupShuffle() {
    if (!this.stealthMode) return;
    
    // Random delay 1-4 seconds before full initialization
    const delay = Math.random() * 3000 + 1000;
    console.log(`[STEALTH] Anti-analysis delay: ${delay}ms`);
    
    return new Promise(resolve => {
      setTimeout(() => {
        this.wipeConsoleInProduction();
        resolve();
      }, delay);
    });
  }

  // Enhanced screen capture protection
  setScreenCaptureProtection() {
    if (!this.mainWindow) return;
    
    // Always use maximum protection
    this.mainWindow.setContentProtection(true);
    if (process.platform === 'darwin') {
      this.mainWindow.setWindowButtonVisibility(false);
    }
    // On Windows, try to set as utility window
    if (process.platform === 'win32') {
      this.mainWindow.setSkipTaskbar(true);
    }
    
    console.log('Screen capture protection set to: MAXIMUM');
  }

  toggleStealthMode() {
    this.stealthMode = !this.stealthMode;
    console.log(`[STEALTH] Stealth mode: ${this.stealthMode ? 'ENABLED' : 'DISABLED'}`);
    
    if (!this.stealthMode) {
      // Stop window title swapping
      if (this.windowTitleTimer) {
        clearTimeout(this.windowTitleTimer);
        this.windowTitleTimer = null;
      }
      // Reset to original title
      if (this.mainWindow) {
        this.mainWindow.setTitle('OA-Coder');
      }
    } else {
      // Re-enable stealth features
      this.randomizeProcessIdentity();
      this.randomizeUserAgent();
      this.startPeriodicWindowTitleSwap();
    }
    
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('update-instruction', 
        `Stealth mode: ${this.stealthMode ? 'ON' : 'OFF'}`);
    }
  }

  initializeStealth() {
    // Initialize all stealth features
    this.randomizeProcessIdentity();
    this.randomizeUserAgent();
    this.setupDisplayMediaHandler();
    this.hideFromTaskSwitchers();
    
    // Set maximum screen capture protection
    this.setScreenCaptureProtection();
    
    // Platform-specific window level management
    if (process.platform === 'darwin' && this.mainWindow) {
      const { screen } = require('electron');
      
      // macOS: Use screen-saver level (highest) for true fullscreen overlay capability
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      // Simplified but effective fullscreen detection and handling
      const stealthFullscreenHandler = () => {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        
        // Ensure we maintain the proper window level and visibility
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
        this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        
        // Keep stealth features active
        this.mainWindow.setHiddenInMissionControl(true);
        this.mainWindow.setSkipTaskbar(true);
      };
      
      // Monitor for display changes and re-apply settings
      screen.on('display-metrics-changed', stealthFullscreenHandler);
      
      // Periodic enforcement to ensure settings stay applied
      setInterval(stealthFullscreenHandler, 2000);
    }
    
    // Start periodic window title swapping after initialization
    setTimeout(() => {
      this.startPeriodicWindowTitleSwap();
    }, 1000);
    
    // Enable stealth modes by default
    setTimeout(() => {
      if (this.mainWindow) {
        // COMPLETELY UNDETECTABLE: Block ALL mouse events, never allow focus
        this.mainWindow.setFocusable(false);
        this.mainWindow.setIgnoreMouseEvents(true);
        this.mainWindow.webContents.send('enable-scroll-only-mode');
        console.log('[STEALTH] Click-through and scroll-only modes enabled by default (completely undetectable)');
        
        // Ensure keyboard shortcuts still work by sending a message to the renderer
      }
    }, 1000);
  }

  cleanup() {
    // Clean up timers
    if (this.windowTitleTimer) {
      clearTimeout(this.windowTitleTimer);
      this.windowTitleTimer = null;
    }
    
    // Restore original process title
    if (this.stealthMode) {
      process.title = 'OA-Coder';
    }
  }

  getStealthState() {
    return {
      stealthMode: this.stealthMode,
      clickThroughEnabled: this.clickThroughEnabled,
      scrollOnlyMode: this.scrollOnlyMode
    };
  }
}

module.exports = StealthManager; 