/**
 * Key Blocking Configuration
 * Manages settings for different levels of keyboard input blocking
 */

class KeyBlockingConfig {
  constructor() {
    // Default configuration
    this.defaultConfig = {
      level: 'standard',
      enableConflictDetection: true,
      enableAutoRecovery: true,
      enableNativeHooks: false,
      monitoringInterval: 5000,
      aggressiveMode: {
        windows: {
          useLowLevelHooks: false,
          requireAdmin: false,
          hookType: 'WH_KEYBOARD_LL'
        },
        macos: {
          useGlobalMonitor: false,
          requireAccessibility: true,
          eventMask: 'NSKeyDownMask | NSKeyUpMask'
        },
        linux: {
          useX11Grabs: false,
          requireX11: true,
          grabMode: 'AsyncBoth'
        }
      },
      fallbackStrategies: [
        'doubleRegistration',
        'priorityRegistration',
        'pollingRecovery',
        'forceReRegistration'
      ]
    };

    this.config = { ...this.defaultConfig };
  }

  /**
   * Load configuration from file or use defaults
   */
  async loadConfig() {
    try {
      // In a real implementation, load from file
      // For now, use defaults with potential overrides
      const platformOverrides = this.getPlatformOverrides();
      this.config = { ...this.defaultConfig, ...platformOverrides };
      console.log('Key blocking config loaded:', this.config);
    } catch (error) {
      console.error('Failed to load key blocking config:', error);
      this.config = { ...this.defaultConfig };
    }
  }

  /**
   * Get platform-specific configuration overrides
   */
  getPlatformOverrides() {
    const platform = process.platform;
    const overrides = {};

    switch (platform) {
      case 'win32':
        overrides.aggressiveMode = {
          ...this.defaultConfig.aggressiveMode,
          windows: {
            useLowLevelHooks: true,
            requireAdmin: false,
            hookType: 'WH_KEYBOARD_LL'
          }
        };
        break;

      case 'darwin':
        overrides.aggressiveMode = {
          ...this.defaultConfig.aggressiveMode,
          macos: {
            useGlobalMonitor: true,
            requireAccessibility: true,
            eventMask: 'NSKeyDownMask | NSKeyUpMask'
          }
        };
        break;

      case 'linux':
        overrides.aggressiveMode = {
          ...this.defaultConfig.aggressiveMode,
          linux: {
            useX11Grabs: true,
            requireX11: true,
            grabMode: 'AsyncBoth'
          }
        };
        break;
    }

    return overrides;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('Key blocking config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Reset to defaults
   */
  resetToDefaults() {
    this.config = { ...this.defaultConfig };
    console.log('Key blocking config reset to defaults');
  }

  /**
   * Check if current configuration is valid
   */
  validateConfig() {
    const issues = [];

    if (!['none', 'standard', 'aggressive'].includes(this.config.level)) {
      issues.push(`Invalid blocking level: ${this.config.level}`);
    }

    if (this.config.monitoringInterval < 1000) {
      issues.push('Monitoring interval too short (< 1000ms)');
    }

    if (this.config.level === 'aggressive' && !this.config.enableNativeHooks) {
      issues.push('Aggressive mode requires native hooks to be enabled');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Get recommended configuration for current platform
   */
  getRecommendedConfig() {
    const platform = process.platform;
    const recommended = { ...this.defaultConfig };

    switch (platform) {
      case 'win32':
        recommended.level = 'standard';
        recommended.enableNativeHooks = false;
        break;

      case 'darwin':
        recommended.level = 'standard';
        recommended.enableNativeHooks = false;
        break;

      case 'linux':
        recommended.level = 'standard';
        recommended.enableNativeHooks = false;
        break;
    }

    return recommended;
  }

  /**
   * Export configuration for debugging
   */
  exportConfig() {
    return {
      current: this.config,
      defaults: this.defaultConfig,
      platform: process.platform,
      validation: this.validateConfig(),
      recommendations: this.getRecommendedConfig()
    };
  }
}

module.exports = KeyBlockingConfig;
