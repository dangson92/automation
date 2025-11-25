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

// --- AUTOMATION HANDLER ---
ipcMain.handle('automation-run', async (event, { url, selectors, prompt, headless }) => {
  console.log('Running automation for:', url, 'Headless:', headless);
  
  // Tạo một cửa sổ worker
  const workerWindow = new BrowserWindow({
    show: !headless, // Nếu headless = true thì show = false (ẩn)
    width: 1000,
    height: 800,
    webPreferences: {
      offscreen: false // Cần render để tương tác DOM
    }
  });

  try {
    await workerWindow.loadURL(url);
    
    // Inject Script để điền prompt và lấy kết quả
    const result = await workerWindow.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        const inputSel = '${selectors.input}';
        const submitSel = '${selectors.submit}';
        const outputSel = '${selectors.output}';
        const textToType = \`${prompt.replace(/`/g, '\\`')}\`;

        // 1. Wait for Input
        let inputEl = document.querySelector(inputSel);
        let attempts = 0;
        while(!inputEl && attempts < 20) {
           await sleep(500);
           inputEl = document.querySelector(inputSel);
           attempts++;
        }
        if(!inputEl) return { error: "Không tìm thấy ô nhập liệu: " + inputSel };

        // 2. Type Prompt
        inputEl.focus();
        inputEl.value = textToType;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);

        // 3. Submit
        const btn = document.querySelector(submitSel);
        if(btn) {
           btn.click();
        } else {
           // Fallback Enter
           const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' });
           inputEl.dispatchEvent(enter);
        }

        // 4. Wait for Result
        await sleep(2000); // Wait for generation start
        
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
                 return { success: true, text: currentText };
              }
           }
           waitAttempts++;
        }
        
        return { success: true, text: lastText || "Timeout waiting for result" };
      })();
    `);

    // Đóng cửa sổ sau khi xong
    workerWindow.close();
    return result;

  } catch (err) {
    if (!workerWindow.isDestroyed()) workerWindow.close();
    return { error: err.message };
  }
});