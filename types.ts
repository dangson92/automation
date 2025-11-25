
export enum Status {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface WorkflowStep {
  id: string;
  name: string;
  template: string; // e.g. "Translate this: {{prev}}"
  url: string; // Target URL for this specific step
  selectors?: {
    input?: string;
    submit?: string;
    output?: string;
  };
}

export interface StepResult {
  stepId: string;
  stepName: string;
  prompt: string;
  response: string;
  timestamp: number;
  url?: string;
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
      runAutomation: (data: { url: string; selectors: any; prompt: string; headless: boolean }) => Promise<{ success?: boolean; text?: string; error?: string }>;
      stopAutomation: () => Promise<{ success?: boolean; message?: string }>;
      openLoginWindow: (url: string) => Promise<{ success?: boolean }>;
      pickSelector: (url: string) => Promise<{ success?: boolean; selector?: string | null }>;
    };
  }
}
