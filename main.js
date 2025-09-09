const { app } = require('electron');
const path = require('path');

// Add fetch polyfill for main process
const fetch = require('node-fetch');

// Import all the modular components
const ConfigManager = require('./src/config/ConfigManager');
const AuthManager = require('./src/auth/AuthManager');
const StealthManager = require('./src/stealth/StealthManager');
const ScreenshotManager = require('./src/capture/ScreenshotManager');
const WindowManager = require('./src/window/WindowManager');
const AIManager = require('./src/ai/AIManager');
const ShortcutManager = require('./src/shortcuts/ShortcutManager');
const AppController = require('./src/AppController');
const AutofillManager = require('./src/autofill/AutofillManager');

// Global managers
let configManager;
let authManager;
let stealthManager;
let screenshotManager;
let windowManager;
let aiManager;
let shortcutManager;
let appController;
let autofillManager;

app.whenReady().then(async () => {
  try {
    // Initialize configuration
    configManager = new ConfigManager();
    
    // Initialize all managers
    authManager = new AuthManager(configManager);
    stealthManager = new StealthManager();
    windowManager = new WindowManager();
    screenshotManager = new ScreenshotManager();
    aiManager = new AIManager(configManager);
    autofillManager = new AutofillManager();
    appController = new AppController();
    shortcutManager = new ShortcutManager();
    
    // Load authentication state on app start
    authManager.loadAuthState();
    
    // macOS: Hide dock icon for extra stealth
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // Initialize the window using the correct method name
    await windowManager.createMainWindow();
    
    // Initialize all managers with the main window
    authManager.setMainWindow(windowManager.getMainWindow());
    aiManager.setMainWindow(windowManager.getMainWindow());
    screenshotManager.setMainWindow(windowManager.getMainWindow());
    autofillManager.setMainWindow(windowManager.getMainWindow());
    
    // Set up stealth mode using the correct method name
    stealthManager.setMainWindow(windowManager.getMainWindow());
    stealthManager.initializeStealth();
    
    // Set up AppController with all managers
    appController.setManagers({
      configManager,
      windowManager,
      authManager,
      stealthManager,
      screenshotManager,
      aiManager,
      shortcutManager,
      autofillManager
    });
    
    // Set up AIManager with AuthManager reference for backend calls
    aiManager.setAuthManager(authManager);
    
    // Set up AutofillManager with AuthManager reference for authentication checks
    autofillManager.setAuthManager(authManager);
    
    // Set up ShortcutManager with all managers
    shortcutManager.setManagers({
      windowManager,
      authManager,
      stealthManager,
      screenshotManager,
      aiManager,
      appController,
      autofillManager
    });
    
    // Initialize key blocking system first
    await shortcutManager.initializeKeyBlocking();

    // Initialize shortcuts and IPC handlers
    shortcutManager.registerShortcuts();
    shortcutManager.registerIPCHandlers();
    
    // Initialize the UI
    appController.initializeUI();
    
    // Test shortcuts to make sure they're working
    setTimeout(() => {
      shortcutManager.testShortcuts();
    }, 1000);
    
    console.log('Application started successfully with local server authentication');
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
});

// Handle window-all-closed event
app.on('window-all-closed', () => {
  // Clean up authentication server on app quit
  if (authManager) {
    authManager.signOut(); // This will stop any running local server
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (windowManager && windowManager.getMainWindow() === null) {
    windowManager.createMainWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  console.log('Application shutting down...');
  
  // Clean up shortcuts
  if (shortcutManager) {
    shortcutManager.unregisterAll();
  }
  
  // Clean up authentication server
  if (authManager) {
    authManager.signOut();
  }
});

// Single instance handling
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (windowManager?.getMainWindow()) {
      const mainWindow = windowManager.getMainWindow();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
