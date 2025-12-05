/**
 * Ví dụ sử dụng License Manager trong Electron App
 *
 * File này demo cách tích hợp license vào main process của Electron
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const LicenseManager = require('./licenseManager')

// Đọc Public Key từ file
const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'public.pem'), 'utf8')

// Khởi tạo License Manager
const licenseManager = new LicenseManager({
  serverUrl: 'https://api.dangthanhson.com', // URL API backend
  appCode: 'APP001', // Mã app của bạn
  appVersion: app.getVersion(),
  publicKey: PUBLIC_KEY,
  configDir: path.join(app.getPath('userData'), 'license')
})

let mainWindow = null

/**
 * Kiểm tra license khi khởi động app
 */
async function checkLicenseOnStartup() {
  const status = licenseManager.getLicenseStatus()

  if (status.active) {
    console.log('✅ License is valid')
    console.log('License info:', status.info)
    return true
  } else {
    console.log('❌ License is invalid:', status.error)

    // Hiển thị dialog yêu cầu nhập license key
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: 'License Required',
      message: 'This application requires a valid license key.',
      detail: status.error,
      buttons: ['Enter License Key', 'Exit'],
      defaultId: 0,
      cancelId: 1
    })

    if (result.response === 0) {
      // Người dùng chọn nhập license key
      return await showLicenseActivationDialog()
    } else {
      // Người dùng chọn thoát
      app.quit()
      return false
    }
  }
}

/**
 * Hiển thị dialog nhập license key
 */
async function showLicenseActivationDialog() {
  // Tạo window để nhập license key
  const licenseWindow = new BrowserWindow({
    width: 500,
    height: 300,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // Load trang nhập license (bạn cần tạo file HTML này)
  licenseWindow.loadFile(path.join(__dirname, 'license-input.html'))

  return new Promise((resolve) => {
    // Lắng nghe sự kiện kích hoạt license
    ipcMain.once('activate-license', async (event, licenseKey) => {
      try {
        await licenseManager.activateLicense(licenseKey)

        dialog.showMessageBox({
          type: 'info',
          title: 'Success',
          message: 'License activated successfully!'
        })

        licenseWindow.close()
        resolve(true)
      } catch (error) {
        dialog.showErrorBox('Activation Failed', error.message)
        resolve(false)
      }
    })

    licenseWindow.on('closed', () => {
      resolve(false)
    })
  })
}

/**
 * Tạo cửa sổ chính
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile('index.html')

  // Kiểm tra license định kỳ (mỗi 1 giờ)
  setInterval(() => {
    const status = licenseManager.getLicenseStatus()
    if (!status.active) {
      dialog.showErrorBox(
        'License Invalid',
        'Your license has expired or is invalid. The application will now close.'
      )
      app.quit()
    }
  }, 60 * 60 * 1000) // 1 giờ
}

/**
 * IPC Handlers cho renderer process
 */
function setupIpcHandlers() {
  // Lấy trạng thái license
  ipcMain.handle('get-license-status', () => {
    return licenseManager.getLicenseStatus()
  })

  // Kích hoạt license
  ipcMain.handle('activate-license', async (event, licenseKey) => {
    try {
      const result = await licenseManager.activateLicense(licenseKey)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Xóa license
  ipcMain.handle('clear-license', () => {
    licenseManager.clearLicense()
    return { success: true }
  })
}

/**
 * Khởi động app
 */
app.whenReady().then(async () => {
  setupIpcHandlers()

  // Kiểm tra license trước khi mở app
  const isLicenseValid = await checkLicenseOnStartup()

  if (isLicenseValid) {
    createMainWindow()
  } else {
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * Thêm license check vào các điểm quan trọng trong app
 * Để tránh bypass đơn giản
 */
function checkLicenseAtCriticalPoint() {
  const status = licenseManager.getLicenseStatus()
  if (!status.active) {
    throw new Error('License verification failed at critical point')
  }
  return true
}

// Export hàm này để dùng ở các module khác
module.exports = { checkLicenseAtCriticalPoint }
