const { OpenAI } = require('openai');

class AIManager {
  constructor(configManager) {
    this.configManager = configManager;
    // Remove OpenAI client - we'll use backend instead
    this.authManager = null; // Will be set by AppController
    this.currentModel = configManager.getModel();
    this.availableModels = ['gpt-oss', 'gpt-4o-mini', 'o4-mini'];
    this.mainWindow = null;
    this.autofillManager = null;

    // Model aliases to prevent backtracking - Transformers theme
    this.modelAliases = {
      'gpt-oss': 'Optimus',
      'gpt-4o-mini': 'Starscream',
      'o4-mini': 'Megatron'
    };
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  setAutofillManager(autofillManager) {
    this.autofillManager = autofillManager;
  }

  setAuthManager(authManager) {
    this.authManager = authManager;
  }

  switchModel() {
    const currentIndex = this.availableModels.indexOf(this.currentModel);
    const nextIndex = (currentIndex + 1) % this.availableModels.length;
    const newModel = this.availableModels[nextIndex];
    
    this.currentModel = newModel;
    console.log(`Model switched to: ${this.currentModel}`);
    
    // Send model change to renderer
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('model-switched', {
        model: this.currentModel,
        alias: this.getCurrentModelAlias()
      });
    }

    return this.currentModel;
  }

  setModel(newModel) {
    if (this.availableModels.includes(newModel)) {
      this.currentModel = newModel;
      console.log(`Model changed via UI to: ${this.currentModel}`);
      return true;
    }
    return false;
  }

  getCurrentModel() {
    return this.currentModel;
  }

  getAvailableModels() {
    return this.availableModels;
  }

  getModelAlias(modelName) {
    return this.modelAliases[modelName] || modelName;
  }

  getCurrentModelAlias() {
    return this.getModelAlias(this.currentModel);
  }

  async processScreenshots(screenshots) {
    try {
      // Send processing start event for UI feedback
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('processing-start');
      }
      
      // Check payload size to prevent network issues
      const totalSize = screenshots.reduce((total, screenshot) => {
        return total + (screenshot.length || 0);
      }, 0);

      const maxSize = 50 * 1024 * 1024; // 50MB limit
      if (totalSize > maxSize) {
        throw new Error(`Screenshots too large (${(totalSize / 1024 / 1024).toFixed(2)}MB). Please reduce the number of screenshots or use smaller images.`);
      }

      console.log(`📊 Payload size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

      // Prepare the request payload
      const payload = {
        screenshots: screenshots, // Base64 encoded images
        model: this.currentModel
      };

      // Make request to backend with retry logic and timeout
      let response;
      let lastError;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`🔄 Attempt ${attempt}/3 to connect to API...`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

          response = await fetch('http://127.0.0.1:8000/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.authManager?.authState?.sessionToken
                ? `Bearer ${this.authManager.authState.sessionToken}`
                : undefined
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          console.log(`✅ API request successful on attempt ${attempt}`);
          break; // Success, exit retry loop

        } catch (error) {
          lastError = error;
          console.log(`❌ Attempt ${attempt}/3 failed:`, error.message);

          if (attempt === 3) {
            // All attempts failed
            throw new Error(`Network error after ${attempt} attempts: ${error.message}`);
          }

          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response JSON:', parseError.message);
        throw new Error(`Invalid response format: ${parseError.message}`);
      }

      // Handle different response types
      if (!response.ok) {
        let errorMessage;
        
        switch (response.status) {
          case 429:
            errorMessage = responseData.message || 'Rate limited. Please try again later.';
            break;
          case 422:
            // Screen recording permission required
            if (process.platform === 'darwin') {
              errorMessage = 'Screen recording permission required. Please:\n\n1. Open System Settings (System Preferences on older macOS)\n2. Go to Privacy & Security > Screen Recording\n3. Add this app and enable the checkbox\n4. Restart the application\n\nAfter granting permission, you can capture screenshots using ⌘+L or ⌘+Enter.';
            } else if (process.platform === 'win32') {
              errorMessage = 'Screen recording permission required. Please:\n\n1. Check Windows Privacy Settings\n2. Allow desktop recording for this application\n3. Restart the application if needed\n\nAfter granting permission, you can capture screenshots using Alt+L or Alt+Enter.';
            } else {
              errorMessage = 'Screen recording permission required. Please check your system permissions for screen capture and restart the application.\n\nAfter granting permission, you can capture screenshots using Alt+L or Alt+Enter.';
            }
            break;
          case 402:
            errorMessage = responseData.message || 'Out of requests. Please upgrade your plan.';
            break;
          case 401:
            const loginShortcut = process.platform === 'darwin' ? '⌘+⇧+X' : 'Alt+Shift+X';
            errorMessage = responseData.message || `Authentication failed. Please sign in again using ${loginShortcut}.`;
            break;
          case 400:
            errorMessage = responseData.message || 'Invalid request format.';
            break;
          default:
            errorMessage = responseData.message || `Backend error: ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }


      console.log(responseData);
      // Handle successful response
      const responseText = responseData.result || responseData.content || responseData.response;
      
      if (!responseText) {
        throw new Error('Backend returned empty response');
      }

      // Send the text to the renderer
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('analysis-result', responseText);
      }

      // Send API response data to update counter
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('api-response-data', responseData);
      }
      

      // Update autofill manager with the response
      if (this.autofillManager) {
        this.autofillManager.updateResponse(responseText);
      }

      return responseText;
    } catch (err) {
      console.error("Error in processScreenshots:", err);

      // Provide user-friendly error messages for common network issues
      let userFriendlyMessage = err.message;

      if (err.message.includes('fetch failed') || err.message.includes('UND_ERR_SOCKET')) {
        userFriendlyMessage = 'Network connection failed. Please check your internet connection and try again.';
      } else if (err.message.includes('other side closed')) {
        userFriendlyMessage = 'Server connection was interrupted. Please try again in a moment.';
      } else if (err.message.includes('Network error after')) {
        userFriendlyMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
      } else if (err.message.includes('Invalid response format')) {
        userFriendlyMessage = 'Received invalid response from server. Please try again.';
      }

      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('error', userFriendlyMessage);
      }
      throw err;
    }
  }
}

module.exports = AIManager; 
