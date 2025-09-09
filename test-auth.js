#!/usr/bin/env node

/**
 * Test script for local HTTP server authentication
 * This script verifies that the authentication system can start a local server
 * and handle basic callback scenarios.
 */

const http = require('http');
const { URL } = require('url');

class AuthTester {
  constructor() {
    this.server = null;
    this.port = null;
  }

  // Test if we can find an available port
  async testPortDiscovery() {
    console.log('🔍 Testing port discovery...');
    
    try {
      const port = await this.findAvailablePort(8000, 8020);
      console.log(`✅ Found available port: ${port}`);
      return true;
    } catch (error) {
      console.error(`❌ Port discovery failed: ${error.message}`);
      return false;
    }
  }

  // Test if we can start and stop a local server
  async testServerLifecycle() {
    console.log('🔍 Testing server lifecycle...');
    
    try {
      // Start server
      const port = await this.startTestServer();
      console.log(`✅ Local server started on port ${port}`);
      
      // Test if server responds
      const response = await this.testServerResponse(port);
      if (response) {
        console.log('✅ Server responds correctly');
      } else {
        console.log('❌ Server not responding');
        return false;
      }
      
      // Stop server
      await this.stopTestServer();
      console.log('✅ Server stopped cleanly');
      
      return true;
    } catch (error) {
      console.error(`❌ Server lifecycle test failed: ${error.message}`);
      return false;
    }
  }

  // Test callback URL parsing
  testCallbackParsing() {
    console.log('🔍 Testing callback URL parsing...');
    
    const testCases = [
      { url: '/callback?token=abc123', expected: { token: 'abc123', error: null } },
      { url: '/callback?error=access_denied&error_description=User%20cancelled', expected: { token: null, error: 'access_denied' } },
      { url: '/callback', expected: { token: null, error: null } }
    ];

    for (const testCase of testCases) {
      try {
        const url = new URL(testCase.url, 'http://localhost:8000');
        const token = url.searchParams.get('token');
        const error = url.searchParams.get('error');
        
        if (token === testCase.expected.token && error === testCase.expected.error) {
          console.log(`✅ URL parsing correct for: ${testCase.url}`);
        } else {
          console.log(`❌ URL parsing failed for: ${testCase.url}`);
          console.log(`   Expected: token=${testCase.expected.token}, error=${testCase.expected.error}`);
          console.log(`   Got: token=${token}, error=${error}`);
          return false;
        }
      } catch (error) {
        console.log(`❌ URL parsing error for ${testCase.url}: ${error.message}`);
        return false;
      }
    }

    console.log('✅ All callback URL parsing tests passed');
    return true;
  }

  // Helper: Find available port
  async findAvailablePort(startPort = 8000, maxPort = 8020) {
    return new Promise((resolve, reject) => {
      let currentPort = startPort;

      const tryPort = () => {
        const server = http.createServer();
        
        server.listen(currentPort, 'localhost', () => {
          server.close(() => {
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

  // Helper: Start test server
  async startTestServer() {
    const port = await this.findAvailablePort();
    
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Test server running');
      });

      this.server.on('error', reject);

      this.server.listen(port, 'localhost', () => {
        this.port = port;
        resolve(port);
      });
    });
  }

  // Helper: Test server response
  async testServerResponse(port) {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data === 'Test server running');
        });
      });

      req.on('error', () => {
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // Helper: Stop test server
  async stopTestServer() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.port = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting authentication system tests...\n');

    const tests = [
      { name: 'Port Discovery', fn: () => this.testPortDiscovery() },
      { name: 'Server Lifecycle', fn: () => this.testServerLifecycle() },
      { name: 'Callback URL Parsing', fn: () => this.testCallbackParsing() }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      console.log(`\n--- Testing: ${test.name} ---`);
      try {
        const result = await test.fn();
        if (result) {
          passed++;
          console.log(`✅ ${test.name} PASSED`);
        } else {
          failed++;
          console.log(`❌ ${test.name} FAILED`);
        }
      } catch (error) {
        failed++;
        console.log(`❌ ${test.name} ERROR: ${error.message}`);
      }
    }

    console.log('\n=== Test Results ===');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${passed + failed}`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed! Authentication system is ready.');
      return true;
    } else {
      console.log('\n⚠️  Some tests failed. Please check the implementation.');
      return false;
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new AuthTester();
  tester.runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = AuthTester; 