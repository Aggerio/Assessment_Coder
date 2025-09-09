# OA-Coder Modular Architecture

This document explains the refactored modular architecture of the OA-Coder application.

## Architecture Overview

The application has been refactored from a monolithic `main.js` file (1349 lines) into a clean, modular architecture with separate concerns and responsibilities.

## Module Structure

```
src/
├── auth/               # Authentication system
│   └── AuthManager.js  # Desktop authentication, token management
├── stealth/            # Security and privacy features
│   └── StealthManager.js # Process obfuscation, click-through, window stealth
├── capture/            # Screenshot functionality
│   └── ScreenshotManager.js # Screen capture, permissions, error handling
├── window/             # Window management
│   └── WindowManager.js # Window creation, positioning, visibility
├── ai/                 # AI integration
│   └── AIManager.js    # OpenAI API, model switching, image processing
├── shortcuts/          # Global shortcuts
│   └── ShortcutManager.js # Hotkey registration, IPC handlers
├── config/             # Configuration management
│   └── ConfigManager.js # Config loading, validation, defaults
├── utils/              # Utility functions and documentation
│   └── README.md       # This documentation
└── AppController.js    # Main application controller
```

## Key Benefits

### 1. **Separation of Concerns**
- Each module handles a specific responsibility
- Clear boundaries between different features
- Easier to understand and maintain

### 2. **Improved Maintainability**
- Changes to one feature don't affect others
- Bugs are isolated to specific modules
- Easier to add new features

### 3. **Better Testing**
- Each module can be tested independently
- Mocking dependencies is straightforward
- Unit testing is more focused

### 4. **Code Reusability**
- Modules can be reused in other parts of the application
- Common patterns are abstracted into reusable classes
- Dependency injection makes modules more flexible

## Module Details

### ConfigManager
- **Purpose**: Centralized configuration management
- **Responsibilities**:
  - Load and validate config.json
  - Provide default values
  - Expose configuration getters

### AuthManager
- **Purpose**: Handle desktop authentication
- **Responsibilities**:
  - Manage authentication state
  - Handle token exchange
  - Save/load authentication data
  - Custom protocol handling

### StealthManager
- **Purpose**: Security and privacy features
- **Responsibilities**:
  - Process identity randomization
  - Window title obfuscation
  - Click-through modes
  - Screen capture protection
  - Anti-analysis features

### ScreenshotManager
- **Purpose**: Screenshot capture functionality
- **Responsibilities**:
  - Cross-platform screenshot capture
  - Permission handling (especially macOS)
  - Error handling and troubleshooting
  - Capability testing

### WindowManager
- **Purpose**: Window lifecycle management
- **Responsibilities**:
  - Window creation and configuration
  - Positioning and movement
  - Visibility control
  - Platform-specific behavior

### AIManager
- **Purpose**: AI integration and processing
- **Responsibilities**:
  - OpenAI API communication
  - Model management and switching
  - Screenshot processing
  - Response handling

### ShortcutManager
- **Purpose**: Global shortcuts and IPC
- **Responsibilities**:
  - Register/unregister global hotkeys
  - Handle IPC communication
  - Coordinate between modules

### AppController
- **Purpose**: Main application orchestration
- **Responsibilities**:
  - Application state management
  - Coordinate between modules
  - Handle application logic flow
  - UI state management

## Data Flow

1. **Initialization**:
   ```
   main.js → ConfigManager → All other managers → AppController
   ```

2. **User Actions**:
   ```
   Hotkey → ShortcutManager → AppController → Relevant Managers
   ```

3. **UI Updates**:
   ```
   Manager → WindowManager → Renderer Process
   ```

## Dependencies

- **ConfigManager**: No dependencies
- **AuthManager**: Depends on ConfigManager
- **StealthManager**: No dependencies
- **ScreenshotManager**: No dependencies
- **WindowManager**: No dependencies
- **AIManager**: Depends on ConfigManager
- **ShortcutManager**: Depends on all other managers
- **AppController**: Depends on all managers

## Error Handling

Each module handles its own errors and provides meaningful error messages. Errors are propagated up through the AppController and displayed to the user through the WindowManager.

## Future Improvements

1. **Add TypeScript**: For better type safety and developer experience
2. **Add Unit Tests**: Test each module independently
3. **Add Logging**: Centralized logging system
4. **Add Plugin System**: Allow extending functionality through plugins
5. **Add Configuration UI**: GUI for managing settings

## Migration Guide

The refactored code maintains the same external API, so existing functionality works unchanged. However, internal function calls have been moved to their respective modules.

### Before (monolithic):
```javascript
function captureScreenshot() { ... }
captureScreenshot();
```

### After (modular):
```javascript
const screenshotManager = new ScreenshotManager();
screenshotManager.captureScreenshot();
```

All hotkeys, IPC handlers, and UI interactions work exactly the same as before. 