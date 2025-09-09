const { globalShortcut, ipcMain, BrowserWindow, app } = require('electron');
const path = require('path');
const KeyBlockingConfig = require('./KeyBlockingConfig');

class ShortcutManager {
  constructor(windowManager, screenshotManager, aiManager, authManager, stealthManager, autofillManager, appController) {
    // Support both constructor parameters and setManagers approach
    this.windowManager = windowManager || null;
    this.authManager = authManager || null;
    this.stealthManager = stealthManager || null;
    this.screenshotManager = screenshotManager || null;
    this.aiManager = aiManager || null;
    this.appController = appController || null;
    this.autofillManager = autofillManager || null;
    
    // Platform detection
    this.isMac = process.platform === 'darwin';
    this.isWindows = process.platform === 'win32';
    this.isLinux = process.platform === 'linux';

    // Key blocking configuration
    this.keyBlockingLevel = 'standard'; // 'none', 'standard', 'aggressive'
    this.blockedKeys = new Set();
    this.keyBlockingActive = false;

    // Native hooks (will be initialized if available)
    this.nativeHook = null;
    this.hookInitialized = false;

    // Configuration manager
    this.keyBlockingConfig = new KeyBlockingConfig();
    this.configLoaded = false;
  }

  // Get platform-appropriate shortcut display
  getShortcutDisplay(shortcut) {
    if (this.isMac) {
      return shortcut.replace(/CommandOrControl\+/g, '⌘+')
                    .replace(/Alt\+/g, '⌘+')
                    .replace(/Shift\+/g, 'Shift+')
                    .replace(/Ctrl\+/g, '⌘+');
    } else {
      return shortcut.replace(/CommandOrControl\+/g, 'Alt+')
                    .replace(/Alt\+/g, 'Alt+');
    }
  }

  // Check if user is authenticated and show error if not
  checkAuthentication(shortcutName) {
    if (!this.authManager) {
      console.error('AuthManager not available for authentication check');
      return false;
    }

    const authState = this.authManager.getAuthState();
    if (!authState.isAuthenticated) {
      const loginShortcut = this.isMac ? '⌘+⇧+X' : 'Alt+Shift+X';
      const errorMessage = `Authentication required for ${shortcutName}. Please sign in using ${loginShortcut} to use this feature.`;
      
      console.warn(`[SHORTCUT] Authentication required for ${shortcutName}:`, errorMessage);
      
      // Send error to renderer
      if (this.windowManager?.getMainWindow()?.webContents) {
        this.windowManager.getMainWindow().webContents.send('error', errorMessage);
      }
      
      return false;
    }
    
    return true;
  }

  // Check if authentication is needed (for auth shortcut)
  checkIfAuthNeeded() {
    if (!this.authManager) {
      return true; // Assume auth is needed if authManager is not available
    }

    const authState = this.authManager.getAuthState();
    return !authState.isAuthenticated;
  }

