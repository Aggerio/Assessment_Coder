class AppController {
  constructor() {
    this.screenshots = [];
    this.multiPageMode = false;
    this.stage = 0; // 0 = boot up stage, 1 = multi capture, 2 = AI Answered
    
    // Managers will be injected
    this.configManager = null;
    this.windowManager = null;
    this.authManager = null;
    this.stealthManager = null;
    this.screenshotManager = null;
    this.aiManager = null;
    this.shortcutManager = null;
    this.autofillManager = null;
  }

  setManagers(managers) {
    this.configManager = managers.configManager;
    this.windowManager = managers.windowManager;
    this.authManager = managers.authManager;
    this.stealthManager = managers.stealthManager;
    this.screenshotManager = managers.screenshotManager;
    this.aiManager = managers.aiManager;
    this.shortcutManager = managers.shortcutManager;
    this.autofillManager = managers.autofillManager;
  }

  async addScreenshotToCollection() {
    try {
      const img = await this.screenshotManager.captureScreenshot();
      this.screenshots.push(img);
      this.multiPageMode = true;
      this.stage = 1;
      
      // Send enhanced UI event
      this.windowManager.sendToRenderer('screenshot-added', this.screenshots.length);
      console.log(`Added screenshot ${this.screenshots.length} to collection`);
    } catch (error) {
      console.error("Error adding screenshot to collection:", error);
      throw error;
    }
  }

  async processAllScreenshots() {
    try {
      if (this.screenshots.length === 0) {
        // If no screenshots collected, take one and process immediately
        const img = await this.screenshotManager.captureScreenshot();
        this.screenshots.push(img);
      }
      
      const result = await this.aiManager.processScreenshots(this.screenshots);
      this.stage = 2;
      return result;
    } catch (error) {
      console.error("Error processing screenshots:", error);
      throw error;
    }
  }

  // Clear screenshots array and chat messages
  clearScreenshots() {
    this.screenshots = [];
    this.multiPageMode = false;
    this.stage = 0;
    this.windowManager.sendToRenderer('clear-result');
    this.updateInstruction("Chat cleared - ready for next task!");
    console.log("Screenshots array and chat messages cleared");
  }

  // Reset everything
  resetProcess() {
    this.screenshots = [];
    this.multiPageMode = false;
    this.windowManager.sendToRenderer('clear-result');
    this.updateInstruction("Ready!");
    this.stage = 0;
    
    // Clear autofill manager
    if (this.autofillManager) {
      this.autofillManager.clear();
    }
  }

  updateInstruction(instruction) {
    this.windowManager.updateInstruction(instruction);
  }

  getBaseInstruction() {
    const authInfo = this.authManager.getAuthInfo();
    return authInfo + "Ready!";
  }

  initializeUI() {
    if (this.stage == 2) {
      this.windowManager.sendToRenderer('show-app');
    } else {
      this.updateInstruction(this.getBaseInstruction());
    }
  }

  getScreenshots() {
    return this.screenshots;
  }

  getStage() {
    return this.stage;
  }

  isMultiPageMode() {
    return this.multiPageMode;
  }
}

module.exports = AppController; 