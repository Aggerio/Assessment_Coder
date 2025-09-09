const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../../config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      // if (!this.config.apiKey) {
      //   throw new Error("API key is missing in config.json");
      // }
      
      // Set default model if not specified
      if (!this.config.model) {
        this.config.model = "gpt-oss";
        console.log("Model not specified in config, using default:", this.config.model);
      }
      
      // Set default auth URL if not specified
      if (!this.config.authUrl) {
        this.config.authUrl = "https://your-domain.com/auth/desktop";
        console.log("Auth URL not specified in config, using placeholder:", this.config.authUrl);
      }
      
      // Set default API base URL if not specified
      if (!this.config.apiBaseUrl) {
        this.config.apiBaseUrl = "https://your-domain.com/api";
        console.log("API base URL not specified in config, using placeholder:", this.config.apiBaseUrl);
      }
    } catch (err) {
      console.error("Error reading config:", err);
      throw err;
    }
  }

  getConfig() {
    return this.config;
  }

  getApiKey() {
    return this.config?.apiKey;
  }

  getModel() {
    return this.config?.model || "gpt-oss";
  }

  getAuthUrl() {
    return this.config?.authUrl || "https://your-domain.com/auth/desktop";
  }

  getApiBaseUrl() {
    return this.config?.apiBaseUrl || "https://your-domain.com/api";
  }
}

module.exports = ConfigManager; 