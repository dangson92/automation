import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Pause, Plus, Trash2, Download, Save, UserCog, ChevronDown, Bot, Layout, Zap, X, Globe, HelpCircle, ArrowRight, Link as LinkIcon, Target, CheckCircle2, Cpu, FileText, Box, Layers, AlertTriangle, Monitor, Eye, EyeOff, Settings, Image as ImageIcon, RotateCcw, Search, Filter, Upload, Edit3, Edit, Send } from 'lucide-react';
import { Status, QueueItem, AppConfig, SavedAgent, AutomationConfig, WorkflowStep, StepResult } from './types';
import { OutputEditor } from './components/OutputEditor';
import { generateContent } from './services/geminiService';
import { StatusBadge } from './components/StatusBadge';
import { ImportInput } from './components/ImportInput';

// Fix for missing chrome types
declare var chrome: any;

const DEFAULT_CONFIG: AppConfig = {
  systemInstruction: "Bạn là trợ lý AI hữu ích.",
  model: 'gemini-2.5-flash',
  steps: [
    {
      id: 'step_1',
      name: 'Bước 1: ChatGPT Phân tích',
      url: 'https://chatgpt.com/',
      template: "Phân tích: {{input}}",
      selectors: {
        input: "#prompt-textarea",
        submit: "button[data-testid='send-button']",
        output: ".markdown"
      }
    },
    {
      id: 'step_2',
      name: 'Bước 2: Google Search',
      url: 'https://google.com/',
      template: "Tìm kiếm: {{prev}}"
    }
  ],
  delayMs: 2000,
};

const DEFAULT_AUTOMATION: AutomationConfig = {
  defaultUrl: "https://chatgpt.com/",
  inputSelector: "#prompt-textarea",
  submitSelector: "button[data-testid='send-button']",
  outputSelector: "div[data-message-author-role='assistant'] .markdown, .markdown",
};

// Check if running as Chrome Extension
const isExtension = () => {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
};

// Check if running as Electron App
const isElectron = () => {
  return !!window.electronAPI;
};

// Helper function to decode HTML entities
const decodeHTMLEntities = (text: string): string => {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
};

// Helper function to remove only dangerous attributes (XSS prevention)
const cleanAttributes = (element: Element): void => {
  // Dangerous event handlers to remove
  const dangerousAttributes = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmousemove', 'onmouseout',
    'onkeydown', 'onkeyup', 'onkeypress', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
    'onselect', 'onload', 'onerror', 'onabort', 'onunload', 'onresize', 'onscroll',
    'oncontextmenu', 'ondrag', 'ondrop', 'oninput', 'oninvalid', 'onsearch',
    'onanimationend', 'onanimationiteration', 'onanimationstart', 'ontransitionend'
  ];

  const attrs = Array.from(element.attributes).map(attr => attr.name);

  attrs.forEach(attrName => {
    const attrLower = attrName.toLowerCase();

    // Remove dangerous event handlers
    if (dangerousAttributes.includes(attrLower)) {
      element.removeAttribute(attrName);
      return;
    }

    // Remove href/src with javascript:
    if (attrLower === 'href' || attrLower === 'src') {
      const attrValue = element.getAttribute(attrName);
      if (attrValue && attrValue.toLowerCase().trim().startsWith('javascript:')) {
        element.removeAttribute(attrName);
      }
    }
  });
};

// Kiểu 2: Xử lý HTML trong code block (syntax highlight)
const normalizeClaudeCodeBlock = (htmlString: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Find <pre><code class="language-html">...</code></pre>
  const codeBlock = doc.querySelector('pre code.language-html, pre code[class*="code-block"]');

  if (!codeBlock) {
    // Không tìm thấy code block, fallback
    return htmlString;
  }

  // Lấy text content (bỏ tất cả span, token highlighting)
  let encodedHTML = codeBlock.textContent || '';

  // Decode HTML entities: &lt;p&gt; -> <p>
  const decodedHTML = decodeHTMLEntities(encodedHTML);

  // Parse decoded HTML
  const contentDoc = parser.parseFromString(decodedHTML, 'text/html');

  // Remove [imageX] paragraphs
  const imageParagraphs = contentDoc.querySelectorAll('p');
  imageParagraphs.forEach(p => {
    const text = p.textContent?.trim() || '';
    if (/^\[image\d+\]$/.test(text)) {
      p.remove();
    }
  });

  // Clean all attributes
  const allElements = contentDoc.querySelectorAll('*');
  allElements.forEach(element => cleanAttributes(element));

  return contentDoc.body.innerHTML;
};

// Kiểu 1: Xử lý HTML bọc trong div.standard-markdown
const normalizeClaudeHtml = (htmlString: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Strategy: Unwrap ONLY if body has a single wrapper div
  // If body has multiple children or no wrapper, keep everything
  let innerContent: string;

  // Check if body has exactly 1 child
  if (doc.body.children.length === 1) {
    const singleChild = doc.body.children[0] as HTMLElement;
    const childClasses = singleChild.className || '';

    // Check if it's a Claude UI wrapper div
    const isWrapper =
      singleChild.tagName.toLowerCase() === 'div' &&
      (childClasses.includes('standard-markdown') ||
       childClasses.includes('font-claude') ||
       childClasses.includes('claude-response'));

    if (isWrapper) {
      // Unwrap: lấy innerHTML của wrapper, bỏ div bao ngoài
      innerContent = singleChild.innerHTML;
    } else {
      // Không phải wrapper, giữ nguyên
      innerContent = doc.body.innerHTML;
    }
  } else {
    // Nhiều children hoặc không có children, giữ nguyên tất cả
    innerContent = doc.body.innerHTML;
  }

  // Decode ALL HTML entities (handles double encoding và complex HTML)
  // DOMParser đã decode 1 lần, function này decode thêm nếu còn entities
  innerContent = decodeHTMLEntities(innerContent);

  // Parse lại sau khi decode để có HTML structure đúng
  const contentDoc = parser.parseFromString(innerContent, 'text/html');

  // Remove [imageX] paragraphs (có class font-claude-response-body)
  const imageParagraphs = contentDoc.querySelectorAll('p.font-claude-response-body, p[class*="font-claude"]');
  imageParagraphs.forEach(p => {
    const text = p.textContent?.trim() || '';
    if (/^\[image\d+\]$/.test(text)) {
      p.remove();
    }
  });

  // Clean all attributes
  const allElements = contentDoc.querySelectorAll('*');
  allElements.forEach(element => cleanAttributes(element));

  return contentDoc.body.innerHTML;
};

// Hàm chính: Auto-detect kiểu dữ liệu và xử lý
const normalizeClaudeContent = (rawString: string): string => {
  if (!rawString) return rawString;

  // Detect kiểu 1: có class="standard-markdown"
  if (rawString.includes('standard-markdown')) {
    return normalizeClaudeHtml(rawString);
  }

  // Detect kiểu 2: có <pre> + language-html hoặc code-block
  if (rawString.includes('language-html') || rawString.includes('code-block__code')) {
    return normalizeClaudeCodeBlock(rawString);
  }

  // Fallback: cố gắng xử lý như kiểu 1
  return normalizeClaudeHtml(rawString);
};

