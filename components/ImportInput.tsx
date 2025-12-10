import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { parseFile, ParsedData, extractInputVariables } from '../services/parseFileService';
import { QueueItem, Status, WorkflowStep } from '../types';

interface ImportInputProps {
  steps: WorkflowStep[];
  onAddToQueue: (items: QueueItem[]) => void;
  currentWorkflowId?: string;
}

interface ColumnMapping {
  [inputVariable: string]: string; // e.g., { "input": "Title", "input1": "Content" }
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const ImportInput: React.FC<ImportInputProps> = ({ steps, onAddToQueue, currentWorkflowId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [inputVariables, setInputVariables] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract all input variables from all steps
  const extractAllInputVariables = () => {
    const allVariables = new Set<string>();

    steps.forEach(step => {
      const vars = extractInputVariables(step.template);
      vars.forEach(v => allVariables.add(v));
    });

    // Always include "input" as the primary variable
    allVariables.add('input');

    return Array.from(allVariables).sort((a, b) => {
      if (a === 'input') return -1;
      if (b === 'input') return 1;
      const numA = parseInt(a.replace('input', '')) || 0;
      const numB = parseInt(b.replace('input', '')) || 0;
      return numA - numB;
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError('');
    setParsedData(null);
    setMapping({});

    const result = await parseFile(selectedFile);

    if (result.success && result.data) {
      setParsedData(result.data);

      // Extract input variables from steps
      const variables = extractAllInputVariables();
      setInputVariables(variables);

      // Auto-map first column to "input"
      if (result.data.headers.length > 0 && variables.includes('input')) {
        setMapping({ input: result.data.headers[0] });
      }
    } else {
      setError(result.error || 'Unknown error');
      setFile(null);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setParsedData(null);
    setError('');
    setMapping({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMappingChange = (inputVar: string, column: string) => {
    setMapping(prev => ({
      ...prev,
      [inputVar]: column
    }));
  };

  const handleAddToQueue = () => {
    if (!parsedData || !mapping.input) {
      setError('Bạn phải map ít nhất cột "{{input}}" trước khi thêm vào queue');
      return;
    }

    const newItems: QueueItem[] = parsedData.rows.map(row => {
      // Build originalPrompt from mapped columns
      // Primary input is always from "input" mapping
      const primaryInput = row[mapping.input] || '';

      // Store all mapped data as a combined originalPrompt
      // We'll use a special format to preserve all mapped data
      const mappedData: Record<string, string> = {};
      Object.keys(mapping).forEach(inputVar => {
        const column = mapping[inputVar];
        mappedData[inputVar] = row[column] || '';
      });

      return {
        id: generateId(),
        originalPrompt: primaryInput, // Primary input for display
        status: Status.QUEUED,
        currentStepIndex: 0,
        results: [],
        logs: [],
        workflowId: currentWorkflowId || undefined,
        // Store mapping data in a custom field (we'll extend QueueItem type)
        mappedInputs: mappedData
      } as QueueItem & { mappedInputs?: Record<string, string> };
    });

    onAddToQueue(newItems);

    // Reset after adding
    handleRemoveFile();
  };

  const getMappedPreview = () => {
    if (!parsedData || !mapping.input) return null;

    // Show first 3 rows as preview
    return parsedData.rows.slice(0, 3).map((row, idx) => {
      const mappedValues: Record<string, string> = {};
      Object.keys(mapping).forEach(inputVar => {
        const column = mapping[inputVar];
        mappedValues[inputVar] = row[column] || '';
      });
      return { rowIndex: idx, values: mappedValues };
    });
  };

  return (
    <div className="space-y-4">
      {/* File Upload Area */}
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-slate-400 transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />

        {!file ? (
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            <Upload className="w-12 h-12 text-slate-400 mb-3" />
            <p className="text-sm font-medium text-slate-700 mb-1">
              Click để chọn file hoặc kéo thả vào đây
            </p>
            <p className="text-xs text-slate-500">
              Hỗ trợ CSV, XLSX, XLS (có tiêu đề cột)
            </p>
          </label>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                  {parsedData && ` • ${parsedData.rows.length} dòng`}
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Column Mapping Interface */}
      {parsedData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">
              Mapping Cột với Input Variables
            </h3>
          </div>

          <div className="grid gap-3">
            {inputVariables.map(inputVar => (
              <div key={inputVar} className="flex items-center gap-3">
                <div className="w-32 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-mono text-blue-700">
                    {`{{${inputVar}}}`}
                    {inputVar === 'input' && (
                      <span className="text-[10px] text-blue-500">*</span>
                    )}
                  </span>
                </div>

                <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />

                <select
                  value={mapping[inputVar] || ''}
                  onChange={(e) => handleMappingChange(inputVar, e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Không map --</option>
                  {parsedData.headers.map(header => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>

                {mapping[inputVar] && (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 italic">
            * <code className="font-mono text-blue-600">{'{{input}}'}</code> là bắt buộc và sẽ hiển thị ở cột input trong queue
          </p>

          {/* Preview */}
          {mapping.input && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                Preview (3 dòng đầu)
              </h4>
              <div className="space-y-2">
                {getMappedPreview()?.map(({ rowIndex, values }) => (
                  <div key={rowIndex} className="p-3 bg-white rounded border border-slate-200">
                    <div className="space-y-1">
                      {Object.entries(values).map(([inputVar, value]) => (
                        <div key={inputVar} className="flex gap-2 text-xs">
                          <span className="font-mono text-blue-600 font-semibold min-w-[80px]">
                            {`{{${inputVar}}}`}:
                          </span>
                          <span className="text-slate-700 truncate">{value || '(trống)'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add to Queue Button */}
          <button
            onClick={handleAddToQueue}
            disabled={!mapping.input}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-medium text-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            <Upload className="w-4 h-4" />
            <span>
              Thêm {parsedData.rows.length} dòng vào Queue
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
