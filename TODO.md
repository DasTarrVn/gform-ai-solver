Dưới đây là file Markdown tổng hợp toàn bộ các lỗi, giải pháp và đoạn mã mẫu. Cấu trúc này được thiết kế theo hướng chỉ dẫn kỹ thuật (Technical Guidelines) để AI Agent của bạn có thể dễ dàng đọc, phân tích ngữ cảnh và thực thi việc sửa code một cách chính xác.
Bạn chỉ cần copy toàn bộ nội dung trong khung dưới đây và lưu thành file refactor_guidelines.md (hoặc tên tương tự) rồi nạp cho Agent:
```markdown
# GForm AI Solver - Technical Refactoring Guidelines

Tài liệu này tổng hợp các lỗi kiến trúc hiện tại của dự án `gform-ai-solver` và cung cấp hướng dẫn chi tiết (kèm code mẫu) để AI Agent thực hiện refactor toàn bộ mã nguồn. Mục tiêu là xây dựng một Chrome Extension đạt chuẩn Production, an toàn, ổn định và tuân thủ Manifest V3.

---

## 1. File `manifest.json` (Cấu hình lõi)

### Vấn đề (Issues):
- Sử dụng Manifest V2 (sắp bị Google khai tử).
- Cấp quyền quá rộng (`"<all_urls>"`), gây rủi ro bảo mật và khó duyệt lên Chrome Web Store.
- Chưa định nghĩa Service Worker chuẩn của Manifest V3.

### Giải pháp (Solutions):
- Nâng cấp `"manifest_version": 3`.
- Giới hạn `host_permissions` chỉ truy cập vào Google Forms.
- Chuyển `background` sang dạng `service_worker`.

### Code mẫu (Snippet):
```json
{
  "manifest_version": 3,
  "name": "GForm AI Solver",
  "version": "1.0.0",
  "description": "Tự động phân tích và hỗ trợ điền Google Forms bằng AI.",
  "permissions": [
    "storage", 
    "activeTab", 
    "scripting"
  ],
  "host_permissions": [
    "*://[docs.google.com/forms/](https://docs.google.com/forms/)*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["*://[docs.google.com/forms/](https://docs.google.com/forms/)*"],
      "js": ["content.js"]
    }
  ]
}

```
## 2. File content.js (Scraper & Filler)
### Vấn đề (Issues):
 * Dùng class CSS ngẫu nhiên (VD: .M7eMe) để tìm câu hỏi. Các class này thay đổi liên tục, làm extension dễ bị lỗi (break).
 * Gán giá trị trực tiếp (input.value = "...") không kích hoạt được state nội bộ của Google Forms, dẫn đến lỗi khi submit.
### Giải pháp (Solutions):
 * Quét câu hỏi thông qua các thuộc tính Accessibility (ARIA attributes) như [role="listitem"] và [role="heading"].
 * Sau khi điền, phải mô phỏng thao tác người dùng bằng cách dispatch sự kiện (Event) để bypass cơ chế React/Angular của Google Forms.
### Code mẫu (Snippet):
```javascript
// Hướng dẫn lấy danh sách câu hỏi an toàn
const questions = document.querySelectorAll('[role="listitem"]');
questions.forEach((q, index) => {
    const titleElement = q.querySelector('[role="heading"]');
    if (titleElement) {
        console.log(`Câu ${index + 1}:`, titleElement.innerText);
    }
});

// Hướng dẫn điền đáp án và kích hoạt sự kiện lưu của hệ thống
function fillAnswerAndTriggerEvent(inputElement, answer) {
    inputElement.value = answer;
    // Bắn sự kiện để đánh lừa Forms rằng có user thao tác
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
}

```
## 3. File background.js (API Handler / Service Worker)
### Vấn đề (Issues):
 * Gọi API trực tiếp từ content.js sẽ gây lỗi CORS (Cross-Origin Resource Sharing) và dễ lộ API Key.
 * Service Worker trong Manifest V3 sẽ tự động "ngủ", lưu biến toàn cục (global variables) sẽ bị mất dữ liệu.
### Giải pháp (Solutions):
 * Sử dụng background.js làm proxy trung gian để fetch API (OpenAI/Gemini...).
 * content.js giao tiếp với background.js qua chrome.runtime.sendMessage.
 * Lấy API Key từ chrome.storage.local thay vì lưu bằng biến.
### Code mẫu (Snippet):
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "solve_question") {
        chrome.storage.local.get(['gform_api_key'], async function(result) {
            const apiKey = result.gform_api_key;
            if (!apiKey) {
                sendResponse({ error: "Missing API Key" });
                return;
            }
            
            try {
                // Thực hiện fetch gọi AI API tại đây để tránh CORS
                // const aiResponse = await fetch(...) 
                sendResponse({ answer: "Kết quả từ AI" });
            } catch (err) {
                sendResponse({ error: err.toString() });
            }
        });
        return true; // Bắt buộc return true để dùng sendResponse bất đồng bộ (async)
    }
});

```
## 4. File popup.html & popup.js (User Interface & Settings)
### Vấn đề (Issues):
 * Hardcode API key trực tiếp trong code, dễ bị bot trên GitHub rà quét và đánh cắp.
### Giải pháp (Solutions):
 * Tạo form nhập liệu để người dùng tự điền API Key.
 * Mã hóa/Lưu Key an toàn bằng chrome.storage.local.
 * Tạo luồng giao tiếp (Message Passing) để kích hoạt script từ giao diện popup.
### Code mẫu (Snippet popup.js):
```javascript
document.addEventListener('DOMContentLoaded', () => {
    const keyInput = document.getElementById('apiKeyInput');
    const saveBtn = document.getElementById('saveBtn');
    
    // Tải key đã lưu (nếu có)
    chrome.storage.local.get(['gform_api_key'], (result) => {
        if (result.gform_api_key) {
            keyInput.value = result.gform_api_key;
        }
    });

    // Lưu key mới
    saveBtn.addEventListener('click', () => {
        const apiKey = keyInput.value.trim();
        chrome.storage.local.set({ 'gform_api_key': apiKey }, () => {
            alert('Đã lưu API Key thành công!');
        });
    });
});

```
## 5. File popup.css & Assets (UI Stability)
### Vấn đề (Issues):
 * Không set fix size cho popup làm giao diện dễ bị vỡ trên các màn hình/OS khác nhau.
 * Thiếu các kích thước icon chuẩn của Chrome Web Store.
### Giải pháp (Solutions):
 * Set min-width và min-height cứng cho thẻ body trong file CSS.
 * Đảm bảo thư mục assets/icons có đủ các file ảnh: 16x16, 48x48, 128x128.
### Code mẫu (Snippet popup.css):
```css
body {
    width: 320px;
    min-height: 250px;
    margin: 0;
    padding: 16px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f9f9f9;
}

```
**Agent Instruction:** Please process these guidelines step-by-step. Start by updating the manifest.json, then rewrite content.js to rely on ARIA tags, implement the API proxy in background.js, and finally build the secure settings interface in popup.html/js.
```

```