const App: React.FC = () => {
  // --- State ---
  // User info from license (Electron only)
  const [userInfo, setUserInfo] = useState<{ email: string; name: string } | null>(null);

  // Queue will be loaded from file (Electron) or localStorage (web) in useEffect
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inputText, setInputText] = useState("");

  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>(DEFAULT_AUTOMATION);
  const [headless, setHeadless] = useState(false); // Default false: hiển trình duyệt

  const [mode, setMode] = useState<'API' | 'BROWSER' | 'EXTENSION' | 'ELECTRON'>('BROWSER');
  
  // Agent / Preset Management
  const [savedAgents, setSavedAgents] = useState<SavedAgent[]>(() => {
    const saved = localStorage.getItem('promptflow_agents');
    return saved ? JSON.parse(saved) : [];
  });
  const [agentNameInput, setAgentNameInput] = useState("");
  const [showSaveAgent, setShowSaveAgent] = useState(false);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null); // Track currently loaded workflow
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false); // Track save state
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameWorkflowId, setRenameWorkflowId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  // Login URLs Management
  const [customLoginUrls, setCustomLoginUrls] = useState<string[]>(() => {
    const saved = localStorage.getItem('promptflow_custom_login_urls');
    return saved ? JSON.parse(saved) : [];
  });
  const [showCustomUrlModal, setShowCustomUrlModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");

  // UI State
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(config.steps[0]?.id || null);

  // Refs
  const stopRef = useRef(false);
  const processingRef = useRef(false);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Selected items for batch delete
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [editingOutput, setEditingOutput] = useState<{ itemId: string; stepId: string; content: string } | null>(null);
  const [rerunningStep, setRerunningStep] = useState<{ itemId: string; stepId: string } | null>(null);
  const [imageGallery, setImageGallery] = useState<{ itemId: string; stepId: string; imageIndex: number; images: string[]; currentSelected: number } | null>(null);
  const [scrollToStepId, setScrollToStepId] = useState<string | null>(null);
  const [isDetailPanelClosing, setIsDetailPanelClosing] = useState(false);

  // Queue filter and search
  const [filterStatus, setFilterStatus] = useState<string>('all'); // 'all', 'queued', 'running', 'completed', 'failed'
  const [searchText, setSearchText] = useState<string>('');

  // Input mode: manual or import
  const [inputMode, setInputMode] = useState<'manual' | 'import'>('manual');
  const [importMappingCount, setImportMappingCount] = useState<number>(0);

  // Get visible input variables based on input mode
  const getVisibleInputVariables = () => {
    if (inputMode === 'manual') {
      // Manual mode: show only {{input}} variable
      return ['input'];
    } else {
      // Import mode: show based on mapping count (up to 20)
      if (importMappingCount === 0) return ['input'];

      const vars = ['input'];
      for (let i = 1; i < Math.min(importMappingCount, 20); i++) {
        vars.push(`input${i}`);
      }
      return vars;
    }
  };

  // --- Init ---
  useEffect(() => {
    const initApp = async () => {
      if (isElectron()) {
        setMode('ELECTRON');
        // Load queue from file in Electron mode
        try {
          const result = await window.electronAPI.loadQueue();
          if (result.success && result.data) {
            console.log('[DEBUG] Loaded queue items:', result.data.length);
            const itemsWithMappedInputs = result.data.filter((item: any) => item.mappedInputs);
            console.log('[DEBUG] Items with mappedInputs:', itemsWithMappedInputs.length);
            if (itemsWithMappedInputs.length > 0) {
              console.log('[DEBUG] Sample item:', {
                id: itemsWithMappedInputs[0].id,
                originalPrompt: itemsWithMappedInputs[0].originalPrompt,
                mappedInputs: itemsWithMappedInputs[0].mappedInputs
              });
            }
            setQueue(result.data);
          }
        } catch (err) {
          console.error('Failed to load queue from file:', err);
        }
      } else {
        // Load from localStorage for web/extension mode
        const saved = localStorage.getItem('promptflow_queue');
        if (saved) {
          try {
            setQueue(JSON.parse(saved));
          } catch (err) {
            console.error('Failed to load queue from localStorage:', err);
          }
        }

        if (isExtension()) {
          setMode('EXTENSION');
        }
      }
    };
    initApp();
  }, []);

  // --- Persistence ---
  useEffect(() => {
    console.log('[LOCALSTORAGE] Saving agents:', savedAgents.length, 'workflows');
    localStorage.setItem('promptflow_agents', JSON.stringify(savedAgents));
    console.log('[LOCALSTORAGE] Saved to localStorage');
  }, [savedAgents]);

  useEffect(() => {
    localStorage.setItem('promptflow_custom_login_urls', JSON.stringify(customLoginUrls));
  }, [customLoginUrls]);

  // Auto-save workflow changes when editing a loaded workflow
  useEffect(() => {
    if (currentWorkflowId) {
      console.log('[AUTO-SAVE] Saving workflow:', currentWorkflowId);
      console.log('[AUTO-SAVE] Config steps:', config.steps.length);
      // Only auto-save if we have a loaded workflow
      setSavedAgents(prev => {
        const updated = prev.map(agent =>
          agent.id === currentWorkflowId
            ? {
                ...agent,
                config: { ...config },
                automationConfig: { ...automationConfig }
              }
            : agent
        );
        console.log('[AUTO-SAVE] Updated agents count:', updated.length);
        return updated;
      });
    }
  }, [config, automationConfig, currentWorkflowId]);

  useEffect(() => {
    if (mode === 'ELECTRON' && window.electronAPI) {
      // Save to file in Electron mode
      window.electronAPI.saveQueue(queue).catch(err => {
        console.error('Failed to save queue to file:', err);
      });
    } else {
      // Use localStorage for web/extension mode
      localStorage.setItem('promptflow_queue', JSON.stringify(queue));
    }
  }, [queue, mode]);

  // Load user info from license (Electron only)
  useEffect(() => {
    if (mode === 'ELECTRON' && window.electronAPI?.getUserInfo) {
      window.electronAPI.getUserInfo().then((info: any) => {
        if (info) {
          setUserInfo(info);
        }
      }).catch(err => {
        console.error('Failed to get user info:', err);
      });
    }
  }, [mode]);

  // Scroll to step when scrollToStepId changes
  useEffect(() => {
    if (scrollToStepId) {
      setTimeout(() => {
        // Try to scroll to output first, fallback to step detail
        const outputElement = document.getElementById(`step-output-${scrollToStepId}`);
        const element = outputElement || document.getElementById(`step-detail-${scrollToStepId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setScrollToStepId(null);
      }, 300); // Wait for detail panel animation
    }
  }, [scrollToStepId]);

  // Handle ESC key to close detail panel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedItemId) {
        handleCloseDetailPanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedItemId]);

  // --- Helpers ---
  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleExportSettings = async () => {
    const payload = { config, automationConfig };
    if (mode === 'ELECTRON' && window.electronAPI) {
      try {
        const res = await window.electronAPI.exportSettings(payload);
        if (!res.success) alert('Xuất thất bại');
      } catch (e: any) {
        alert('Lỗi xuất: ' + e.message);
      }
    } else {
      try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'workflow-settings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e: any) {
        alert('Lỗi xuất: ' + e.message);
      }
    }
  };

  const handleImportSettings = async () => {
    if (mode === 'ELECTRON' && window.electronAPI) {
      try {
        const res = await window.electronAPI.importSettings();
        if (res.success && res.data) {
          setConfig(res.data.config);
          setAutomationConfig(res.data.automationConfig);
          if (res.data.config.steps.length > 0) setExpandedStepId(res.data.config.steps[0].id);
        } else {
          alert('Nhập thất bại');
        }
      } catch (e: any) {
        alert('Lỗi nhập: ' + e.message);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(String(reader.result || '{}'));
            if (data.config && data.automationConfig) {
              setConfig(data.config);
              setAutomationConfig(data.automationConfig);
              if (data.config.steps && data.config.steps.length > 0) setExpandedStepId(data.config.steps[0].id);
            } else {
              alert('File không hợp lệ');
            }
          } catch (e: any) {
            alert('Lỗi đọc file: ' + e.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  };

  const handleOpenLogin = (url: string) => {
    if (!window.electronAPI || mode !== 'ELECTRON') return;

    window.electronAPI.openLoginWindow(url)
      .then(() => {
        console.log('Login window closed, session saved');
      })
      .catch((err: any) => {
        console.error('Login error:', err);
        alert('Lỗi mở cửa sổ đăng nhập: ' + err.message);
      });
  };

  const handleOpenCustomLogin = () => {
    if (!customUrlInput.trim()) {
      alert('Vui lòng nhập URL');
      return;
    }

    // Add to history if not already there
    if (!customLoginUrls.includes(customUrlInput)) {
      setCustomLoginUrls(prev => [customUrlInput, ...prev].slice(0, 10)); // Keep last 10
    }

    handleOpenLogin(customUrlInput);
    setShowCustomUrlModal(false);
    setCustomUrlInput('');
  };

  const handleAddPrompts = () => {
    if (!inputText.trim()) return;

    const lines = inputText.split('\n').filter(line => line.trim() !== '');
    const newItems: QueueItem[] = lines.map(line => ({
      id: generateId(),
      originalPrompt: line.trim(),
      status: Status.QUEUED,
      currentStepIndex: 0,
      results: [],
      logs: [],
      workflowId: currentWorkflowId || undefined, // Save current workflow ID
      source: 'manual' as const
    }));

    setQueue(prev => [...prev, ...newItems]);
    setInputText("");
  };

  const handleClearQueue = () => {
    // Stop automation (fire-and-forget, don't wait)
    stopRef.current = true;
    setIsProcessing(false);
    processingRef.current = false;

    if (mode === 'ELECTRON' && window.electronAPI) {
      window.electronAPI.stopAutomation().catch(err => {
        console.error('Failed to stop automation:', err);
      });
    }

    // Clear queue and selections immediately (no confirm dialog)
    setQueue([]);
    setProgress(0);
    setSelectedItemId(null);
    setSelectedItemIds(new Set());

    // Focus textarea immediately - no delay needed without confirm dialog
    if (inputTextareaRef.current) {
      inputTextareaRef.current.focus();
    }
  };

  const handleDeleteSelected = () => {
    if (selectedItemIds.size === 0) return;

    // Stop automation (fire-and-forget, don't wait)
    stopRef.current = true;
    setIsProcessing(false);
    processingRef.current = false;

    if (mode === 'ELECTRON' && window.electronAPI) {
      window.electronAPI.stopAutomation().catch(err => {
        console.error('Failed to stop automation:', err);
      });
    }

    // Remove selected items immediately (no confirm dialog)
    setQueue(prev => prev.filter(item => !selectedItemIds.has(item.id)));
    setSelectedItemIds(new Set());
    if (selectedItemId && selectedItemIds.has(selectedItemId)) {
      setSelectedItemId(null);
    }

    // Focus textarea immediately - no delay needed without confirm dialog
    if (inputTextareaRef.current) {
      inputTextareaRef.current.focus();
    }
  };

  const handleResetItem = (id: string) => {
    // Reset a single queue item to QUEUED state
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        status: Status.QUEUED,
        currentStepIndex: 0,
        results: [],
        finalResponse: undefined,
        error: undefined,
        logs: [],
        startTime: undefined,
        endTime: undefined
      };
    }));
  };

  const handleResetSelected = () => {
    if (selectedItemIds.size === 0) return;

    // Stop automation first
    stopRef.current = true;
    setIsProcessing(false);
    processingRef.current = false;

    if (mode === 'ELECTRON' && window.electronAPI) {
      window.electronAPI.stopAutomation().catch(err => {
        console.error('Failed to stop automation:', err);
      });
    }

    // Reset selected items to QUEUED state
    setQueue(prev => prev.map(item => {
      if (!selectedItemIds.has(item.id)) return item;
      return {
        ...item,
        status: Status.QUEUED,
        currentStepIndex: 0,
        results: [],
        finalResponse: undefined,
        error: undefined,
        logs: [],
        startTime: undefined,
        endTime: undefined
      };
    }));

    // Clear selection
    setSelectedItemIds(new Set());
  };

  const handlePublishPosts = async () => {
    if (selectedItemIds.size === 0) {
      alert('Vui lòng chọn ít nhất 1 bài viết để đăng');
      return;
    }

    // Lấy các items đã chọn và đã hoàn thành
    const selectedItems = queue.filter(item =>
      selectedItemIds.has(item.id) && item.status === Status.COMPLETED
    );

    if (selectedItems.length === 0) {
      alert('Không có bài viết nào hoàn thành để đăng. Vui lòng chọn các bài đã COMPLETED.');
      return;
    }

    setIsPublishing(true);

    try {
      // Map QueueItem sang format API
      const posts = selectedItems.map(item => {
        // Lấy title từ originalPrompt hoặc mappedInputs
        const title = item.mappedInputs?.['input'] || item.originalPrompt.substring(0, 100);

        // Lấy content từ finalResponse (kết quả step cuối cùng)
        const content = item.finalResponse || '';

        // Lấy tags, categories, excerpt từ mappedInputs nếu có
        const tags = item.mappedInputs?.['tags'] || item.mappedInputs?.['input1'] || '';
        const categories = item.mappedInputs?.['categories'] || item.mappedInputs?.['input2'] || '';
        const excerpt = item.mappedInputs?.['excerpt'] || item.mappedInputs?.['input3'] || '';

        return {
          Title: title,
          Content: content,
          Tags: tags,
          Categories: categories,
          Excerpt: excerpt,
          Status: 'draft'
        };
      });

      const data = { posts };

      try {
        // Thử POST tới localhost trước với timeout 3s
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch('http://localhost:45678/api/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          alert(`✅ Đăng thành công ${posts.length} bài viết!`);
          return;
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        // Nếu không connect được, dùng URL scheme
        console.log('Không kết nối được localhost, chuyển sang URL scheme...', error);

        // Debug: Log data trước khi gửi
        console.log('📦 Data gửi tới WP Poster:', data);
        console.log('📊 Số bài viết:', posts.length);
        console.log('📝 Sample post:', posts[0]);

        // Lưu data (Electron: file temp, Web: localStorage)
        if (mode === 'ELECTRON' && window.electronAPI) {
          // Electron mode: Lưu vào file temp (không giới hạn kích thước)
          try {
            const result = await window.electronAPI.savePublishData(data);
            if (result.success) {
              console.log(`✅ Data đã được lưu vào file: ${result.filePath}`);

              // Mở WP Poster với file path
              window.location.href = `wpposter://import?file=${encodeURIComponent(result.filePath || '')}`;

              alert(`✅ Đã gửi ${posts.length} bài viết tới WP Poster!\n\n📂 File: ${result.filePath}`);
            } else {
              throw new Error(result.error || 'Không thể lưu file');
            }
          } catch (e) {
            console.error('❌ Lỗi lưu file:', e);
            alert(`❌ Lỗi lưu data: ${e instanceof Error ? e.message : 'Unknown'}`);
          }
        } else {
          // Web mode: Fallback localStorage (giới hạn ~5-10MB)
          try {
            localStorage.setItem('wpposter_import_data', JSON.stringify(data));
            console.log('✅ Data đã lưu vào localStorage (key: wpposter_import_data)');

            window.location.href = `wpposter://import`;

            alert(`✅ Đã gửi ${posts.length} bài viết tới WP Poster!\n\nℹ️ Data lưu trong localStorage`);
          } catch (e) {
            console.error('❌ Lỗi localStorage (có thể quá giới hạn):', e);
            alert(`❌ Data quá lớn! Vui lòng giảm số bài viết hoặc dùng Desktop App.`);
          }
        }
      }
    } catch (error) {
      console.error('Lỗi khi đăng bài:', error);
      alert(`❌ Đăng thất bại: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRunSelected = () => {
    if (selectedItemIds.size === 0) return;

    // Check if any selected items are already completed
    const completedItems = queue.filter(item =>
      selectedItemIds.has(item.id) && item.status === Status.COMPLETED
    );

    if (completedItems.length > 0) {
      alert(`Bạn cần reset các queue sau về trạng thái chờ mới chạy lại được:\n\n${completedItems.map(item => `- ${item.originalPrompt.substring(0, 50)}...`).join('\n')}`);
      return;
    }

    // Run only selected items
    processQueue(selectedItemIds);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    // Use filteredQueue to select only visible items
    const visibleIds = filteredQueue.map(item => item.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedItemIds.has(id));

    if (allVisibleSelected) {
      // Deselect all visible items
      setSelectedItemIds(prev => {
        const newSet = new Set(prev);
        visibleIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all visible items
      setSelectedItemIds(prev => {
        const newSet = new Set(prev);
        visibleIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  const updateItemStatus = (id: string, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const updateResultContent = (itemId: string, stepId: string, content: string) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const newResults = (item.results || []).map(r => {
        if (r.stepId !== stepId) return r;

        // Sync imageData with actual images in the edited HTML
        let syncedImageData = r.imageData;
        if (r.imageData && r.imageData.length > 0) {
          // Parse HTML to find images with data-image-idx attribute
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = content;

          // Update imageData based on what's actually in the HTML
          syncedImageData = r.imageData.map((imgData: any, idx: number) => {
            const img = tempDiv.querySelector(`img[data-image-idx="${idx}"]`);
            if (!img) {
              // Image was removed from HTML
              return null;
            }

            const currentSrc = (img as HTMLImageElement).src;
            if (currentSrc !== imgData.selectedImage) {
              // URL was changed, try to find its index in the images array
              const newIndex = imgData.images.indexOf(currentSrc);
              return {
                ...imgData,
                selectedImage: currentSrc,
                selectedIndex: newIndex >= 0 ? newIndex : imgData.selectedIndex
              };
            }

            return imgData;
          }).filter(Boolean); // Remove null entries (deleted images)
        }

        return { ...r, response: content, imageData: syncedImageData };
      });

      const finalResponse = newResults.length ? newResults[newResults.length - 1].response : item.finalResponse;
      return { ...item, results: newResults, finalResponse };
    }));
  };

  const handleRerunStep = async (itemId: string, stepIndex: number) => {
    if (isProcessing) {
      alert('Đang xử lý queue, vui lòng dừng trước khi chạy lại bước.');
      return;
    }
    const item = queue.find(i => i.id === itemId);
    if (!item) return;
    const step = config.steps[stepIndex];
    if (!step) return;

    const stepRes = item.results.find(r => r.stepId === step.id);
    if (!stepRes || !stepRes.url) {
      alert('Không tìm thấy URL lịch sử của bước này. Không thể chạy lại.');
      return;
    }
    let stepUrl = stepRes.url;
    let previousResult = '';
    if (stepIndex > 0) {
      const prevStep = config.steps[stepIndex - 1];
      const prevRes = item.results.find(r => r.stepId === prevStep.id);
      previousResult = prevRes?.response || '';
    }

    // Replace input variables - check for mappedInputs first
    let promptToSend = step.template;

    if (item.mappedInputs) {
      // If we have mappedInputs, replace all input variables
      Object.keys(item.mappedInputs).forEach(inputVar => {
        const value = item.mappedInputs![inputVar] || '';
        const regex = new RegExp(`\\{\\{${inputVar}\\}\\}`, 'g');
        promptToSend = promptToSend.replace(regex, value);
      });
    } else {
      // Fallback to original behavior for manual input
      promptToSend = promptToSend.replace(/\{\{input\}\}/g, item.originalPrompt);
    }

    promptToSend = promptToSend.replace(/\{\{prev\}\}/g, previousResult);
    for (let prevIdx = 0; prevIdx < stepIndex; prevIdx++) {
      const prevStep = config.steps[prevIdx];
      const prevResAny = item.results.find(r => r.stepId === prevStep.id);
      const prevResult = prevResAny?.response || '';
      const prevVar = `{{prev${prevIdx + 1}}}`;
      const rx = new RegExp(prevVar.replace(/[{}]/g, '\\$&'), 'g');
      promptToSend = promptToSend.replace(rx, prevResult);
    }

    if (mode !== 'ELECTRON' || !window.electronAPI) {
      alert('Chạy lại bước chỉ hỗ trợ trong Desktop App');
      return;
    }

    try {
      setRerunningStep({ itemId, stepId: step.id });
      const res = await window.electronAPI.runAutomation({
        url: stepUrl,
        selectors: step.selectors || {},
        useCustomSelectors: !!step.useCustomSelectors,
        prompt: promptToSend,
        headless
      });
      if (res.error) {
        setRerunningStep(null);
        alert('Lỗi chạy lại: ' + res.error);
        return;
      }
      let newResponse = res.text || '';
      stepUrl = res.url || stepUrl;

      // Process image generation if step has imageConfig enabled
      let imageData: any[] = [];
      if (step.imageConfig?.enabled) {
        // Check if we have existing imageData from previous run
        const existingImageData = stepRes.imageData;

        if (existingImageData && existingImageData.length > 0) {
          // Reuse existing images instead of searching again
          appendLog(itemId, `[IMAGE] Tái sử dụng ${existingImageData.length} ảnh từ lần chạy trước`);

          // Parse shortcodes from new response
          const shortcodePairs = parseImageShortcodes(newResponse);

          if (shortcodePairs.length === existingImageData.length) {
            // Same number of shortcodes - reuse images
            let updatedResponse = newResponse;
            shortcodePairs.forEach((pair, index) => {
              const existingImg = existingImageData[index];
              const altText = existingImg.contextParagraph?.substring(0, 100) || pair.contextParagraph.substring(0, 100);
              const imgTag = `<div style="text-align: center; margin: 1.5em 0;"><img src="${existingImg.selectedImage}" alt="${altText}" class="auto-generated-image" data-image-idx="${index}" style="max-width: 100%; height: auto; display: inline-block;" /></div>`;
              updatedResponse = updatedResponse.replace(pair.shortcode, imgTag);
            });
            newResponse = updatedResponse;
            imageData = existingImageData;
            appendLog(itemId, `[IMAGE] Đã tái sử dụng ảnh thành công`);
          } else {
            // Different number of shortcodes - search for new images
            appendLog(itemId, `[IMAGE] Số lượng shortcode thay đổi (${shortcodePairs.length} vs ${existingImageData.length}), tìm ảnh mới...`);
            const imageResult = await processImageGeneration(newResponse, step, itemId);
            newResponse = imageResult.updatedResponse;
            imageData = imageResult.imageData;
          }
        } else {
          // No existing images - process normally
          const imageResult = await processImageGeneration(newResponse, step, itemId);
          newResponse = imageResult.updatedResponse;
          imageData = imageResult.imageData;
        }
      }

      setRerunningStep(null);

      setQueue(prev => prev.map(q => {
        if (q.id !== itemId) return q;
        const existingIndex = (q.results || []).findIndex(r => r.stepId === step.id);
        const newResult: StepResult = {
          stepId: step.id,
          stepName: step.name,
          prompt: promptToSend,
          response: newResponse,
          timestamp: Date.now(),
          url: stepUrl,
          imageData: imageData.length > 0 ? imageData : undefined
        };
        let newResults: StepResult[];
        if (existingIndex >= 0) {
          newResults = [...q.results];
          newResults[existingIndex] = newResult;
        } else {
          newResults = [...q.results, newResult];
        }
        const finalResponse = newResults.length ? newResults[newResults.length - 1].response : q.finalResponse;
        return { ...q, results: newResults, finalResponse };
      }));
    } catch (e: any) {
      setRerunningStep(null);
      alert('Lỗi chạy lại: ' + e.message);
    }
  };

  const appendLog = (id: string, message: string) => {
     setQueue(prev => prev.map(item => {
        if (item.id !== id) return item;
        return { ...item, logs: [...(item.logs || []), `[${new Date().toLocaleTimeString()}] ${message}`] };
     }));
  };

  // --- Workflow / Step Management ---
  const handleAddStep = () => {
    const newStep: WorkflowStep = {
      id: generateId(),
      name: `Bước ${config.steps.length + 1}`,
      url: "https://chatgpt.com/",
      template: config.steps.length === 0 ? "{{input}}" : "Xử lý kết quả: {{prev}}",
      useCustomSelectors: false, // Default to auto-detect
      selectors: { input: "", submit: "", output: "" }
    };
    setConfig(prev => ({ ...prev, steps: [...prev.steps, newStep] }));
    setExpandedStepId(newStep.id);
  };

  const handleRemoveStep = (stepId: string) => {
    if (config.steps.length <= 1) return alert("Cần ít nhất 1 bước.");
    setConfig(prev => ({ ...prev, steps: prev.steps.filter(s => s.id !== stepId) }));
  };

  const handleUpdateStep = (stepId: string, field: keyof WorkflowStep, value: string) => {
    setConfig(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === stepId ? { ...s, [field]: value } : s)
    }));
  };

  const handleUpdateStepSelector = (stepId: string, selectorField: 'input' | 'submit' | 'output', value: string) => {
    setConfig(prev => ({
      ...prev,
      steps: prev.steps.map(s => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          selectors: {
            ...(s.selectors || {}), // Ensure selectors exists
            [selectorField]: value
          }
        };
      })
    }));
  };

  const handleToggleImageConfig = (stepId: string) => {
    setConfig(prev => ({
      ...prev,
      steps: prev.steps.map(s => {
        if (s.id !== stepId) return s;
        if (!s.imageConfig) {
          // Enable image config with defaults
          return {
            ...s,
            imageConfig: {
              enabled: true,
              count: 3,
              autoInsert: true,
              source: 'perplexity' as const
            }
          };
        } else {
          // Toggle enabled state
          return {
            ...s,
            imageConfig: {
              ...s.imageConfig,
              enabled: !s.imageConfig.enabled
            }
          };
        }
      })
    }));
  };

  const handleUpdateImageConfig = (stepId: string, field: 'count' | 'autoInsert' | 'source', value: number | boolean | string) => {
    setConfig(prev => ({
      ...prev,
      steps: prev.steps.map(s => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          imageConfig: {
            ...(s.imageConfig || { enabled: false, count: 3, autoInsert: true, source: 'perplexity' as const }),
            [field]: value
          }
        };
      })
    }));
  };

  const handleCloseDetailPanel = () => {
    setIsDetailPanelClosing(true);
    setTimeout(() => {
      setSelectedItemId(null);
      setIsDetailPanelClosing(false);
    }, 200); // Match animation duration
  };

  const handleSelectImage = (newImageUrl: string, newIndex: number) => {
    if (!imageGallery) return;

    const { itemId, stepId, imageIndex } = imageGallery;

    setQueue(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      return {
        ...item,
        results: item.results.map(result => {
          if (result.stepId !== stepId || !result.imageData) return result;

          const updatedImageData = result.imageData.map((imgData: any, idx: number) => {
            if (idx !== imageIndex) return imgData;

            // Update selected image
            return {
              ...imgData,
              selectedImage: newImageUrl,
              selectedIndex: newIndex
            };
          });

          // Update response HTML to replace image using data-image-idx attribute
          let updatedResponse = result.response;

          // Parse HTML and find the image with matching data-image-idx
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = updatedResponse;
          const targetImg = tempDiv.querySelector(`img[data-image-idx="${imageIndex}"]`);

          if (targetImg) {
            // Update the src attribute
            targetImg.setAttribute('src', newImageUrl);
            updatedResponse = tempDiv.innerHTML;
          } else {
            // Fallback: try to find by old URL if data attribute is missing
            const oldImageData = result.imageData[imageIndex];
            if (oldImageData) {
              const escapedOldUrl = oldImageData.selectedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const imgTagRegex = new RegExp(`<img\\s+src="${escapedOldUrl}"([^>]*)>`, 'g');
              updatedResponse = updatedResponse.replace(imgTagRegex, `<img src="${newImageUrl}"$1>`);
            }
          }

          return {
            ...result,
            imageData: updatedImageData,
            response: updatedResponse
          };
        })
      };
    }));

    setImageGallery(null);
  };

  const handlePickSelector = async (stepId: string, selectorField: 'input' | 'submit' | 'output') => {
    if (!window.electronAPI) {
      alert('Visual selector picker chỉ hoạt động trong Desktop App mode');
      return;
    }

    const step = config.steps.find(s => s.id === stepId);
    if (!step || !step.url) {
      alert('Vui lòng nhập URL cho bước này trước');
      return;
    }

    try {
      console.log('[DEBUG] Opening selector picker for:', step.url);
      const result = await window.electronAPI.pickSelector(step.url);
      console.log('[DEBUG] Picker result:', result);

      if (result.success && result.selector) {
        console.log('[DEBUG] Setting selector:', selectorField, '=', result.selector);
        handleUpdateStepSelector(stepId, selectorField, result.selector);
        console.log('[DEBUG] Selector updated successfully');
      } else {
        console.log('[DEBUG] No selector returned or picker cancelled');
      }
    } catch (err: any) {
      console.error('[DEBUG] Pick selector error:', err);
      alert('Lỗi: ' + err.message);
    }
  };

  const handleToggleCustomSelectors = (stepId: string) => {
    setConfig(prev => ({
      ...prev,
      steps: prev.steps.map(s =>
        s.id === stepId
          ? { ...s, useCustomSelectors: !s.useCustomSelectors }
          : s
      )
    }));
  };

  // --- Agent Management ---
  const handleSaveAgent = (saveAsNew = false, workflowId?: string) => {
    // Update existing workflow by ID
    if (workflowId && !saveAsNew) {
      console.log('[HANDLE_SAVE] Updating workflow:', workflowId);
      setSavedAgents(prev => prev.map(agent =>
        agent.id === workflowId
          ? { ...agent, config: { ...config }, automationConfig: { ...automationConfig } }
          : agent
      ));
      setCurrentWorkflowId(workflowId);
      return;
    }

    // Create new workflow
    if (!agentNameInput.trim()) return;

    const newAgent: SavedAgent = {
      id: generateId(),
      name: agentNameInput,
      config: { ...config },
      automationConfig: { ...automationConfig }
    };
    setSavedAgents(prev => [...prev, newAgent]);
    setCurrentWorkflowId(newAgent.id);
    setAgentNameInput("");
    setShowSaveAgent(false);
  };

  const handleRenameWorkflow = () => {
    if (!renameInput.trim() || !renameWorkflowId) return;

    setSavedAgents(prev => prev.map(agent =>
      agent.id === renameWorkflowId
        ? { ...agent, name: renameInput }
        : agent
    ));

    // Update current workflow ID if renaming the currently loaded workflow
    if (currentWorkflowId === renameWorkflowId) {
      // Workflow name updated, currentWorkflowId stays the same (ID doesn't change)
    }

    setShowRenameDialog(false);
    setRenameWorkflowId(null);
    setRenameInput("");
  };

  const handleLoadAgent = (agentId: string) => {
    const agent = savedAgents.find(a => a.id === agentId);
    if (agent) {
      setConfig(agent.config);
      if (agent.automationConfig) setAutomationConfig(agent.automationConfig);
      if (agent.config.steps.length > 0) setExpandedStepId(agent.config.steps[0].id);
      setCurrentWorkflowId(agentId);
    }
  };

  const handleDeselectWorkflow = () => {
    setCurrentWorkflowId(null);
    setAgentNameInput("");
    setConfig(DEFAULT_CONFIG);
    setAutomationConfig(DEFAULT_AUTOMATION);
    if (DEFAULT_CONFIG.steps.length > 0) setExpandedStepId(DEFAULT_CONFIG.steps[0].id);
  };

  const handleDeleteAgent = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Xóa workflow này?")) {
      setSavedAgents(prev => prev.filter(a => a.id !== agentId));
      // If deleting the currently loaded workflow, clear the current workflow ID
      if (currentWorkflowId === agentId) {
        setCurrentWorkflowId(null);
        setAgentNameInput("");
      }
    }
  };

  // --- EXTENSION EXECUTION LOGIC ---
  const runExtensionStep = async (step: WorkflowStep, prompt: string, appendLog: (msg: string) => void): Promise<{ text: string; url: string }> => {
    return new Promise((resolve, reject) => {
      if (!chrome.tabs || !chrome.scripting) {
        reject(new Error("Chrome Extension APIs not available"));
        return;
      }

      appendLog(`[EXT] Mở tab: ${step.url}`);
      
      chrome.tabs.create({ url: step.url, active: true }, (tab: any) => {
        if (!tab.id) {
          reject(new Error("Failed to create tab"));
          return;
        }

        const onUpdated = (tabId: number, changeInfo: any) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            appendLog(`[EXT] Tab đã load. Chuẩn bị điền form...`);
            setTimeout(() => {
                executeAutomationScript(tab.id!, step, prompt);
            }, 3000);
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
      });

      const executeAutomationScript = (tabId: number, step: WorkflowStep, promptText: string) => {
         const inp = step.selectors?.input || automationConfig.inputSelector;
         const sub = step.selectors?.submit || automationConfig.submitSelector;
         const out = step.selectors?.output || automationConfig.outputSelector;

         if (!inp) {
            reject(new Error("Chưa cấu hình Input Selector"));
            return;
         }

         chrome.scripting.executeScript({
            target: { tabId },
            func: (sInp: string, sSub: string, sOut: string, text: string) => {
                return new Promise((resolveScript) => {
                    const inputEl = document.querySelector(sInp) as HTMLTextAreaElement | HTMLInputElement;
                    if (!inputEl) {
                        resolveScript({ error: `Không tìm thấy ô nhập: ${sInp}` });
                        return;
                    }
                    inputEl.focus();
                    inputEl.value = text;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

                    setTimeout(() => {
                        if (sSub) {
                            const btn = document.querySelector(sSub) as HTMLElement;
                            if (btn) btn.click();
                            else {
                                const enterEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13 });
                                inputEl.dispatchEvent(enterEvent);
                            }
                        } else {
                             const enterEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13 });
                            inputEl.dispatchEvent(enterEvent);
                        }

                        let attempts = 0;
                        const maxAttempts = 20;
                        const interval = setInterval(() => {
                            attempts++;
                            const outEls = document.querySelectorAll(sOut);
                            if (outEls.length > 0 && attempts > 3) {
                                let targetEl = outEls[outEls.length - 1] as HTMLElement;
                                const urlLower = (window.location.href || '').toLowerCase();
                                if (urlLower.includes('chatgpt.com') || urlLower.includes('chat.openai.com')) {
                                   // Prefer the markdown of the last assistant message
                                   const assistantMessages = document.querySelectorAll('div[data-message-author-role="assistant"]');
                                   if (assistantMessages.length > 0) {
                                     const lastAssistantMsg = assistantMessages[assistantMessages.length - 1] as HTMLElement;
                                     const markdownEl = lastAssistantMsg.querySelector('.markdown') as HTMLElement | null;
                                     if (markdownEl) targetEl = markdownEl;
                                   } else {
                                     const inner = targetEl.querySelector('div[data-message-author-role="assistant"] .markdown, .markdown') as HTMLElement | null;
                                     if (inner) targetEl = inner;
                                   }
                                }
                                const extractContent = (root: HTMLElement) => {
                                  // If content is in a code block, extract text and wrap in clean pre/code
                                  const codeEl = root.querySelector('pre code, code') as HTMLElement | null;
                                  if (codeEl) {
                                    const textContent = codeEl.textContent || codeEl.innerText || '';
                                    // Only use code content if it's substantial
                                    if (textContent.trim().length > 20) {
                                      // Escape HTML entities and return as clean structure
                                      const escaped = textContent
                                        .replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;')
                                        .replace(/"/g, '&quot;')
                                        .replace(/'/g, '&#039;');
                                      return `<pre><code>${escaped}</code></pre>`;
                                    }
                                  }

                                  // Otherwise extract HTML, removing UI elements
                                  const clone = root.cloneNode(true) as HTMLElement;
                                  // Remove only UI elements (buttons, icons, copy toolbars), keep content divs
                                  clone.querySelectorAll('[aria-label="Copy"], [aria-label="Sao chép"], button, svg, div.sticky').forEach(el => el.remove());

                                  // Clean up ChatGPT-style pre blocks: extract code directly
                                  clone.querySelectorAll('pre').forEach(pre => {
                                    const codeEl = pre.querySelector('code');
                                    if (codeEl && codeEl.innerHTML && codeEl.innerHTML.trim().length > 0) {
                                      // Create new clean pre with only code content
                                      const newPre = document.createElement('pre');
                                      const newCode = document.createElement('code');
                                      newCode.innerHTML = codeEl.innerHTML;
                                      newPre.appendChild(newCode);
                                      if (pre.parentNode) {
                                        pre.parentNode.replaceChild(newPre, pre);
                                      }
                                    } else {
                                      // If no code element found or empty, extract text content
                                      const textContent = pre.textContent || '';
                                      if (textContent.trim().length > 0) {
                                        const newPre = document.createElement('pre');
                                        const newCode = document.createElement('code');
                                        newCode.textContent = textContent.trim();
                                        newPre.appendChild(newCode);
                                        if (pre.parentNode) {
                                          pre.parentNode.replaceChild(newPre, pre);
                                        }
                                      }
                                    }
                                  });

                                  // Clean all HTML attributes except href for links
                                  const allElements = clone.querySelectorAll('*');
                                  allElements.forEach(element => {
                                    const attrs = Array.from(element.attributes).map(attr => attr.name);
                                    attrs.forEach(attrName => {
                                      if (element.tagName.toLowerCase() === 'a' && attrName === 'href') {
                                        return; // Keep href for links
                                      }
                                      element.removeAttribute(attrName);
                                    });
                                  });

                                  const html = clone.innerHTML || '';
                                  if (html && html.trim().length > 0) return html;

                                  // Fallback to text
                                  const text = root.innerText || root.textContent || '';
                                  return text;
                                };
                                const innerHtml = extractContent(targetEl);
                                if (innerHtml.length > 5) {
                                    clearInterval(interval);
                                    resolveScript({ success: true, text: innerHtml, url: window.location.href });
                                }
                            }
                            if (attempts >= maxAttempts) {
                                clearInterval(interval);
                                let lastEl = outEls[outEls.length - 1] as HTMLElement;
                                resolveScript({ 
                                    success: true, 
                                    text: lastEl ? lastEl.innerHTML : "Timeout: Không tìm thấy kết quả",
                                    url: window.location.href
                                });
                            }
                        }, 1500);
                    }, 500);
                });
            },
            args: [inp, sub, out, promptText]
         }, (injectionResults: any[]) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            const result = injectionResults[0].result as any;
            if (result.error) reject(new Error(result.error));
            else resolve({ text: result.text, url: result.url || step.url || '' });
         });
      };
    });
  };

  // --- IMAGE GENERATION HELPERS ---

  // Parse HTML/text to find image shortcodes and extract context paragraph
  const parseImageShortcodes = (content: string): Array<{ shortcode: string; contextParagraph: string }> => {
    const shortcodeRegex = /\[image(\d+)\]/g;
    const matches: Array<{ shortcode: string; contextParagraph: string }> = [];

    // Find all shortcodes
    const shortcodes = Array.from(content.matchAll(shortcodeRegex));

    for (const match of shortcodes) {
      const shortcode = match[0]; // e.g., [image1]
      const position = match.index || 0;

      // Extract text before the shortcode to find paragraph
      const textBefore = content.substring(0, position);

      // Split by common paragraph separators
      const paragraphs = textBefore.split(/\n\n|\n|<\/p>|<br\s*\/?>|<\/div>/);

      // Get the last non-empty paragraph
      let contextParagraph = '';
      for (let i = paragraphs.length - 1; i >= 0; i--) {
        const p = paragraphs[i].replace(/<[^>]+>/g, '').trim(); // Strip HTML tags
        if (p.length > 20) { // Minimum length for meaningful context
          contextParagraph = p;
          break;
        }
      }

      // Fallback: if no paragraph found, take last 200 chars
      if (!contextParagraph) {
        contextParagraph = textBefore.replace(/<[^>]+>/g, '').trim().slice(-200);
      }

      matches.push({ shortcode, contextParagraph });
    }

    return matches;
  };

  // Search images from Perplexity based on context
  const searchImagesForContext = async (context: string, itemId: string, conversationUrl?: string): Promise<{ images: string[]; conversationUrl?: string }> => {
    // Check if user stopped the queue
    if (stopRef.current) {
      appendLog(itemId, '[IMAGE] Bỏ qua tìm ảnh do người dùng dừng queue');
      return { images: [] };
    }

    if (mode !== 'ELECTRON' || !window.electronAPI) {
      appendLog(itemId, '[IMAGE] Chỉ hỗ trợ tìm ảnh trong Desktop mode');
      return { images: [] };
    }

    try {
      const query = `Dựa vào nội dung: ${context.substring(0, 200)}. Tìm ảnh không có watermark, ảnh chất lượng cao, ảnh người việt hoặc châu á`;

      if (conversationUrl) {
        appendLog(itemId, `[IMAGE] Tìm ảnh trên Perplexity (reusing conversation)...`);
      } else {
        appendLog(itemId, `[IMAGE] Tìm ảnh trên Perplexity (new conversation)...`);
      }

      const result = await window.electronAPI.searchPerplexityImages({
        query,
        headless,
        conversationUrl
      });

      if (result.error) {
        appendLog(itemId, `[IMAGE ERROR] ${result.error}`);
        return { images: [] };
      }

      appendLog(itemId, `[IMAGE] Tìm thấy ${result.images?.length || 0} ảnh`);
      return {
        images: result.images || [],
        conversationUrl: result.conversationUrl
      };
    } catch (err: any) {
      appendLog(itemId, `[IMAGE ERROR] ${err.message}`);
      return { images: [] };
    }
  };

  // Process image generation for a step
  const processImageGeneration = async (
    stepResponse: string,
    step: WorkflowStep,
    itemId: string
  ): Promise<{ updatedResponse: string; imageData: any[] }> => {
    if (!step.imageConfig?.enabled) {
      return { updatedResponse: stepResponse, imageData: [] };
    }

    appendLog(itemId, `[IMAGE] Bắt đầu xử lý ${step.imageConfig.count} ảnh...`);

    // Parse shortcodes from response
    const shortcodePairs = parseImageShortcodes(stepResponse);

    if (shortcodePairs.length === 0) {
      appendLog(itemId, '[IMAGE] Không tìm thấy shortcode ảnh trong response');
      return { updatedResponse: stepResponse, imageData: [] };
    }

    appendLog(itemId, `[IMAGE] Tìm thấy ${shortcodePairs.length} shortcode`);

    const imageData: any[] = [];
    let updatedResponse = stepResponse;
    let conversationUrl: string | undefined;

    // Process each shortcode
    for (const { shortcode, contextParagraph } of shortcodePairs) {
      // Check if user stopped the queue
      if (stopRef.current) {
        appendLog(itemId, `[IMAGE] Dừng xử lý ảnh do người dùng dừng queue`);
        break;
      }

      appendLog(itemId, `[IMAGE] Xử lý ${shortcode}...`);

      // Search images based on context, reusing conversation URL if available
      const searchResult = await searchImagesForContext(contextParagraph, itemId, conversationUrl);
      const images = searchResult.images;

      // Update conversation URL for next iteration
      if (searchResult.conversationUrl) {
        conversationUrl = searchResult.conversationUrl;
      }

      if (images.length === 0) {
        appendLog(itemId, `[IMAGE] Không tìm thấy ảnh cho ${shortcode}`);
        continue;
      }

      // Random select one image
      const randomIndex = Math.floor(Math.random() * images.length);
      const selectedImage = images[randomIndex];

      // Replace shortcode with centered image tag
      // Use contextParagraph for alt text (truncated to 100 chars for better alt text)
      const altText = contextParagraph.substring(0, 100).trim();
      const imageIndex = imageData.length; // Current index before pushing
      const imgTag = `<div style="text-align: center; margin: 1.5em 0;"><img src="${selectedImage}" alt="${altText}" class="auto-generated-image" data-image-idx="${imageIndex}" style="max-width: 100%; height: auto; display: inline-block;" /></div>`;
      updatedResponse = updatedResponse.replace(shortcode, imgTag);

      // Save image data
      imageData.push({
        shortcode,
        contextParagraph: contextParagraph.substring(0, 200),
        searchQuery: `Dựa vào nội dung: ${contextParagraph.substring(0, 100)}...`,
        images,
        selectedImage,
        selectedIndex: randomIndex
      });

      appendLog(itemId, `[IMAGE] Đã thay ${shortcode} bằng ảnh (${randomIndex + 1}/${images.length})`);
    }

    return { updatedResponse, imageData };
  };

  // --- PROCESSING LOGIC ---
  const processQueue = useCallback(async (selectedIds?: Set<string>) => {
    if (processingRef.current) return;

    setIsProcessing(true);
    processingRef.current = true;
    stopRef.current = false;

    const idsToProcess = queue
      .filter(item => {
        // If selectedIds is provided, only process items in the selection
        if (selectedIds) {
          return selectedIds.has(item.id) && item.status !== Status.COMPLETED;
        }
        // Otherwise, process all non-completed items
        return item.status !== Status.COMPLETED;
      })
      .map(item => item.id);

    const totalSteps = idsToProcess.length * config.steps.length;
    let completedStepsTotal = 0; 

    for (const id of idsToProcess) {
      if (stopRef.current) break;

      let currentItem = queue.find(i => i.id === id);
      if (!currentItem) continue;

      updateItemStatus(id, { status: Status.RUNNING, startTime: Date.now() });

      let startIndex = currentItem.currentStepIndex || 0;
      let previousResult = startIndex > 0 && currentItem.results[startIndex - 1]
        ? currentItem.results[startIndex - 1].response
        : "";

      // Track results locally for template variable replacement
      const localResults: StepResult[] = [...currentItem.results];

      try {
        for (let i = startIndex; i < config.steps.length; i++) {
          if (stopRef.current) break;

          const step = config.steps[i];
          let stepUrl = step.url || automationConfig.defaultUrl;
          appendLog(id, `Đang chạy: ${step.name}...`);

          // Replace input variables - check for mappedInputs first
          let promptToSend = step.template;

          if (currentItem.mappedInputs) {
            // If we have mappedInputs, replace all input variables
            Object.keys(currentItem.mappedInputs).forEach(inputVar => {
              const value = currentItem.mappedInputs![inputVar] || '';
              const regex = new RegExp(`\\{\\{${inputVar}\\}\\}`, 'g');
              promptToSend = promptToSend.replace(regex, value);
            });
          } else {
            // Fallback to original behavior for manual input
            promptToSend = promptToSend.replace(/\{\{input\}\}/g, currentItem.originalPrompt);
          }

          // Replace {{prev}} and {{prev1}}, {{prev2}}, etc.
          promptToSend = promptToSend.replace(/\{\{prev\}\}/g, previousResult);

          for (let prevIdx = 0; prevIdx < i; prevIdx++) {
            const prevResult = localResults[prevIdx]?.response || '';
            const prevVar = `{{prev${prevIdx + 1}}}`;
            promptToSend = promptToSend.replace(new RegExp(prevVar.replace(/[{}]/g, '\\$&'), 'g'), prevResult);
          }

          // Append hidden prompt for image shortcodes if imageConfig is enabled
          if (step.imageConfig?.enabled && step.imageConfig?.autoInsert) {
            const imageCount = step.imageConfig.count || 3;
            const hiddenPrompt = `\n\n[INSTRUCTION] Chèn ${imageCount} vị trí ảnh vào bài viết bằng cách sử dụng các shortcode theo định dạng [image1], [image2], [image3], v.v. Mỗi shortcode phải ở riêng một dòng. Đừng thêm text giải thích về shortcode, chỉ thêm shortcode vào vị trí phù hợp trong bài.`;
            promptToSend += hiddenPrompt;
            appendLog(id, `[IMAGE] Đã thêm prompt ẩn để chèn ${imageCount} shortcode ảnh`);
          }

          const urlVarMatches = Array.from((step.url || '').matchAll(/\{\{url_prev(\d*)\}\}/g));
          if (urlVarMatches.length > 0) {
            const m = urlVarMatches[0];
            const idxStr = m[1];
            let targetIndex = typeof idxStr === 'string' && idxStr.length > 0 ? parseInt(idxStr, 10) - 1 : i - 1;
            if (targetIndex < 0) targetIndex = 0;
            const targetStep = config.steps[targetIndex];
            const targetRes = currentItem.results.find(r => r.stepId === targetStep.id) || localResults[targetIndex];
            const targetUrl = targetRes?.url || '';
            if (!targetUrl) {
              throw new Error('Không tìm thấy URL lịch sử phù hợp để sử dụng cho bước này');
            }
            // Nếu URL field chứa nhiều biến, thay thế tất cả biến bằng URL tương ứng
            let resolvedUrl = step.url || '';
            resolvedUrl = resolvedUrl.replace(/\{\{url_prev\}\}/g, i > 0 ? (currentItem.results.find(r => r.stepId === config.steps[i - 1].id)?.url || localResults[i - 1]?.url || '') : '');
            for (let prevIdx = 0; prevIdx < i; prevIdx++) {
              const prevVar = `{{url_prev${prevIdx + 1}}}`;
              const prevStep = config.steps[prevIdx];
              const prevRes = currentItem.results.find(r => r.stepId === prevStep.id) || localResults[prevIdx];
              const prevUrl = prevRes?.url || '';
              resolvedUrl = resolvedUrl.replace(new RegExp(prevVar.replace(/[{}]/g, '\\$&'), 'g'), prevUrl);
            }
            stepUrl = resolvedUrl || targetUrl;
            if (!stepUrl) {
              throw new Error('Không thể xác định URL từ biến đã cung cấp trong bước này');
            }
          }

          // Log the actual prompt being sent
          appendLog(id, `Prompt gửi đi: ${promptToSend.substring(0, 100)}${promptToSend.length > 100 ? '...' : ''}`);

          let stepResponse = "";

          if (mode === 'ELECTRON') {
             // --- ELECTRON MODE ---
             const modeMsg = headless ? "chạy ẩn" : "chạy nổi";
             appendLog(id, `[DESKTOP] Truy cập (${modeMsg}): ${stepUrl}`);
             if (!window.electronAPI) throw new Error("Electron API not initialized");

             const result = await window.electronAPI.runAutomation({
                url: stepUrl,
                selectors: {
                  input: step.selectors?.input || automationConfig.inputSelector,
                  submit: step.selectors?.submit || automationConfig.submitSelector,
                  output: step.selectors?.output || automationConfig.outputSelector,
                },
                useCustomSelectors: step.useCustomSelectors || false,
                prompt: promptToSend,
                headless: headless // Pass current headless state
             });
             
             if (result.error) throw new Error(result.error);
             stepResponse = result.text || "";
             // Use the actual URL after generation if provided
             stepUrl = result.url || stepUrl;
             appendLog(id, `[DESKTOP] Nhận kết quả: ${stepResponse.substring(0, 30)}...`);

          } else if (mode === 'EXTENSION') {
             // --- EXTENSION MODE ---
             try {
                const extRes = await runExtensionStep(step, promptToSend, (msg) => appendLog(id, msg));
                stepResponse = extRes.text || "";
                stepUrl = extRes.url || stepUrl;
                appendLog(id, `[EXT] Kết quả nhận được: ${stepResponse.substring(0, 50)}...`);
             } catch (e: any) {
                 appendLog(id, `[EXT ERROR] ${e.message}`);
                 throw e;
             }
          } else if (mode === 'BROWSER') {
             // --- SIMULATION (MOCK) ---
             appendLog(id, `[SIMULATION] Truy cập: ${stepUrl}`);
             appendLog(id, `[SIMULATION] Điền prompt: ${promptToSend.substring(0, 30)}...`);
             await new Promise(r => setTimeout(r, 1500)); 
             stepResponse = await generateContent(promptToSend, config);
          } else {
             // --- DIRECT API ---
             stepResponse = await generateContent(promptToSend, config);
          }

          // Normalize Claude output (auto-detect type 1 or 2)
          stepResponse = normalizeClaudeContent(stepResponse);

          // Process image generation if enabled
          let imageData: any[] = [];
          if (step.imageConfig?.enabled && !stopRef.current) {
            const imageResult = await processImageGeneration(stepResponse, step, id);
            stepResponse = imageResult.updatedResponse;
            imageData = imageResult.imageData;
          } else if (step.imageConfig?.enabled && stopRef.current) {
            appendLog(id, '[IMAGE] Bỏ qua xử lý ảnh do người dùng dừng queue');
          }

          previousResult = stepResponse;

          const resultEntry: StepResult = {
            stepId: step.id,
            stepName: step.name,
            prompt: promptToSend,
            response: stepResponse,
            timestamp: Date.now(),
            url: stepUrl,
            imageData: imageData.length > 0 ? imageData : undefined
          };

          // Update local results array for next iteration's template variables
          localResults[i] = resultEntry;

          setQueue(prev => prev.map(item => {
            if (item.id !== id) return item;
            const newResults = [...item.results];
            newResults[i] = resultEntry;
            return {
              ...item,
              currentStepIndex: i + 1,
              results: newResults,
              finalResponse: i === config.steps.length - 1 ? stepResponse : undefined
            };
          }));

          completedStepsTotal++;
          if (config.delayMs > 0) await new Promise(r => setTimeout(r, config.delayMs));
        }

        if (!stopRef.current) {
          const endTime = Date.now();
          const elapsedSeconds = currentItem.startTime ? ((endTime - currentItem.startTime) / 1000).toFixed(1) : '?';
          updateItemStatus(id, { status: Status.COMPLETED, endTime });
          appendLog(id, `Hoàn tất quy trình. (Thời gian: ${elapsedSeconds}s)`);
        }

      } catch (err: any) {
        appendLog(id, `LỖI: ${err.message}`);
        updateItemStatus(id, { status: Status.FAILED, error: err.message, endTime: Date.now() });
      }
      setProgress(Math.min(100, Math.round((completedStepsTotal / totalSteps) * 100)));
    }

    setIsProcessing(false);
    processingRef.current = false;
  }, [queue, config, mode, automationConfig, headless]);

  const handleStop = async () => {
    stopRef.current = true;
    setIsProcessing(false);
    processingRef.current = false;

    // Update status of currently running items to FAILED
    setQueue(prev => prev.map(item => {
      if (item.status === Status.RUNNING) {
        return {
          ...item,
          status: Status.FAILED,
          error: 'Đã dừng bởi người dùng'
        };
      }
      return item;
    }));

    // If running in Electron, stop the worker window
    if (mode === 'ELECTRON' && window.electronAPI) {
      try {
        await window.electronAPI.stopAutomation();
        console.log('Automation stopped');
      } catch (err) {
        console.error('Failed to stop automation:', err);
      }
    }
  };

  const handleExportCSV = () => {
    const stepHeaders = config.steps.map(s => s.name);
    const headers = ["ID", "Original Input", ...stepHeaders, "Status"];
    const csvContent = [
      headers.join(","),
      ...queue.map(item => {
        const stepOutputs = config.steps.map((s, idx) => {
          const res = item.results[idx]?.response || "";
          return `"${res.replace(/"/g, '""')}"`;
        });
        const row = [item.id, `"${item.originalPrompt.replace(/"/g, '""')}"`, ...stepOutputs, item.status];
        return row.join(",");
      })
    ].join("\n");

    // Add UTF-8 BOM for Vietnamese text support in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `workflow_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSelected = () => {
    if (selectedItemIds.size === 0) return;

    const selectedItems = queue.filter(item => selectedItemIds.has(item.id));
    const stepHeaders = config.steps.map(s => s.name);
    const headers = ["ID", "Original Input", ...stepHeaders, "Status"];
    const csvContent = [
      headers.join(","),
      ...selectedItems.map(item => {
        const stepOutputs = config.steps.map((s, idx) => {
          const res = item.results[idx]?.response || "";
          return `"${res.replace(/"/g, '""')}"`;
        });
        const row = [item.id, `"${item.originalPrompt.replace(/"/g, '""')}"`, ...stepOutputs, item.status];
        return row.join(",");
      })
    ].join("\n");

    // Add UTF-8 BOM for Vietnamese text support in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `workflow_export_selected_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter queue items by current workflow first for stats
  const workflowQueue = currentWorkflowId
    ? queue.filter(item => item.workflowId === currentWorkflowId)
    : queue; // Show all items when no workflow is selected

  const stats = {
    total: workflowQueue.length,
    completed: workflowQueue.filter(i => i.status === Status.COMPLETED).length,
    failed: workflowQueue.filter(i => i.status === Status.FAILED).length,
    queued: workflowQueue.filter(i => i.status === Status.QUEUED).length,
    processing: workflowQueue.filter(i => i.status === Status.RUNNING).length,
  };

  // Filter queue based on workflow, status and search text
  const filteredQueue = queue.filter(item => {
    // Filter by workflow - only when a workflow is selected
    // If currentWorkflowId is null (no workflow loaded), show all items
    if (currentWorkflowId && item.workflowId !== currentWorkflowId) {
      return false;
    }

    // Filter by status
    if (filterStatus !== 'all' && item.status.toLowerCase() !== filterStatus.toLowerCase()) {
      return false;
    }

    // Filter by search text (search in originalPrompt)
    if (searchText.trim() !== '' && !item.originalPrompt.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }

    return true;
  });

  // Calculate column widths dynamically based on number of steps
  const stepCount = config.steps.length;

  // Fixed columns: Checkbox (32px) + # (40px) + Status (96px) + Input (128-176px) + Arrow (40px)
  const inputColWidth = stepCount <= 2 ? 'w-44' : stepCount <= 4 ? 'w-36' : 'w-32'; // 176px, 144px, 128px
  const inputColWidthPx = stepCount <= 2 ? 176 : stepCount <= 4 ? 144 : 128;
  const inputColClamp = stepCount <= 2 ? 'line-clamp-3' : 'line-clamp-2';

  // Fixed columns total width
  const fixedColsWidth = 32 + 40 + 96 + inputColWidthPx + 40; // ~336-384px

  // Step columns: min-width depends on step count to ensure readability
  const getStepColMinWidth = () => {
    if (stepCount === 0) return 0;
    // When many columns, use smaller min-width but allow horizontal scroll
    return stepCount <= 2 ? 300 : stepCount <= 4 ? 250 : 220;
  };
  const stepColMinWidth = getStepColMinWidth();
  const stepColWidth = `min-w-[${stepColMinWidth}px]`;
  const stepColClamp = stepCount <= 2 ? 4 : stepCount <= 4 ? 3 : 3;

  // Calculate total table min-width to enable horizontal scroll
  const tableMinWidth = fixedColsWidth + (stepCount * stepColMinWidth);

  const selectedItem = queue.find(i => i.id === selectedItemId);

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden text-slate-800 font-sans">
      
      {/* --- HELP MODAL --- */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[85vh] flex flex-col overflow-hidden relative">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <HelpCircle className="w-6 h-6 mr-2 text-indigo-600" />
                    Hướng dẫn sử dụng
                 </h2>
                 <button onClick={() => setShowHelp(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shadow-sm">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
                <div className="space-y-8 max-w-4xl mx-auto">
                  {/* Giới thiệu */}
                  <section>
                    <h3 className="text-2xl font-bold text-slate-800 mb-3 flex items-center">
                      <Bot className="w-6 h-6 mr-2 text-indigo-600" />
                      Automation AI - Công cụ tự động hóa với ChatGPT
                    </h3>
                    <p className="text-slate-600 leading-relaxed">
                      Ứng dụng giúp bạn tự động hóa các tác vụ lặp đi lặp lại với AI. Bạn có thể tạo quy trình (workflow)
                      với nhiều bước, mỗi bước gửi prompt tới ChatGPT và lấy kết quả để xử lý tiếp.
                    </p>
                  </section>

                  {/* Bước 1: Cấu hình Workflow */}
                  <section className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-blue-900 mb-3 flex items-center">
                      <Settings className="w-5 h-5 mr-2" />
                      1. Cấu hình Workflow
                    </h4>

                    <div className="space-y-4 text-sm">
                      <div className="bg-white p-4 rounded-lg border border-blue-100">
                        <p className="font-semibold text-slate-800 mb-2">📝 Thêm bước (Step)</p>
                        <ul className="list-disc list-inside space-y-1 text-slate-600 ml-2">
                          <li>Click nút <strong>"+ Thêm"</strong> để thêm bước mới</li>
                          <li>Mỗi bước bao gồm: Tên, URL, Prompt template, và CSS selectors</li>
                          <li>Có thể có nhiều bước, kết quả bước trước truyền cho bước sau</li>
                        </ul>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-blue-100">
                        <p className="font-semibold text-slate-800 mb-2">🔗 Cấu hình URL và Selectors</p>
                        <ul className="list-disc list-inside space-y-1 text-slate-600 ml-2">
                          <li><strong>URL:</strong> Địa chỉ trang web (ví dụ: https://chatgpt.com/)</li>
                          <li><strong>Input Selector:</strong> CSS selector của ô nhập text (ví dụ: #prompt-textarea)</li>
                          <li><strong>Submit Selector:</strong> CSS selector của nút gửi (ví dụ: button[data-testid='send-button'])</li>
                          <li><strong>Output Selector:</strong> CSS selector của kết quả (ví dụ: .markdown)</li>
                          <li>Dùng nút <strong>"Pick"</strong> để chọn element trực quan (chỉ trong Desktop mode)</li>
                        </ul>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-blue-100">
                        <p className="font-semibold text-slate-800 mb-2">📄 Viết Prompt Template</p>
                        <ul className="list-disc list-inside space-y-1 text-slate-600 ml-2">
                          <li><strong>{`{{input}}`}</strong> - Dữ liệu gốc từ ô nhập batch</li>
                          <li><strong>{`{{prev}}`}</strong> - Kết quả từ bước ngay trước đó</li>
                          <li><strong>{`{{prev1}}, {{prev2}}`}</strong> - Kết quả từ bước 1, bước 2 cụ thể</li>
                          <li>Click vào các biến để tự động insert vào prompt</li>
                          <li>Ví dụ: "Phân tích {`{{input}}`} và đưa ra đề xuất: {`{{prev}}`}"</li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* Bước 2: Đăng nhập */}
                  <section className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-green-900 mb-3 flex items-center">
                      <UserCog className="w-5 h-5 mr-2" />
                      2. Đăng nhập ChatGPT (Desktop mode)
                    </h4>
                    <div className="space-y-2 text-sm text-green-800">
                      <p>Trước khi chạy automation, bạn cần đăng nhập ChatGPT để tránh bị gián đoạn:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Click nút <strong>"Mở cửa sổ đăng nhập"</strong> trong phần "Quản lý Đăng nhập"</li>
                        <li>Đăng nhập vào ChatGPT trong cửa sổ mới</li>
                        <li>Session sẽ được lưu tự động, chỉ cần đăng nhập 1 lần</li>
                        <li>Đóng cửa sổ sau khi đăng nhập xong</li>
                      </ul>
                    </div>
                  </section>

                  {/* Bước 3: Nhập dữ liệu */}
                  <section className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-amber-900 mb-3 flex items-center">
                      <FileText className="w-5 h-5 mr-2" />
                      3. Nhập dữ liệu batch
                    </h4>
                    <div className="space-y-2 text-sm text-amber-800">
                      <p>Nhập nhiều dòng dữ liệu vào ô <strong>"Dữ liệu đầu vào (Batch Input)"</strong>:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Mỗi dòng = 1 item trong queue</li>
                        <li>Ví dụ: Nhập 10 tiêu đề blog, mỗi dòng 1 tiêu đề</li>
                        <li>Click <strong>"Thêm vào Queue"</strong> để thêm vào danh sách</li>
                        <li>Queue sẽ được lưu tự động, không mất khi tắt app</li>
                      </ul>
                    </div>
                  </section>

                  {/* Bước 4: Chạy automation */}
                  <section className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-purple-900 mb-3 flex items-center">
                      <Zap className="w-5 h-5 mr-2" />
                      4. Chạy Automation
                    </h4>
                    <div className="space-y-2 text-sm text-purple-800">
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Chọn chế độ <strong>"Headless"</strong> để chạy ngầm (ẩn browser) hoặc tắt để xem trực tiếp</li>
                        <li>Click nút <strong>"Chạy ngay"</strong> để bắt đầu</li>
                        <li>Hệ thống sẽ tự động:
                          <ul className="list-circle list-inside ml-6 mt-1">
                            <li>Mở ChatGPT</li>
                            <li>Điền prompt (có thay thế biến {`{{input}}, {{prev}}`})</li>
                            <li>Đợi AI generate xong (theo dõi stop button)</li>
                            <li>Lấy kết quả và chuyển bước tiếp theo</li>
                          </ul>
                        </li>
                        <li>Bấm nút <strong>"Dừng lại"</strong> để ngừng automation bất kỳ lúc nào</li>
                      </ul>
                    </div>
                  </section>

                  {/* Bước 5: Xem kết quả */}
                  <section className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-teal-900 mb-3 flex items-center">
                      <Eye className="w-5 h-5 mr-2" />
                      5. Xem kết quả và Export
                    </h4>
                    <div className="space-y-2 text-sm text-teal-800">
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Kết quả hiện trong bảng, mỗi cột là 1 bước trong workflow</li>
                        <li>Click vào dòng để xem chi tiết (prompt, response, logs)</li>
                        <li>Trạng thái: <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">COMPLETED</span>, <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">QUEUED</span>, <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">FAILED</span></li>
                        <li>Click nút <strong>"Excel"</strong> để export toàn bộ kết quả ra file CSV (hỗ trợ tiếng Việt)</li>
                        <li>Tick checkbox để chọn nhiều items, sau đó xóa hàng loạt</li>
                      </ul>
                    </div>
                  </section>

                  {/* Lưu Workflow */}
                  <section className="bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-800 mb-3 flex items-center">
                      <Save className="w-5 h-5 mr-2" />
                      6. Lưu và tái sử dụng Workflow
                    </h4>
                    <div className="space-y-2 text-sm text-slate-700">
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Click <strong>"Lưu Workflow Mới"</strong> để lưu cấu hình hiện tại</li>
                        <li>Đặt tên cho workflow (ví dụ: "Viết blog 3 bước", "Dịch và tóm tắt")</li>
                        <li>Workflow đã lưu hiện trong danh sách <strong>"Workflows đã lưu"</strong></li>
                        <li>Click vào workflow để load lại cấu hình</li>
                        <li>Nếu đang chỉnh sửa workflow đã lưu, click <strong>"Cập nhật"</strong> thay vì tạo mới</li>
                        <li>Click nút <strong>"Sao chép"</strong> để tạo bản copy từ workflow hiện tại</li>
                      </ul>
                    </div>
                  </section>

                  {/* Tips */}
                  <section className="border-l-4 border-indigo-500 bg-indigo-50 p-4 rounded">
                    <h4 className="font-bold text-indigo-900 mb-2">💡 Mẹo hay</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-indigo-800 ml-2">
                      <li>Dùng chế độ <strong>"Headless OFF"</strong> lần đầu để kiểm tra selectors có đúng không</li>
                      <li>Kiểm tra logs ở panel bên phải để debug khi có lỗi</li>
                      <li>Queue được lưu tự động vào file, không lo mất dữ liệu khi tắt app</li>
                      <li>Có thể chạy lại những item FAILED bằng cách xóa các item COMPLETED</li>
                      <li>Prompt template có thể kéo to/nhỏ bằng cách kéo góc textarea</li>
                    </ul>
                  </section>
                </div>
              </div>
           </div>
        </div>
      )}

      {/* --- CUSTOM LOGIN URL MODAL --- */}
      {showCustomUrlModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <Globe className="w-5 h-5 mr-2 text-indigo-600" />
                Đăng nhập trang khác
              </h3>
              <button onClick={() => setShowCustomUrlModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Nhập URL trang web:</label>
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleOpenCustomLogin();
                  }}
                  placeholder="https://example.com/"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  autoFocus
                />
              </div>

              {/* History of custom URLs */}
              {customLoginUrls.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Lịch sử đăng nhập:</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {customLoginUrls.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setCustomUrlInput(url);
                        }}
                        className="w-full text-left px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 transition-colors truncate"
                      >
                        {url}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <button
                  onClick={handleOpenCustomLogin}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
                >
                  Mở đăng nhập
                </button>
                <button
                  onClick={() => setShowCustomUrlModal(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-sm font-semibold transition-colors"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SIDEBAR --- */}
      <aside className="w-96 bg-white border-r border-slate-200 flex flex-col shadow-sm z-20">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className={`p-2 rounded-lg ${mode === 'ELECTRON' ? 'bg-blue-600' : (mode === 'EXTENSION' ? 'bg-indigo-600' : 'bg-slate-800')}`}>
                <Monitor className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight leading-none">Automation</h1>
                <span className="text-[10px] font-medium text-slate-500 tracking-wider uppercase">
                  {mode === 'ELECTRON' ? 'Desktop App Mode' : (mode === 'EXTENSION' ? 'Extension Mode' : 'Web Simulation')}
                </span>
              </div>
            </div>
            <button onClick={() => setShowHelp(true)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
          {/* User info - Electron only */}
          {mode === 'ELECTRON' && userInfo && (
            <div className="text-xs text-slate-600 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-md px-3 py-2">
              <span className="font-medium">Xin chào,</span>{' '}
              <span className="text-indigo-700 font-semibold">{userInfo.email}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
          {/* HEADLESS CONFIG - ALWAYS VISIBLE */}
          <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center">
                 <Settings className="w-3 h-3 mr-1" />
                 Cấu hình Automation
              </h2>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                 <div className="flex items-center space-x-2">
                    {headless ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-indigo-600" />}
                    <div>
                       <div className="text-xs font-bold text-slate-700">Chế độ Ẩn (Headless)</div>
                       <div className="text-[10px] text-slate-400">
                          {mode === 'ELECTRON' 
                             ? (headless ? 'Trình duyệt chạy ngầm' : 'Mở cửa sổ trình duyệt')
                             : '(Chỉ áp dụng cho Desktop App)'}
                       </div>
                    </div>
                 </div>
                 <button 
                    onClick={() => setHeadless(!headless)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${headless ? 'bg-indigo-600' : 'bg-slate-300'}`}
                 >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${headless ? 'translate-x-5' : 'translate-x-1'}`} />
                 </button>
              </div>

              {/* LOGIN SESSION MANAGEMENT - ELECTRON ONLY */}
              {mode === 'ELECTRON' && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-green-800 mb-1 flex items-center">
                    <UserCog className="w-4 h-4 mr-1" />
                    Quản lý Đăng nhập
                  </div>
                  <p className="text-[10px] text-green-700 leading-relaxed mb-3">
                    Đăng nhập trước để tránh bị gián đoạn. Phiên đăng nhập sẽ được lưu tự động.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    {/* ChatGPT */}
                    <button
                      onClick={() => handleOpenLogin('https://chatgpt.com/')}
                      className="flex items-center justify-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md text-xs font-bold transition-colors shadow-sm"
                    >
                      <Bot className="w-3 h-3" />
                      <span>ChatGPT</span>
                    </button>

                    {/* Claude */}
                    <button
                      onClick={() => handleOpenLogin('https://claude.ai/')}
                      className="flex items-center justify-center space-x-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md text-xs font-bold transition-colors shadow-sm"
                    >
                      <Bot className="w-3 h-3" />
                      <span>Claude</span>
                    </button>

                    {/* Perplexity */}
                    <button
                      onClick={() => handleOpenLogin('https://perplexity.ai/')}
                      className="flex items-center justify-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-xs font-bold transition-colors shadow-sm"
                    >
                      <Bot className="w-3 h-3" />
                      <span>Perplexity</span>
                    </button>

                    {/* Other */}
                    <button
                      onClick={() => setShowCustomUrlModal(true)}
                      className="flex items-center justify-center space-x-1 bg-slate-600 hover:bg-slate-700 text-white px-3 py-2 rounded-md text-xs font-bold transition-colors shadow-sm"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Khác...</span>
                    </button>
                  </div>
                </div>
              )}
          </section>

          {/* ... (Existing Steps Editor & Save Logic) ... */}
          <section className="space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Quy trình (Steps)</h2>
                <div className="flex items-center space-x-2">
                  <button onClick={handleImportSettings} className="text-slate-600 hover:bg-slate-50 p-1 rounded transition-colors text-xs font-bold flex items-center">
                    <FileText className="w-3 h-3 mr-1" /> Nhập
                  </button>
                  <button onClick={handleExportSettings} className="text-slate-600 hover:bg-slate-50 p-1 rounded transition-colors text-xs font-bold flex items-center">
                    <Download className="w-3 h-3 mr-1" /> Xuất
                  </button>
                  <button onClick={handleAddStep} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded transition-colors text-xs font-bold flex items-center">
                     <Plus className="w-3 h-3 mr-1" /> Thêm
                  </button>
                </div>
             </div>
             
             <div className="space-y-3">
                {config.steps.map((step, index) => (
                   <div key={step.id} className="relative">
                      {index > 0 && (
                         <div className="absolute -top-3 left-6 h-3 w-0.5 bg-slate-200 z-0"></div>
                      )}
                      <div className={`relative z-10 bg-white border rounded-lg shadow-sm transition-all ${expandedStepId === step.id ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}`}>
                         <div 
                           className="flex items-center justify-between p-3 cursor-pointer select-none"
                           onClick={() => setExpandedStepId(expandedStepId === step.id ? null : step.id)}
                         >
                            <div className="flex items-center space-x-3">
                               <div className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-xs font-bold text-white shadow-md">
                                  {index + 1}
                               </div>
                               <span className="text-sm font-semibold text-slate-700">{step.name}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                               {config.steps.length > 1 && (
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); handleRemoveStep(step.id); }}
                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                                 >
                                    <Trash2 className="w-3.5 h-3.5" />
                                 </button>
                               )}
                               <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedStepId === step.id ? 'rotate-180' : ''}`} />
                            </div>
                         </div>

                         <div className={`step-content-transition border-t border-slate-50 ${expandedStepId === step.id ? 'step-content-expanded' : 'step-content-collapsed'}`}>
                            <div className="p-3 pt-0">
                               <div className="mb-3 mt-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Tên bước</label>
                                  <input 
                                     value={step.name}
                                     onChange={(e) => handleUpdateStep(step.id, 'name', e.target.value)}
                                     className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500"
                                  />
                               </div>
                               
                                   <div className="mb-3">
                                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">URL</label>
                                      <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus-within:ring-1 focus-within:ring-indigo-500">
                                         <LinkIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                         <input 
                                             value={step.url || ''}
                                             onChange={(e) => handleUpdateStep(step.id, 'url', e.target.value)}
                                             className="w-full text-xs bg-transparent border-none p-0 focus:ring-0 text-slate-600 placeholder-slate-400"
                                             placeholder="https://..."
                                             id={`url-${step.id}`}
                                         />
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {index > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const input = document.getElementById(`url-${step.id}`) as HTMLInputElement;
                                              const token = '{{url_prev}}';
                                              if (input) {
                                                const cursorPos = input.selectionStart || (step.url?.length || 0);
                                                const text = step.url || '';
                                                const before = text.substring(0, cursorPos);
                                                const after = text.substring(cursorPos);
                                                handleUpdateStep(step.id, 'url', before + token + after);
                                                setTimeout(() => { input.focus(); input.setSelectionRange(cursorPos + token.length, cursorPos + token.length); }, 0);
                                              } else {
                                                handleUpdateStep(step.id, 'url', token);
                                              }
                                            }}
                                            className="text-[10px] bg-green-50 hover:bg-green-100 px-2 py-1 rounded text-green-700 font-mono cursor-pointer transition-colors"
                                            title="URL từ bước ngay trước"
                                          >
                                            {`{{url_prev}}`}
                                          </button>
                                        )}
                                        {config.steps.slice(0, index).map((prevStep, prevIdx) => (
                                          <button
                                            key={`urlvar-${prevStep.id}`}
                                            type="button"
                                            onClick={() => {
                                              const input = document.getElementById(`url-${step.id}`) as HTMLInputElement;
                                              const token = `{{url_prev${prevIdx + 1}}}`;
                                              if (input) {
                                                const cursorPos = input.selectionStart || (step.url?.length || 0);
                                                const text = step.url || '';
                                                const before = text.substring(0, cursorPos);
                                                const after = text.substring(cursorPos);
                                                handleUpdateStep(step.id, 'url', before + token + after);
                                                setTimeout(() => { input.focus(); input.setSelectionRange(cursorPos + token.length, cursorPos + token.length); }, 0);
                                              } else {
                                                handleUpdateStep(step.id, 'url', token);
                                              }
                                            }}
                                            className="text-[10px] bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded text-indigo-700 font-mono cursor-pointer transition-colors"
                                            title={`URL từ ${prevStep.name}`}
                                          >
                                            {`{{url_prev${prevIdx + 1}}}`}
                                          </button>
                                        ))}
                                      </div>
                                   </div>

                               <div className="mb-3">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Prompt Template</label>
                                  <textarea
                                     id={`template-${step.id}`}
                                     value={step.template}
                                     onChange={(e) => handleUpdateStep(step.id, 'template', e.target.value)}
                                     className="w-full min-h-[80px] bg-white border border-slate-200 rounded-md p-2 text-xs font-mono resize-y focus:outline-none focus:border-indigo-500"
                                     placeholder="Nhập template... Click biến bên dưới để insert"
                                  />
                                  <div className="mt-2 flex flex-wrap gap-1">
                                     {/* Input variables: dynamic based on mode */}
                                     {getVisibleInputVariables().map((inputVar) => {
                                       const varName = `{{${inputVar}}}`;
                                       return (
                                         <button
                                           key={inputVar}
                                           type="button"
                                           onClick={() => {
                                             const textarea = document.getElementById(`template-${step.id}`) as HTMLTextAreaElement;
                                             if (textarea) {
                                               const cursorPos = textarea.selectionStart;
                                               const textBefore = step.template.substring(0, cursorPos);
                                               const textAfter = step.template.substring(cursorPos);
                                               handleUpdateStep(step.id, 'template', textBefore + varName + textAfter);
                                               setTimeout(() => {
                                                 textarea.focus();
                                                 textarea.setSelectionRange(cursorPos + varName.length, cursorPos + varName.length);
                                               }, 0);
                                             }
                                           }}
                                           className="text-[10px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-700 font-mono cursor-pointer transition-colors"
                                           title={inputVar === 'input' ? 'Input chính từ queue' : `Input phụ ${inputVar.replace('input', '')}`}
                                         >
                                           {varName}
                                         </button>
                                       );
                                     })}
                                     {config.steps.slice(0, index).map((prevStep, prevIdx) => (
                                       <button
                                         key={prevStep.id}
                                         type="button"
                                         onClick={() => {
                                           const textarea = document.getElementById(`template-${step.id}`) as HTMLTextAreaElement;
                                           if (textarea) {
                                             const cursorPos = textarea.selectionStart;
                                             const textBefore = step.template.substring(0, cursorPos);
                                             const textAfter = step.template.substring(cursorPos);
                                             const varName = `{{prev${prevIdx + 1}}}`;
                                             handleUpdateStep(step.id, 'template', textBefore + varName + textAfter);
                                             setTimeout(() => {
                                               textarea.focus();
                                               textarea.setSelectionRange(cursorPos + varName.length, cursorPos + varName.length);
                                             }, 0);
                                           }
                                         }}
                                         className="text-[10px] bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded text-indigo-700 font-mono cursor-pointer transition-colors"
                                         title={`Kết quả từ ${prevStep.name}`}
                                       >
                                         {`{{prev${prevIdx + 1}}}`}
                                       </button>
                                     ))}
                                     {index > 0 && (
                                       <button
                                         type="button"
                                         onClick={() => {
                                           const textarea = document.getElementById(`template-${step.id}`) as HTMLTextAreaElement;
                                           if (textarea) {
                                             const cursorPos = textarea.selectionStart;
                                             const textBefore = step.template.substring(0, cursorPos);
                                             const textAfter = step.template.substring(cursorPos);
                                             handleUpdateStep(step.id, 'template', textBefore + '{{prev}}' + textAfter);
                                             setTimeout(() => {
                                               textarea.focus();
                                               textarea.setSelectionRange(cursorPos + 8, cursorPos + 8);
                                             }, 0);
                                           }
                                         }}
                                         className="text-[10px] bg-green-50 hover:bg-green-100 px-2 py-1 rounded text-green-700 font-mono cursor-pointer transition-colors"
                                         title="Kết quả từ bước ngay trước"
                                       >
                                         {`{{prev}}`}
                                       </button>
                                     )}
                                  </div>
                               </div>

                               <div className="pt-3 border-t border-slate-100">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase flex items-center">
                                      <Target className="w-3 h-3 mr-1" />
                                      CSS Selectors
                                    </h4>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-[10px] text-slate-500">
                                        {step.useCustomSelectors ? 'Tùy chỉnh' : 'Tự động'}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleCustomSelectors(step.id);
                                        }}
                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${step.useCustomSelectors ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                        title={step.useCustomSelectors ? 'Sử dụng CSS selector tùy chỉnh' : 'Sử dụng auto-detect từ URL'}
                                      >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${step.useCustomSelectors ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                      </button>
                                    </div>
                                  </div>

                                  {!step.useCustomSelectors && (
                                    <div className="mb-2 text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                                      <span className="font-semibold">Chế độ tự động:</span> Selectors sẽ được nhận diện dựa trên URL (ChatGPT, Claude.ai, Perplexity.ai)
                                    </div>
                                  )}

                                  {step.useCustomSelectors && (
                                    <div className="space-y-2">
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[10px] w-12 text-slate-400">Input</span>
                                      <input
                                        value={step.selectors?.input || ''}
                                        onChange={(e) => handleUpdateStepSelector(step.id, 'input', e.target.value)}
                                        placeholder="#prompt-textarea"
                                        className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono"
                                      />
                                      {mode === 'ELECTRON' && (
                                        <button
                                          onClick={() => handlePickSelector(step.id, 'input')}
                                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-colors flex items-center space-x-1"
                                          title="Click để chọn element trên trang"
                                        >
                                          <Target className="w-3 h-3" />
                                          <span>Pick</span>
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[10px] w-12 text-slate-400">Submit</span>
                                      <input
                                        value={step.selectors?.submit || ''}
                                        onChange={(e) => handleUpdateStepSelector(step.id, 'submit', e.target.value)}
                                        placeholder="button[type='submit']"
                                        className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono"
                                      />
                                      {mode === 'ELECTRON' && (
                                        <button
                                          onClick={() => handlePickSelector(step.id, 'submit')}
                                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-colors flex items-center space-x-1"
                                          title="Click để chọn element trên trang"
                                        >
                                          <Target className="w-3 h-3" />
                                          <span>Pick</span>
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[10px] w-12 text-slate-400">Output</span>
                                      <input
                                        value={step.selectors?.output || ''}
                                        onChange={(e) => handleUpdateStepSelector(step.id, 'output', e.target.value)}
                                        placeholder=".markdown"
                                        className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono"
                                      />
                                      {mode === 'ELECTRON' && (
                                        <button
                                          onClick={() => handlePickSelector(step.id, 'output')}
                                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-colors flex items-center space-x-1"
                                          title="Click để chọn element trên trang"
                                        >
                                          <Target className="w-3 h-3" />
                                          <span>Pick</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  )}
                               </div>

                               {/* Image Generation Config */}
                               <div className="mb-3 pt-3 border-t border-slate-100">
                                  <div className="flex items-center justify-between mb-2">
                                     <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center">
                                        <ImageIcon className="w-3 h-3 mr-1" />
                                        Thêm ảnh
                                     </label>
                                     <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                           type="checkbox"
                                           checked={step.imageConfig?.enabled || false}
                                           onChange={() => handleToggleImageConfig(step.id)}
                                           className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                     </label>
                                  </div>

                                  {step.imageConfig?.enabled && (
                                     <div className="space-y-2 bg-indigo-50 p-2 rounded border border-indigo-100">
                                        <div className="flex items-center space-x-2">
                                           <label className="text-[10px] text-slate-600 font-medium w-20">Nguồn ảnh:</label>
                                           <select
                                              value={step.imageConfig?.source || 'perplexity'}
                                              onChange={(e) => handleUpdateImageConfig(step.id, 'source', e.target.value)}
                                              className="flex-1 text-xs bg-white border border-indigo-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500"
                                           >
                                              <option value="perplexity">Perplexity</option>
                                              <option value="google" disabled>Google Search (Coming soon)</option>
                                              <option value="ai" disabled>AI Generate (Coming soon)</option>
                                           </select>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                           <label className="text-[10px] text-slate-600 font-medium w-20">Số lượng:</label>
                                           <input
                                              type="number"
                                              min="1"
                                              max="10"
                                              value={step.imageConfig?.count || 3}
                                              onChange={(e) => handleUpdateImageConfig(step.id, 'count', parseInt(e.target.value) || 3)}
                                              className="w-16 text-xs bg-white border border-indigo-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500"
                                           />
                                        </div>

                                        <div className="flex items-center space-x-2">
                                           <input
                                              type="checkbox"
                                              id={`auto-insert-${step.id}`}
                                              checked={step.imageConfig?.autoInsert !== false}
                                              onChange={(e) => handleUpdateImageConfig(step.id, 'autoInsert', e.target.checked)}
                                              className="w-3 h-3 text-indigo-600 bg-white border-indigo-300 rounded focus:ring-indigo-500"
                                           />
                                           <label htmlFor={`auto-insert-${step.id}`} className="text-[10px] text-slate-600">
                                              Tự động chèn shortcode vào bài viết
                                           </label>
                                        </div>

                                        <div className="text-[9px] text-indigo-700 bg-white p-2 rounded border border-indigo-200">
                                           <p className="font-semibold mb-1">Hướng dẫn:</p>
                                           <ol className="list-decimal list-inside space-y-0.5 text-indigo-600">
                                              <li>Đợi tạo xong bài viết</li>
                                              <li>Ấn vào chi tiết để xem và chọn lại ảnh nếu muốn</li>
                                           </ol>
                                        </div>
                                     </div>
                                  )}
                               </div>

                            </div>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </section>

          {/* Saved Workflows List */}
          {savedAgents.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">
                Workflow đã lưu ({savedAgents.length} workflow{savedAgents.length > 1 ? 's' : ''})
              </h3>
              <div className="max-h-64 overflow-y-auto">
                {savedAgents.map((agent, index) => (
                  <div
                    key={agent.id}
                    className={`group flex items-center justify-between px-2 py-2 hover:bg-slate-100 transition-colors ${currentWorkflowId === agent.id ? 'bg-indigo-50' : ''} ${index < savedAgents.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <button
                      onClick={() => handleLoadAgent(agent.id)}
                      className={`flex items-center space-x-2 flex-1 text-left text-sm truncate ${currentWorkflowId === agent.id ? 'text-indigo-600 font-semibold' : 'text-slate-700 hover:text-indigo-600'}`}
                    >
                      <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">
                        {agent.name} <span className="text-slate-400 font-normal">- {agent.config.steps.length} bước</span>
                      </span>
                    </button>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameWorkflowId(agent.id);
                          setRenameInput(agent.name);
                          setShowRenameDialog(true);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                        title="Đổi tên"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteAgent(agent.id, e)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Actions */}
          <div className="pt-4 border-t border-slate-100">
            {currentWorkflowId ? (
              <div className="space-y-2">
                {/* Workflow đang chọn */}
                <div className="flex items-center justify-between bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                  <span className="flex items-center text-xs">
                    <FileText className="w-3 h-3 mr-1 text-indigo-600" />
                    <span className="font-semibold text-indigo-700">
                      {savedAgents.find(a => a.id === currentWorkflowId)?.name || 'Workflow'}
                    </span>
                  </span>
                  <button
                    onClick={handleDeselectWorkflow}
                    className="text-indigo-400 hover:text-indigo-600 transition-colors"
                    title="Bỏ chọn workflow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Nút cập nhật */}
                <button
                  onClick={() => {
                    if (isSavingWorkflow) return;
                    setIsSavingWorkflow(true);
                    handleSaveAgent(false, currentWorkflowId || undefined);
                    setTimeout(() => setIsSavingWorkflow(false), 1000);
                  }}
                  disabled={isSavingWorkflow}
                  className={`w-full py-2 rounded text-sm font-semibold flex items-center justify-center space-x-1 transition-colors ${
                    isSavingWorkflow
                      ? 'bg-green-600 text-white cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isSavingWorkflow ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Đã lưu!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Cập nhật Workflow</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Nút Lưu mới khi chưa chọn workflow */
              !showSaveAgent ? (
                <button
                  onClick={() => setShowSaveAgent(true)}
                  className="w-full bg-green-600 text-white py-2 rounded text-sm hover:bg-green-700 font-semibold flex items-center justify-center space-x-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lưu mới</span>
                </button>
              ) : (
                <div className="flex flex-col space-y-2 p-3 bg-green-50 border border-green-200 rounded-lg animate-in fade-in zoom-in duration-200">
                  <label className="text-xs font-semibold text-green-700">Tên workflow mới:</label>
                  <input
                    value={agentNameInput}
                    onChange={(e) => setAgentNameInput(e.target.value)}
                    placeholder="Đặt tên workflow..."
                    className="w-full text-sm border-green-300 rounded px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-green-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && agentNameInput.trim()) handleSaveAgent(false);
                      if (e.key === 'Escape') setShowSaveAgent(false);
                    }}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSaveAgent(false)}
                      disabled={!agentNameInput.trim()}
                      className="flex-1 bg-green-600 text-white py-1.5 rounded text-sm hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Lưu
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveAgent(false);
                        setAgentNameInput("");
                      }}
                      className="px-3 bg-slate-100 text-slate-600 py-1.5 rounded text-sm hover:bg-slate-200"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </aside>

      {/* --- RIGHT CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Input Area */}
        <div className="bg-white p-6 border-b border-slate-200 shadow-sm z-10">
           <div className="max-w-5xl mx-auto w-full space-y-4">
              <div className="flex justify-between items-start">
                 <div>
                    <h2 className="text-lg font-semibold text-slate-800">Dữ liệu đầu vào (Batch Input)</h2>
                    <p className="text-sm text-slate-500">
                       {inputMode === 'manual'
                         ? `Hệ thống sẽ chạy ${inputText.split('\n').filter(l => l.trim()).length} dòng dữ liệu qua ${config.steps.length} bước xử lý.`
                         : `Import và map dữ liệu từ file CSV/XLSX qua ${config.steps.length} bước xử lý.`
                       }
                    </p>
                 </div>
                 <div className="flex items-center space-x-4">
                    {/* RUN CONTROLS */}
                    {isProcessing ? (
                       <button onClick={handleStop} className="flex items-center space-x-2 bg-red-100 text-red-700 px-8 py-2.5 rounded-lg font-bold hover:bg-red-200 transition-colors">
                          <Pause className="w-5 h-5 fill-current" />
                          <span>Dừng lại</span>
                       </button>
                    ) : (
                       <button
                          onClick={selectedItemIds.size > 0 ? handleRunSelected : () => processQueue()}
                          disabled={queue.length === 0}
                          className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-2.5 rounded-lg font-bold hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none"
                       >
                          <Play className="w-5 h-5 fill-current" />
                          <span>{selectedItemIds.size > 0 ? 'Chạy đã chọn' : 'Chạy ngay'}</span>
                       </button>
                    )}
                 </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex gap-2 border-b border-slate-200">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all ${
                    inputMode === 'manual'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Nhập thủ công</span>
                </button>
                <button
                  onClick={() => setInputMode('import')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all ${
                    inputMode === 'import'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>Import từ file</span>
                </button>
              </div>

              {/* Manual Input Mode */}
              {inputMode === 'manual' && (
                <div className="relative">
                  <textarea
                    ref={inputTextareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onClick={(e) => {
                      // Ensure textarea is always clickable and focusable
                      const target = e.currentTarget;
                      target.removeAttribute('disabled');
                      target.removeAttribute('readonly');
                      target.focus();
                    }}
                    placeholder="Nhập mỗi prompt một dòng..."
                    className="w-full h-24 border border-slate-300 rounded-xl p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm resize-y"
                    style={{ pointerEvents: 'auto', userSelect: 'auto' }}
                  />
                  <button
                    onClick={handleAddPrompts}
                    disabled={!inputText.trim()}
                    className="absolute bottom-3 right-3 bg-slate-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm vào Queue</span>
                  </button>
                </div>
              )}

              {/* Import Mode */}
              {inputMode === 'import' && (
                <ImportInput
                  steps={config.steps}
                  onAddToQueue={(items) => {
                    setQueue(prev => [...prev, ...items]);
                  }}
                  currentWorkflowId={currentWorkflowId || undefined}
                  onMappingChange={(count) => setImportMappingCount(count)}
                  queue={queue}
                />
              )}
              
              {/* Progress Bar */}
              {isProcessing && (
                 <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                       className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                       style={{ width: `${progress}%` }}
                    />
                 </div>
              )}
           </div>
        </div>

        {/* Results / Queue Area */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Table List */}
          <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
             <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                <div className="flex items-center space-x-4">
                   <h3 className="font-semibold text-slate-700 flex items-center">
                     <Cpu className="w-4 h-4 mr-2 text-slate-400" />
                     Danh sách công việc ({stats.total})
                   </h3>
                   <div className="flex space-x-2 text-xs">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Xong: {stats.completed}</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Chờ: {stats.queued}</span>
                      {stats.processing > 0 && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold animate-pulse">Đang chạy: {stats.processing}</span>
                      )}
                   </div>
                </div>
                <div className="flex items-center space-x-2">
                   {selectedItemIds.size > 0 && (
                      <span className="text-xs text-slate-500 mr-2">
                        Đã chọn: <span className="font-bold text-indigo-600">{selectedItemIds.size}</span>
                      </span>
                   )}
                   <button
                      onClick={selectedItemIds.size > 0 ? handleExportSelected : handleExportCSV}
                      disabled={queue.length === 0}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors disabled:opacity-50"
                   >
                      <Download className="w-4 h-4" />
                      <span>{selectedItemIds.size > 0 ? 'Export đã chọn' : 'Excel'}</span>
                   </button>
                   <button
                      onClick={handlePublishPosts}
                      disabled={isPublishing || selectedItemIds.size === 0}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-green-300 rounded-md text-sm text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors disabled:opacity-50"
                   >
                      <Send className={`w-4 h-4 ${isPublishing ? 'animate-pulse' : ''}`} />
                      <span>{isPublishing ? 'Đang đăng...' : 'Đăng web'}</span>
                   </button>
                   <button onClick={handleResetSelected} disabled={selectedItemIds.size === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-blue-300 rounded-md text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50">
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset đã chọn</span>
                   </button>
                   <button onClick={handleDeleteSelected} disabled={selectedItemIds.size === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-orange-300 rounded-md text-sm text-orange-600 hover:bg-orange-50 hover:text-orange-700 transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa</span>
                   </button>
                </div>
             </div>

             {/* Filter and Search Bar */}
             <div className="px-4 py-3 border-b border-slate-200 bg-white">
                <div className="flex items-center space-x-3">
                   <div className="flex items-center space-x-2">
                      <Filter className="w-4 h-4 text-slate-400" />
                      <select
                         value={filterStatus}
                         onChange={(e) => setFilterStatus(e.target.value)}
                         className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer"
                      >
                         <option value="all">Tất cả trạng thái</option>
                         <option value="queued">Chờ</option>
                         <option value="running">Đang chạy</option>
                         <option value="completed">Hoàn thành</option>
                         <option value="failed">Thất bại</option>
                      </select>
                   </div>
                   <div className="flex-1 flex items-center space-x-2">
                      <Search className="w-4 h-4 text-slate-400" />
                      <input
                         type="text"
                         placeholder="Tìm kiếm theo input gốc..."
                         value={searchText}
                         onChange={(e) => setSearchText(e.target.value)}
                         className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      {searchText && (
                         <button
                            onClick={() => setSearchText('')}
                            className="text-slate-400 hover:text-slate-600"
                         >
                            <X className="w-4 h-4" />
                         </button>
                      )}
                   </div>
                   {(filterStatus !== 'all' || searchText) && (
                      <span className="text-xs text-slate-500">
                         Hiển thị: <span className="font-bold text-indigo-600">{filteredQueue.length}</span> / {stats.total}
                      </span>
                   )}
                </div>
             </div>

             {/* DATA GRID */}
             <div className="flex-1 overflow-auto custom-scrollbar relative">
               <table className="text-left border-collapse w-full" style={{ minWidth: `${tableMinWidth}px` }}>
                 <thead className="bg-slate-100 sticky top-0 z-20 shadow-sm">
                   <tr>
                     <th className="p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 w-8 sticky left-0 bg-slate-100 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                       <input
                         type="checkbox"
                         checked={filteredQueue.length > 0 && filteredQueue.every(item => selectedItemIds.has(item.id))}
                         onChange={handleToggleSelectAll}
                         className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                       />
                     </th>
                     <th className="p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 w-10 sticky left-[32px] bg-slate-100 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">#</th>
                     <th className="p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 w-24 min-w-[96px] sticky left-[72px] bg-slate-100 z-30 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Trạng thái</th>
                     <th className="p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 w-32 min-w-[128px] sticky left-[168px] bg-slate-100 z-30 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Workflow</th>
                     <th className="p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 w-28 min-w-[112px] sticky left-[300px] bg-slate-100 z-30 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Nguồn</th>
                     <th className={`p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 ${inputColWidth} sticky left-[412px] bg-slate-100 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>Input Gốc</th>
                     {config.steps.map((step) => (
                        <th key={step.id} className={`p-2 text-xs font-semibold text-slate-500 border-b border-slate-200 ${stepColWidth}`}>
                           <div className="flex items-center space-x-1">
                              <span>{step.name}</span>
                           </div>
                        </th>
                     ))}
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-10"></th>
                   </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-slate-100">
                    {filteredQueue.length === 0 && (
                      <tr>
                        <td colSpan={7 + config.steps.length} className="p-10 text-center text-slate-400">
                           <Layout className="w-12 h-12 mx-auto mb-3 opacity-20" />
                           <p>{queue.length === 0 ? 'Danh sách trống.' : 'Không tìm thấy kết quả phù hợp.'}</p>
                        </td>
                      </tr>
                    )}
                    {filteredQueue.map((item, idx) => {
                      const isSelected = selectedItemId === item.id;
                      return (
                      <tr
                        key={item.id}
                        className={`group hover:bg-indigo-50/50 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}
                      >
                        <td className={`p-2 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/50'}`} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => handleToggleSelect(item.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className={`p-2 text-xs font-mono text-slate-400 sticky left-[32px] z-10 cursor-pointer shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/50'}`} onClick={() => setSelectedItemId(item.id)}>{idx + 1}</td>
                        <td className={`p-2 sticky left-[72px] z-10 whitespace-nowrap cursor-pointer shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/50'}`} onClick={() => setSelectedItemId(item.id)}>
                           <div className="flex flex-col gap-1">
                             <StatusBadge status={item.status} />
                             {item.startTime && item.endTime && (
                               <span className="text-[10px] text-green-600 font-semibold">
                                 {((item.endTime - item.startTime) / 1000).toFixed(1)}s
                               </span>
                             )}
                           </div>
                        </td>
                        <td className={`p-2 text-xs text-slate-600 sticky left-[168px] z-10 cursor-pointer shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/50'}`} onClick={() => setSelectedItemId(item.id)}>
                           <div className="truncate">
                             {item.workflowId ? savedAgents.find(a => a.id === item.workflowId)?.name || '-' : '-'}
                           </div>
                        </td>
                        <td className={`p-2 text-xs sticky left-[300px] z-10 cursor-pointer shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/50'}`} onClick={() => setSelectedItemId(item.id)}>
                           <div className="flex items-center gap-1">
                             {item.source === 'import' ? (
                               <>
                                 <Upload className="w-3 h-3 text-blue-500" />
                                 <span className="text-xs text-slate-600 truncate" title={item.fileName}>
                                   {item.fileName || 'Import'}
                                 </span>
                               </>
                             ) : (
                               <>
                                 <Edit className="w-3 h-3 text-green-500" />
                                 <span className="text-xs text-slate-600">Thủ công</span>
                               </>
                             )}
                           </div>
                        </td>
                        <td className={`p-2 text-sm text-slate-800 font-medium ${inputColWidth} align-top cursor-pointer sticky left-[412px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-indigo-50/50'}`} onClick={() => setSelectedItemId(item.id)}>
                           <div className={`break-words whitespace-normal ${inputColClamp}`}>{item.originalPrompt}</div>
                        </td>

                        {config.steps.map((step, sIdx) => {
                           const result = item.results.find(r => r.stepId === step.id);
                           const isCurrent = item.currentStepIndex === sIdx && item.status === Status.RUNNING;
                           const isRerunning = rerunningStep?.itemId === item.id && rerunningStep?.stepId === step.id;

                           return (
                              <td
                                 key={step.id}
                                 className={`p-2 text-sm text-slate-600 align-top border-l border-slate-50 ${stepColWidth} cursor-pointer hover:bg-indigo-50/80 transition-colors relative`}
                                 onClick={() => {
                                   if (isRerunning) return; // Disable click when rerunning
                                   setSelectedItemId(item.id);
                                   if (result) {
                                     setScrollToStepId(step.id);
                                   }
                                 }}
                              >
                                 {result ? (
                                    <div
                                      className={`break-words line-clamp-${stepColClamp} ${isRerunning ? 'opacity-30' : ''}`}
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: stepColClamp,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        wordBreak: 'break-word'
                                      }}
                                      title={result.response}
                                    >
                                       {result.response}
                                    </div>
                                 ) : isCurrent ? (
                                    <div className="flex items-center text-xs text-amber-600 italic">
                                       <Cpu className="w-3 h-3 mr-1 animate-spin" /> Đang chạy...
                                    </div>
                                 ) : (
                                    <span className="text-slate-200 text-xs">-</span>
                                 )}

                                 {/* Loading overlay when rerunning this step */}
                                 {isRerunning && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                                       <Cpu className="w-6 h-6 text-indigo-600 animate-spin" />
                                    </div>
                                 )}
                              </td>
                           );
                        })}

                        <td className="p-3 text-right align-top">
                           <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
                        </td>
                      </tr>
                      );
                    })}
                 </tbody>
               </table>
             </div>
          </div>

          {/* Detail Panel */}
          {selectedItem && (
             <>
               {/* Overlay */}
               <div
                 className="fixed inset-0 bg-black/20 z-20"
                 onClick={handleCloseDetailPanel}
               />

               {/* Detail Panel */}
               <div
                 className={`fixed right-0 top-0 bottom-0 w-[500px] border-l border-slate-200 bg-white flex flex-col shadow-xl z-30 ${
                   isDetailPanelClosing
                     ? 'animate-slide-out-right'
                     : 'animate-slide-in-right'
                 }`}
                 style={{
                   animation: isDetailPanelClosing
                     ? 'slideOutRight 200ms ease-in-out forwards'
                     : 'slideInRight 200ms ease-in-out forwards'
                 }}
               >
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <div>
                        <h3 className="font-semibold text-slate-700">Chi tiết</h3>
                        <p className="text-xs text-slate-500 mb-1">ID: {selectedItem.id}</p>
                        {selectedItem.startTime && selectedItem.endTime && (
                          <p className="text-xs text-green-600 font-semibold mb-1">
                            ⏱️ Thời gian chạy: {((selectedItem.endTime - selectedItem.startTime) / 1000).toFixed(1)}s
                          </p>
                        )}
                        <button
                          onClick={() => handleResetItem(selectedItem.id)}
                          className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                          title="Reset về trạng thái chờ"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                     </div>
                     <button onClick={handleCloseDetailPanel} className="text-slate-400 hover:text-slate-700">
                        <X className="w-5 h-5" />
                     </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-slate-50/50">
                     {/* Original Input */}
                     <div className="p-4 bg-white border-b border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Input Gốc</div>
                        <div className="bg-slate-100 p-3 rounded-md text-sm text-slate-800 font-mono whitespace-pre-wrap border border-slate-200">
                           {selectedItem.originalPrompt}
                        </div>
                     </div>

                   {/* Steps Timeline */}
                   <div className="p-4 space-y-6">
                      {selectedItem.results.map((result, idx) => (
                         <div key={idx} id={`step-detail-${result.stepId}`} className="relative pl-6 border-l-2 border-indigo-200 last:border-0 pb-6 last:pb-0 scroll-mt-4">
                            {/* Step Node */}
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-2 border-white shadow-sm"></div>
                            
                            <div className="mb-2">
                               <div className="flex justify-between items-center mb-1">
                                  <h4 className="font-bold text-indigo-700 text-sm">{result.stepName}</h4>
                                  <span className="text-[10px] text-slate-400">{new Date(result.timestamp).toLocaleTimeString()}</span>
                                </div>
                               {result.url && (
                                 <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[10px] text-indigo-500 hover:underline mb-2">
                                    <Globe className="w-3 h-3 mr-1" />
                                    {result.url}
                                 </a>
                               )}
                            </div>

                            {/* Prompt Sent */}
                            <div className="mb-2">
                               <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Prompt gửi đi</div>
                               <div className="text-xs text-slate-600 bg-white border border-slate-200 p-2 rounded line-clamp-3 hover:line-clamp-none cursor-pointer transition-all">
                                  {result.prompt}
                               </div>
                            </div>

                            {/* Response Received */}
                            <div id={`step-output-${result.stepId}`} className="scroll-mt-4">
                              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Kết quả</div>
                              <div className="text-sm text-slate-800 bg-white border border-indigo-100 p-3 rounded-lg shadow-sm html-content" dangerouslySetInnerHTML={{ __html: result.response }} />

                              {/* Image Gallery */}
                              {result.imageData && result.imageData.length > 0 && (
                                <div className="mt-3 bg-indigo-50 border border-indigo-200 p-3 rounded-lg">
                                  <div className="text-[10px] uppercase font-bold text-indigo-700 mb-2 flex items-center">
                                    <ImageIcon className="w-3 h-3 mr-1" />
                                    Ảnh đã tạo ({result.imageData.length})
                                  </div>
                                  <div className="space-y-2">
                                    {result.imageData.map((imgData: any, imgIdx: number) => (
                                      <div key={imgIdx} className="bg-white p-2 rounded border border-indigo-100">
                                        <div className="flex items-start space-x-2">
                                          <img
                                            src={imgData.selectedImage}
                                            alt={imgData.shortcode}
                                            className="w-20 h-20 object-cover rounded"
                                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80?text=Error'; }}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-indigo-700 mb-1">{imgData.shortcode}</div>
                                            <div className="text-[10px] text-slate-600 line-clamp-2 mb-1">{imgData.contextParagraph}</div>
                                            <div className="text-[9px] text-slate-400">
                                              Ảnh {imgData.selectedIndex + 1}/{imgData.images.length}
                                            </div>
                                            <button
                                              className="mt-1 px-2 py-0.5 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                                              onClick={() => setImageGallery({
                                                itemId: selectedItem.id,
                                                stepId: result.stepId,
                                                imageIndex: imgIdx,
                                                images: imgData.images,
                                                currentSelected: imgData.selectedIndex
                                              })}
                                            >
                                              Chọn ảnh khác
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="mt-2 flex items-center space-x-2">
                                <button
                                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                                  onClick={() => setEditingOutput({ itemId: selectedItem.id, stepId: result.stepId, content: result.response })}
                                >
                                  Chỉnh sửa
                                </button>
                                <button
                                  className="px-2 py-1 text-xs rounded bg-amber-600 text-white disabled:opacity-50"
                                  onClick={() => handleRerunStep(selectedItem.id, idx)}
                                  disabled={rerunningStep?.itemId === selectedItem.id && rerunningStep?.stepId === result.stepId}
                                >
                                  {rerunningStep?.itemId === selectedItem.id && rerunningStep?.stepId === result.stepId ? 'Đang chạy lại...' : 'Chạy lại'}
                                </button>
                              </div>
                            </div>
                         </div>
                      ))}
                      
                      {selectedItem.status === Status.FAILED && (
                         <div className="pl-6">
                            <div className="bg-red-50 text-red-600 p-3 rounded text-xs border border-red-100 font-mono">
                               Lỗi: {selectedItem.error}
                            </div>
                         </div>
                      )}
                   </div>
                   
                   {/* Logs Section */}
                   {selectedItem.logs && selectedItem.logs.length > 0 && (
                      <div className="p-4 border-t border-slate-200 bg-slate-900 text-slate-400 font-mono text-xs">
                         <div className="mb-2 text-slate-500 uppercase font-bold">System Logs</div>
                         <div className="space-y-1">
                            {selectedItem.logs.map((log, i) => (
                               <div key={i} className="break-words">{log}</div>
                            ))}
                         </div>
                      </div>
                   )}
                </div>
               </div>
             </>
          )}

          {editingOutput && (
            <OutputEditor
              initialHtml={editingOutput.content}
              onSave={(html) => { updateResultContent(editingOutput.itemId, editingOutput.stepId, html); setEditingOutput(null); }}
              onCancel={() => setEditingOutput(null)}
            />
          )}

          {/* Image Gallery Modal */}
          {imageGallery && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center">
                    <ImageIcon className="w-5 h-5 mr-2 text-indigo-600" />
                    Chọn ảnh ({imageGallery.images.length} ảnh)
                  </h3>
                  <button
                    onClick={() => setImageGallery(null)}
                    className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shadow-sm"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-3 gap-4">
                    {imageGallery.images.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                          idx === imageGallery.currentSelected
                            ? 'border-indigo-600 ring-2 ring-indigo-300'
                            : 'border-slate-200 hover:border-indigo-400'
                        }`}
                        onClick={() => handleSelectImage(imgUrl, idx)}
                      >
                        <div className="aspect-square bg-slate-100">
                          <img
                            src={imgUrl}
                            alt={`Image ${idx + 1}`}
                            className="w-full h-full object-cover"
                            onLoad={(e) => {
                              const img = e.target as HTMLImageElement;
                              const sizeTag = img.nextElementSibling as HTMLElement;
                              if (sizeTag && sizeTag.classList.contains('image-size-tag')) {
                                sizeTag.textContent = `${img.naturalWidth} × ${img.naturalHeight}px`;
                              }
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x300?text=Error+Loading';
                            }}
                          />
                          <div className="image-size-tag absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded font-mono">
                            ...
                          </div>
                        </div>
                        {idx === imageGallery.currentSelected && (
                          <div className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full p-1">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          Ảnh {idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 text-center">
                  Click vào ảnh để chọn. Ảnh được chọn sẽ thay thế trong bài viết.
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Rename Workflow Dialog */}
      {showRenameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowRenameDialog(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <Edit className="w-5 h-5 mr-2 text-blue-600" />
              Đổi tên Workflow
            </h3>
            <input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              placeholder="Nhập tên mới..."
              className="w-full text-sm border-slate-300 rounded px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameInput.trim()) handleRenameWorkflow();
                if (e.key === 'Escape') setShowRenameDialog(false);
              }}
            />
            <div className="flex space-x-2">
              <button
                onClick={handleRenameWorkflow}
                disabled={!renameInput.trim()}
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lưu
              </button>
              <button
                onClick={() => {
                  setShowRenameDialog(false);
                  setRenameWorkflowId(null);
                  setRenameInput("");
                }}
                className="flex-1 bg-slate-100 text-slate-600 py-2 rounded text-sm hover:bg-slate-200 font-medium"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
