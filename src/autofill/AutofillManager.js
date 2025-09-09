const { clipboard } = require('electron');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const CodeExtractor = require('../utils/CodeExtractor');

class AutofillManager {
  constructor() {
    this.codeExtractor = new CodeExtractor();
    this.lastResponse = '';
    this.availableSnippets = [];
    this.isTyping = false;
    this.shouldStop = false; // Flag to stop typing
    this.typingSpeed = 3; // milliseconds between characters (very fast for Windows)
    this.mainWindow = null;
    this.authManager = null; // Will be set by main process
    
    // Configure nutjs
    keyboard.config.autoDelayMs = this.typingSpeed;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  setAuthManager(authManager) {
    this.authManager = authManager;
  }

  /**
   * Update the last AI response and extract code snippets
   * @param {string} response - The AI response text
   */
  updateResponse(response) {
    this.lastResponse = response;
    this.availableSnippets = this.codeExtractor.extractCodeSnippets(response);
    
    // Notify UI about available snippets
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('code-snippets-updated', {
        count: this.availableSnippets.length,
        snippets: this.availableSnippets.map(snippet => ({
          index: snippet.index,
          language: snippet.language,
          preview: snippet.preview
        }))
      });
    }
  }

  /**
   * Get available code snippets
   * @returns {Array} Array of available code snippets
   */
  getAvailableSnippets() {
    return this.availableSnippets;
  }

  /**
   * Autofill the most recent/largest code snippet
   * @param {number} snippetIndex - Optional specific snippet index, defaults to largest
   */
  async autofillCode(snippetIndex = null) {
    if (this.isTyping) {
      console.log('Already typing, stopping current process...');
      this.shouldStop = true;
      this.sendStatusUpdate('Stopping typing process...');
      return;
    }

    // Reset stop flag
    this.shouldStop = false;

    let snippet;
    if (snippetIndex !== null && this.availableSnippets[snippetIndex]) {
      snippet = this.availableSnippets[snippetIndex];
    } else {
      // Default to largest snippet (likely the main answer)
      snippet = this.codeExtractor.getLargestCodeSnippet(this.lastResponse);
    }

    if (!snippet) {
      this.sendStatusUpdate('No code snippets found in the response');
      return;
    }

    this.sendStatusUpdate(`Typing ${snippet.language} code (${snippet.code.length} chars)...`);
    
    try {
      // Clean the code for typing
      const cleanCode = this.codeExtractor.cleanCodeForTyping(snippet.code);
      
      // Use platform-specific typing method
      await this.typeCodeWithHighSpeed(cleanCode);
      
      if (this.shouldStop) {
        this.sendStatusUpdate('Typing stopped by user');
      } else {
        this.sendStatusUpdate(`Code typed successfully! (${cleanCode.length} characters)`);
      }
    } catch (error) {
      console.error('Error during autofill:', error);
      this.sendStatusUpdate(`Autofill failed: ${error.message}`, true);
    }
  }

  /**
   * Type code using nutjs for reliable cross-platform input
   * @param {string} code - The code to type
   */
  async typeCodeWithHighSpeed(code) {
    this.isTyping = true;
    
    try {
      // Give user brief moment to focus target application if needed
      this.sendStatusUpdate('Focus target application... Starting autofill in 1 second');
      await this.delay(1000);
      
      // Check if user wants to stop
      if (this.shouldStop) {
        return;
      }
      
      // Hide our window to avoid interfering with target app focus
      if (this.mainWindow) {
        this.mainWindow.hide();
      }
      
      // Small additional delay for focus to settle
      await this.delay(200);

      // Check if user wants to stop
      if (this.shouldStop) {
        return;
      }

      // Use nutjs for reliable typing across all platforms
      await this.typeCodeWithNutjs(code);
      
      // Check if user wants to stop before showing window
      if (this.shouldStop) {
        return;
      }
      
      // Brief delay before showing our window again
      await this.delay(300);
      
      // Show our window again
      if (this.mainWindow) {
        this.mainWindow.show();
      }
    } finally {
      this.isTyping = false;
    }
  }

  /**
   * Type code using nutjs with proper newline handling
   * @param {string} code - The code to type
   */
  async typeCodeWithNutjs(code) {
    return new Promise((resolve, reject) => {
      try {
        // Set up progress tracking
        let charCount = 0;
        const totalChars = code.length;
        const startTime = Date.now();
        
        // Update typing speed
        keyboard.config.autoDelayMs = this.typingSpeed;
        
        // Split code into lines to handle newlines properly
        const lines = code.split(/\r?\n/);
        
        const typeNextLine = async (lineIndex) => {
          // Check if user wants to stop
          if (this.shouldStop) {
            resolve();
            return;
          }
          
          if (lineIndex >= lines.length) {
            // Finished typing all lines
            resolve();
            return;
          }
          
          const line = lines[lineIndex];
          
          try {
            // Type the current line
            if (line.length > 0) {
              // Type character by character to allow for stopping
              await this.typeStringCharByChar(line);
              charCount += line.length;
            }
            
            // Add newline if not the last line
            if (lineIndex < lines.length - 1) {
              await keyboard.pressKey(Key.Enter);
              charCount += 1;
            }
            
            // Update progress
            const progress = Math.min((charCount / totalChars) * 100, 95);
            this.sendStatusUpdate(`Typing code... ${Math.round(progress)}% complete`);
            
            // Continue with next line
            setTimeout(() => typeNextLine(lineIndex + 1), 10);
          } catch (error) {
            reject(error);
          }
        };
        
        // Start typing from the first line
        typeNextLine(0);
        
      } catch (error) {
        reject(new Error(`Nutjs typing failed: ${error.message}`));
      }
    });
  }

  /**
   * Type string character by character with stop checking
   * @param {string} text - Text to type
   */
  async typeStringCharByChar(text) {
    return new Promise((resolve, reject) => {
      let charIndex = 0;
      
      const typeNextChar = async () => {
        // Check if user wants to stop
        if (this.shouldStop) {
          resolve();
          return;
        }
        
        if (charIndex >= text.length) {
          resolve();
          return;
        }
        
        try {
          const char = text[charIndex];
          await keyboard.type(char);
          charIndex++;
          
          // Continue with next character
          setTimeout(typeNextChar, this.typingSpeed);
        } catch (error) {
          reject(error);
        }
      };
      
      typeNextChar();
    });
  }



  /**
   * Send status update to UI
   * @param {string} message - Status message
   * @param {boolean} isError - Whether this is an error message
   */
  sendStatusUpdate(message, isError = false) {
    console.log(`[AutofillManager] ${message}`);
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('autofill-status', { message, isError });
    }
  }

  /**
   * Utility delay function
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop the current typing process
   */
  stopTyping() {
    if (this.isTyping) {
      this.shouldStop = true;
      this.sendStatusUpdate('Stopping typing process...');
    }
  }

  /**
   * Clear stored response and snippets
   */
  clear() {
    this.lastResponse = '';
    this.availableSnippets = [];
    this.shouldStop = false; // Reset stop flag
    
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('code-snippets-updated', {
        count: 0,
        snippets: []
      });
    }
  }
}

module.exports = AutofillManager; 