  // Get all shortcuts with platform-appropriate display
  getAllShortcuts() {
    const shortcuts = [
      { key: this.isMac ? 'CommandOrControl+Enter' : 'Alt+Enter', description: 'Process all screenshots', category: 'Core', requiresAuth: true },
      { key: this.isMac ? 'CommandOrControl+L' : 'Alt+L', description: 'Add screenshot to collection', category: 'Core', requiresAuth: true },
      { key: this.isMac ? 'CommandOrControl+N' : 'Alt+N', description: 'Clear Context', category: 'Core', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+H' : 'Alt+H', description: 'Hide/Show app', category: 'Core', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Q' : 'Alt+Q', description: 'Quit application', category: 'Core', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Up' : 'Alt+Up', description: 'Move window up', category: 'Window', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Down' : 'Alt+Down', description: 'Move window down', category: 'Window', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Left' : 'Alt+Left', description: 'Move window left', category: 'Window', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Right' : 'Alt+Right', description: 'Move window right', category: 'Window', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Plus' : 'Alt+Plus', description: 'Scale window up', category: 'Window', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+-' : 'Alt+-', description: 'Scale window down', category: 'Window', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+M' : 'Alt+M', description: 'Switch AI model', category: 'AI', requiresAuth: true },
      { key: this.isMac ? 'CommandOrControl+Shift+X' : 'Alt+Shift+X', description: 'Initiate desktop authentication', category: 'Auth', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+Shift+Z' : 'Alt+Shift+Z', description: 'Sign out', category: 'Auth', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+J' : 'Alt+J', description: 'Scroll down', category: 'Navigation', requiresAuth: false },
      { key: this.isMac ? 'CommandOrControl+K' : 'Alt+K', description: 'Scroll up', category: 'Navigation', requiresAuth: false }
      // { key: this.isMac ? 'CommandOrControl+F' : 'Alt+F', description: 'Autofill largest code snippet', category: 'Autofill', requiresAuth: true } // DISABLED
    ];

    // Add numbered autofill shortcuts
    for (let i = 1; i <= 9; i++) {
      shortcuts.push({
        key: this.isMac ? `CommandOrControl+${i}` : `Alt+${i}`,
        description: `Autofill code snippet ${i}`,
        category: 'Autofill',
        requiresAuth: true
      });
    }

    return shortcuts.map(shortcut => ({
      ...shortcut,
      display: this.getShortcutDisplay(shortcut.key)
    }));
  }

  // Send shortcuts to renderer for display
  sendShortcutsToRenderer() {
    if (this.windowManager && this.windowManager.getMainWindow()) {
      const shortcuts = this.getAllShortcuts();
      this.windowManager.sendToRenderer('shortcuts-updated', {
        shortcuts,
        platform: this.isMac ? 'mac' : 'windows',
        isMac: this.isMac
      });
    }
  }

  setManagers(managers) {
    this.windowManager = managers.windowManager || this.windowManager;
    this.authManager = managers.authManager || this.authManager;
    this.stealthManager = managers.stealthManager || this.stealthManager;
    this.screenshotManager = managers.screenshotManager || this.screenshotManager;
    this.aiManager = managers.aiManager || this.aiManager;
    this.appController = managers.appController || this.appController;
    this.autofillManager = managers.autofillManager || this.autofillManager;
  }

  // ============================================================================
  // KEY BLOCKING SYSTEM
  // ============================================================================

  /**
   * Initialize the key blocking system based on platform and configuration
   */
  async initializeKeyBlocking() {
    try {
      // Load configuration first
      await this.keyBlockingConfig.loadConfig();
      this.configLoaded = true;

      // Apply configuration
      const config = this.keyBlockingConfig.getConfig();
      this.keyBlockingLevel = config.level;

      console.log(`Initializing key blocking system (level: ${this.keyBlockingLevel})`);

      if (this.keyBlockingLevel === 'none') {
        console.log('Key blocking disabled by configuration');
        return;
      }

      // Initialize blocked keys from shortcuts
      this.updateBlockedKeys();

      // Attempt to initialize native hooks for better blocking (if enabled)
      if (config.enableNativeHooks) {
        await this.initializeNativeHooks();
      }

      // Fallback to enhanced globalShortcut monitoring
      this.initializeEnhancedMonitoring();

      this.keyBlockingActive = true;
      console.log('Key blocking system initialized successfully');

    } catch (error) {
      console.error('Failed to initialize key blocking:', error);
      // Continue with basic globalShortcut functionality
      console.log('Falling back to standard globalShortcut system');
    }
  }

  /**
   * Update the list of keys that should be blocked
   */
  updateBlockedKeys() {
    this.blockedKeys.clear();

    // Add all application shortcuts to blocked list
    const shortcuts = this.getAllShortcuts();
    shortcuts.forEach(shortcut => {
      // Convert display shortcut back to electron format for blocking
      const electronKey = this.getElectronKeyFormat(shortcut.key);
      this.blockedKeys.add(electronKey);
    });

    console.log(`Updated blocked keys: ${Array.from(this.blockedKeys).join(', ')}`);
  }

  /**
   * Convert shortcut key to electron format
   */
  getElectronKeyFormat(displayKey) {
    if (this.isMac) {
      return displayKey.replace(/⌘\+/g, 'CommandOrControl+')
                      .replace(/Alt\+/g, 'CommandOrControl+')
                      .replace(/Shift\+/g, 'Shift+')
                      .replace(/Ctrl\+/g, 'CommandOrControl+');
    } else {
      return displayKey.replace(/Alt\+/g, 'Alt+');
    }
  }

  /**
   * Initialize native keyboard hooks for advanced key blocking
   */
  async initializeNativeHooks() {
    if (this.keyBlockingLevel !== 'aggressive') {
      return;
    }

    try {
      if (this.isWindows) {
        await this.initializeWindowsHooks();
      } else if (this.isMac) {
        await this.initializeMacHooks();
      } else if (this.isLinux) {
        await this.initializeLinuxHooks();
      }
    } catch (error) {
      console.warn('Native hooks initialization failed, using fallback:', error.message);
    }
  }

  /**
   * Windows-specific key blocking using native hooks
   */
  async initializeWindowsHooks() {
    try {
      // For Windows, we'll use a native module approach
      // This would require a native addon, but we can simulate the concept
      console.log('Windows native hooks: Would use SetWindowsHookEx(WH_KEYBOARD_LL)');

      // In a real implementation, you would:
      // 1. Load a native addon that calls SetWindowsHookEx
      // 2. Hook into low-level keyboard events
      // 3. Filter out blocked key combinations
      // 4. Return false for blocked keys to prevent further processing

    } catch (error) {
      throw new Error(`Windows hooks failed: ${error.message}`);
    }
  }

  /**
   * macOS-specific key blocking using native hooks
   */
  async initializeMacHooks() {
    try {
      console.log('macOS native hooks: Would use NSEvent global monitoring');

      // In a real implementation, you would:
      // 1. Use a native addon with Objective-C code
      // 2. Call [NSEvent addGlobalMonitorForEventsMatchingMask:]
      // 3. Filter NSEventTypeKeyDown and NSEventTypeKeyUp events
      // 4. Block events matching our key combinations

    } catch (error) {
      throw new Error(`macOS hooks failed: ${error.message}`);
    }
  }

  /**
   * Linux-specific key blocking using X11
   */
  async initializeLinuxHooks() {
    try {
      console.log('Linux native hooks: Would use X11 XGrabKey');

      // In a real implementation, you would:
      // 1. Use a native addon with X11 libraries
      // 2. Call XGrabKey to grab specific key combinations
      // 3. Use X11 event filtering
      // 4. Handle XKeyEvent structures

    } catch (error) {
      throw new Error(`Linux hooks failed: ${error.message}`);
    }
  }

  /**
   * Enhanced monitoring for standard key blocking level
   */
  initializeEnhancedMonitoring() {
    // Monitor for potential conflicts and provide warnings
    this.monitorSystemHotkeys();

    // Set up periodic validation
    this.validationInterval = setInterval(() => {
      this.validateShortcuts();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Monitor system hotkeys that might conflict
   */
  monitorSystemHotkeys() {
    const conflictingKeys = this.getConflictingSystemKeys();

    if (conflictingKeys.length > 0) {
      console.warn('Potential key conflicts detected:');
      conflictingKeys.forEach(key => {
        console.warn(`  - ${key.shortcut}: ${key.description}`);
      });

      // Notify user through UI if possible
      if (this.windowManager?.getMainWindow()?.webContents) {
        this.windowManager.getMainWindow().webContents.send('key-conflicts-detected', {
          conflicts: conflictingKeys,
          recommendation: 'Consider changing conflicting system shortcuts or using aggressive blocking mode'
        });
      }
    }
  }

  /**
   * Get list of potentially conflicting system keys
   */
  getConflictingSystemKeys() {
    const conflicts = [];

    // Common system shortcuts that might conflict
    const systemKeys = [
      { shortcut: this.isMac ? 'CommandOrControl+Enter' : 'Alt+Enter', description: 'System submit/confirm (some apps)' },
      { shortcut: this.isMac ? 'CommandOrControl+L' : 'Alt+L', description: 'System location/focus (some apps)' },
      { shortcut: this.isMac ? 'CommandOrControl+N' : 'Alt+N', description: 'System new (some apps)' },
      { shortcut: this.isMac ? 'CommandOrControl+H' : 'Alt+H', description: 'System help (some apps)' },
              { shortcut: this.isMac ? 'CommandOrControl+Q' : 'Alt+Q', description: 'Quit application (some apps)' },
      { shortcut: this.isMac ? 'CommandOrControl+M' : 'Alt+M', description: 'Minimize window (some apps)' },
              { shortcut: this.isMac ? 'CommandOrControl+Shift+X' : 'Alt+Shift+X', description: 'Sign in (this app)' },
        { shortcut: this.isMac ? 'CommandOrControl+Shift+Z' : 'Alt+Shift+Z', description: 'Sign out (this app)' }
    ];

    systemKeys.forEach(systemKey => {
      if (this.blockedKeys.has(systemKey.shortcut)) {
        conflicts.push(systemKey);
      }
    });

    return conflicts;
  }

  /**
   * Validate that shortcuts are still working
   */
  validateShortcuts() {
    if (!this.keyBlockingActive) return;

    const shortcuts = this.getAllShortcuts();
    let failedCount = 0;

    shortcuts.forEach(shortcut => {
      const electronKey = this.getElectronKeyFormat(shortcut.key);
      if (!globalShortcut.isRegistered(electronKey)) {
        console.warn(`Shortcut not registered: ${electronKey}`);
        failedCount++;

        // Attempt to re-register
        try {
          globalShortcut.register(electronKey, () => {
            console.log(`Re-registered shortcut: ${electronKey}`);
          });
        } catch (error) {
          console.error(`Failed to re-register ${electronKey}:`, error);
        }
      }
    });

    if (failedCount > 0) {
      console.warn(`${failedCount} shortcuts failed validation and were re-registered`);
    }
  }

  /**
   * Set key blocking level
   */
  setKeyBlockingLevel(level) {
    const validLevels = ['none', 'standard', 'aggressive'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid key blocking level: ${level}. Must be one of: ${validLevels.join(', ')}`);
    }

    console.log(`Changing key blocking level from ${this.keyBlockingLevel} to ${level}`);
    this.keyBlockingLevel = level;

    // Re-initialize with new level
    this.deinitializeKeyBlocking();
    this.initializeKeyBlocking();
  }

  /**
   * Deinitialize key blocking system
   */
  deinitializeKeyBlocking() {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }

    if (this.nativeHook) {
      // Clean up native hooks
      this.cleanupNativeHooks();
    }

    this.keyBlockingActive = false;
    console.log('Key blocking system deinitialized');
  }

  /**
   * Clean up native hooks
   */
  cleanupNativeHooks() {
    try {
      if (this.isWindows) {
        // Unhook Windows hooks
        console.log('Cleaning up Windows native hooks');
      } else if (this.isMac) {
        // Remove macOS event monitors
        console.log('Cleaning up macOS native hooks');
      } else if (this.isLinux) {
        // Ungrab X11 keys
        console.log('Cleaning up Linux native hooks');
      }
    } catch (error) {
      console.error('Error cleaning up native hooks:', error);
    }
  }

  /**
   * Force capture specific keys (emergency method)
   */
  forceCaptureKeys(keyCombinations) {
    console.log(`Force capturing keys: ${keyCombinations.join(', ')}`);

    keyCombinations.forEach(combination => {
      try {
        // Unregister any existing registration
        globalShortcut.unregister(combination);

        // Force register with high priority
        const success = globalShortcut.register(combination, () => {
          console.log(`Force captured: ${combination}`);
          // Handle the shortcut
          this.handleForcedShortcut(combination);
        });

        if (success) {
          console.log(`Successfully force-captured: ${combination}`);
        } else {
          console.error(`Failed to force-capture: ${combination}`);
        }
      } catch (error) {
        console.error(`Error force-capturing ${combination}:`, error);
      }
    });
  }

  /**
   * Handle shortcuts captured through force capture
   */
  handleForcedShortcut(combination) {
    // Map the combination to the appropriate handler
    const shortcutMap = {
      [this.isMac ? 'CommandOrControl+Enter' : 'Alt+Enter']: () => this.appController?.processAllScreenshots(),
      [this.isMac ? 'CommandOrControl+L' : 'Alt+L']: () => this.appController?.addScreenshotToCollection(),
      [this.isMac ? 'CommandOrControl+N' : 'Alt+N']: () => this.appController?.clearScreenshots(),
      [this.isMac ? 'CommandOrControl+H' : 'Alt+H']: () => this.windowManager?.toggleMainWindow(),
      [this.isMac ? 'CommandOrControl+Q' : 'Alt+Q']: () => process.exit(0),
      [this.isMac ? 'CommandOrControl+M' : 'Alt+M']: () => this.aiManager?.switchModel(),
          [this.isMac ? 'CommandOrControl+Shift+X' : 'Alt+Shift+X']: () => this.authManager?.initiateDesktopAuth(),
    [this.isMac ? 'CommandOrControl+Shift+Z' : 'Alt+Shift+Z']: () => this.authManager?.signOut()
    };

    const handler = shortcutMap[combination];
    if (handler) {
      try {
        handler();
      } catch (error) {
        console.error(`Error handling forced shortcut ${combination}:`, error);
      }
    }
  }

  /**
   * Get key blocking status information
   */
  getKeyBlockingStatus() {
    return {
      level: this.keyBlockingLevel,
      active: this.keyBlockingActive,
      blockedKeys: Array.from(this.blockedKeys),
      nativeHooks: this.hookInitialized,
      platform: process.platform,
      conflicts: this.getConflictingSystemKeys()
    };
  }

  /**
   * Get key blocking recommendations based on current status
   */
  getKeyBlockingRecommendations() {
    const recommendations = [];
    const conflicts = this.getConflictingSystemKeys();

    if (conflicts.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `${conflicts.length} key conflicts detected`,
        action: 'Consider using aggressive blocking mode or changing system shortcuts'
      });
    }

    if (this.keyBlockingLevel === 'none') {
      recommendations.push({
        type: 'info',
        message: 'Key blocking is disabled',
        action: 'Enable standard or aggressive blocking for better key capture'
      });
    }

    if (this.keyBlockingLevel === 'standard' && !this.keyBlockingActive) {
      recommendations.push({
        type: 'warning',
        message: 'Standard key blocking failed to initialize',
        action: 'Try aggressive mode or check system permissions'
      });
    }

    if (this.isWindows && this.keyBlockingLevel === 'aggressive') {
      recommendations.push({
        type: 'info',
        message: 'Aggressive mode requires native Windows hooks',
        action: 'Implementation would need a native addon with SetWindowsHookEx'
      });
    }

    if (this.isMac && this.keyBlockingLevel === 'aggressive') {
      recommendations.push({
        type: 'info',
        message: 'Aggressive mode requires native macOS hooks',
        action: 'Implementation would need NSEvent global monitoring'
      });
    }

    if (this.isLinux && this.keyBlockingLevel === 'aggressive') {
      recommendations.push({
        type: 'info',
        message: 'Aggressive mode requires X11 hooks',
        action: 'Implementation would need XGrabKey functionality'
      });
    }

    return recommendations;
  }

  registerShortcuts() {
    // Check if all required managers are initialized
    if (!this.windowManager || !this.authManager || !this.stealthManager || 
        !this.screenshotManager || !this.aiManager || !this.appController || !this.autofillManager) {
      console.error('Not all managers are initialized. Cannot register shortcuts.');
      console.log('Manager status:', {
        windowManager: !!this.windowManager,
        authManager: !!this.authManager,
        stealthManager: !!this.stealthManager,
        screenshotManager: !!this.screenshotManager,
        aiManager: !!this.aiManager,
        appController: !!this.appController,
        autofillManager: !!this.autofillManager
      });
      return;
    }

    console.log('Registering global shortcuts...');

    // Alt+Enter => Process all collected screenshots
    globalShortcut.register(this.isMac ? 'CommandOrControl+Enter' : 'Alt+Enter', async () => {
      try {
        if (!this.checkAuthentication('screenshot processing')) {
          return;
        }
        // Send shortcut used event to UI
        if (this.windowManager?.getMainWindow()?.webContents) {
          this.windowManager.getMainWindow().webContents.send('shortcut-used', 'process');
        }
        await this.appController.processAllScreenshots();
      } catch (error) {
        console.error("Alt+Enter error:", error);
      }
    });

    // Alt+L => Add screenshot to collection
    globalShortcut.register(this.isMac ? 'CommandOrControl+L' : 'Alt+L', async () => {
      try {
        if (!this.checkAuthentication('screenshot capture')) {
          return;
        }
        // Send shortcut used event to UI
        if (this.windowManager?.getMainWindow()?.webContents) {
          this.windowManager.getMainWindow().webContents.send('shortcut-used', 'screenshot');
        }
        await this.appController.addScreenshotToCollection();
      } catch (error) {
        console.error("Alt+L error:", error);
      }
    });

    // Alt+N => Clear chat and screenshots
    globalShortcut.register(this.isMac ? 'CommandOrControl+N' : 'Alt+N', () => {
      // Send shortcut used event to UI
      if (this.windowManager?.getMainWindow()?.webContents) {
        this.windowManager.getMainWindow().webContents.send('shortcut-used', 'clear');
      }
      this.appController.clearScreenshots();
    });

    // Alt+H => Hide/Show app
    globalShortcut.register(this.isMac ? 'CommandOrControl+H' : 'Alt+H', () => {
      // Send shortcut used event to UI
      if (this.windowManager?.getMainWindow()?.webContents) {
        this.windowManager.getMainWindow().webContents.send('shortcut-used', 'hide');
      }
      this.windowManager.toggleMainWindow();
    });
       
    // Alt+Q => Quit the application
    globalShortcut.register(this.isMac ? 'CommandOrControl+Q' : 'Alt+Q', () => {
      console.log("Quitting application...");
      // Force quit immediately without cleanup to avoid hanging
      process.exit(0);
    });

    // Screen capture protection is always set to maximum - no toggle needed

    // Window movement shortcuts - Alt + Arrow keys
    globalShortcut.register(this.isMac ? 'CommandOrControl+Up' : 'Alt+Up', () => {
      this.windowManager.moveWindow('up');
    });

    globalShortcut.register(this.isMac ? 'CommandOrControl+Down' : 'Alt+Down', () => {
      this.windowManager.moveWindow('down');
    });

    globalShortcut.register(this.isMac ? 'CommandOrControl+Left' : 'Alt+Left', () => {
      this.windowManager.moveWindow('left');
    });

    globalShortcut.register(this.isMac ? 'CommandOrControl+Right' : 'Alt+Right', () => {
      this.windowManager.moveWindow('right');
    });

    // Window scaling shortcuts - Alt + Plus/Minus
    globalShortcut.register(this.isMac ? 'CommandOrControl+Plus' : 'Alt+Plus', () => {
      this.windowManager.scaleWindow('up');
    });

    // Alternative shortcut for plus (using equals key)
    globalShortcut.register(this.isMac ? 'CommandOrControl+=' : 'Alt+=', () => {
      this.windowManager.scaleWindow('up');
    });

    globalShortcut.register(this.isMac ? 'CommandOrControl+-' : 'Alt+-', () => {
      this.windowManager.scaleWindow('down');
    });
    
    // Alt+M => Switch model
    globalShortcut.register(this.isMac ? 'CommandOrControl+M' : 'Alt+M', () => {
      if (!this.checkAuthentication('model switching')) {
        return;
      }
      this.aiManager.switchModel();
    });

    // Command+Shift+X => Initiate desktop authentication
    globalShortcut.register(this.isMac ? 'CommandOrControl+Shift+X' : 'Alt+Shift+X', () => {
      if (!this.checkIfAuthNeeded()) {
        // User is already authenticated, show a brief message
        const userName = this.authManager.getAuthState().user?.firstName || 
                       this.authManager.getAuthState().user?.email || 'User';
        const message = `Already signed in as ${userName}`;
        
        if (this.windowManager?.getMainWindow()?.webContents) {
          this.windowManager.getMainWindow().webContents.send('update-instruction', message);
          // Clear the message after 3 seconds
          setTimeout(() => {
            this.windowManager.getMainWindow().webContents.send('hide-instruction');
          }, 3000);
        }
        return;
      }
      
      this.authManager.initiateDesktopAuth();
    });

    // Command+Shift+Z => Sign out
    globalShortcut.register(this.isMac ? 'CommandOrControl+Shift+Z' : 'Alt+Shift+Z', () => {
      this.authManager.signOut();
    });
    
    // =============================================================================
    // STEALTH HOTKEYS - REMOVED
    // Click-through, scroll-only, and stealth modes are now always enabled by default
    // =============================================================================

    // Alt+J => Scroll down
    globalShortcut.register(this.isMac ? 'CommandOrControl+J' : 'Alt+J', () => {
      this.windowManager.sendToRenderer('scroll-down');
    });

    // Alt+K => Scroll up
    globalShortcut.register(this.isMac ? 'CommandOrControl+K' : 'Alt+K', () => {
      this.windowManager.sendToRenderer('scroll-up');
    });

    // =============================================================================
    // AUTOFILL HOTKEYS - DISABLED
    // =============================================================================
    
    // Ctrl+Shift+F => Autofill the largest code snippet
    // globalShortcut.register('CommandOrControl+Shift+F', async () => {
    //   try {
    //     if (!this.checkAuthentication('autofill')) {
    //       return;
    //     }
    //     if (this.autofillManager) {
    //       await this.autofillManager.autofillCode();
    //     }
    //   } catch (error) {
    //     console.error("Ctrl+Shift+F (autofill) error:", error);
    //   }
    // });

    // Ctrl+Shift+1-9 => Autofill specific code snippet by index
    // for (let i = 1; i <= 9; i++) {
    //   globalShortcut.register(`CommandOrControl+Shift+${i}`, async () => {
    //     try {
    //       if (!this.checkAuthentication(`autofill snippet ${i}`)) {
    //         return;
    //       }
    //       if (this.autofillManager) {
    //           await this.autofillManager.autofillCode(i - 1); // Convert to 0-based index
    //         }
    //       } catch (error) {
    //         console.error(`Ctrl+Shift+${i} (autofill snippet ${i}) error:`, error);
    //       }
    //     });
    //   }

    console.log('Global shortcuts registered successfully!');
    
    // Send shortcuts to renderer for display
    this.sendShortcutsToRenderer();
    
    // Log shortcuts with platform-appropriate display
    const shortcuts = this.getAllShortcuts();
    console.log('Available shortcuts:');
    shortcuts.forEach(shortcut => {
      console.log(`  ${shortcut.display}: ${shortcut.description}${shortcut.requiresAuth ? ' (requires auth)' : ''}`);
    });
  }

  registerIPCHandlers() {
    // IPC handlers for model management
    ipcMain.on('model-changed', (event, newModel) => {
      this.aiManager.setModel(newModel);
    });

    // IPC handlers for desktop authentication
    ipcMain.on('auth-sign-out', () => {
      this.authManager.signOut();
    });

    ipcMain.on('auth-get-status', (event) => {
      event.reply('auth-status-updated', {
        isAuthenticated: this.authManager.getAuthState().isAuthenticated,
        user: this.authManager.getAuthState().user,
        isAuthenticating: this.authManager.getAuthState().isAuthenticating
      });
    });

    // IPC handler for getting shortcuts
    ipcMain.on('get-shortcuts', (event) => {
      const shortcuts = this.getAllShortcuts();
      event.reply('shortcuts-updated', {
        shortcuts,
        platform: this.isMac ? 'mac' : 'windows',
        isMac: this.isMac
      });
    });

    // IPC handler for getting usage information
    ipcMain.on('auth-get-usage', async (event) => {
      try {
        await this.authManager.fetchUsageInfoWithRetry();
      } catch (error) {
        console.error('Error fetching usage info:', error);
        // Send a fallback value if the backend is not available
        if (this.authManager.mainWindow?.webContents) {
          this.authManager.mainWindow.webContents.send('api-response-data', {
            requests_remaining: 10, // Default fallback value
            total_requests: 50
          });
        }
      }
    });

    // ============================================================================
    // KEY BLOCKING IPC HANDLERS
    // ============================================================================

    // Get key blocking status
    ipcMain.on('get-key-blocking-status', (event) => {
      const status = this.getKeyBlockingStatus();
      event.reply('key-blocking-status', status);
    });

    // Set key blocking level
    ipcMain.on('set-key-blocking-level', async (event, level) => {
      try {
        await this.setKeyBlockingLevel(level);
        const status = this.getKeyBlockingStatus();
        event.reply('key-blocking-level-changed', { success: true, status });
      } catch (error) {
        event.reply('key-blocking-level-changed', {
          success: false,
          error: error.message
        });
      }
    });

    // Force capture specific keys
    ipcMain.on('force-capture-keys', (event, keyCombinations) => {
      try {
        this.forceCaptureKeys(keyCombinations);
        event.reply('keys-force-captured', { success: true });
      } catch (error) {
        event.reply('keys-force-captured', {
          success: false,
          error: error.message
        });
      }
    });

    // Get conflicting keys
    ipcMain.on('get-conflicting-keys', (event) => {
      const conflicts = this.getConflictingSystemKeys();
      event.reply('conflicting-keys', conflicts);
    });

    // Test key blocking
    ipcMain.on('test-key-blocking', (event) => {
      const status = this.getKeyBlockingStatus();
      const testResults = {
        level: status.level,
        active: status.active,
        registeredShortcuts: this.testShortcuts ? 'Test method available' : 'No test method',
        conflicts: status.conflicts,
        recommendations: this.getKeyBlockingRecommendations()
      };
      event.reply('key-blocking-test-results', testResults);
    });
  }

  unregisterAll() {
    console.log('Unregistering all global shortcuts...');
    globalShortcut.unregisterAll();

    // Also clean up key blocking system
    this.deinitializeKeyBlocking();
  }

  // Test if shortcuts are working
  testShortcuts() {
    const testShortcuts = [
      this.isMac ? 'CommandOrControl+Enter' : 'Alt+Enter',
      this.isMac ? 'CommandOrControl+L' : 'Alt+L',
      this.isMac ? 'CommandOrControl+N' : 'Alt+N',
      this.isMac ? 'CommandOrControl+H' : 'Alt+H',
      this.isMac ? 'CommandOrControl+Plus' : 'Alt+Plus',
      this.isMac ? 'CommandOrControl+=' : 'Alt+=',
      this.isMac ? 'CommandOrControl+-' : 'Alt+-'
    ];

    console.log('Testing shortcut registration...');
    testShortcuts.forEach(shortcut => {
      const isRegistered = globalShortcut.isRegistered(shortcut);
      console.log(`  ${shortcut}: ${isRegistered ? 'REGISTERED' : 'NOT REGISTERED'}`);
    });
  }

  // Force reregister shortcuts if needed
  reregisterShortcuts() {
    console.log('Force reregistering shortcuts...');
    this.unregisterAll();
    this.registerShortcuts();
  }
}

module.exports = ShortcutManager; 