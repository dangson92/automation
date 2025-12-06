const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const LicenseManager = require('./license-manager');

let mainWindow;
let licenseManager;
let licenseWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load file index.html từ thư mục dist sau khi build
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  // Initialize license manager
  try {
    const publicKeyPath = path.join(__dirname, 'keys', 'public.pem');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    licenseManager = new LicenseManager({
      serverUrl: 'https://api.dangthanhson.com', // Thay đổi URL server của bạn
      appCode: 'content-auto-sondang', // Mã app trong database
      appVersion: '1.0.0',
      publicKey: publicKey,
      configDir: path.join(app.getPath('userData'), 'license')
    });

    // Check license first
    const verification = licenseManager.verifyLicenseToken();

    if (!verification.valid) {
      console.log('License invalid:', verification.error);
      // Show license activation window
      await showLicenseWindow();
    } else {
      console.log('License valid, starting app');
      // License valid, proceed to main app
      createWindow();
    }
  } catch (error) {
    console.error('Failed to initialize license manager:', error.message);
    // If public key not found, show error and exit
    dialog.showErrorBox(
      'License System Error',
      'Failed to initialize license system. Please contact support.\n\nError: ' + error.message
    );
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- GLOBAL WORKER WINDOW TRACKING ---
let currentWorkerWindow = null;
let loginWindow = null;

// --- DATA PERSISTENCE ---
const getQueueFilePath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'queue.json');
};

// Save queue to file
ipcMain.handle('queue-save', async (event, queueData) => {
  try {
    const filePath = getQueueFilePath();
    fs.writeFileSync(filePath, JSON.stringify(queueData, null, 2), 'utf-8');
    console.log('Queue saved to:', filePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to save queue:', error);
    return { success: false, error: error.message };
  }
});

// Load queue from file
ipcMain.handle('queue-load', async () => {
  try {
    const filePath = getQueueFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      console.log('Queue loaded from:', filePath);
      return { success: true, data: JSON.parse(data) };
    } else {
      console.log('No queue file found, starting fresh');
      return { success: true, data: [] };
    }
  } catch (error) {
    console.error('Failed to load queue:', error);
    return { success: false, error: error.message, data: [] };
  }
});

ipcMain.handle('settings-export', async (event, settings) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      defaultPath: 'workflow-settings.json'
    });
    if (canceled || !filePath) return { success: false };
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('settings-import', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePaths || !filePaths[0]) return { success: false };
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- AUTOMATION HANDLERS ---

// Auto-detect selectors based on platform URL
function getSelectorsForPlatform(url) {
  const urlLower = url.toLowerCase();

  // ChatGPT
  if (urlLower.includes('chatgpt.com') || urlLower.includes('chat.openai.com')) {
    return {
      input: '#prompt-textarea',
      submit: 'button[data-testid="send-button"]',
      output: 'div[data-message-author-role="assistant"] .markdown, .markdown',
      stopButton: [
        'button[aria-label*="Stop"]',
        'button[data-testid*="stop"]'
      ]
    };
  }

  // Claude.ai
  if (urlLower.includes('claude.ai')) {
    return {
      input: [
        'div[contenteditable="true"][data-testid="chat-input"]',
        'div.tiptap.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="Claude"]',
        'div[contenteditable="true"][role="textbox"]'
      ].join(', '),
      submit: 'button[aria-label="Send Message"], button svg[data-icon="send"]',
      output: 'div[data-is-streaming], div.font-claude-message, div.prose',
      stopButton: [
        'button[aria-label*="Stop"]',
        'button[data-testid*="stop"]',
        '[role="button"][aria-label*="Stop"]'
      ]
    };
  }

  // Perplexity.ai
  if (urlLower.includes('perplexity.ai')) {
    return {
      input: [
        '#ask-input',
        'div[contenteditable="true"]#ask-input',
        'div[contenteditable="true"][id="ask-input"]',
        'div[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]'
      ].join(', '),
      submit: 'button[aria-label*="Submit"], button[type="submit"]',
      output: 'div.prose, div[class*="answer"], div[class*="result"]',
      stopButton: [
        'button[aria-label*="Stop"]',
        'button[aria-label*="Cancel"]',
        'button[data-testid*="stop"]',
        '[role="button"][aria-label*="Stop"]'
      ]
    };
  }

  // Default (generic)
  return {
    input: 'textarea, input[type="text"], div[contenteditable="true"]',
    submit: 'button[type="submit"]',
    output: 'div, p',
    stopButton: [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]'
    ]
  };
}

