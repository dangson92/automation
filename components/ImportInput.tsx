import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Link2, Loader2, Plus } from 'lucide-react';
import { parseFile, ParsedData, fetchGoogleSheet } from '../services/parseFileService';
import { QueueItem, Status, WorkflowStep } from '../types';

interface ImportInputProps {
  steps: WorkflowStep[];
  onAddToQueue: (items: QueueItem[]) => void;
  currentWorkflowId?: string;
}

interface ColumnMapping {
  [inputVariable: string]: string;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const ImportInput: React.FC<ImportInputProps> = ({ steps, onAddToQueue, currentWorkflowId }) => {
  const [importMode, setImportMode] = useState<'file' | 'googlesheet'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>('');
  const [isLoadingSheet, setIsLoadingSheet] = useState<boolean>(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [visibleInputCount, setVisibleInputCount] = useState<number>(4);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getVisibleInputVariables = () => {
    const variables: string[] = ['input'];
    for (let i = 1; i < visibleInputCount; i++) {
      variables.push(`input${i}`);
    }
    return variables;
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
      if (result.data.headers.length > 0) {
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

  const handleLoadGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      setError('Vui lòng nhập URL Google Sheet');
      return;
    }

    setIsLoadingSheet(true);
    setError('');
    setParsedData(null);
    setMapping({});

    const result = await fetchGoogleSheet(googleSheetUrl);

    setIsLoadingSheet(false);

    if (result.success && result.data) {
      setParsedData(result.data);
      if (result.data.headers.length > 0) {
        setMapping({ input: result.data.headers[0] });
      }
    } else {
      setError(result.error || 'Unknown error');
    }
  };

  const handleClearGoogleSheet = () => {
    setGoogleSheetUrl('');
    setParsedData(null);
    setError('');
    setMapping({});
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
      const primaryInput = row[mapping.input] || '';

      const mappedData: Record<string, string> = {};
      Object.keys(mapping).forEach(inputVar => {
        const column = mapping[inputVar];
        mappedData[inputVar] = row[column] || '';
      });

      return {
        id: generateId(),
        originalPrompt: primaryInput,
        status: Status.QUEUED,
        currentStepIndex: 0,
        results: [],
        logs: [],
        workflowId: currentWorkflowId || undefined,
        mappedInputs: mappedData
      } as QueueItem & { mappedInputs?: Record<string, string> };
    });

    onAddToQueue(newItems);

    if (importMode === 'file') {
      handleRemoveFile();
    } else {
      handleClearGoogleSheet();
    }
  };

  const inputVariables = getVisibleInputVariables();

  return (
    <div className="space-y-3">
      {/* Import Mode Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setImportMode('file');
            handleClearGoogleSheet();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded ${
            importMode === 'file'
              ? 'bg-blue-50 text-blue-600 border border-blue-200'
              : 'text-slate-600 hover:bg-slate-50 border border-transparent'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload File</span>
        </button>
        <button
          onClick={() => {
            setImportMode('googlesheet');
            handleRemoveFile();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded ${
            importMode === 'googlesheet'
              ? 'bg-blue-50 text-blue-600 border border-blue-200'
              : 'text-slate-600 hover:bg-slate-50 border border-transparent'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Google Sheet</span>
        </button>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left Column: File/Google Sheet Input */}
        <div className="space-y-2">
          {importMode === 'file' ? (
            <div className="border border-slate-300 rounded-lg p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />

              {!file ? (
                <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer py-2">
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-medium text-slate-700">Click để chọn file</p>
                  <p className="text-[10px] text-slate-500">CSV, XLSX, XLS</p>
                </label>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="text-xs font-medium text-slate-700">{file.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {(file.size / 1024).toFixed(1)} KB
                        {parsedData && ` • ${parsedData.rows.length} dòng`}
                      </p>
                    </div>
                  </div>
                  <button onClick={handleRemoveFile} className="p-1 hover:bg-slate-100 rounded">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-slate-300 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-700">Google Sheet URL</p>
              </div>

              <div className="flex gap-1">
                <input
                  type="text"
                  value={googleSheetUrl}
                  onChange={(e) => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && googleSheetUrl.trim()) {
                      handleLoadGoogleSheet();
                    }
                  }}
                />
                <button
                  onClick={handleLoadGoogleSheet}
                  disabled={!googleSheetUrl.trim() || isLoadingSheet}
                  className="px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {isLoadingSheet ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {parsedData && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <p className="text-[10px] text-green-700">
                    {parsedData.rows.length} dòng • {parsedData.headers.length} cột
                  </p>
                  <button onClick={handleClearGoogleSheet} className="ml-auto p-0.5 hover:bg-green-100 rounded">
                    <X className="w-3 h-3 text-green-600" />
                  </button>
                </div>
              )}

              <p className="text-[10px] text-slate-500 italic">
                💡 Sheet phải được chia sẻ công khai
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Right Column: Mapping */}
        {parsedData && (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <div className="flex items-center gap-1">
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                <h3 className="text-xs font-semibold text-slate-700">Mapping</h3>
              </div>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {inputVariables.map(inputVar => (
                <div key={inputVar} className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-mono text-blue-700 w-16 flex-shrink-0 text-center">
                    {`{{${inputVar}}}`}
                    {inputVar === 'input' && <span className="text-red-500">*</span>}
                  </span>

                  <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />

                  <select
                    value={mapping[inputVar] || ''}
                    onChange={(e) => handleMappingChange(inputVar, e.target.value)}
                    className="flex-1 px-2 py-0.5 border border-slate-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Không map --</option>
                    {parsedData.headers.map(header => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>

                  {mapping[inputVar] && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {visibleInputCount < 10 && (
              <button
                onClick={() => setVisibleInputCount(prev => prev + 1)}
                className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Thêm input variable</span>
              </button>
            )}

            <p className="text-[10px] text-slate-500 italic pt-1">
              * <code className="font-mono text-blue-600">{'{{input}}'}</code> bắt buộc
            </p>

            {/* Add to Queue Button */}
            <button
              onClick={handleAddToQueue}
              disabled={!mapping.input}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg text-xs font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Thêm {parsedData.rows.length} dòng vào Queue</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
