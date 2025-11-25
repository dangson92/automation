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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inputText, setInputText] = useState("");
  
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>(DEFAULT_AUTOMATION);
  const [headless, setHeadless] = useState(true); // Default true for automation
  
  const [mode, setMode] = useState<'API' | 'BROWSER' | 'EXTENSION' | 'ELECTRON'>('BROWSER');
  
  // Agent / Preset Management
  const [savedAgents, setSavedAgents] = useState<SavedAgent[]>(() => {
    const saved = localStorage.getItem('promptflow_agents');
    return saved ? JSON.parse(saved) : [];
  });
  const [agentNameInput, setAgentNameInput] = useState("");
  const [showSaveAgent, setShowSaveAgent] = useState(false);

  // UI State
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<'GUIDE' | 'INSTALL'>('GUIDE');
  const [expandedStepId, setExpandedStepId] = useState<string | null>(config.steps[0]?.id || null);

  // Refs
  const stopRef = useRef(false);
  const processingRef = useRef(false);

  // --- Init ---
  useEffect(() => {
    if (isElectron()) {
      setMode('ELECTRON');
    } else if (isExtension()) {
      setMode('EXTENSION');
    }
  }, []);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('promptflow_agents', JSON.stringify(savedAgents));
  }, [savedAgents]);

  // --- Helpers ---
  const generateId = () => Math.random().toString(36).substring(2, 9);

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

  const handleClearQueue = async () => {
    if (confirm("Xóa toàn bộ danh sách kết quả?")) {
      // Stop any running process first
      stopRef.current = true;
      setIsProcessing(false);
      processingRef.current = false;

      // Force stop automation if running in Electron
      if (mode === 'ELECTRON' && window.electronAPI) {
        try {
          await window.electronAPI.stopAutomation();
        } catch (err) {
          console.error('Failed to stop automation:', err);
        }
      }

      // Clear queue
      setQueue([]);
      setProgress(0);
      setSelectedItemId(null);
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
            ...s.selectors,
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
      const result = await window.electronAPI.pickSelector(step.url);
      if (result.success && result.selector) {
        handleUpdateStepSelector(stepId, selectorField, result.selector);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  // --- Agent Management ---
  const handleSaveAgent = () => {
    if (!agentNameInput.trim()) return;
    const newAgent: SavedAgent = {
      id: generateId(),
      name: agentNameInput,
      config: { ...config },
      automationConfig: { ...automationConfig }
    };
    setSavedAgents(prev => [...prev, newAgent]);
    setAgentNameInput("");
    setShowSaveAgent(false);
  };

  const handleLoadAgent = (agentId: string) => {
    const agent = savedAgents.find(a => a.id === agentId);
    if (agent) {
      setConfig(agent.config);
      if (agent.automationConfig) setAutomationConfig(agent.automationConfig);
      if (agent.config.steps.length > 0) setExpandedStepId(agent.config.steps[0].id);
    }
  };

  const handleDeleteAgent = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Xóa Agent này?")) {
      setSavedAgents(prev => prev.filter(a => a.id !== agentId));
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

      try {
        for (let i = startIndex; i < config.steps.length; i++) {
          if (stopRef.current) break;

          const step = config.steps[i];
          const stepUrl = step.url || automationConfig.defaultUrl;
          appendLog(id, `Đang chạy: ${step.name}...`);
          
          let promptToSend = step.template.replace('{{input}}', currentItem.originalPrompt);
          promptToSend = promptToSend.replace('{{prev}}', previousResult);

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

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
      
      {/* --- HELP / INSTALL MODAL --- */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[85vh] flex flex-col overflow-hidden relative">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <HelpCircle className="w-6 h-6 mr-2 text-indigo-600" />
                    Trung tâm Trợ giúp & Cài đặt
                 </h2>
                 <button onClick={() => setShowHelp(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shadow-sm">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-2 flex-shrink-0">
                   <button 
                      onClick={() => setHelpTab('GUIDE')}
                      className={`w-full text-left px-4 py-3 rounded-lg flex items-center space-x-3 transition-all ${helpTab === 'GUIDE' ? 'bg-white shadow-sm text-indigo-600 font-semibold ring-1 ring-indigo-100' : 'text-slate-600 hover:bg-slate-100'}`}
                   >
                      <FileText className="w-5 h-5" />
                      <span>Hướng dẫn cơ bản</span>
                   </button>
                   <button 
                      onClick={() => setHelpTab('INSTALL')}
                      className={`w-full text-left px-4 py-3 rounded-lg flex items-center space-x-3 transition-all ${helpTab === 'INSTALL' ? 'bg-white shadow-sm text-indigo-600 font-semibold ring-1 ring-indigo-100' : 'text-slate-600 hover:bg-slate-100'}`}
                   >
                      <Monitor className="w-5 h-5" />
                      <span>Cài đặt Desktop App</span>
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
                   {helpTab === 'GUIDE' && (
                      <div className="space-y-6">
                         <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Quy trình Tự động</h3>
                            <p className="text-slate-600 text-sm mb-4">Kết nối chuỗi hành động: Bước 1 (Hỏi ChatGPT) {'->'} Bước 2 (Lấy kết quả đó Search Google).</p>
                         </div>
                      </div>
                   )}

                   {helpTab === 'INSTALL' && (
                      <div className="space-y-6">
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6">
                             <h3 className="text-lg font-bold text-blue-900 mb-2">Chạy dưới dạng Desktop App (Electron)</h3>
                             <p className="text-sm text-blue-700 mb-4">Để có cửa sổ ứng dụng riêng biệt và khả năng điều khiển trình duyệt mạnh mẽ nhất.</p>
                             
                             <div className="space-y-4 bg-white p-4 rounded-lg border border-blue-100 font-mono text-xs shadow-sm">
                                <div className="text-slate-500"># 1. Cài đặt Node.js nếu chưa có</div>
                                <div className="text-slate-500"># 2. Tải toàn bộ code về và mở terminal tại thư mục đó</div>
                                <div className="text-slate-500"># 3. Cài đặt thư viện:</div>
                                <div className="font-bold text-slate-800">npm install electron electron-builder --save-dev</div>
                                <div className="font-bold text-slate-800">npm install</div>
                                <div className="text-slate-500 mt-2"># 4. Chạy ứng dụng:</div>
                                <div className="font-bold text-indigo-600">npm start</div>
                             </div>
                          </div>
                      </div>
                   )}
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
           <button onClick={() => { setShowHelp(true); setHelpTab('INSTALL'); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
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
                    Đang ở chế độ <strong>Giả lập Web</strong>. Để chạy thật, vui lòng cài đặt theo hướng dẫn Desktop App.
                    <button onClick={() => { setShowHelp(true); setHelpTab('INSTALL'); }} className="block mt-1 underline font-bold">Xem hướng dẫn</button>
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
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${headless ? 'bg-slate-300' : 'bg-indigo-600'}`}
                 >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${headless ? 'translate-x-1' : 'translate-x-5'}`} />
                 </button>
              </div>

              {/* LOGIN SESSION MANAGEMENT - ELECTRON ONLY */}
              {mode === 'ELECTRON' && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-green-800 mb-1 flex items-center">
                        <UserCog className="w-4 h-4 mr-1" />
                        Quản lý Đăng nhập
                      </div>
                      <p className="text-[10px] text-green-700 leading-relaxed mb-2">
                        Đăng nhập trước để tránh bị gián đoạn giữa chừng. Phiên đăng nhập sẽ được lưu tự động.
                      </p>
                      <button
                        onClick={() => {
                          if (!window.electronAPI) return;
                          const url = config.steps[0]?.url || 'https://chatgpt.com/';

                          // Open login window (non-blocking)
                          window.electronAPI.openLoginWindow(url)
                            .then(() => {
                              console.log('Login window closed, session saved');
                            })
                            .catch((err: any) => {
                              console.error('Login error:', err);
                              alert('Lỗi mở cửa sổ đăng nhập: ' + err.message);
                            });
                        }}
                        className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
                      >
                        <UserCog className="w-3 h-3" />
                        <span>Mở cửa sổ đăng nhập</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </section>

          {/* ... (Existing Steps Editor & Save Logic) ... */}
          <section className="space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Quy trình (Steps)</h2>
                <button onClick={handleAddStep} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded transition-colors text-xs font-bold flex items-center">
                   <Plus className="w-3 h-3 mr-1" /> Thêm
                </button>
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

                               <div className="relative mb-3">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Prompt Template</label>
                                  <textarea 
                                     value={step.template}
                                     onChange={(e) => handleUpdateStep(step.id, 'template', e.target.value)}
                                     className="w-full h-20 bg-white border border-slate-200 rounded-md p-2 text-xs font-mono resize-none focus:outline-none focus:border-indigo-500"
                                  />
                                  <div className="absolute bottom-2 right-2 flex space-x-1">
                                     <span className="text-[10px] bg-slate-100 px-1 rounded text-slate-500">{`{{input}}`}</span>
                                     {index > 0 && <span className="text-[10px] bg-indigo-50 px-1 rounded text-indigo-600">{`{{prev}}`}</span>}
                                  </div>
                               </div>

                               <div className="pt-3 border-t border-slate-100">
                                  <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center">
                                    <Target className="w-3 h-3 mr-1" />
                                    CSS Selectors
                                  </h4>
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
                               </div>

                            </div>
                         )}
                      </div>
                   </div>
                ))}
             </div>
          </section>

          {/* Save Agent */}
          <div className="pt-4 border-t border-slate-100">
            {!showSaveAgent ? (
              <button onClick={() => setShowSaveAgent(true)} className="w-full flex items-center justify-center space-x-2 py-2 border border-dashed border-indigo-300 text-indigo-600 text-sm rounded-lg hover:bg-indigo-50 transition-colors">
                <Save className="w-4 h-4" />
                <span>Lưu Workflow</span>
              </button>
            ) : (
              <div className="flex flex-col space-y-2 animate-in fade-in zoom-in duration-200">
                <input 
                  value={agentNameInput}
                  onChange={(e) => setAgentNameInput(e.target.value)}
                  placeholder="Đặt tên..."
                  className="w-full text-sm border-slate-300 rounded px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button onClick={handleSaveAgent} className="flex-1 bg-indigo-600 text-white py-1.5 rounded text-sm hover:bg-indigo-700">Lưu</button>
                  <button onClick={() => setShowSaveAgent(false)} className="px-3 bg-slate-100 text-slate-600 py-1.5 rounded text-sm hover:bg-slate-200">Hủy</button>
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
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nhập mỗi prompt một dòng..."
                  className="w-full h-24 border border-slate-300 rounded-xl p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm resize-y"
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
                   <button onClick={handleExportCSV} disabled={queue.length === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                      <Download className="w-4 h-4" />
                      <span>Excel</span>
                   </button>
                   <button onClick={handleClearQueue} disabled={queue.length === 0} className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa</span>
                   </button>
                </div>
             </div>

             {/* DATA GRID */}
             <div className="flex-1 overflow-auto custom-scrollbar">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                   <tr>
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-12 sticky left-0 bg-slate-100 z-20">#</th>
                     <th className="p-3 text-xs font-semibold text-slate-500 border-b border-slate-200 w-[140px] min-w-[140px] sticky left-12 bg-slate-100 z-20 whitespace-nowrap">Trạng thái</th>
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
                        <td colSpan={4 + config.steps.length} className="p-10 text-center text-slate-400">
                           <Layout className="w-12 h-12 mx-auto mb-3 opacity-20" />
                           <p>Danh sách trống.</p>
                        </td>
                      </tr>
                    )}
                    {queue.map((item, idx) => (
                      <tr 
                        key={item.id} 
                        onClick={() => setSelectedItemId(item.id)}
                        className={`hover:bg-indigo-50/50 cursor-pointer group transition-colors ${selectedItemId === item.id ? 'bg-indigo-50' : ''}`}
                      >
                        <td className="p-3 text-xs font-mono text-slate-400 sticky left-0 bg-inherit z-10">{idx + 1}</td>
                        <td className="p-3 sticky left-12 bg-inherit z-10 whitespace-nowrap">
                           <StatusBadge status={item.status} />
                        </td>
                        <td className="p-3 text-sm text-slate-800 font-medium truncate max-w-xs align-top">
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