
export enum Status {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface ImageConfig {
  enabled: boolean;          // Toggle "Thêm ảnh"
  count: number;             // Số lượng shortcode ảnh sẽ thêm vào
  autoInsert: boolean;       // Tự động chèn shortcode vào content
  source: 'perplexity' | 'google' | 'ai'; // Nguồn ảnh
}

export interface ImageData {
  shortcode: string;         // VD: [image1], [image2]
  contextParagraph: string;  // Paragraph ngay phía trên shortcode
  searchQuery: string;       // Query gửi đến Perplexity
  images: string[];          // Array ~20 URLs ảnh từ Perplexity
  selectedImage: string;     // URL ảnh được chọn (random ban đầu)
  selectedIndex: number;     // Index của ảnh trong array
}

export interface WorkflowStep {
  id: string;
  name: string;
  template: string; // e.g. "Translate this: {{prev}}"
  url: string; // Target URL for this specific step
  useCustomSelectors?: boolean; // Toggle for manual CSS selectors
  selectors?: {
    input?: string;
    submit?: string;
    output?: string;
  };
  imageConfig?: ImageConfig; // Cấu hình tạo ảnh cho step này
}

export interface StepResult {
  stepId: string;
  stepName: string;
  prompt: string;
  response: string;
  timestamp: number;
  url?: string;
  imageData?: ImageData[]; // Thông tin ảnh nếu step này có imageConfig
}

export interface QueueItem {
  id: string;
  originalPrompt: string;
  status: Status;
  currentStepIndex: number; // To track progress within workflow
  results: StepResult[]; // History of all steps
  finalResponse?: string; // The output of the last step
  error?: string;
  logs?: string[];
}

export interface AppConfig {
  systemInstruction: string;
  model: string;
  steps: WorkflowStep[]; // Replaces single template
  delayMs: number;
}

export interface AutomationConfig {
  // Global defaults if step url is missing (optional fallback)
  defaultUrl: string;
  inputSelector: string;
  submitSelector: string;
  outputSelector: string;
}

export interface SavedAgent {
  id: string;
  name: string;
  config: AppConfig;
  automationConfig?: AutomationConfig;
}

// Add global type for Electron Bridge
declare global {
  interface Window {
    electronAPI?: {
      runAutomation: (data: { url: string; selectors: any; useCustomSelectors: boolean; prompt: string; headless: boolean }) => Promise<{ success?: boolean; text?: string; url?: string; error?: string }>;
      stopAutomation: () => Promise<{ success?: boolean; message?: string }>;
      openLoginWindow: (url: string) => Promise<{ success?: boolean }>;
      pickSelector: (url: string) => Promise<{ success?: boolean; selector?: string | null }>;
      saveQueue: (queueData: QueueItem[]) => Promise<{ success: boolean; error?: string }>;
      loadQueue: () => Promise<{ success: boolean; data: QueueItem[]; error?: string }>;
      exportSettings: (settings: { config: AppConfig; automationConfig: AutomationConfig }) => Promise<{ success: boolean; path?: string; error?: string }>;
      importSettings: () => Promise<{ success: boolean; data?: { config: AppConfig; automationConfig: AutomationConfig }; error?: string }>;
      searchPerplexityImages: (data: { query: string; headless: boolean }) => Promise<{ success?: boolean; images?: string[]; count?: number; error?: string }>;
    };
  }
}
