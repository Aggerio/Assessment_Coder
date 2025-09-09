const { ipcRenderer } = require('electron');
    
    marked.setOptions({
      sanitize: false,
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (lang && Prism.languages[lang]) {
          try {
            return Prism.highlight(code, Prism.languages[lang], lang);
          } catch (e) {
            console.warn('Prism highlighting failed for language:', lang, e);
            return code;
          }
        }
        return code;
      }
    });
    
    // UI Elements
    const conversation = document.getElementById('conversation');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const counter = document.getElementById('counter');
    const modelValue = document.getElementById('model-value');
    const clearShortcutKey = document.getElementById('clear-shortcut-key');
    
    // State
    let messages = [];
    let currentIndex = 0;
    let screenshotCount = 0;
    let currentModel = 'gpt-oss';
    let isLoading = false;
    let scrollOnlyMode = false;
    let availableCodeSnippets = [];
    let autofillStatus = '';
    let shortcuts = [];


    let isMac = false;
    let requestsData = { requests_remaining: 0, total_requests: 0 };
    
    // Initialize model display with alias
    if (modelValue) {
      // Default aliases for initial load
      const defaultAliases = {
        'gpt-oss': 'Optimus',
        'gpt-4o-mini': 'Starscream',
        'o4-mini': 'Megatron'
      };
      modelValue.textContent = defaultAliases[currentModel] || currentModel;
    }
    
    // Initialize model indicator styling
    const modelIndicator = document.querySelector('.model-indicator');
    if (modelIndicator) {
      // Remove any existing model classes first
      modelIndicator.classList.remove('model-gpt-4o-mini', 'model-o4-mini', 'model-gpt-oss', 'model-gpt-4', 'model-gpt-3-5-turbo');
      // Add the appropriate class for the current model
      modelIndicator.classList.add(`model-${currentModel.replace(/[^a-zA-Z0-9-]/g, '-')}`);
    }
    
    // Authentication state
    let authState = {
      isAuthenticated: false,
      user: null,
      isAuthenticating: false
    };
    
    // Authentication DOM elements
    const authStatusEl = document.getElementById('auth-status');
    const authTextEl = document.getElementById('auth-text');
    
    // Functions
    let statusTimeout = null;
    
    const updateStatus = (text, isError = false) => {
      // Store the status text in a data attribute for hover display
      statusDot.setAttribute('data-status', text);
      statusDot.className = `status-dot ${isError ? 'error' : ''}`;
      
      // Show the text initially
      statusText.textContent = text;
      
      // Remove compact class when showing text
      const statusIndicator = document.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.classList.remove('compact');
      }
      
      // Clear any existing timeout
      if (statusTimeout) {
        clearTimeout(statusTimeout);
      }
      
      // Set timeout to hide only the text after 2 seconds, keep the dot
      statusTimeout = setTimeout(() => {
        statusText.textContent = '';
        // Add compact class to status indicator when text is hidden
        if (statusIndicator) {
          statusIndicator.classList.add('compact');
        }
        // Don't hide the dot, just clear the text
      }, 2000);
    };
    
    const updateAuthStatus = (status) => {
      authState = { ...authState, ...status };
      
      // Update logo color based on authentication status
      const appLogo = document.querySelector('.app-logo');
      if (appLogo) {
        if (authState.isAuthenticated && authState.user) {
          appLogo.classList.add('authenticated');
        } else {
          appLogo.classList.remove('authenticated');
        }
      }
      
      if (authState.isAuthenticated && authState.user) {
        authStatusEl.className = 'auth-status authenticated';
        authTextEl.textContent = 'Signed in';
        // Update status indicator to show successful authentication
        updateStatus('Authentication successful');
      } else if (authState.isAuthenticating) {
        authStatusEl.className = 'auth-status authenticating';
        authTextEl.textContent = 'Authenticating...';
        updateStatus('Authenticating...');
      } else {
        authStatusEl.className = 'auth-status not-authenticated';
        authTextEl.textContent = 'Not signed in';
        // Only update status to 'Ready' if not in the middle of authentication
        if (!authState.isAuthenticating) {
          updateStatus('Ready');
        }
      }
    };
    
    // Dialog functions removed - using seamless authentication only
    
    const handleAuthSuccess = (data) => {
      // Show shortcuts after successful authentication
      setTimeout(() => {
        if (shortcuts.length > 0) {
          const platformText = isMac ? 'macOS' : 'Windows/Linux';
          const authShortcutsMessage = `# You're All Set!

**Platform:** ${platformText}

## Quick Start
- **${isMac ? '⌘+L' : 'Alt+L'}**: Take a screenshot
- **${isMac ? '⌘+Enter' : 'Alt+Enter'}**: Process all screenshots
- **${isMac ? '⌘+H' : 'Alt+H'}**: Hide/Show app

## Core Shortcuts
${shortcuts.filter(s => s.category === 'Core').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

## Window Management
${shortcuts.filter(s => s.category === 'Window').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

## Navigation
${shortcuts.filter(s => s.category === 'Navigation').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

## Authentication & Configuration
${shortcuts.filter(s => s.category === 'AI' || s.category === 'Auth').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

*You're all set! Start by taking a screenshot with ${isMac ? '⌘+L' : 'Alt+L'}*`;

          addMessage(authShortcutsMessage);
        }
      }, 1000);
    };
    
    const handleAuthError = (error) => {
      addMessage(`# Authentication Failed

Error: ${error}

Please try signing in again using ${isMac ? '⌘+⇧+X' : 'Alt+Shift+X'}.`, true);
      
      updateStatus('Authentication failed', true);
    };
    
    const handleSignOut = () => {
              const loginShortcut = isMac ? '⌘+⇧+X' : 'Alt+Shift+X';
      
      // Clear messages and reset state first
      clearMessages();
      availableCodeSnippets = [];
      
      // Update authentication status
      updateAuthStatus({
        isAuthenticated: false,
        user: null,
        isAuthenticating: false
      });
      
      // Display sign out message after clearing
      addMessage(`# Signed Out Successfully

You have been signed out of Assessment Coder.

## What's Restricted
- **Screenshot capture** is disabled
- **AI processing** is disabled  
- **Search operations** are disabled

## To Continue
Use **${loginShortcut}** to sign back in and restore full functionality.

*All your previous screenshots and conversations have been cleared for security.*`);
    };
    
    // Authentication now uses seamless flow only - no manual UI elements needed
    
    const updateCounter = () => {
      // Use requests counter instead of message counter
      // counter.textContent = `${Math.max(0, currentIndex)}/${messages.length}`;
      // prevBtn.disabled = currentIndex <= 0; // REMOVED
      // nextBtn.disabled = currentIndex >= messages.length - 1; // REMOVED
    };

    const updateRequestsCounter = (requestsRemaining, totalRequests) => {
      console.log('Updating requests counter:', { requestsRemaining, totalRequests });
      requestsData = { requests_remaining: requestsRemaining, total_requests: totalRequests };
      if (counter) {
        counter.textContent = `${requestsRemaining}`;
        console.log('Counter element updated with:', requestsRemaining);
      } else {
        console.error('Counter element not found');
      }
    };
    
    // Highlight keyboard keys and shortcuts within message content
    function applyKeycapHighlighting(root) {
      if (!root) return;
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.closest('pre, code, kbd') || parent.tagName === 'A') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      const keyName = '(?:⌘|Cmd|Command|Ctrl|Control|Alt|Option|Opt|Shift|⇧|Win|Windows|Meta|Super|Esc|Escape|Tab|Enter|Return|Space|Spacebar|Backspace|Delete|Del|Home|End|PgUp|PgDn|Up|Down|Left|Right|F(?:[1-9]|1[0-2])|[A-Z0-9])';
      const comboRegex = new RegExp(`(^|[\\s(])(${keyName}(?:[+\\/]${keyName})+)(?=$|[\\s).,;:!?])`, 'g');
      const singleRegex = new RegExp(`(^|[\\s(])(${keyName})(?=$|[\\s).,;:!?=])`, 'g');
      const textNodesToProcess = [];
      let current;
      while ((current = walker.nextNode())) {
        textNodesToProcess.push(current);
      }
      textNodesToProcess.forEach(node => {
        const original = node.nodeValue;
        let text = original;
        if (!text) return;
        text = text.replace(comboRegex, (m, p1, p2) => `${p1}§§KEYCOMBO§§${p2}§§END§§`);
        text = text.replace(singleRegex, (m, p1, p2) => `${p1}§§KEYSINGLE§§${p2}§§END§§`);
        if (text === original) return;
        const parts = text.split('§§END§§');
        const frag = document.createDocumentFragment();
        parts.forEach(part => {
          if (!part) return;
          if (part.startsWith('§§KEYCOMBO§§')) {
            const combo = part.slice('§§KEYCOMBO§§'.length);
            frag.appendChild(buildKeyComboFragment(combo));
          } else if (part.startsWith('§§KEYSINGLE§§')) {
            const key = part.slice('§§KEYSINGLE§§'.length);
            frag.appendChild(buildKeyElement(key));
          } else {
            frag.appendChild(document.createTextNode(part));
          }
        });
        if (node.parentNode) {
          node.parentNode.replaceChild(frag, node);
        }
      });
    }

    function buildKeyComboFragment(combo) {
      const fragment = document.createDocumentFragment();
      const tokens = combo.split(/([+\/])/);
      tokens.forEach(token => {
        if (token === '+' || token === '/') {
          const sep = document.createElement('span');
          sep.className = 'key-sep';
          sep.textContent = token;
          fragment.appendChild(sep);
        } else if (token.trim().length > 0) {
          fragment.appendChild(buildKeyElement(token.trim()));
        }
      });
      return fragment;
    }

    function buildKeyElement(key) {
      const k = document.createElement('kbd');
      k.className = 'keycap';
      k.textContent = key;
      return k;
    }
    
    // Remove any marker tokens from incoming text content
    function sanitizeMessageContent(raw) {
      if (typeof raw !== 'string') return raw;
      
      const original = raw;
      let cleaned = raw;
      
      // Log input for debugging
      if (original.includes('§§') || original.includes('\u00A7')) {
        console.log('Sanitizing content:', original);
      }
      
      // Remove specific known markers first
      cleaned = cleaned.replace(/§§(?:KEYCOMBO|KEYSINGLE|KEYSINGLES|END)§§/gi, '');
      
      // Remove any remaining markers with alphanumeric/underscore/dash content
      cleaned = cleaned.replace(/§§[A-Z0-9_-]+§§/gi, '');
      
      // Handle potential Unicode variations of the section sign
      cleaned = cleaned.replace(/\u00A7\u00A7(?:KEYCOMBO|KEYSINGLE|KEYSINGLES|END)\u00A7\u00A7/gi, '');
      cleaned = cleaned.replace(/\u00A7\u00A7[A-Z0-9_-]+\u00A7\u00A7/gi, '');
      
      // Clean up any residual marker-like patterns (more aggressive)
      cleaned = cleaned.replace(/§§[^§]*§§/gi, '');
      cleaned = cleaned.replace(/\u00A7\u00A7[^\u00A7]*\u00A7\u00A7/gi, '');
      
      // Handle malformed markers that might be missing closing tags
      cleaned = cleaned.replace(/§§[A-Z0-9_-]+$/gi, '');
      cleaned = cleaned.replace(/\u00A7\u00A7[A-Z0-9_-]+$/gi, '');
      
      if (original !== cleaned) {
        console.log('Content sanitized from:', original);
        console.log('Content sanitized to:', cleaned);
      }
      
      return cleaned;
    }
    
    // Clean up marker texts from already-rendered DOM content
    function sanitizeDOMContent(container) {
      if (!container) return;
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            // Don't sanitize content inside pre/code/kbd elements
            const parent = node.parentElement;
            if (!parent || parent.closest('pre, code, kbd')) return NodeFilter.FILTER_REJECT;
            // Process all text nodes (not just ones with markers) for safety
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      const textNodesToClean = [];
      let current;
      while ((current = walker.nextNode())) {
        textNodesToClean.push(current);
      }
      
      textNodesToClean.forEach(node => {
        const cleaned = sanitizeMessageContent(node.nodeValue);
        if (cleaned !== node.nodeValue) {
          console.log('DOM sanitization applied to node:', node.nodeValue, '->', cleaned);
          node.nodeValue = cleaned;
        }
      });
    }
    
    // Global sanitization function that runs periodically to catch any missed markers
    function globalSanitizationSweep() {
      if (conversation) {
        sanitizeDOMContent(conversation);
      }
    }
    
    // Set up MutationObserver to catch any DOM changes and sanitize immediately
    function setupDOMSanitizationObserver() {
      if (!conversation) return;
      
      const observer = new MutationObserver((mutations) => {
        let needsSanitization = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.TEXT_NODE && node.nodeValue && 
                  (node.nodeValue.includes('§§') || node.nodeValue.includes('\u00A7'))) {
                needsSanitization = true;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                const textContent = node.textContent || '';
                if (textContent.includes('§§') || textContent.includes('\u00A7')) {
                  needsSanitization = true;
                }
              }
            });
          } else if (mutation.type === 'characterData') {
            if (mutation.target.nodeValue && 
                (mutation.target.nodeValue.includes('§§') || mutation.target.nodeValue.includes('\u00A7'))) {
              needsSanitization = true;
            }
          }
        });
        
        if (needsSanitization) {
          console.log('MutationObserver detected marker texts, sanitizing...');
          setTimeout(() => sanitizeDOMContent(conversation), 0);
        }
      });
      
      observer.observe(conversation, {
        childList: true,
        subtree: true,
        characterData: true
      });
      
      return observer;
    }
    
    const addMessage = (content, isError = false) => {
      const messageEl = document.createElement('div');
      messageEl.className = `message ${isError ? 'error-message' : ''}`;
      const sanitized = sanitizeMessageContent(content);
      
      if (isError) {
        messageEl.innerHTML = `<div class="error-header"><strong>Error</strong></div>${marked.parse(sanitized)}`;
        // Apply syntax highlighting to code blocks in this error message
        setTimeout(() => {
          const codeBlocks = messageEl.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);
      } else {
        messageEl.innerHTML = marked.parse(sanitized);
        
        // Apply syntax highlighting to code blocks in this message
        setTimeout(() => {
          const codeBlocks = messageEl.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);
      }
      
      // Clean up any residual marker texts from DOM and apply keycap highlighting
      sanitizeDOMContent(messageEl);
      applyKeycapHighlighting(messageEl);
      
      messages.push(messageEl);
      currentIndex = messages.length - 1;
      
      renderCurrentMessage();
      updateCounter();
    };
    
    const showLoading = () => {
      if (isLoading) return;
      isLoading = true;
      
      const loadingEl = document.createElement('div');
      loadingEl.className = 'loading-message';
      loadingEl.innerHTML = `
        <div class="loading-spinner"></div>
        <span>Processing...</span>
      `;
      
      conversation.innerHTML = '';
      conversation.appendChild(loadingEl);
      updateStatus('Processing...');
    };
    
    const hideLoading = () => {
      isLoading = false;
      renderCurrentMessage();
    };
    
    const renderCurrentMessage = () => {
      if (isLoading) return;
      
      conversation.innerHTML = '';
      if (messages.length > 0 && currentIndex >= 0 && currentIndex < messages.length) {
        conversation.appendChild(messages[currentIndex].cloneNode(true));
        
        // Re-apply syntax highlighting to the rendered message
        setTimeout(() => {
          const codeBlocks = conversation.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
          // Clean up any residual marker texts from DOM
          sanitizeDOMContent(conversation);
          // Ensure keycaps are applied to the rendered DOM
          applyKeycapHighlighting(conversation);
        }, 0);
      }
      
      // Scroll to top when new message is shown
      conversation.scrollTop = 0;
    };
    
    const clearMessages = () => {
      messages = [];
      currentIndex = 0;
      conversation.innerHTML = '';
      updateCounter();
      availableCodeSnippets = [];
      
      // Show a proper message with core and scroll controls after clearing
      const platformText = isMac ? 'macOS' : 'Windows/Linux';
      const clearMessage = `# Context Cleared

**Platform:** ${platformText}

## Core Controls
- **${isMac ? '⌘+L' : 'Alt+L'}**: Take a screenshot
- **${isMac ? '⌘+Enter' : 'Alt+Enter'}**: Process all screenshots
- **${isMac ? '⌘+N' : 'Alt+N'}**: Clear chat (you just used this!)
- **${isMac ? '⌘+H' : 'Alt+H'}**: Hide/Show app

## Scroll Controls
- **${isMac ? '⌘+J' : 'Alt+J'}**: Scroll down in answer window
- **${isMac ? '⌘+K' : 'Alt+K'}**: Scroll up in answer window

## Authentication
- **${isMac ? '⌘+⇧+X' : 'Alt+Shift+X'}**: Sign in to process screenshots
- **${isMac ? '⌘+⇧+Z' : 'Alt+Shift+Z'}**: Sign out`;

      addMessage(clearMessage);
      updateStatus('Context cleared - ready for next task');
    };
    
    // Code snippets display functions - DISABLED
    // const updateCodeSnippetsDisplay = (count, snippets) => {
    //   // Find or create code snippets indicator
    //   let snippetsIndicator = document.getElementById('code-snippets-indicator');
    //   if (!snippetsIndicator) {
    //     snippetsIndicator = document.createElement('div');
    //     snippetsIndicator.id = 'code-snippets-indicator';
    //     snippetsIndicator.className = 'code-snippets-indicator';
    //     
    //     // Insert after the counter
    //     const counter = document.getElementById('counter');
    //     counter.parentNode.insertBefore(snippetsIndicator, counter.nextSibling);
    //   }
    //   
    //   if (count > 0) {
    //     snippetsIndicator.style.display = 'block';
    //     const mainShortcut = isMac ? '⌘+⇧+F' : 'Ctrl+Shift+F';
    //     snippetsIndicator.innerHTML = `
    //       <div class="snippets-header">📝 ${count} Code Snippet${count > 1 ? 's' : ''} Available</div>
    //       <div class="snippets-list">
    //         <div class="snippet-item main">
    //           <span class="shortcut">${mainShortcut}</span>
    //           <span class="description">Type main code (press again to stop)</span>
    //         </div>
    //         ${snippets.slice(0, 9).map((snippet, index) => {
    //           const shortcut = isMac ? `⌘+⇧+${index + 1}` : `Ctrl+Shift+${index + 1}`;
    //           return `
    //             <div class="snippet-item">
    //               <span class="shortcut">${shortcut}</span>
    //               <span class="language">${snippet.language}</span>
    //               <span class="preview">${snippet.preview}</span>
    //             </div>
    //           `;
    //         }).join('')}
    //       </div>
    //     `;
    //   } else {
    //     snippetsIndicator.style.display = 'none';
    //     snippetsIndicator.innerHTML = '';
    //   }
    // };
    
    // Navigation
    // prevBtn.addEventListener('click', () => { // REMOVED
    //   if (currentIndex > 0) { // REMOVED
    //     currentIndex--; // REMOVED
    //     renderCurrentMessage(); // REMOVED
    //     updateCounter(); // REMOVED
    //   } // REMOVED
    // }); // REMOVED
    
    // nextBtn.addEventListener('click', () => { // REMOVED
    //   if (currentIndex < messages.length - 1) { // REMOVED
    //     currentIndex++; // REMOVED
    //     renderCurrentMessage(); // REMOVED
    //     updateCounter(); // REMOVED
    //   } // REMOVED
    // }); // REMOVED
    


    // Function to display shortcuts
    const displayShortcuts = (shortcutsData) => {
      shortcuts = shortcutsData.shortcuts || [];
      isMac = shortcutsData.isMac || false;

      // Update the shortcuts display in header
      updateShortcutsDisplay();

      // Update mobile shortcuts display with correct platform
      updateMobileShortcutsDisplay();
      
      // Create a welcome message with shortcuts if no messages exist
      if (messages.length === 0) {
        const platformText = isMac ? 'macOS' : 'Windows/Linux';
        const loginShortcut = isMac ? '⌘+⇧+X' : 'Alt+Shift+X';
        
        // Check if user is authenticated
        if (!authState.isAuthenticated) {
          const welcomeMessage = `# Get Started with Assessment Coder

**Platform:** ${platformText}

## Quick Start
- **${isMac ? '⌘+L' : 'Alt+L'}**: Take a screenshot
- **${loginShortcut}**: Sign in to process screenshots
- **${isMac ? '⌘+Enter' : 'Alt+Enter'}**: Process all screenshots (requires sign-in)
- **${isMac ? '⌘+H' : 'Alt+H'}**: Hide/Show app

## Authentication Required
To process screenshots and get AI analysis, you need to sign in first.

**Sign in with:** ${loginShortcut}

## Core Shortcuts
${shortcuts.filter(s => s.category === 'Core').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

## Authentication
${shortcuts.filter(s => s.category === 'Auth').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

*Start by taking a screenshot with ${isMac ? '⌘+L' : 'Alt+L'}, then sign in with ${loginShortcut} to process it!*`;

          addMessage(welcomeMessage);
        } else {
          const welcomeMessage = `# Get Started with Assessment Coder 

**Platform:** ${platformText}

## Quick Start
- **${isMac ? '⌘+L' : 'Alt+L'}**: Take a screenshot
- **${isMac ? '⌘+Enter' : 'Alt+Enter'}**: Process all screenshots
- **${isMac ? '⌘+H' : 'Alt+H'}**: Hide/Show app

## Core Shortcuts
${shortcuts.filter(s => s.category === 'Core').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

## Authentication
${shortcuts.filter(s => s.category === 'Auth').map(s => `- **${s.display}**: ${s.description}`).join('\n')}

*Press any shortcut to get started!*`;

          addMessage(welcomeMessage);
        }
      }
    };

    // Function to format shortcut keys with keycap styling
    const formatShortcutKeycap = (shortcut) => {
      // Split the shortcut into parts (e.g., "⌘+A" -> ["⌘", "A"])
      const parts = shortcut.split('+');
      return parts.map(part => {
        // Check if it's a modifier key
        if (part === '⌘' || part === 'Alt') {
          return `<span class="modifier-key">${part}</span>`;
        }
        // Add special data attribute for Enter key to make it wider
        const dataAttr = part === 'Enter' ? ' data-key="Enter"' : '';
        return `<span class="key-key"${dataAttr}>${part}</span>`;
      }).join('<span class="key-separator">+</span>');
    };

    // Function to show keycap press animation
    const showKeycapPress = (shortcutType) => {
      const shortcutsDisplay = document.getElementById('shortcuts-display');
      if (shortcutsDisplay) {
        const shortcutItem = shortcutsDisplay.querySelector(`[data-shortcut="${shortcutType}"]`);
        if (shortcutItem) {
          shortcutItem.classList.add('pressed');
          setTimeout(() => {
            shortcutItem.classList.remove('pressed');
          }, 200);
        }
      }
    };

    // Function to update shortcuts display in header
    const updateShortcutsDisplay = () => {
      const shortcutsDisplay = document.getElementById('shortcuts-display');
      if (!shortcutsDisplay) return;

      const shortcutMap = {
        screenshot: isMac ? '⌘+L' : 'Alt+L',
        process: isMac ? '⌘+Enter' : 'Alt+Enter',
        scroll: isMac ? '⌘+J/K' : 'Alt+J/K',
        hide: isMac ? '⌘+H' : 'Alt+H',
        clear: isMac ? '⌘+N' : 'Alt+N',
        signin: isMac ? '⌘+⇧+X' : 'Alt+Shift+X',
        signout: isMac ? '⌘+⇧+Z' : 'Alt+Shift+Z',
        quit: isMac ? '⌘+Q' : 'Alt+Q'
      };

      const shortcutLabels = {
        screenshot: 'Screenshot',
        process: 'Process',
        scroll: 'Scroll J/K',
        hide: 'Hide',
        clear: 'Clear',
        signin: 'Sign In',
        signout: 'Sign Out',
        quit: 'Quit'
      };

      const shortcutItems = shortcutsDisplay.querySelectorAll('.shortcut-item');
      shortcutItems.forEach(item => {
        const shortcutType = item.getAttribute('data-shortcut');
        const shortcutKey = shortcutMap[shortcutType];
        const label = shortcutLabels[shortcutType];
        if (shortcutKey) {
          // Format the shortcut with keycap styling
          const formattedShortcut = formatShortcutKeycap(shortcutKey);
          item.innerHTML = formattedShortcut;
          
          // Enhanced tooltips with more detailed information
          let tooltip = `${shortcutKey}: ${label}`;
          if (shortcutType === 'scroll') {
            tooltip = `${shortcutKey}: Scroll controls (J=down, K=up)`;
          } else if (shortcutType === 'screenshot') {
            tooltip = `${shortcutKey}: Take a screenshot`;
          } else if (shortcutType === 'process') {
            tooltip = `${shortcutKey}: Process all screenshots`;
          } else if (shortcutType === 'hide') {
            tooltip = `${shortcutKey}: Hide/Show app`;
          } else if (shortcutType === 'clear') {
            tooltip = `${shortcutKey}: Clear chat and screenshots`;
          } else if (shortcutType === 'signin') {
            tooltip = `${shortcutKey}: Sign in to process screenshots`;
          } else if (shortcutType === 'signout') {
            tooltip = `${shortcutKey}: Sign out`;
          } else if (shortcutType === 'quit') {
            tooltip = `${shortcutKey}: Quit application`;
          }
          
          item.title = tooltip;
        }
      });

      // Update labels with more descriptive text
      const labelElements = shortcutsDisplay.querySelectorAll('.shortcut-label');
      labelElements.forEach(label => {
        const shortcutItem = label.previousElementSibling;
        const shortcutType = shortcutItem.getAttribute('data-shortcut');
        const labelText = shortcutLabels[shortcutType];
        if (labelText) {
          label.textContent = labelText;
        }
      });

      // Update clear shortcut in footer
      if (clearShortcutKey) {
        clearShortcutKey.innerHTML = formatShortcutKeycap(shortcutMap.clear);
        clearShortcutKey.title = `${shortcutMap.clear}: Clear all messages`;
      }

      // Update model change shortcut in footer
      const modelChangeShortcutKey = document.getElementById('model-change-shortcut-key');
      if (modelChangeShortcutKey) {
        modelChangeShortcutKey.innerHTML = formatShortcutKeycap(isMac ? '⌘+M' : 'Alt+M');
        modelChangeShortcutKey.title = `${isMac ? '⌘+M' : 'Alt+M'}: Switch AI model`;
      }
    };
    
    // IPC Handlers
    const handlers = {
      'analysis-result': (event, result) => {
        hideLoading();
        addMessage(result);
        updateStatus('Analysis complete');
      },

      'shortcut-used': (event, shortcutType) => {
        showKeycapPress(shortcutType);
      },

      'api-response-data': (event, data) => {
        console.log('Received api-response-data:', data);
        if (data.requests_remaining !== undefined && data.total_requests !== undefined) {
          updateRequestsCounter(data.requests_remaining, data.total_requests);
        } else {
          console.warn('Invalid api-response-data format:', data);
        }
      },
      
      'error': (event, error) => {
        hideLoading();
        addMessage(error, true);
        updateStatus('Error occurred', true);
      },
      
      'update-instruction': (event, instruction) => {
        updateStatus(instruction);
      },
      
      'hide-instruction': () => {
        updateStatus('Ready');
      },
      
      'hide-app': () => {
        document.body.style.opacity = '0';
      },
      
      'show-app': () => {
        document.body.style.opacity = '1';
      },
      
      'clear-result': () => {
        clearMessages();
        updateStatus('Ready');
      },
      
      'screenshot-added': (event, count) => {
        screenshotCount = count;
        updateStatus(`Screenshot ${count} added`);
      },
      
      'processing-start': () => {
        showLoading();
      },
      
      'model-switched': (event, data) => {
        let model = data.model;
        let alias = data.alias;

        currentModel = model;

        // Use alias for display if available, otherwise use model name
        if (modelValue) {
          modelValue.textContent = alias || model;
        }

        // Update model indicator styling
        const modelIndicator = document.querySelector('.model-indicator');
        if (modelIndicator) {
          // Remove all model-specific classes
          modelIndicator.classList.remove('model-gpt-4o-mini', 'model-o4-mini', 'model-gpt-oss', 'model-gpt-4', 'model-gpt-3-5-turbo');
          // Add the appropriate class for the current model
          modelIndicator.classList.add(`model-${model.replace(/[^a-zA-Z0-9-]/g, '-')}`);
        }

        updateStatus(`Model: ${alias || model}`);
      },
      
      'enable-scroll-only-mode': () => {
        scrollOnlyMode = true;
        enableScrollOnlyMode();
      },
      
      'disable-scroll-only-mode': () => {
        scrollOnlyMode = false;
        disableScrollOnlyMode();
      },
      
      // Authentication handlers
      'auth-status-updated': (event, status) => {
        updateAuthStatus(status);
      },
      
      'auth-success': (event, data) => {
        handleAuthSuccess(data);
      },
      
      'auth-signed-out': () => {
        handleSignOut();
      },
      
      'auth-error': (event, error) => {
        handleAuthError(error);
      },
      
      // Scroll handlers for answer window
      'scroll-down': () => {
        console.log('Scroll down command received');
        scrollAnswerWindow('down');
        updateStatus('Scrolled down');
      },
      
      'scroll-up': () => {
        console.log('Scroll up command received');
        scrollAnswerWindow('up');
        updateStatus('Scrolled up');
      },
      
      // Autofill handlers - DISABLED
      // 'code-snippets-updated': (event, data) => {
      //   availableCodeSnippets = data.snippets || [];
      //   updateCodeSnippetsDisplay(data.count, data.snippets);
      // },
      
      // 'autofill-status': (event, data) => {
      //   autofillStatus = data.message;
      //   updateStatus(autofillStatus, data.isError);
      // },
      
      // Shortcuts handler
      'shortcuts-updated': (event, data) => {
        displayShortcuts(data);
      }
    };
    
    // Scroll-only mode functions
    const enableScrollOnlyMode = () => {
      document.addEventListener('mousedown', preventNonScrollEvents, true);
      document.addEventListener('mouseup', preventNonScrollEvents, true);
      document.addEventListener('click', preventNonScrollEvents, true);
      document.addEventListener('dblclick', preventNonScrollEvents, true);
      document.addEventListener('contextmenu', preventNonScrollEvents, true);
      document.addEventListener('dragstart', preventNonScrollEvents, true);
      document.addEventListener('drag', preventNonScrollEvents, true);
      document.addEventListener('dragend', preventNonScrollEvents, true);
      document.addEventListener('drop', preventNonScrollEvents, true);
      
      // Ensure keyboard events are not blocked
      document.addEventListener('keydown', (event) => {
        // Allow all keyboard events to pass through
        return true;
      }, true);
      
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      
      console.log('Scroll-only mode enabled');
    };
    
    const disableScrollOnlyMode = () => {
      document.removeEventListener('mousedown', preventNonScrollEvents, true);
      document.removeEventListener('mouseup', preventNonScrollEvents, true);
      document.removeEventListener('click', preventNonScrollEvents, true);
      document.removeEventListener('dblclick', preventNonScrollEvents, true);
      document.removeEventListener('contextmenu', preventNonScrollEvents, true);
      document.removeEventListener('dragstart', preventNonScrollEvents, true);
      document.removeEventListener('drag', preventNonScrollEvents, true);
      document.removeEventListener('dragend', preventNonScrollEvents, true);
      document.removeEventListener('drop', preventNonScrollEvents, true);
      
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      
      console.log('Scroll-only mode disabled');
    };
    
    const preventNonScrollEvents = (event) => {
      if (scrollOnlyMode) {
        // Allow scroll events (wheel, touchmove) but block clicks and drags
        if (event.type === 'wheel' || event.type === 'touchmove' || event.type === 'scroll') {
          return true; // Allow scroll events
        }
        
        // Allow keyboard events to pass through
        if (event.type === 'keydown' || event.type === 'keyup' || event.type === 'keypress') {
          return true; // Allow keyboard events
        }
        
        // Block all other mouse events
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
    };
    
    // Scroll answer window function
    const scrollAnswerWindow = (direction) => {
      if (!conversation) {
        console.warn('Conversation element not found');
        return;
      }
      
      const scrollAmount = 120; // Pixels to scroll
      const currentScrollTop = conversation.scrollTop;
      const maxScrollTop = conversation.scrollHeight - conversation.clientHeight;
      
      if (direction === 'down') {
        const newScrollTop = Math.min(maxScrollTop, currentScrollTop + scrollAmount);
        conversation.scrollTo({
          top: newScrollTop,
          behavior: 'smooth'
        });
        console.log(`Scrolling down: ${currentScrollTop} -> ${newScrollTop}`);
      } else if (direction === 'up') {
        const newScrollTop = Math.max(0, currentScrollTop - scrollAmount);
        conversation.scrollTo({
          top: newScrollTop,
          behavior: 'smooth'
        });
        console.log(`Scrolling up: ${currentScrollTop} -> ${newScrollTop}`);
      }
    };
    
    // Register IPC handlers with sanitization wrapper
    Object.entries(handlers).forEach(([channel, handler]) => {
      ipcRenderer.on(channel, (event, ...args) => {
        // Sanitize any string arguments that might contain marker texts
        const sanitizedArgs = args.map(arg => {
          if (typeof arg === 'string' && (arg.includes('§§') || arg.includes('\u00A7'))) {
            console.log('Sanitizing IPC message on channel:', channel, 'Original:', arg);
            const cleaned = sanitizeMessageContent(arg);
            console.log('Sanitized to:', cleaned);
            return cleaned;
          }
          return arg;
        });
        
        // Call the original handler with sanitized arguments
        handler(event, ...sanitizedArgs);
      });
    });
    
    // Cleanup
    window.addEventListener('unload', () => {
      Object.keys(handlers).forEach(channel => {
        ipcRenderer.removeAllListeners(channel);
      });
      
      // Clear status timeout
      if (statusTimeout) {
        clearTimeout(statusTimeout);
      }
    });
    
    // Initialize
    // Only set status to 'Ready' if not authenticated
    if (!authState.isAuthenticated) {
      updateStatus('Ready');
    } else {
      // If authenticated, set a default status but hide the text
      statusDot.setAttribute('data-status', 'Ready');
      statusText.textContent = '';
    }
    updateCounter();
    
    // Add hover positioning logic for status dot tooltip
    statusDot.addEventListener('mouseenter', (event) => {
      positionTooltip(event);
    });
    
    function positionTooltip(event) {
      const statusText = statusDot.getAttribute('data-status');
      if (!statusText) return;
      
      // Create or update tooltip
      let tooltip = document.getElementById('status-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'status-tooltip';
        tooltip.style.cssText = `
          position: fixed;
          background: rgba(0, 0, 0, 0.9);
          color: var(--text-primary);
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          z-index: 9999;
          border: 1px solid var(--border-color);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          transition: all var(--transition-normal);
        `;
        document.body.appendChild(tooltip);
      }
      
      tooltip.textContent = statusText;
      tooltip.style.opacity = '1';
      tooltip.style.visibility = 'visible';
      
      // Position tooltip below the dot
      const rect = statusDot.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      let top = rect.bottom + 8;
      
      // Ensure tooltip stays within window bounds
      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      if (top + tooltipRect.height > window.innerHeight - 10) {
        top = rect.top - tooltipRect.height - 8;
      }
      
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }
    
    // Hide tooltip on mouse leave
    statusDot.addEventListener('mouseleave', () => {
      const tooltip = document.getElementById('status-tooltip');
      if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
      }
    });
    
    // Initialize counter with default values
    updateRequestsCounter(requestsData.requests_remaining, requestsData.total_requests);
    
    // Check if conversation element exists
    if (!conversation) {
      console.error('Conversation element not found during initialization');
    } else {
      console.log('Conversation element found and ready for scrolling');
    }
    
    // Initialize authentication state
    ipcRenderer.send('auth-get-status');
    
    // Request shortcuts from main process
    ipcRenderer.send('get-shortcuts');
    
    // Request usage information if authenticated
    ipcRenderer.send('auth-get-usage');
    
    // Initialize shortcuts display
    updateShortcutsDisplay();
    
    // Set up DOM sanitization observer to catch any marker texts that get through
    if (conversation) {
      setupDOMSanitizationObserver();
      console.log('DOM sanitization observer initialized');
      
      // Run periodic sanitization sweep to catch any missed markers
      setInterval(globalSanitizationSweep, 2000);
      console.log('Periodic sanitization sweep initialized');
      
      // Test sanitization function on window for debugging
      window.testSanitization = (testText) => {
        console.log('Testing sanitization with input:', testText);
        const result = sanitizeMessageContent(testText);
        console.log('Sanitization result:', result);
        return result;
      };

      // Mobile Shortcuts Dropdown Functionality
      initializeMobileShortcuts();
    };

    // Mobile Shortcuts Functionality
    function initializeMobileShortcuts() {
      const shortcutsIcon = document.getElementById('shortcuts-icon');
      const shortcutsDropdown = document.getElementById('shortcuts-dropdown');

      if (!shortcutsIcon || !shortcutsDropdown) {
        console.log('Mobile shortcuts elements not found, skipping initialization');
        return;
      }

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!shortcutsIcon.contains(e.target)) {
          shortcutsDropdown.style.opacity = '0';
          shortcutsDropdown.style.visibility = 'hidden';
          shortcutsDropdown.style.transform = 'translateY(-10px) scale(0.95)';
        }
      });

      // Handle icon hover to show dropdown
      shortcutsIcon.addEventListener('mouseenter', (e) => {
        shortcutsDropdown.style.opacity = '1';
        shortcutsDropdown.style.visibility = 'visible';
        shortcutsDropdown.style.transform = 'translateY(0) scale(1)';
        shortcutsDropdown.style.zIndex = '9999999';
      });

      shortcutsIcon.addEventListener('mouseleave', (e) => {
        // Check if mouse is over dropdown
        setTimeout(() => {
          if (!shortcutsDropdown.matches(':hover')) {
            shortcutsDropdown.style.opacity = '0';
            shortcutsDropdown.style.visibility = 'hidden';
            shortcutsDropdown.style.transform = 'translateY(-10px) scale(0.95)';
          }
        }, 100);
      });

      // Keep dropdown visible when hovering over it
      shortcutsDropdown.addEventListener('mouseenter', (e) => {
        shortcutsDropdown.style.opacity = '1';
        shortcutsDropdown.style.visibility = 'visible';
        shortcutsDropdown.style.transform = 'translateY(0) scale(1)';
        shortcutsDropdown.style.zIndex = '9999999';
      });

      shortcutsDropdown.addEventListener('mouseleave', (e) => {
        shortcutsDropdown.style.opacity = '0';
        shortcutsDropdown.style.visibility = 'hidden';
        shortcutsDropdown.style.transform = 'translateY(-10px) scale(0.95)';
      });

      // Update shortcuts based on platform
      updateMobileShortcutsDisplay();
    }

    function updateMobileShortcutsDisplay() {
      // Add platform class to body
      if (isMac) {
        document.body.classList.add('platform-mac');
        document.body.classList.remove('platform-windows');
      } else {
        document.body.classList.add('platform-windows');
        document.body.classList.remove('platform-mac');
      }
    }