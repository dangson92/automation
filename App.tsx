import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Pause, Plus, Trash2, Download, Save, UserCog, ChevronDown, Bot, Layout, Zap, X, Globe, HelpCircle, ArrowRight, Link as LinkIcon, Target, CheckCircle2, Cpu, FileText, Box, Layers, AlertTriangle, Monitor, Eye, EyeOff, Settings } from 'lucide-react';
import { Status, QueueItem, AppConfig, SavedAgent, AutomationConfig, WorkflowStep, StepResult } from './types';
import { generateContent } from './services/geminiService';
import { StatusBadge } from './components/StatusBadge';

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
  outputSelector: ".markdown",
};

// Check if running as Chrome Extension
const isExtension = () => {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
};

// Check if running as Electron App
const isElectron = () => {
  return !!window.electronAPI;
};

const App: React.FC = () => {
  // --- State ---
  // Queue will be loaded from file (Electron) or localStorage (web) in useEffect
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
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

  // --- Init ---
  useEffect(() => {
    const initApp = async () => {
      if (isElectron()) {
        setMode('ELECTRON');
        // Load queue from file in Electron mode
        try {
          const result = await window.electronAPI.loadQueue();
          if (result.success && result.data) {
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
    localStorage.setItem('promptflow_agents', JSON.stringify(savedAgents));
  }, [savedAgents]);

  useEffect(() => {
    localStorage.setItem('promptflow_custom_login_urls', JSON.stringify(customLoginUrls));
  }, [customLoginUrls]);

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
      logs: []
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
    if (selectedItemIds.size === queue.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(queue.map(item => item.id)));
    }
  };

  const updateItemStatus = (id: string, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
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
  const handleSaveAgent = (saveAsNew = false) => {
    if (!agentNameInput.trim()) return;

    // If we have a current workflow ID and not explicitly saving as new, update it
    if (currentWorkflowId && !saveAsNew) {
      setSavedAgents(prev => prev.map(agent =>
        agent.id === currentWorkflowId
          ? {
              ...agent,
              name: agentNameInput,
              config: { ...config },
              automationConfig: { ...automationConfig }
            }
          : agent
      ));
    } else {
      // Create new workflow
      const newAgent: SavedAgent = {
        id: generateId(),
        name: agentNameInput,
        config: { ...config },
        automationConfig: { ...automationConfig }
      };
      setSavedAgents(prev => [...prev, newAgent]);
      setCurrentWorkflowId(newAgent.id); // Set as current workflow
    }

    setAgentNameInput("");
    setShowSaveAgent(false);
  };

  const handleLoadAgent = (agentId: string) => {
    const agent = savedAgents.find(a => a.id === agentId);
    if (agent) {
      setConfig(agent.config);
      if (agent.automationConfig) setAutomationConfig(agent.automationConfig);
      if (agent.config.steps.length > 0) setExpandedStepId(agent.config.steps[0].id);
      setCurrentWorkflowId(agentId); // Track which workflow is loaded
      setAgentNameInput(agent.name); // Pre-fill the name for updates
    }
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
  const runExtensionStep = async (step: WorkflowStep, prompt: string, appendLog: (msg: string) => void): Promise<string> => {
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
                                const lastEl = outEls[outEls.length - 1] as HTMLElement;
                                if (lastEl.innerText.length > 5) {
                                    clearInterval(interval);
                                    resolveScript({ success: true, text: lastEl.innerText });
                                }
                            }
                            if (attempts >= maxAttempts) {
                                clearInterval(interval);
                                const lastEl = outEls[outEls.length - 1] as HTMLElement;
                                resolveScript({ 
                                    success: true, 
                                    text: lastEl ? lastEl.innerText : "Timeout: Không tìm thấy kết quả" 
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
            else resolve(result.text);
         });
      };
    });
  };

  // --- PROCESSING LOGIC ---
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    
    setIsProcessing(true);
    processingRef.current = true;
    stopRef.current = false;

    const idsToProcess = queue
      .filter(item => item.status !== Status.COMPLETED)
      .map(item => item.id);

    const totalSteps = idsToProcess.length * config.steps.length;
    let completedStepsTotal = 0; 

    for (const id of idsToProcess) {
      if (stopRef.current) break;

      let currentItem = queue.find(i => i.id === id);
      if (!currentItem) continue;

      updateItemStatus(id, { status: Status.RUNNING });

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
          const stepUrl = step.url || automationConfig.defaultUrl;
          appendLog(id, `Đang chạy: ${step.name}...`);

          // Replace template variables
          let promptToSend = step.template.replace(/\{\{input\}\}/g, currentItem.originalPrompt);

          // Replace {{prev}} with result from previous step
          promptToSend = promptToSend.replace(/\{\{prev\}\}/g, previousResult);

          // Replace {{prev1}}, {{prev2}}, etc. with results from specific steps using localResults
          for (let prevIdx = 0; prevIdx < i; prevIdx++) {
            const prevResult = localResults[prevIdx]?.response || '';
            const prevVar = `{{prev${prevIdx + 1}}}`;
            promptToSend = promptToSend.replace(new RegExp(prevVar.replace(/[{}]/g, '\\$&'), 'g'), prevResult);
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
             appendLog(id, `[DESKTOP] Nhận kết quả: ${stepResponse.substring(0, 30)}...`);

          } else if (mode === 'EXTENSION') {
             // --- EXTENSION MODE ---
             try {
                stepResponse = await runExtensionStep(step, promptToSend, (msg) => appendLog(id, msg));
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

          previousResult = stepResponse;

          const resultEntry: StepResult = {
            stepId: step.id,
            stepName: step.name,
            prompt: promptToSend,
            response: stepResponse,
            timestamp: Date.now(),
            url: stepUrl
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
          updateItemStatus(id, { status: Status.COMPLETED });
          appendLog(id, "Hoàn tất quy trình.");
        }

      } catch (err: any) {
        appendLog(id, `LỖI: ${err.message}`);
        updateItemStatus(id, { status: Status.FAILED, error: err.message });
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

  const stats = {
    total: queue.length,
    completed: queue.filter(i => i.status === Status.COMPLETED).length,
    failed: queue.filter(i => i.status === Status.FAILED).length,
    queued: queue.filter(i => i.status === Status.QUEUED).length,
  };

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
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
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

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
          {/* Status Alert */}
          {mode === 'ELECTRON' ? (
             <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                 <div className="flex items-center space-x-2 text-blue-700 font-bold text-xs mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Desktop App Active</span>
                 </div>
                 <p className="text-[10px] text-blue-600 leading-relaxed">
                    Ứng dụng đang chạy quyền Desktop.
                 </p>
             </div>
          ) : mode === 'EXTENSION' ? (
             <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                 <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Extension Active</span>
                 </div>
             </div>
          ) : (
             <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800 flex items-start">
                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                <div>
                    Đang ở chế độ <strong>Giả lập Web</strong>. Chạy ứng dụng Desktop để có đầy đủ tính năng automation.
                    <button onClick={() => setShowHelp(true)} className="block mt-1 underline font-bold">Xem hướng dẫn</button>
                </div>
             </div>
          )}

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
                               <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-xs font-bold text-slate-600">
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

                         {expandedStepId === step.id && (
                            <div className="p-3 pt-0 border-t border-slate-50 animate-in slide-in-from-top-2 duration-200">
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
                                      />
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
                                     <button
                                       type="button"
                                       onClick={() => {
                                         const textarea = document.getElementById(`template-${step.id}`) as HTMLTextAreaElement;
                                         if (textarea) {
                                           const cursorPos = textarea.selectionStart;
                                           const textBefore = step.template.substring(0, cursorPos);
                                           const textAfter = step.template.substring(cursorPos);
                                           handleUpdateStep(step.id, 'template', textBefore + '{{input}}' + textAfter);
                                           setTimeout(() => {
                                             textarea.focus();
                                             textarea.setSelectionRange(cursorPos + 9, cursorPos + 9);
                                           }, 0);
                                         }
                                       }}
                                       className="text-[10px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-700 font-mono cursor-pointer transition-colors"
                                     >
                                       {`{{input}}`}
                                     </button>
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

                            </div>
                         )}
                      </div>
                   </div>
                ))}
             </div>
          </section>

          {/* Saved Workflows List */}
          {savedAgents.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3 flex items-center">
                <Layers className="w-3 h-3 mr-1" />
                Workflows đã lưu
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {savedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="group relative bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => handleLoadAgent(agent.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-700 truncate">
                          {agent.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {agent.config.steps.length} bước • {agent.config.model}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteAgent(agent.id, e)}
                        className="opacity-0 group-hover:opacity-100 ml-2 p-1.5 text-slate-400 hover:text-red-500 rounded transition-all"
                        title="Xóa workflow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Agent */}
          <div className="pt-4 border-t border-slate-100">
            {/* Show current workflow indicator */}
            {currentWorkflowId && !showSaveAgent && (
              <div className="mb-2 text-xs text-slate-500 flex items-center justify-between bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                <span className="flex items-center">
                  <FileText className="w-3 h-3 mr-1 text-indigo-600" />
                  <span className="font-semibold text-indigo-700">
                    {savedAgents.find(a => a.id === currentWorkflowId)?.name || 'Workflow đang chỉnh sửa'}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setCurrentWorkflowId(null);
                    setAgentNameInput("");
                  }}
                  className="text-indigo-400 hover:text-indigo-600 transition-colors"
                  title="Tạo workflow mới"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {!showSaveAgent ? (
              <button
                onClick={() => setShowSaveAgent(true)}
                className="w-full flex items-center justify-center space-x-2 py-2 border border-dashed border-indigo-300 text-indigo-600 text-sm rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{currentWorkflowId ? 'Cập nhật Workflow' : 'Lưu Workflow Mới'}</span>
              </button>
            ) : (
              <div className="flex flex-col space-y-2 animate-in fade-in zoom-in duration-200">
                <input
                  value={agentNameInput}
                  onChange={(e) => setAgentNameInput(e.target.value)}
                  placeholder="Đặt tên workflow..."
                  className="w-full text-sm border-slate-300 rounded px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveAgent(false);
                    if (e.key === 'Escape') setShowSaveAgent(false);
                  }}
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleSaveAgent(false)}
                    className="flex-1 bg-indigo-600 text-white py-1.5 rounded text-sm hover:bg-indigo-700 font-semibold"
                  >
                    {currentWorkflowId ? 'Cập nhật' : 'Lưu mới'}
                  </button>
                  {currentWorkflowId && (
                    <button
                      onClick={() => handleSaveAgent(true)}
                      className="flex-1 bg-green-600 text-white py-1.5 rounded text-sm hover:bg-green-700 font-semibold"
                      title="Tạo bản sao mới"
                    >
                      Sao chép
                    </button>
                  )}
                  <button
                    onClick={() => setShowSaveAgent(false)}
                    className="px-3 bg-slate-100 text-slate-600 py-1.5 rounded text-sm hover:bg-slate-200"
                  >
                    Hủy
                  </button>
                </div>
              </div>
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
                       Hệ thống sẽ chạy {inputText.split('\n').filter(l => l.trim()).length} dòng dữ liệu qua {config.steps.length} bước xử lý.
                    </p>
                 </div>
                 <div className="flex items-center space-x-4">
                    {/* RUN CONTROLS */}
                    {isProcessing ? (
                       <button onClick={handleStop} className="flex items-center space-x-2 bg-red-100 text-red-700 px-6 py-2 rounded-lg font-bold hover:bg-red-200 transition-colors">
                          <Pause className="w-5 h-5 fill-current" />
                          <span>Dừng lại</span>
                       </button>
                    ) : (
                       <button onClick={processQueue} disabled={queue.length === 0} className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-2.5 rounded-lg font-bold hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none">
                          <Play className="w-5 h-5 fill-current" />
                          <span>Chạy ngay</span>
                       </button>
                    )}
                 </div>
              </div>
              
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
                     Danh sách công việc ({queue.length})
                   </h3>
                   <div className="flex space-x-2 text-xs">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Xong: {stats.completed}</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Chờ: {stats.queued}</span>
                   </div>
                </div>
                <div className="flex items-center space-x-2">
                   {selectedItemIds.size > 0 && (
                      <span className="text-xs text-slate-500 mr-2">
                        Đã chọn: <span className="font-bold text-indigo-600">{selectedItemIds.size}</span>
                      </span>
                   )}
                   <button onClick={handleExportCSV} disabled={queue.length === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors disabled:opacity-50">
                      <Download className="w-4 h-4" />
                      <span>Excel</span>
                   </button>
                   <button onClick={handleDeleteSelected} disabled={selectedItemIds.size === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-orange-300 rounded-md text-sm text-orange-600 hover:bg-orange-50 hover:text-orange-700 transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa đã chọn</span>
                   </button>
                   <button onClick={handleClearQueue} disabled={queue.length === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa tất cả</span>
                   </button>
                </div>
             </div>

             {/* DATA GRID */}
             <div className="flex-1 overflow-auto custom-scrollbar">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                   <tr>
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-10 sticky left-0 bg-slate-100 z-20">
                       <input
                         type="checkbox"
                         checked={queue.length > 0 && selectedItemIds.size === queue.length}
                         onChange={handleToggleSelectAll}
                         className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                       />
                     </th>
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-12 sticky left-10 bg-slate-100 z-20">#</th>
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-[140px] min-w-[140px] sticky left-[88px] bg-slate-100 z-20 whitespace-nowrap">Trạng thái</th>
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 min-w-[200px] max-w-xs">Input Gốc</th>
                     {config.steps.map(step => (
                        <th key={step.id} className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 min-w-[250px]">
                           <div className="flex items-center space-x-1">
                              <span>{step.name}</span>
                           </div>
                        </th>
                     ))}
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-10"></th>
                   </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-slate-100">
                    {queue.length === 0 && (
                      <tr>
                        <td colSpan={5 + config.steps.length} className="p-10 text-center text-slate-400">
                           <Layout className="w-12 h-12 mx-auto mb-3 opacity-20" />
                           <p>Danh sách trống.</p>
                        </td>
                      </tr>
                    )}
                    {queue.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-indigo-50/50 group transition-colors ${selectedItemId === item.id ? 'bg-indigo-50' : ''}`}
                      >
                        <td className="p-3 sticky left-0 bg-inherit z-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => handleToggleSelect(item.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-xs font-mono text-slate-400 sticky left-10 bg-inherit z-10 cursor-pointer" onClick={() => setSelectedItemId(item.id)}>{idx + 1}</td>
                        <td className="p-3 sticky left-[88px] bg-inherit z-10 whitespace-nowrap cursor-pointer" onClick={() => setSelectedItemId(item.id)}>
                           <StatusBadge status={item.status} />
                        </td>
                        <td className="p-3 text-sm text-slate-800 font-medium truncate max-w-xs align-top cursor-pointer" onClick={() => setSelectedItemId(item.id)}>
                           {item.originalPrompt}
                        </td>
                        
                        {config.steps.map((step, sIdx) => {
                           const result = item.results.find(r => r.stepId === step.id);
                           const isCurrent = item.currentStepIndex === sIdx && item.status === Status.RUNNING;
                           
                           return (
                              <td key={step.id} className="p-3 text-sm text-slate-600 align-top border-l border-slate-50">
                                 {result ? (
                                    <div className="max-h-20 overflow-hidden text-ellipsis line-clamp-3" title={result.response}>
                                       {result.response}
                                    </div>
                                 ) : isCurrent ? (
                                    <div className="flex items-center text-xs text-amber-600 italic">
                                       <Cpu className="w-3 h-3 mr-1 animate-spin" /> Đang chạy...
                                    </div>
                                 ) : (
                                    <span className="text-slate-200 text-xs">-</span>
                                 )}
                              </td>
                           );
                        })}

                        <td className="p-3 text-right align-top">
                           <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
                        </td>
                      </tr>
                    ))}
                 </tbody>
               </table>
             </div>
          </div>

          {/* Detail Panel */}
          {selectedItem && (
             <div className="w-[500px] border-l border-slate-200 bg-white flex flex-col shadow-xl z-30 animate-in slide-in-from-right duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                   <div>
                      <h3 className="font-semibold text-slate-700">Chi tiết</h3>
                      <p className="text-xs text-slate-500">ID: {selectedItem.id}</p>
                   </div>
                   <button onClick={() => setSelectedItemId(null)} className="text-slate-400 hover:text-slate-700">
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
                         <div key={idx} className="relative pl-6 border-l-2 border-indigo-200 last:border-0 pb-6 last:pb-0">
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
                            <div>
                               <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Kết quả</div>
                               <div className="text-sm text-slate-800 bg-white border border-indigo-100 p-3 rounded-lg shadow-sm whitespace-pre-wrap prose prose-sm max-w-none">
                                  {result.response}
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
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
