const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

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

app.whenReady().then(() => {
  createWindow();

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
          const outEls = document.querySelectorAll(outputSel);

          if (outEls.length === 0) {
            console.error('No output elements found with selector:', outputSel);
            return { error: 'Không tìm thấy output với selector: ' + outputSel };
          }

          let targetEl = outEls[outEls.length - 1];
          const urlLower = (window.location.href || '').toLowerCase();
          if (urlLower.includes('chatgpt.com') || urlLower.includes('chat.openai.com')) {
            const inner = targetEl.querySelector('div[data-message-author-role="assistant"] .markdown, .markdown');
            if (inner) targetEl = inner;
          }
          const sanitizeInner = (root) => {
            const clone = root.cloneNode(true);
            // For ChatGPT code blocks: keep only <code> content inside <pre>
            clone.querySelectorAll('pre').forEach((pre) => {
              const code = pre.querySelector('code');
              if (code) {
                pre.innerHTML = code.innerHTML;
              } else {
                // Remove common UI controls inside pre
                pre.querySelectorAll('[aria-label="Copy"], button, svg, div.sticky, div[class*="bg-token"]').forEach(el => el.remove());
              }
            });
            return clone.innerHTML || '';
          };

          const finalHtml = sanitizeInner(targetEl);
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
