const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const { URL } = require('url');
const fetch = require('node-fetch');
const http = require('http');

class AuthManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.authState = {
      isAuthenticated: false,
      sessionToken: null,
      refreshToken: null,
      user: null,
      tempToken: null,
      isAuthenticating: false,
      oauthState: null
    };
    
    this.AUTH_CONFIG = {
      authUrl: configManager.getAuthUrl(),
      apiBaseUrl: configManager.getApiBaseUrl(),
      tokenStorePath: path.join(os.homedir(), '.oa-coder-auth.json')
    };
    
    this.mainWindow = null;
    this.localServer = null;
    this.serverPort = null;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  // Save authentication state to file
  saveAuthState() {
    try {
      const dataToSave = {
        sessionToken: this.authState.sessionToken,
        refreshToken: this.authState.refreshToken,
        user: this.authState.user,
        isAuthenticated: this.authState.isAuthenticated,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.AUTH_CONFIG.tokenStorePath, JSON.stringify(dataToSave, null, 2));
      console.log('[AUTH] Authentication state saved');
    } catch (error) {
      console.error('[AUTH] Failed to save authentication state:', error);
    }
  }

  // Load authentication state from file
  loadAuthState() {
    try {
      if (fs.existsSync(this.AUTH_CONFIG.tokenStorePath)) {
        const savedData = JSON.parse(fs.readFileSync(this.AUTH_CONFIG.tokenStorePath, 'utf8'));
        
        // Check if saved token is still valid (basic check)
        if (savedData.sessionToken && savedData.isAuthenticated) {
          this.authState.sessionToken = savedData.sessionToken;
          this.authState.refreshToken = savedData.refreshToken;
          this.authState.user = savedData.user;
          this.authState.isAuthenticated = savedData.isAuthenticated;
          
          console.log('[AUTH] Authentication state loaded');
          
          // Validate the token with the server
          this.validateStoredToken();
        }
      }
    } catch (error) {
      console.error('[AUTH] Failed to load authentication state:', error);
    }
  }

  // Validate stored token with server using OAuth2 introspection
  async validateStoredToken() {
    if (!this.authState.sessionToken) return;
    
    try {
      console.log('[AUTH] Validating stored OAuth2 token...');
      
      // Use OAuth2 token introspection endpoint
      const introspectUrl = `${this.AUTH_CONFIG.apiBaseUrl}/oauth2/introspect`;
      const params = new URLSearchParams({
        token: this.authState.sessionToken
      });
      
      const response = await fetch(introspectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.active) {
          console.log('[AUTH] Stored OAuth2 token is valid');
          
          // Get fresh user info
          const userInfoResponse = await fetch(`${this.AUTH_CONFIG.apiBaseUrl}/oauth2/userinfo`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.authState.sessionToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (userInfoResponse.ok) {
            const userData = await userInfoResponse.json();
            this.authState.user = {
              id: userData.id || userData.sub,
              name: userData.name,
              email: userData.email,
              firstName: userData.given_name,
              lastName: userData.family_name,
              picture: userData.picture
            };
          }
          
          this.updateAuthStatus();
          
          // Fetch usage information after successful token validation with retry
          await this.fetchUsageInfoWithRetry();
          return;
        }
      }
      
      // Token is invalid, clear auth state
      console.log('[AUTH] Stored OAuth2 token is invalid, clearing auth state');
      this.clearAuthState();
    } catch (error) {
      console.error('[AUTH] OAuth2 token validation failed:', error);
      this.clearAuthState();
    }
  }

  // Clear authentication state
  clearAuthState() {
    this.authState = {
      isAuthenticated: false,
      sessionToken: null,
      refreshToken: null,
      user: null,
      tempToken: null,
      isAuthenticating: false,
      oauthState: null
    };
    
    // Close any running local server
    this.stopLocalServer();
    
    // Remove saved token file
    try {
      if (fs.existsSync(this.AUTH_CONFIG.tokenStorePath)) {
        fs.unlinkSync(this.AUTH_CONFIG.tokenStorePath);
      }
    } catch (error) {
      console.error('[AUTH] Failed to remove token file:', error);
    }
    
    console.log('[AUTH] Authentication state cleared');
    this.updateAuthStatus();
  }

  // Make authenticated API request
  async makeAuthenticatedRequest(endpoint, options = {}) {
    const url = `${this.AUTH_CONFIG.apiBaseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (this.authState.sessionToken) {
      headers['Authorization'] = `Bearer ${this.authState.sessionToken}`;
    }
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - backend may not be running');
      }
      throw error;
    }
  }

  // Update authentication status in UI
  updateAuthStatus() {
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('auth-status-updated', {
        isAuthenticated: this.authState.isAuthenticated,
        user: this.authState.user,
        isAuthenticating: this.authState.isAuthenticating
      });
    }
  }

  // Fetch usage information from backend
  async fetchUsageInfo() {
    if (!this.authState.isAuthenticated || !this.authState.sessionToken) {
      console.log('[AUTH] Cannot fetch usage info - not authenticated');
      return null;
    }

    try {
      console.log('[AUTH] Fetching usage information...');
      console.log('[AUTH] API Base URL:', this.AUTH_CONFIG.apiBaseUrl);
      console.log('[AUTH] Session token exists:', !!this.authState.sessionToken);
      
      const response = await this.makeAuthenticatedRequest('/usage');
      
      if (response.ok) {
        const usageData = await response.json();
        console.log('[AUTH] Usage info received:', usageData);
        
        // Send usage data to renderer
        if (this.mainWindow?.webContents) {
          console.log('[AUTH] Sending usage data to renderer:', {
            requests_remaining: usageData.requests_remaining,
            total_requests: usageData.monthly_api_calls
          });
          this.mainWindow.webContents.send('api-response-data', {
            requests_remaining: usageData.requests_remaining,
            total_requests: usageData.monthly_api_calls
          });
        }
        
        return usageData;
      } else {
        console.error('[AUTH] Failed to fetch usage info:', response.status, response.statusText);
        
        // Try to get error details
        try {
          const errorData = await response.json();
          console.error('[AUTH] Error details:', errorData);
        } catch (e) {
          console.error('[AUTH] Could not parse error response');
        }
        
        return null;
      }
    } catch (error) {
      console.error('[AUTH] Error fetching usage info:', error);
      return null;
    }
  }

  // Enhanced method to fetch usage info with retry logic
  async fetchUsageInfoWithRetry(maxRetries = 3, delayMs = 1000) {
    // First check if backend is running
    try {
      console.log('[AUTH] Checking if backend is running...');
      const healthResponse = await fetch(`${this.AUTH_CONFIG.apiBaseUrl}/health`);
      if (!healthResponse.ok) {
        console.error('[AUTH] Backend health check failed:', healthResponse.status);
        return null;
      }
      console.log('[AUTH] Backend is running');
    } catch (error) {
      console.error('[AUTH] Backend health check failed:', error.message);
      return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AUTH] Fetching usage info (attempt ${attempt}/${maxRetries})...`);
        const usageData = await this.fetchUsageInfo();
        
        if (usageData) {
          console.log(`[AUTH] Successfully fetched usage info on attempt ${attempt}`);
          return usageData;
        }
        
        if (attempt < maxRetries) {
          console.log(`[AUTH] Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`[AUTH] Error on attempt ${attempt}:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    console.error(`[AUTH] Failed to fetch usage info after ${maxRetries} attempts`);
    return null;
  }

  getAuthInfo() {
    if (this.authState.isAuthenticated && this.authState.user) {
      return 'Signed in | ';
    } else if (this.authState.isAuthenticating) {
      return 'Authenticating... | ';
    } else {
      return 'Not signed in | ';
    }
  }

  // ===== LOCAL HTTP SERVER AUTHENTICATION =====

  // Find an available port for the local server
  async findAvailablePort(startPort = 8000, maxPort = 8020) {
    return new Promise((resolve, reject) => {
      let currentPort = startPort;

      const tryPort = () => {
        const server = http.createServer();
        
        server.listen(currentPort, 'localhost', () => {
          server.close(() => {
            console.log(`[AUTH] Found available port: ${currentPort}`);
            resolve(currentPort);
          });
        });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            currentPort++;
            if (currentPort > maxPort) {
              reject(new Error(`No available ports found between ${startPort} and ${maxPort}`));
              return;
            }
            tryPort();
          } else {
            reject(err);
          }
        });
      };

      tryPort();
    });
  }

  // Start local HTTP server for OAuth callback
  async startLocalServer() {
    try {
      // Find an available port
      this.serverPort = await this.findAvailablePort();
      
      return new Promise((resolve, reject) => {
        this.localServer = http.createServer((req, res) => {
          this.handleServerCallback(req, res);
        });

        this.localServer.on('error', (err) => {
          console.error('[AUTH] Local server error:', err);
          reject(err);
        });

        this.localServer.listen(this.serverPort, 'localhost', () => {
          console.log(`[AUTH] Local authentication server started on http://localhost:${this.serverPort}`);
          resolve(this.serverPort);
        });

        // Auto-close server after 10 minutes to prevent hanging
        setTimeout(() => {
          if (this.localServer && this.authState.isAuthenticating) {
            console.log('[AUTH] Authentication timeout - closing local server');
            this.stopLocalServer();
            this.authState.isAuthenticating = false;
            this.updateAuthStatus();
            
            if (this.mainWindow?.webContents) {
              this.mainWindow.webContents.send('auth-error', 'Authentication timeout - please try again');
            }
          }
        }, 10 * 60 * 1000); // 10 minutes
      });
    } catch (error) {
      console.error('[AUTH] Failed to start local server:', error);
      throw error;
    }
  }

  // Handle HTTP callback from OAuth provider
  handleServerCallback(req, res) {
    console.log('[AUTH] ====== CALLBACK RECEIVED ======');
    console.log('[AUTH] Request URL:', req.url);
    
    try {
      const url = new URL(req.url, `http://localhost:${this.serverPort}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      console.log('[AUTH] Parsed callback parameters:', {
        code: code ? `${code.substring(0, 10)}...` : null,
        state,
        error,
        errorDescription
      });

      // Send response to browser
      res.writeHead(200, { 'Content-Type': 'text/html' });

      if (error) {
        console.error('[AUTH] OAuth error received:', error, errorDescription);
        
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                     text-align: center; padding: 50px; background: #f5f5f5; }
              .container { max-width: 500px; margin: 0 auto; background: white; 
                          padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .error { color: #d73a49; }
              .icon { font-size: 48px; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">❌</div>
              <h2 class="error">Authentication Failed</h2>
              <p>Error: ${error}</p>
              ${errorDescription ? `<p>${errorDescription}</p>` : ''}
              <p>You can close this tab and try again.</p>
            </div>
          </body>
          </html>
        `);

        // Send error to main window
        if (this.mainWindow?.webContents) {
          this.mainWindow.webContents.send('auth-error', errorDescription || error);
        }

      } else if (code) {
        console.log('[AUTH] Authorization code received successfully');
        
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                     text-align: center; padding: 50px; background: #f5f5f5; }
              .container { max-width: 500px; margin: 0 auto; background: white; 
                          padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .success { color: #28a745; }
              .icon { font-size: 48px; margin-bottom: 20px; }
              .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; 
                        border-radius: 50%; width: 30px; height: 30px; 
                        animation: spin 2s linear infinite; margin: 20px auto; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">✅</div>
              <h2 class="success">Authentication Successful!</h2>
              <p>You have been successfully authenticated.</p>
              <div class="spinner"></div>
              <p>Completing sign-in process...</p>
              <p><small>This tab will close automatically in a few seconds.</small></p>
              <script>
                setTimeout(() => window.close(), 3000);
              </script>
            </div>
          </body>
          </html>
        `);

        // Process the authorization code using OAuth2 flow
        this.exchangeAuthorizationCode(code, state).catch(error => {
          console.error('[AUTH] OAuth2 code exchange failed:', error);
          if (this.mainWindow?.webContents) {
            this.mainWindow.webContents.send('auth-error', error.message);
          }
        });

      } else {
        console.error('[AUTH] No authorization code or error in callback');
        
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                     text-align: center; padding: 50px; background: #f5f5f5; }
              .container { max-width: 500px; margin: 0 auto; background: white; 
                          padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .error { color: #d73a49; }
              .icon { font-size: 48px; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">⚠️</div>
              <h2 class="error">Authentication Error</h2>
              <p>No authorization code received.</p>
              <p>Please close this tab and try signing in again.</p>
            </div>
          </body>
          </html>
        `);

        if (this.mainWindow?.webContents) {
          this.mainWindow.webContents.send('auth-error', 'No authorization code received');
        }
      }

      // Close the local server after handling the callback
      setTimeout(() => {
        this.stopLocalServer();
      }, 5000); // Give the browser time to display the response

    } catch (error) {
      console.error('[AUTH] Error handling server callback:', error);
      
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Server Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #d73a49;">Server Error</h2>
          <p>An error occurred processing the authentication callback.</p>
          <p>Please close this tab and try again.</p>
        </body>
        </html>
      `);

      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('auth-error', 'Server error processing authentication');
      }

      this.stopLocalServer();
    }

    console.log('[AUTH] ====== CALLBACK PROCESSING COMPLETE ======');
  }

  // Stop the local HTTP server
  stopLocalServer() {
    if (this.localServer) {
      try {
        this.localServer.close((err) => {
          if (err) {
            console.error('[AUTH] Error closing local server:', err);
          } else {
            console.log('[AUTH] Local authentication server stopped');
          }
        });
      } catch (error) {
        console.error('[AUTH] Error stopping local server:', error);
      }
      
      this.localServer = null;
      this.serverPort = null;
    }
  }

  // ===== MAIN AUTHENTICATION INITIATION =====

  // Initiate desktop authentication using local HTTP server
  async initiateDesktopAuth() {
    // Check if user is already authenticated
    if (this.authState.isAuthenticated && this.authState.user) {
      console.log('[AUTH] User is already authenticated:', this.authState.user.email || this.authState.user.name);
      
      // Send success message to UI indicating user is already authenticated
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('auth-success', {
          user: this.authState.user,
          message: 'You are already signed in!'
        });
      }
      return;
    }

    if (this.authState.isAuthenticating) {
      console.log('[AUTH] Authentication already in progress');
      return;
    }
    
    this.authState.isAuthenticating = true;
    this.updateAuthStatus();

    try {
      console.log('[AUTH] Initiating local server authentication...');

      // Start the local server
      const port = await this.startLocalServer();
      const callbackUrl = `http://localhost:${port}/callback`;
      
      // Generate random state for CSRF protection
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      this.authState.oauthState = state;
      
      // Construct the OAuth2 authorization URL
      const authParams = new URLSearchParams({
        client_id: 'oa-coder-desktop',
        redirect_uri: callbackUrl,
        response_type: 'code',
        state: state,
        scope: 'profile'
      });
      const authUrl = `${this.AUTH_CONFIG.apiBaseUrl}/oauth2/authorize?${authParams.toString()}`;
      
      console.log('[AUTH] Opening browser for OAuth2 authentication:', authUrl);
      console.log('[AUTH] Local callback server running on:', callbackUrl);

      // Open browser to authentication URL
      await shell.openExternal(authUrl);

      // Update UI to show the process
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('auth-status-updated', {
          isAuthenticated: this.authState.isAuthenticated,
          user: this.authState.user,
          isAuthenticating: this.authState.isAuthenticating,
          message: `Authentication server running on port ${port}. Complete sign-in in your browser.`
        });
      }

    } catch (error) {
      console.error('[AUTH] Failed to initiate authentication:', error);
      this.authState.isAuthenticating = false;
      this.updateAuthStatus();
      
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('error', `Failed to start authentication: ${error.message}`);
      }
    }
  }

  // Exchange authorization code for access token (OAuth2 flow)
  async exchangeAuthorizationCode(code, state) {
    if (!code) {
      throw new Error('Authorization code is required');
    }
    
    console.log('[AUTH] ====== OAUTH2 CODE EXCHANGE STARTING ======');
    console.log('[AUTH] Exchanging authorization code for access token...');
    console.log('[AUTH] API Base URL:', this.AUTH_CONFIG.apiBaseUrl);
    console.log('[AUTH] Code length:', code.length);
    console.log('[AUTH] State:', state);
    
    try {
      // Validate state parameter for CSRF protection
      if (this.authState.oauthState && state !== this.authState.oauthState) {
        throw new Error('Invalid state parameter - potential CSRF attack');
      }
      
      // Step 1: Exchange authorization code for access token
      const tokenUrl = `${this.AUTH_CONFIG.apiBaseUrl}/oauth2/token`;
      console.log('[AUTH] Token exchange URL:', tokenUrl);
      
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'oa-coder-desktop',
        code: code,
        redirect_uri: `http://localhost:${this.serverPort}/callback`
      });
      
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenParams.toString()
      });
      
      console.log('[AUTH] Token response status:', tokenResponse.status);
      console.log('[AUTH] Token response ok:', tokenResponse.ok);
      
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('[AUTH] Token exchange error:', errorData);
        throw new Error(errorData.error_description || errorData.error || 'Token exchange failed');
      }
      
      const tokenData = await tokenResponse.json();
      console.log('[AUTH] Token exchange successful, received token data keys:', Object.keys(tokenData));
      
      // Step 2: Get user information using access token
      const userInfoUrl = `${this.AUTH_CONFIG.apiBaseUrl}/oauth2/userinfo`;
      console.log('[AUTH] User info URL:', userInfoUrl);
      
      const userInfoResponse = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[AUTH] User info response status:', userInfoResponse.status);
      console.log('[AUTH] User info response ok:', userInfoResponse.ok);
      
      if (!userInfoResponse.ok) {
        const errorData = await userInfoResponse.json();
        console.error('[AUTH] User info error:', errorData);
        throw new Error('Failed to get user information');
      }
      
      const userData = await userInfoResponse.json();
      console.log('[AUTH] User info successful, user:', userData.name || userData.email);
      
      // Step 3: Update authentication state
      this.authState.isAuthenticated = true;
      this.authState.sessionToken = tokenData.access_token;
      this.authState.user = {
        id: userData.id || userData.sub,
        name: userData.name,
        email: userData.email,
        firstName: userData.given_name,
        lastName: userData.family_name,
        picture: userData.picture
      };
      this.authState.refreshToken = tokenData.refresh_token;
      this.authState.tempToken = null;
      this.authState.isAuthenticating = false;
      this.authState.oauthState = null; // Clear the state
      
      // Save authentication state
      this.saveAuthState();
      
      console.log('[AUTH] OAuth2 authentication successful for user:', this.authState.user?.email || 'unknown');
      console.log('[AUTH] Updated auth state:', {
        isAuthenticated: this.authState.isAuthenticated,
        hasSessionToken: !!this.authState.sessionToken,
        hasUser: !!this.authState.user,
        hasRefreshToken: !!this.authState.refreshToken
      });
      
      this.updateAuthStatus();
      
      // Fetch usage information after successful authentication with retry
      await this.fetchUsageInfoWithRetry();
      
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('auth-success', {
          user: this.authState.user,
          message: 'Successfully authenticated with OAuth2!'
        });
      }
      
      console.log('[AUTH] ====== OAUTH2 CODE EXCHANGE COMPLETE ======');
      return { user: this.authState.user, token: tokenData };
      
    } catch (error) {
      console.error('[AUTH] ====== OAUTH2 CODE EXCHANGE FAILED ======');
      console.error('[AUTH] OAuth2 code exchange failed:', error);
      console.error('[AUTH] Error stack:', error.stack);
      this.authState.isAuthenticating = false;
      this.authState.oauthState = null; // Clear the state
      this.updateAuthStatus();
      throw error;
    }
  }

  // Exchange temporary token for session token (legacy method - kept for backwards compatibility)
  async exchangeTemporaryToken(tempToken) {
    if (!tempToken) {
      throw new Error('Temporary token is required');
    }
    
    console.log('[AUTH] ====== TOKEN EXCHANGE STARTING ======');
    console.log('[AUTH] Exchanging temporary token for session token...');
    console.log('[AUTH] API Base URL:', this.AUTH_CONFIG.apiBaseUrl);
    console.log('[AUTH] Token length:', tempToken.length);
    
    try {
      const exchangeUrl = `${this.AUTH_CONFIG.apiBaseUrl}/auth/desktop/exchange`;
      console.log('[AUTH] Exchange URL:', exchangeUrl);
      
      const response = await fetch(exchangeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tempToken })
      });
      
      console.log('[AUTH] Response status:', response.status);
      console.log('[AUTH] Response ok:', response.ok);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[AUTH] Error response data:', errorData);
        throw new Error(errorData.message || 'Token exchange failed');
      }
      
      const data = await response.json();
      console.log('[AUTH] Exchange successful, received data keys:', Object.keys(data));
      
      // Update authentication state
      this.authState.isAuthenticated = true;
      this.authState.sessionToken = data.sessionToken;
      this.authState.user = data.user;
      this.authState.tempToken = null;
      this.authState.isAuthenticating = false;
      
      // Save authentication state
      this.saveAuthState();
      
      console.log('[AUTH] Authentication successful for user:', data.user?.email || 'unknown');
      console.log('[AUTH] Updated auth state:', {
        isAuthenticated: this.authState.isAuthenticated,
        hasSessionToken: !!this.authState.sessionToken,
        hasUser: !!this.authState.user
      });
      
      this.updateAuthStatus();
      
      if (this.mainWindow?.webContents) {
        this.mainWindow.webContents.send('auth-success', {
          user: data.user,
          message: 'Successfully authenticated!'
        });
      }
      
      console.log('[AUTH] ====== TOKEN EXCHANGE COMPLETE ======');
      return data;
      
    } catch (error) {
      console.error('[AUTH] ====== TOKEN EXCHANGE FAILED ======');
      console.error('[AUTH] Token exchange failed:', error);
      console.error('[AUTH] Error stack:', error.stack);
      this.authState.isAuthenticating = false;
      this.updateAuthStatus();
      throw error;
    }
  }

  // Sign out
  signOut() {
    console.log('[AUTH] Signing out...');
    
    // Stop local server if running
    this.stopLocalServer();
    
    this.clearAuthState();
    
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send('auth-signed-out');
    }
  }

  getAuthState() {
    return this.authState;
  }

  getAuthConfig() {
    return this.AUTH_CONFIG;
  }
}

module.exports = AuthManager; 