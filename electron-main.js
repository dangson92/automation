const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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

// --- AUTOMATION HANDLERS ---

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
  console.log('Stopping automation...');
  if (currentWorkerWindow && !currentWorkerWindow.isDestroyed()) {
    currentWorkerWindow.close();
    currentWorkerWindow = null;
    return { success: true };
  }
  return { success: false, message: 'No active automation' };
});

// Run automation
ipcMain.handle('automation-run', async (event, { url, selectors, prompt, headless }) => {
  console.log('Running automation for:', url, 'Headless:', headless);

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

  // Forward console logs từ worker window
  workerWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Worker Console] ${message}`);
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
      inputSel: selectors.input,
      submitSel: selectors.submit,
      outputSel: selectors.output,
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

          // 2. Type Prompt
          inputEl.focus();
          inputEl.value = textToType;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(500);

          console.log('Text typed, submitting...');

          // 3. Submit
          const btn = document.querySelector(submitSel);
          if(btn) {
             console.log('Submit button found, clicking...');
             btn.click();
          } else {
             console.log('Submit button not found, using Enter key...');
             // Fallback Enter
             const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' });
             inputEl.dispatchEvent(enter);
          }

          console.log('Waiting for response...');

          // 4. Wait for Result
          await sleep(3000); // Wait for generation start

          let waitAttempts = 0;
          let lastText = "";
          let stableCount = 0;

          // Poll cho đến khi text không đổi (hoàn tất) hoặc timeout
          while(waitAttempts < 60) { // Max 60s
             await sleep(1000);
             const outEls = document.querySelectorAll(outputSel);
             if(outEls.length > 0) {
                const currentText = outEls[outEls.length - 1].innerText;

                if(currentText.length > 0 && currentText === lastText) {
                   stableCount++;
                } else {
                   stableCount = 0;
                }
                lastText = currentText;

                // Nếu text không đổi trong 3 giây -> coi như xong
                if(stableCount >= 3) {
                   console.log('Response stable, returning result...');
                   return { success: true, text: currentText };
                }
             }
             waitAttempts++;
             if(waitAttempts % 10 === 0) {
                console.log('Still waiting for stable response... attempt:', waitAttempts);
             }
          }

          console.log('Timeout reached, returning last text...');
          return { success: true, text: lastText || "Timeout waiting for result" };

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