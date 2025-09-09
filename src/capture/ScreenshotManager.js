const screenshot = require('screenshot-desktop');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const macScreenCapturePermissions = process.platform === 'darwin' ? require('mac-screen-capture-permissions') : null;

class ScreenshotManager {
  constructor() {
    this.mainWindow = null;
    this.windowsCompatibilityChecked = false;
    this.windowsScreenshotWorking = false;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  // Check Windows .NET Framework availability
  async checkWindowsCompatibility() {
    if (this.windowsCompatibilityChecked) {
      return this.windowsScreenshotWorking;
    }

    if (process.platform !== 'win32') {
      this.windowsCompatibilityChecked = true;
      this.windowsScreenshotWorking = true;
      return true;
    }

    try {
      // Try to take a test screenshot to verify everything works
      console.log('Testing Windows screenshot compatibility...');
      await screenshot({ filename: path.join(os.tmpdir(), 'oa_test_screenshot.png') });
      
      // Clean up test file
      try {
        fs.unlinkSync(path.join(os.tmpdir(), 'oa_test_screenshot.png'));
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      this.windowsScreenshotWorking = true;
      console.log('Windows screenshot compatibility: OK');
    } catch (error) {
      console.error('Windows screenshot compatibility check failed:', error.message);
      this.windowsScreenshotWorking = false;
      
      // Log additional debugging info
      if (error.message.includes('no .net framework installed')) {
        console.error('❌ .NET Framework is missing or not accessible');
      } else if (error.message.includes('csc')) {
        console.error('❌ C# compiler (csc.exe) not found');
      }
    }

    this.windowsCompatibilityChecked = true;
    return this.windowsScreenshotWorking;
  }

  async captureScreenshot() {
    try {
      // Check Windows compatibility first
      if (process.platform === 'win32') {
        const isCompatible = await this.checkWindowsCompatibility();
        if (!isCompatible) {
          const errorMessage = this.getWindowsErrorMessage();
          if (this.mainWindow?.webContents) {
            this.mainWindow.webContents.send('error', errorMessage);
          }
          throw new Error('Windows screenshot functionality unavailable: .NET Framework or native compilation issue');
        }
      }

      if (process.platform === 'darwin' && macScreenCapturePermissions) {
        this.mainWindow.setAlwaysOnTop(false);
        this.mainWindow.showInactive();
        const hasPerm = macScreenCapturePermissions.hasScreenCapturePermission();
        if (!hasPerm) {
          await macScreenCapturePermissions.openSystemPreferences();
          this.mainWindow.webContents.send('error',
            'Screen recording permission is required. Please enable it for this app in System Settings > Privacy & Security > Screen Recording, then restart the app.');
          return;
        }
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        this.mainWindow.hide();
      }
      
      this.hideInstruction();
      this.mainWindow.hide();
      await new Promise(res => setTimeout(res, 500)); // Increased delay for Linux

      const timestamp = Date.now();
      let imagePath;
      const tempDir = app.getPath('temp');
      imagePath = path.join(tempDir, `oa_screenshot_${timestamp}.png`);
      console.log('Attempting screenshot capture to:', imagePath);
      
      try {
        if (os.platform() === 'linux') {
          const displays = await screenshot.listDisplays();
          console.log('Available displays:', displays.length);
          if (displays.length > 0) {
            await screenshot({ filename: imagePath, screen: displays[0].id });
          } else {
            await screenshot({ filename: imagePath });
          }
        } else {
          await screenshot({ filename: imagePath });
        }
      } catch (screenshotError) {
        console.error('Screenshot error:', screenshotError.message);
        try {
          const img = await screenshot();
          fs.writeFileSync(imagePath, img);
        } catch (fallbackError) {
          console.error('Fallback screenshot method also failed:', fallbackError.message);
          throw new Error(`Screenshot capture failed: ${screenshotError.message}. Fallback also failed: ${fallbackError.message}`);
        }
      }
      
      if (!fs.existsSync(imagePath)) {
        throw new Error('Screenshot file was not created');
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      try {
        fs.unlinkSync(imagePath);
      } catch (cleanupError) {
        console.warn('Could not clean up screenshot file:', cleanupError.message);
      }
      
      this.mainWindow.showInactive();
      return base64Image;
    } catch (err) {
      console.error('Screenshot capture failed:', err);
      this.mainWindow.showInactive();
      let errorMessage = `Screenshot failed: ${err.message}`;
      
      if (os.platform() === 'win32') {
        errorMessage += this.getWindowsErrorMessage();
      } else if (os.platform() === 'linux') {
        errorMessage += '\n\nLinux troubleshooting:\n';
        errorMessage += '• Install required packages: sudo apt-get install xvfb imagemagick\n';
        errorMessage += '• Ensure you\'re running in X11 (not Wayland)\n';
        errorMessage += '• Check display permissions and $DISPLAY variable\n';
        errorMessage += '• Try running: xhost +local:';
      } else if (os.platform() === 'darwin') {
        errorMessage += '\n\nmacOS troubleshooting:\n';
        errorMessage += '• Grant screen recording permission: System Settings > Privacy & Security > Screen Recording > Enable for this app.\n';
        errorMessage += '• Restart the app after granting permission.\n';
        errorMessage += '• If the app is not listed, try taking a screenshot again and check System Settings.\n';
      }
      
      if (this.mainWindow.webContents) {
        this.mainWindow.webContents.send('error', errorMessage);
      }
      throw err;
    }
  }

  getWindowsErrorMessage() {
    return '\n\nWindows troubleshooting:\n' +
           '• Ensure .NET Framework 4.5 or later is installed\n' +
           '• Download from: https://dotnet.microsoft.com/download/dotnet-framework\n' +
           '• Try running as administrator if permission issues occur\n' +
           '• Check Windows Defender or antivirus isn\'t blocking the screenshot process\n' +
           '• Verify the app was installed correctly from the MSI installer';
  }

  async testScreenshotCapability() {
    try {
      // Check Windows compatibility first
      if (process.platform === 'win32') {
        const isCompatible = await this.checkWindowsCompatibility();
        if (!isCompatible) {
          console.error('Screenshot capability test: FAILED - Windows compatibility issues');
          return false;
        }
      }

      if (process.platform === 'darwin' && macScreenCapturePermissions) {
        // Temporarily disable always-on-top and show window for permissions
        this.mainWindow.setAlwaysOnTop(false);
        this.mainWindow.showInactive();
        // Check permission
        const hasPerm = macScreenCapturePermissions.hasScreenCapturePermission();
        if (!hasPerm) {
          // Open System Preferences to Screen Recording
          await macScreenCapturePermissions.openSystemPreferences();
          this.mainWindow.webContents.send('error',
            'Screen recording permission is required. Please enable it for this app in System Settings > Privacy & Security > Screen Recording, then restart the app.');
          // Wait for user to grant permission
          return false;
        }
        // Re-enable always-on-top
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        this.mainWindow.hide();
      }
      
      console.log('Testing screenshot capability...');
      const displays = await screenshot.listDisplays();
      console.log(`Found ${displays.length} display(s)`);
      if (displays.length === 0) {
        console.warn('No displays found for screenshot capture');
        return false;
      }
      
      await screenshot();
      console.log('Screenshot capability test: PASSED');
      return true;
    } catch (error) {
      console.error('Screenshot capability test: FAILED -', error.message);
      return false;
    }
  }

  hideInstruction() {
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('hide-instruction');
    }
  }
}

module.exports = ScreenshotManager; 