# 📝 WP Poster Integration Guide

## ⚠️ VẤN ĐỀ HIỆN TẠI
- Automation app gửi data thành công (file đã được tạo)
- WP Poster app nhận được 0 bài viết
- Cần debug ở phía WP Poster

---

## 🔍 CHECKLIST DEBUG CHO WP POSTER TEAM

### 1️⃣ URL Scheme Handler
**Câu hỏi:**
- [ ] WP Poster có đăng ký URL scheme `wpposter://` chưa?
- [ ] Protocol handler có được gọi khi nhận URL `wpposter://import?file=...` không?
- [ ] WP Poster có log ra URL nhận được không?

**Test:**
```javascript
// Trong WP Poster console
console.log('Protocol handler called with URL:', window.location.href);
```

### 2️⃣ File Path Parsing
**Câu hỏi:**
- [ ] WP Poster có parse query parameter `file` từ URL không?
- [ ] File path có bị decode đúng không? (Vì đã dùng `encodeURIComponent`)

**Code mẫu:**
```javascript
// Parse URL scheme
const url = new URL('wpposter://import?file=C%3A%5CUsers%5C...');
const filePath = decodeURIComponent(url.searchParams.get('file') || '');
console.log('File path:', filePath);
```

### 3️⃣ File Reading
**Câu hỏi:**
- [ ] WP Poster có đọc file JSON từ path đó không?
- [ ] Có lỗi permission denied hoặc file not found không?
- [ ] File có được đọc với encoding UTF-8 không?

**Code mẫu (nếu WP Poster là Electron):**
```javascript
const fs = require('fs');
try {
  const jsonData = fs.readFileSync(filePath, 'utf-8');
  console.log('File content:', jsonData);
  const data = JSON.parse(jsonData);
  console.log('Parsed data:', data);
} catch (error) {
  console.error('Error reading file:', error);
}
```

### 4️⃣ Data Structure Validation
**Câu hỏi:**
- [ ] WP Poster có kiểm tra `data.posts` có tồn tại không?
- [ ] WP Poster có validate format từng post không?

---

## 📋 DATA FORMAT

### File Location
```
Windows: C:\Users\{User}\AppData\Roaming\automation\temp\wpposter_import.json
macOS: ~/Library/Application Support/automation/temp/wpposter_import.json
Linux: ~/.config/automation/temp/wpposter_import.json
```

### JSON Structure
```json
{
  "posts": [
    {
      "Title": "Tiêu đề bài viết",
      "Content": "<p>Nội dung HTML...</p>",
      "Tags": "tag1, tag2, tag3",
      "Categories": "Danh mục 1, Danh mục 2",
      "Excerpt": "Mô tả ngắn",
      "Status": "draft"
    }
  ]
}
```

### Field Types
| Field | Type | Description |
|-------|------|-------------|
| Title | string | Tiêu đề bài viết |
| Content | string | Nội dung HTML |
| Tags | string | Tags phân cách bằng dấu phẩy |
| Categories | string | Categories phân cách bằng dấu phẩy |
| Excerpt | string | Mô tả ngắn |
| Status | string | Trạng thái (draft/publish) |

---

## 🔗 URL SCHEME FLOW

```
1. Automation App
   ↓
   Lưu data → C:\Users\...\temp\wpposter_import.json
   ↓
   Mở URL → wpposter://import?file=C%3A%5CUsers%5C...
   ↓
2. WP Poster App
   ↓
   Protocol handler nhận URL
   ↓
   Parse query param: file = "C:\Users\..."
   ↓
   Đọc file JSON
   ↓
   Parse JSON → data.posts[]
   ↓
   Import vào WP Poster
```

---

## 🐛 DEBUG STEPS CHO WP POSTER

### Bước 1: Log URL nhận được
```javascript
// WP Poster Protocol Handler
app.on('open-url', (event, url) => {
  console.log('━━━ WP POSTER DEBUG ━━━');
  console.log('Received URL:', url);

  const parsedUrl = new URL(url);
  console.log('Protocol:', parsedUrl.protocol);
  console.log('Host:', parsedUrl.host);
  console.log('Search params:', parsedUrl.searchParams.toString());
  console.log('File param:', parsedUrl.searchParams.get('file'));
});
```

### Bước 2: Log file content
```javascript
const filePath = decodeURIComponent(parsedUrl.searchParams.get('file'));
console.log('Decoded file path:', filePath);

const fs = require('fs');
if (fs.existsSync(filePath)) {
  console.log('✅ File exists');
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log('File size:', content.length, 'bytes');
  console.log('First 200 chars:', content.substring(0, 200));
} else {
  console.error('❌ File NOT found:', filePath);
}
```

### Bước 3: Log parsed data
```javascript
try {
  const data = JSON.parse(content);
  console.log('✅ JSON parsed successfully');
  console.log('Posts count:', data.posts?.length || 0);
  console.log('Sample post:', data.posts[0]);
} catch (error) {
  console.error('❌ JSON parse error:', error);
}
```

---

## 📞 THÔNG TIN CẦN GỬI TỪ AUTOMATION APP

Khi nhấn nút "Đăng web", mở Console (F12) trong Automation app sẽ thấy:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ DATA ĐÃ LƯU THÀNH CÔNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 File path: C:\Users\...\wpposter_import.json
🔗 URL Scheme: wpposter://import?file=...
📊 Tổng số bài: 5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 COPY THÔNG TIN NÀY GỬI CHO WP POSTER TEAM:
{
  "urlScheme": "wpposter://import?file=...",
  "filePath": "C:\\Users\\...\\wpposter_import.json",
  "totalPosts": 5,
  "samplePost": { ... }
}
```

**→ Copy toàn bộ thông tin này và gửi cho WP Poster team**

---

## ❓ CÂU HỎI CHO WP POSTER TEAM

1. **Protocol Handler:**
   - WP Poster có đăng ký protocol `wpposter://` chưa?
   - Có log gì khi nhận URL scheme không?

2. **File Access:**
   - WP Poster có quyền đọc file trong `AppData\Roaming\automation\temp\` không?
   - Có thử đọc file thủ công với path cụ thể không?

3. **Implementation:**
   - WP Poster đang dùng platform gì? (Electron, Web, Native Windows app?)
   - Code xử lý protocol handler như thế nào?
   - Có thể share đoạn code handle `wpposter://import` không?

4. **Testing:**
   - Thử mở URL thủ công: `wpposter://import?file=C:\test.json`
   - Có lỗi gì trong console WP Poster không?

---

## 💡 GỢI Ý FIX CHO WP POSTER

### Option 1: Protocol Handler (Electron)
```javascript
// main.js
const { app, protocol } = require('electron');

app.setAsDefaultProtocolClient('wpposter');

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleImportUrl(url);
});

function handleImportUrl(urlString) {
  const url = new URL(urlString);
  const filePath = decodeURIComponent(url.searchParams.get('file') || '');

  if (filePath) {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Send to renderer
    mainWindow.webContents.send('import-posts', data.posts);
  }
}
```

### Option 2: IPC Handler (Electron)
```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wpPosterAPI', {
  readImportFile: (filePath) => ipcRenderer.invoke('read-import-file', filePath)
});

// renderer
const data = await window.wpPosterAPI.readImportFile(filePath);
```

---

## 📧 LIÊN HỆ

Nếu cần thêm thông tin:
1. Share toàn bộ console log từ cả 2 apps
2. Share screenshot lỗi (nếu có)
3. Share platform WP Poster đang dùng
4. Share code xử lý protocol handler

---

**Last updated:** 2025-12-13
**Automation App Version:** 1.0.0