// Visual Selector Picker
ipcMain.handle('selector-picker-open', async (event, url) => {
  console.log('Opening selector picker for:', url);

  return new Promise((resolve) => {
    const pickerWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        partition: 'persist:automation',
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    pickerWindow.loadURL(url);

    let resolved = false;

    pickerWindow.webContents.on('did-finish-load', () => {
      // Inject selector picker UI and logic
      pickerWindow.webContents.executeJavaScript(`
        (function() {
          // Create overlay
          const overlay = document.createElement('div');
          overlay.id = 'selector-picker-overlay';
          overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 999999; pointer-events: none;';
          document.body.appendChild(overlay);

          // Create instruction banner
          const banner = document.createElement('div');
          banner.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; border-radius: 12px; z-index: 10000000; font-family: system-ui; font-size: 16px; font-weight: 600; box-shadow: 0 10px 40px rgba(0,0,0,0.3); pointer-events: none;';
          banner.textContent = '🎯 Click vào element để chọn CSS Selector';
          document.body.appendChild(banner);

          // Highlight box
          const highlight = document.createElement('div');
          highlight.style.cssText = 'position: absolute; pointer-events: none; border: 3px solid #667eea; background: rgba(102, 126, 234, 0.1); z-index: 9999999; transition: all 0.1s ease;';
          document.body.appendChild(highlight);

          let currentElement = null;

          function escAttr(v) { return String(v).replace(/"/g, '\\"'); }
          function escId(v) { try { return CSS.escape(v); } catch(e) { return String(v).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); } }
          function escClass(v) { try { return CSS.escape(v); } catch(e) { return String(v).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); } }
          function getSelector(el) {
            if (el.id) return '#' + escId(el.id);
            const cl = Array.from(el.classList || []).filter(Boolean).map(escClass);
            if (cl.length) return el.tagName.toLowerCase() + '.' + cl.slice(0,3).join('.');
            const dt = el.getAttribute('data-testid');
            if (dt) return '[data-testid="' + escAttr(dt) + '"]';
            const nm = el.getAttribute('name');
            if (nm) return el.tagName.toLowerCase() + '[name="' + escAttr(nm) + '"]';
            const al = el.getAttribute('aria-label');
            if (al) return '[aria-label="' + escAttr(al) + '"]';
            let path = [];
            let cur = el;
            while (cur.parentElement) {
              let sel = cur.tagName.toLowerCase();
              if (cur.id) { path.unshift('#' + escId(cur.id)); break; }
              const cl2 = Array.from(cur.classList || []).filter(Boolean).map(escClass);
              if (cl2.length) sel += '.' + cl2.slice(0,2).join('.');
              const siblings = Array.from(cur.parentElement.children);
              const index = siblings.indexOf(cur) + 1;
              if (siblings.length > 1) sel += ':nth-child(' + index + ')';
              path.unshift(sel);
              cur = cur.parentElement;
              if (path.length > 4) break;
            }
            return path.join(' > ');
          }

          // Mouse move handler
          document.addEventListener('mousemove', (e) => {
            if (e.target === overlay || e.target === banner || e.target === highlight) return;
            currentElement = e.target;
            const rect = currentElement.getBoundingClientRect();
            highlight.style.top = (rect.top + window.scrollY) + 'px';
            highlight.style.left = (rect.left + window.scrollX) + 'px';
            highlight.style.width = rect.width + 'px';
            highlight.style.height = rect.height + 'px';
          }, true);

          // Click handler
          document.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentElement) {
              const selector = getSelector(currentElement);
              window.__selectorPickerResult = selector;
              try { console.log('PICKER:' + encodeURIComponent(selector)); } catch (e) {}
            }
          }, true);

          // ESC to cancel
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              window.__selectorPickerResult = null;
              window.close();
            }
          });
        })();
      `);
    });
    pickerWindow.webContents.on('dom-ready', () => {
      pickerWindow.webContents.executeJavaScript(`
        (function() {
          if (window.__selectorPickerInjected) return;
          window.__selectorPickerInjected = true;
        })();
      `);
    });

    pickerWindow.webContents.on('console-message', (event, level, message) => {
      if (resolved) return;
      if (typeof message === 'string' && message.startsWith('PICKER:')) {
        const selector = decodeURIComponent(message.slice('PICKER:'.length));
        resolved = true;
        if (!pickerWindow.isDestroyed()) pickerWindow.destroy();
        resolve({ success: true, selector });
      }
    });

    pickerWindow.on('page-title-updated', (event, title) => {
      if (resolved) return;
      if (typeof title === 'string' && title.startsWith('PICKER_RESULT:')) {
        event.preventDefault();
        const selector = decodeURIComponent(title.slice('PICKER_RESULT:'.length));
        resolved = true;
        if (!pickerWindow.isDestroyed()) pickerWindow.destroy();
        resolve({ success: true, selector });
      }
    });

    const timeout = setTimeout(async () => {
      if (resolved) return;
      try {
        const result = await pickerWindow.webContents.executeJavaScript('window.__selectorPickerResult || null');
        resolved = true;
        if (!pickerWindow.isDestroyed()) pickerWindow.destroy();
        resolve({ success: true, selector: result });
      } catch (_) {
        resolved = true;
        if (!pickerWindow.isDestroyed()) pickerWindow.destroy();
        resolve({ success: true, selector: null });
      }
    }, 30000);

    pickerWindow.on('close', async (e) => {
      if (resolved) return;
      e.preventDefault();
      clearTimeout(timeout);
      try {
        const result = await pickerWindow.webContents.executeJavaScript('window.__selectorPickerResult || null');
        resolved = true;
        pickerWindow.destroy();
        resolve({ success: true, selector: result });
      } catch (err) {
        resolved = true;
        pickerWindow.destroy();
        resolve({ success: true, selector: null });
      }
    });
  });
});

// Open login window to establish session
ipcMain.handle('login-window-open', async (event, url) => {
  console.log('Opening login window for:', url);

  // Close existing login window if any
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }

  loginWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      partition: 'persist:automation', // Use persistent session
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  await loginWindow.loadURL(url);

  // Return when window is closed
  return new Promise((resolve) => {
    loginWindow.on('closed', () => {
      console.log('Login window closed. Session saved.');
      loginWindow = null;

      // Focus back to main window after login window closes
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
      }

      resolve({ success: true });
    });
  });
});

// Stop current automation
ipcMain.handle('automation-stop', async () => {
  console.log('Force stopping automation...');

  // Force destroy worker window immediately (don't wait for close)
  if (currentWorkerWindow && !currentWorkerWindow.isDestroyed()) {
    currentWorkerWindow.destroy(); // Use destroy() instead of close() for immediate shutdown
    currentWorkerWindow = null;
    console.log('Worker window destroyed');
  }

  // Focus main window without resizing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus(); // Just focus, don't restore/resize
    console.log('Main window focused');
  }

  return { success: true };
});

// Run automation
ipcMain.handle('automation-run', async (event, { url, selectors, useCustomSelectors, prompt, headless }) => {
  console.log('Running automation for:', url, 'Headless:', headless, 'Use Custom Selectors:', useCustomSelectors);

  // Auto-detect selectors based on platform
  const detectedSelectors = getSelectorsForPlatform(url);

  // If useCustomSelectors is true, use provided selectors; otherwise use auto-detected
  const finalSelectors = useCustomSelectors ? {
    input: selectors.input || detectedSelectors.input,
    submit: selectors.submit || detectedSelectors.submit,
    output: selectors.output || detectedSelectors.output
  } : {
    input: detectedSelectors.input,
    submit: detectedSelectors.submit,
    output: detectedSelectors.output
  };
  const stopButtonSelectors = detectedSelectors.stopButton;

  console.log('Using selectors (custom=' + useCustomSelectors + '):', finalSelectors);
  console.log('Stop button selectors:', stopButtonSelectors);

  // Tạo một cửa sổ worker (sử dụng persistent session để giữ login)
  const workerWindow = new BrowserWindow({
    show: !headless, // Nếu headless = true thì show = false (ẩn)
    width: 1000,
    height: 800,
    webPreferences: {
      partition: 'persist:automation', // Reuse same session as login window
      offscreen: false // Cần render để tương tác DOM
    }
  });

  // Track current worker
  currentWorkerWindow = workerWindow;

  workerWindow.webContents.on('console-message', (event, level, message) => {
    const msg = String(message || '');
    const suppress = [
      'Third-party cookie will be blocked',
      'Third-Party Cookie',
      'Unrecognized feature: \'attribution-reporting\'',
      'attribution-reporting'
    ];
    for (const s of suppress) {
      if (msg.includes(s)) return;
    }
    console.log(`[Worker Console] ${msg}`);
  });

  // DevTools will NOT open automatically
  // User can manually open with F12 if needed for debugging

  try {
    console.log('Loading URL:', url);
    await workerWindow.loadURL(url);

    // Chờ page load xong
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Inject Script với proper escaping using JSON.stringify
    const scriptParams = {
      inputSel: finalSelectors.input,
      submitSel: finalSelectors.submit,
      outputSel: finalSelectors.output,
      stopButtonSels: stopButtonSelectors,
      textToType: prompt
    };

    const result = await workerWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));

          const params = ${JSON.stringify(scriptParams)};
          const inputSel = params.inputSel;
          const submitSel = params.submitSel;
          const outputSel = params.outputSel;
          const stopButtonSels = params.stopButtonSels;
          const textToType = params.textToType;

          console.log('Script started. Looking for:', inputSel);

          // 1. Wait for Input
          let inputEl = document.querySelector(inputSel);
          let attempts = 0;
          while(!inputEl && attempts < 20) {
             await sleep(500);
             inputEl = document.querySelector(inputSel);
             attempts++;
             console.log('Waiting for input element, attempt:', attempts);
          }
          if(!inputEl) {
             console.error('Input element not found:', inputSel);
             return { error: "Không tìm thấy ô nhập liệu: " + inputSel };
          }

          console.log('Input element found, typing text...');

          // 2. Type Prompt (React-compatible)
          inputEl.focus();
          await sleep(300);

          // Clear existing value first
          inputEl.value = '';

          // Method 1: Try execCommand (works best with React)
          let success = false;
          try {
            success = document.execCommand('insertText', false, textToType);
            console.log('execCommand result:', success);
          } catch (e) {
            console.log('execCommand failed:', e.message);
          }

          // Method 2: If execCommand failed, use native setter
          if (!success || inputEl.value !== textToType) {
            console.log('Trying native setter method...');
            try {
              // Get the native setter for the element type
              const descriptor = Object.getOwnPropertyDescriptor(
                inputEl.constructor.prototype,
                'value'
              );

              if (descriptor && descriptor.set) {
                descriptor.set.call(inputEl, textToType);
                console.log('Native setter used successfully');
              } else {
                // Fallback to direct assignment
                inputEl.value = textToType;
                console.log('Direct value assignment used');
              }

              // Trigger React events
              const inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: textToType
              });
              const changeEvent = new Event('change', { bubbles: true });

              inputEl.dispatchEvent(inputEvent);
              inputEl.dispatchEvent(changeEvent);
            } catch (e) {
              console.error('All input methods failed:', e.message);
              // Last resort: just set value directly
              inputEl.value = textToType;
            }
          }

          console.log('Text value set to:', inputEl.value.substring(0, 50) + '...');
          console.log('Input element value length:', inputEl.value.length);

          // Wait for React to process and enable submit button (longer delay for long prompts)
          console.log('Waiting for submit button to be enabled...');
          await sleep(2000); // Increased from 1000ms to 2000ms

          // Verify submit button is enabled before clicking
          let waitAttempts = 0;
          while (waitAttempts < 10) {
            const submitBtn = document.querySelector(submitSel);
            if (submitBtn && !submitBtn.disabled) {
              console.log('Submit button is ready');
              break;
            }
            console.log('Waiting for submit button to be enabled, attempt:', waitAttempts + 1);
            await sleep(500);
            waitAttempts++;
          }

          console.log('Text typed and verified, submitting...');

          // 3. Submit - Try multiple methods
          let submitted = false;
          const btn = document.querySelector(submitSel);
          if(btn && !btn.disabled) {
             console.log('Submit button found, clicking...');
             btn.click();
             submitted = true;
          }

          if(!submitted) {
             console.log('Submit button not found or disabled, using Enter key...');
             // Try multiple Enter key methods
             const enterKeydown = new KeyboardEvent('keydown', {
               bubbles: true,
               cancelable: true,
               keyCode: 13,
               which: 13,
               key: 'Enter',
               code: 'Enter'
             });
             const enterKeypress = new KeyboardEvent('keypress', {
               bubbles: true,
               cancelable: true,
               keyCode: 13,
               which: 13,
               key: 'Enter',
               code: 'Enter'
             });
             const enterKeyup = new KeyboardEvent('keyup', {
               bubbles: true,
               cancelable: true,
               keyCode: 13,
               which: 13,
               key: 'Enter',
               code: 'Enter'
             });

             inputEl.dispatchEvent(enterKeydown);
             inputEl.dispatchEvent(enterKeypress);
             inputEl.dispatchEvent(enterKeyup);

             // Also try form submit if input is in a form
             const form = inputEl.closest('form');
             if (form) {
               console.log('Found form, attempting form submit...');
               form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
             }
          }

          console.log('Waiting for response...');

          // 4. Wait for AI Generation to Complete by monitoring stop button
          console.log('Monitoring stop button to detect generation completion...');
          console.log('Using platform-specific stop button selectors:', stopButtonSels);

          const anyStopPresent = () => {
            for (const selector of stopButtonSels) {
              const el = document.querySelector(selector);
              if (el) return true;
            }
            const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
            for (const b of btns) {
              const label = (b.getAttribute('aria-label') || '').toLowerCase();
              const txt = (b.innerText || b.textContent || '').toLowerCase();
              if (label.includes('stop') || label.includes('cancel') || txt.includes('stop')) return true;
            }
            return false;
          };

          let generationStarted = false;
          for (let attempts = 0; attempts < 20; attempts++) {
            await sleep(500);
            if (anyStopPresent()) {
              generationStarted = true;
              console.log('Generation started (stop present)');
              break;
            }
          }

          if (!generationStarted) {
            console.log('Warning: Stop not detected, using fallback timing...');
            await sleep(10000);
          } else {
            for (let attempts = 0; attempts < 120; attempts++) {
              await sleep(1000);
              const present = anyStopPresent();
              if (!present) {
                console.log('Generation complete (stop not present)');
                await sleep(2000);
                break;
              }
              if (attempts % 10 === 0) {
                console.log('Still generating... attempt:', attempts, 'Stop present:', present);
              }
            }
          }

          // 5. Capture the output
          console.log('Capturing output...');
          const urlLower = (window.location.href || '').toLowerCase();

          // For ChatGPT: specifically target the markdown content of the last assistant message
          let targetEl;
          if (urlLower.includes('chatgpt.com') || urlLower.includes('chat.openai.com')) {
            // Find the last assistant message container
            const assistantMessages = document.querySelectorAll('div[data-message-author-role="assistant"]');
            if (assistantMessages.length === 0) {
              console.error('No assistant messages found');
              return { error: 'Không tìm thấy tin nhắn trả lời từ ChatGPT' };
            }

            const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
            // Find the markdown content inside it
            const markdownEl = lastAssistantMsg.querySelector('.markdown');

            if (!markdownEl) {
              console.error('No markdown element found in assistant message');
              return { error: 'Không tìm thấy nội dung markdown trong tin nhắn' };
            }

            targetEl = markdownEl;
            console.log('Using ChatGPT markdown element');
          } else {
            // For other platforms, use the original logic
            const outEls = document.querySelectorAll(outputSel);
            if (outEls.length === 0) {
              console.error('No output elements found with selector:', outputSel);
              return { error: 'Không tìm thấy output với selector: ' + outputSel };
            }
            targetEl = outEls[outEls.length - 1];
          }
          const extractContent = (root) => {
            // If content is in a code block, extract text only (removes all HTML/syntax highlighting)
            const codeEl = root.querySelector('pre code, code');
            if (codeEl) {
              const textContent = codeEl.textContent || codeEl.innerText || '';
              // Only use code content if it's substantial
              if (textContent.trim().length > 20) {
                return textContent;
              }
            }

            // Otherwise extract HTML, removing UI elements
            const clone = root.cloneNode(true);
            // Remove wrapper divs, buttons, and other UI elements
            clone.querySelectorAll('[aria-label="Copy"], button, svg, div.sticky, pre, .rounded-2xl, [class*="corner-"]').forEach(el => el.remove());
            const html = clone.innerHTML || '';
            if (html && html.trim().length > 0) return html;

            // Fallback to text
            const text = root.innerText || root.textContent || '';
            return text;
          };

          const finalHtml = extractContent(targetEl);
          const currentUrl = window.location.href;

          console.log('Output captured. Length:', finalHtml.length, 'Preview:', finalHtml.substring(0, 100) + '...');
          return { success: true, text: finalHtml, url: currentUrl };

        } catch (scriptError) {
          console.error('Script execution error:', scriptError);
          return { error: 'Script error: ' + scriptError.message };
        }
      })();
    `);

    console.log('Automation result:', result);

    // Đóng cửa sổ sau khi xong
    if (!workerWindow.isDestroyed()) {
      workerWindow.close();
    }
    currentWorkerWindow = null;
    return result;

  } catch (err) {
    console.error('Automation error:', err);
    if (!workerWindow.isDestroyed()) {
      workerWindow.close();
    }
    currentWorkerWindow = null;
    return { error: err.message };
  }
});

// Scrape images from Perplexity Images tab
ipcMain.handle('perplexity-search-images', async (event, { query, headless, conversationUrl }) => {
  console.log('Searching Perplexity images for:', query, 'Headless:', headless, 'ConversationURL:', conversationUrl || 'NEW');

  const workerWindow = new BrowserWindow({
    show: !headless,
    width: 1200,
    height: 900,
    webPreferences: {
      partition: 'persist:automation',
      offscreen: false
    }
  });

  // Set a realistic user agent to avoid bot detection
  workerWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  currentWorkerWindow = workerWindow;

  workerWindow.webContents.on('console-message', (event, level, message) => {
    const msg = String(message || '');
    const suppress = [
      'Third-party cookie will be blocked',
      'Third-Party Cookie',
      'Unrecognized feature: \'attribution-reporting\'',
      'attribution-reporting',
      'CORS policy',
      'Access-Control-Allow-Origin',
      'cloudflareaccess.com'
    ];
    for (const s of suppress) {
      if (msg.includes(s)) return;
    }
    console.log(`[Perplexity Worker] ${msg}`);
  });

  try {
    // Load existing conversation or create new one
    const urlToLoad = conversationUrl || 'https://www.perplexity.ai/';
    console.log('Loading Perplexity:', urlToLoad);
    await workerWindow.loadURL(urlToLoad);

    // Wait longer to allow Cloudflare challenges to complete
    const waitTime = conversationUrl ? 3000 : 5000; // Less wait if reusing conversation
    await new Promise(resolve => setTimeout(resolve, waitTime));

    const result = await workerWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const query = ${JSON.stringify(query)};

          // Check if we're on a Cloudflare Access page
          if (document.body.textContent.includes('Cloudflare Access') ||
              document.body.textContent.includes('cloudflareaccess.com') ||
              window.location.href.includes('cloudflareaccess.com')) {
            return { error: 'Perplexity đang được bảo vệ bởi Cloudflare Access. Vui lòng đăng nhập vào Perplexity trong một tab riêng trước, sau đó thử lại.' };
          }

          console.log('Starting Perplexity image search...');

          // 1. Find and focus input
          const inputSelectors = [
            '#ask-input',
            'div[contenteditable="true"]#ask-input',
            'div[contenteditable="true"][role="textbox"]'
          ];

          let inputEl = null;
          for (const sel of inputSelectors) {
            inputEl = document.querySelector(sel);
            if (inputEl) {
              console.log('Found input with selector:', sel);
              break;
            }
          }

          if (!inputEl) {
            let attempts = 0;
            while (!inputEl && attempts < 20) {
              await sleep(500);
              for (const sel of inputSelectors) {
                inputEl = document.querySelector(sel);
                if (inputEl) break;
              }
              attempts++;
              console.log('Waiting for input, attempt:', attempts);
            }
          }

          if (!inputEl) {
            return { error: 'Không tìm thấy ô nhập liệu Perplexity' };
          }

          // 2. Type query
          console.log('Typing query...');
          inputEl.focus();
          await sleep(300);

          // Clear and type
          inputEl.textContent = '';

          try {
            document.execCommand('insertText', false, query);
          } catch (e) {
            inputEl.textContent = query;
            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: query
            });
            inputEl.dispatchEvent(inputEvent);
          }

          console.log('Query typed:', inputEl.textContent.substring(0, 50));
          await sleep(1500);

          // 3. Submit
          console.log('Submitting query...');
          const submitSelectors = [
            'button[aria-label*="Submit"]',
            'button[type="submit"]',
            'button[aria-label*="Search"]'
          ];

          let submitBtn = null;
          for (const sel of submitSelectors) {
            submitBtn = document.querySelector(sel);
            if (submitBtn && !submitBtn.disabled) {
              console.log('Found submit button:', sel);
              break;
            }
          }

          if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
          } else {
            // Try Enter key
            const enterEvent = new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              keyCode: 13,
              which: 13,
              key: 'Enter',
              code: 'Enter'
            });
            inputEl.dispatchEvent(enterEvent);
          }

          console.log('Query submitted');

          // Small delay for UI to update
          await sleep(2000);

          // Capture conversation URL after query is submitted
          const currentUrl = window.location.href;
          console.log('Conversation URL:', currentUrl);

          // 4. Click Images tab directly (no need to wait for text response)
          console.log('Looking for Images tab...');
          const imageTabSelectors = [
            'button[aria-label="Images"]',
            'button[data-testid="answer-mode-tabs-tab-images"]',
            'button:has(svg[xlink\\\\:href*="photo"])',
            'button:has(span:contains("Images"))'
          ];

          let imageTab = null;
          for (const sel of imageTabSelectors) {
            try {
              imageTab = document.querySelector(sel);
              if (imageTab) {
                console.log('Found Images tab with selector:', sel);
                break;
              }
            } catch (e) {
              // Continue to next selector
            }
          }

          // Fallback: find by text content
          if (!imageTab) {
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
              const text = (btn.textContent || '').toLowerCase();
              const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
              if (text.includes('image') || ariaLabel.includes('image')) {
                imageTab = btn;
                console.log('Found Images tab by text/aria-label');
                break;
              }
            }
          }

          if (!imageTab) {
            return { error: 'Không tìm thấy tab Images trên Perplexity' };
          }

          console.log('Clicking Images tab...');
          imageTab.click();
          await sleep(3000); // Wait for images to load

          // 6. Scroll to load lazy images - try multiple approaches
          console.log('Scrolling to load images in Images tab...');

          for (let i = 0; i < 2; i++) {
            console.log('Scroll attempt ' + (i + 1) + '/2...');

            // Method 1: Scroll window
            window.scrollBy(0, 800);

            // Method 2: Find and scroll all potentially scrollable divs
            const allDivs = document.querySelectorAll('div');
            let scrolledCount = 0;
            for (const div of allDivs) {
              const style = window.getComputedStyle(div);
              const isScrollable = style.overflow === 'auto' ||
                                  style.overflow === 'scroll' ||
                                  style.overflowY === 'auto' ||
                                  style.overflowY === 'scroll';

              if (isScrollable && div.scrollHeight > div.clientHeight) {
                div.scrollTop += 800;
                scrolledCount++;
              }
            }

            console.log('Scrolled window and ' + scrolledCount + ' divs, waiting 5s for images to load...');
            await sleep(5000);
          }

          console.log('Finished scrolling, waiting for images to settle...');
          await sleep(3000);

          // 7. Extract full-size image URLs by clicking each image
          console.log('Extracting full-size image URLs...');
          const imageUrls = [];

          // Find all image containers in the Images tab
          const imageContainers = Array.from(document.querySelectorAll('img[src*="http"]'))
            .filter(img => {
              const src = img.src || '';
              return src.startsWith('http') &&
                     !src.includes('gravatar') &&
                     !src.includes('icon') &&
                     !src.includes('logo');
            });

          console.log('Found', imageContainers.length, 'potential images');

          // Click on each image to get full-size URL
          // Check up to 20 images to find 10 that meet width > 600px requirement
          for (let i = 0; i < Math.min(imageContainers.length, 20) && imageUrls.length < 10; i++) {
            try {
              const imgElement = imageContainers[i];

              // Click on the image or its parent container
              const clickTarget = imgElement.closest('a, button, [role="button"]') || imgElement;
              clickTarget.click();

              console.log('Clicked image', i + 1);
              await sleep(800); // Wait for modal/preview to open

              // Scroll inside modal to load more images in carousel
              console.log('Scrolling in modal to load more images...');
              for (let scrollAttempt = 0; scrollAttempt < 2; scrollAttempt++) {
                // Try to find and scroll the modal container
                const modalContainer = document.querySelector('[role="dialog"], .modal, [class*="modal"]') || document.body;
                modalContainer.scrollBy(0, 300);
                await sleep(1500); // Wait for images to load
              }

              // Try to find full-size image in modal/preview
              let fullSizeUrl = null;
              let imageWidth = 0;

              // Method 1: Look for larger image in modal
              const modalImages = document.querySelectorAll('img[src*="http"]');
              for (const modalImg of modalImages) {
                const src = modalImg.src || '';
                // Look for images that are likely full-size (no thumb/small in URL)
                if (src.startsWith('http') &&
                    !src.includes('gravatar') &&
                    !src.includes('icon') &&
                    !src.includes('logo') &&
                    modalImg.naturalWidth > 600) { // Check if it's a larger image
                  fullSizeUrl = src;
                  imageWidth = modalImg.naturalWidth;
                  console.log('Found image with width:', imageWidth);
                  break;
                }
              }

              // Method 2: Check for srcset attribute (with width validation)
              if (!fullSizeUrl) {
                for (const modalImg of modalImages) {
                  const srcset = modalImg.getAttribute('srcset');
                  if (srcset && modalImg.naturalWidth > 600) {
                    // Parse srcset and get the largest image
                    const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
                    if (sources.length > 0) {
                      fullSizeUrl = sources[sources.length - 1]; // Get last (usually largest)
                      imageWidth = modalImg.naturalWidth;
                      console.log('Found image from srcset with width:', imageWidth);
                    }
                  }
                }
              }

              // Only add images that meet width requirement (> 600px)
              if (fullSizeUrl && imageWidth > 600 && !imageUrls.includes(fullSizeUrl)) {
                imageUrls.push(fullSizeUrl);
                console.log('Extracted full-size URL (width: ' + imageWidth + 'px):', fullSizeUrl.substring(0, 80) + '...');
              } else if (!fullSizeUrl) {
                console.log('Skipped image', i + 1, '- no image with width > 600px found');
              } else if (imageWidth <= 600) {
                console.log('Skipped image', i + 1, '- width too small:', imageWidth + 'px');
              }

              // Close modal/preview (press Escape)
              const escEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                keyCode: 27,
                which: 27,
                key: 'Escape',
                code: 'Escape'
              });
              document.dispatchEvent(escEvent);
              await sleep(300);

            } catch (err) {
              console.log('Error processing image', i + 1, ':', err.message);
              continue;
            }
          }

          console.log('Extracted', imageUrls.length, 'full-size image URLs');

          return {
            success: true,
            images: imageUrls.slice(0, 10),
            count: imageUrls.length,
            conversationUrl: currentUrl
          };

        } catch (scriptError) {
          console.error('Script error:', scriptError);
          return { error: 'Script error: ' + scriptError.message };
        }
      })();
    `);

    console.log('Perplexity image search result:', result);

    if (!workerWindow.isDestroyed()) {
      workerWindow.close();
    }
    currentWorkerWindow = null;
    return result;

  } catch (err) {
    console.error('Perplexity image search error:', err);
    if (!workerWindow.isDestroyed()) {
      workerWindow.close();
    }
    currentWorkerWindow = null;
    return { error: err.message };
  }
});

// --- LICENSE MANAGEMENT ---

/**
 * Show license activation window
 */
function showLicenseWindow() {
  return new Promise((resolve) => {
    licenseWindow = new BrowserWindow({
      width: 500,
      height: 450,
      resizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        preload: path.join(__dirname, 'electron-preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Create simple HTML for license activation
    const licenseHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>License Activation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      overflow: hidden;
      -webkit-user-select: none;
      user-select: none;
    }
    .window {
      width: 500px;
      height: 450px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      overflow: hidden;
    }
    .titlebar {
      -webkit-app-region: drag;
      height: 40px;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .titlebar-text {
      color: white;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .close-btn {
      -webkit-app-region: no-drag;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: rgba(255,255,255,0.1);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      font-size: 18px;
      line-height: 1;
    }
    .close-btn:hover {
      background: rgba(255,255,255,0.2);
    }
    .container {
      background: white;
      margin: 20px;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 20px 0;
      font-size: 24px;
      color: #333;
    }
    p {
      color: #666;
      margin-bottom: 20px;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
      margin-bottom: 15px;
      font-family: monospace;
      -webkit-user-select: text;
      user-select: text;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .error {
      color: #e53e3e;
      margin-top: 10px;
      font-size: 14px;
      -webkit-user-select: text;
      user-select: text;
    }
    .success {
      color: #38a169;
      margin-top: 10px;
      font-size: 14px;
      -webkit-user-select: text;
      user-select: text;
    }
  </style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <div class="titlebar-text">PromptFlow Desktop</div>
      <button class="close-btn" onclick="window.close()">×</button>
    </div>
    <div class="container">
      <h1>🔑 Kích hoạt License</h1>
      <p>Vui lòng nhập license key để kích hoạt PromptFlow Desktop.</p>
      <input
        type="text"
        id="licenseKey"
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        maxlength="36"
      />
      <button id="activateBtn">Kích hoạt</button>
      <div id="message"></div>
    </div>
  </div>

  <script>
    const input = document.getElementById('licenseKey');
    const btn = document.getElementById('activateBtn');
    const message = document.getElementById('message');

    // Format license key input (UUID format: 8-4-4-4-12)
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/[^A-Fa-f0-9]/g, '').toLowerCase();

      // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      if (value.length > 0) {
        const parts = [];
        if (value.length > 8) parts.push(value.substring(0, 8));
        else parts.push(value);

        if (value.length > 8) {
          if (value.length > 12) parts.push(value.substring(8, 12));
          else parts.push(value.substring(8));
        }

        if (value.length > 12) {
          if (value.length > 16) parts.push(value.substring(12, 16));
          else parts.push(value.substring(12));
        }

        if (value.length > 16) {
          if (value.length > 20) parts.push(value.substring(16, 20));
          else parts.push(value.substring(16));
        }

        if (value.length > 20) {
          parts.push(value.substring(20, 32));
        }

        e.target.value = parts.join('-');
      } else {
        e.target.value = '';
      }
    });

    btn.addEventListener('click', async () => {
      const licenseKey = input.value.replace(/-/g, '');

      if (licenseKey.length !== 32) {
        message.className = 'error';
        message.textContent = '❌ Vui lòng nhập license key hợp lệ (UUID format)';
        return;
      }

      btn.disabled = true;
      message.textContent = 'Đang kích hoạt...';
      message.className = '';

      try {
        const result = await window.electronAPI.activateLicense(input.value);

        if (result.success) {
          message.className = 'success';
          message.textContent = '✅ ' + (result.message || 'Đã kích hoạt thành công');
          setTimeout(() => {
            window.electronAPI.licenseActivated();
          }, 1500);
        } else {
          message.className = 'error';
          message.textContent = '❌ ' + (result.error || 'Kích hoạt không thành công');
          btn.disabled = false;
        }
      } catch (err) {
        message.className = 'error';
        message.textContent = '❌ Kích hoạt không thành công: ' + err.message;
        btn.disabled = false;
      }
    });

    // Allow Enter key to activate
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        btn.click();
      }
    });
  </script>
</body>
</html>
    `;

    const htmlPath = path.join(app.getPath('userData'), 'license.html');
    fs.writeFileSync(htmlPath, licenseHtml, 'utf8');

    licenseWindow.loadFile(htmlPath);

    licenseWindow.on('closed', () => {
      licenseWindow = null;
      resolve();
    });
  });
}

/**
 * Map server error codes to Vietnamese messages
 */
function mapLicenseError(errorMessage) {
  const errorMap = {
    'invalid_input': 'Thông tin kích hoạt không hợp lệ',
    'app_not_found': 'Ứng dụng không tồn tại',
    'license_not_found': 'License key không tồn tại hoặc không hợp lệ',
    'license_inactive': 'License đã bị vô hiệu hóa',
    'license_expired': 'License đã hết hạn sử dụng',
    'max_devices_reached': 'License đã được kích hoạt trên số thiết bị tối đa',
    'server_error': 'Lỗi server, vui lòng thử lại sau',
    'License activation failed': 'Kết nối đến server thất bại, kiểm tra internet',
    'Invalid server response': 'Server trả về dữ liệu không hợp lệ'
  };

  // Check if error message contains any known error code
  for (const [code, message] of Object.entries(errorMap)) {
    if (errorMessage.includes(code)) {
      return message;
    }
  }

  // Default error message
  return 'Kích hoạt không thành công: ' + errorMessage;
}

// IPC Handlers for license
ipcMain.handle('license-activate', async (event, licenseKey) => {
  if (!licenseManager) {
    return { success: false, error: 'License manager chưa được khởi tạo' };
  }

  try {
    console.log('Activating license...');
    const result = await licenseManager.activateLicense(licenseKey);
    console.log('✅ License activated successfully');
    return { success: true, message: 'Đã kích hoạt thành công' };
  } catch (error) {
    console.error('❌ License activation failed:', error.message);
    const mappedError = mapLicenseError(error.message);
    return { success: false, error: mappedError };
  }
});

ipcMain.handle('license-verify', async () => {
  if (!licenseManager) {
    return { valid: false, error: 'License manager not initialized' };
  }

  return licenseManager.verifyLicenseToken();
});

ipcMain.handle('license-info', async () => {
  if (!licenseManager) {
    return null;
  }

  return licenseManager.getLicenseStatus();
});

ipcMain.handle('get-user-info', async () => {
  if (!licenseManager) {
    return null;
  }

  return licenseManager.getUserInfo();
});

ipcMain.handle('license-remove', async () => {
  if (!licenseManager) {
    return { success: false };
  }

  licenseManager.clearLicense();
  return { success: true };
});

ipcMain.handle('license-activated', async () => {
  // Close license window and open main app
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    licenseWindow.close();
  }

  // Verify license one more time
  const verification = licenseManager.verifyLicenseToken();

  if (verification.valid) {
    createWindow();
    return { success: true };
  } else {
    return { success: false, error: 'License verification failed' };
  }
});
