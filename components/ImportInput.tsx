import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Link2, Loader2, Plus, ChevronRight } from 'lucide-react';
import { parseFile, ParsedData, fetchGoogleSheet } from '../services/parseFileService';
import { QueueItem, Status, WorkflowStep } from '../types';

interface ImportInputProps {
  steps: WorkflowStep[];
  onAddToQueue: (items: QueueItem[]) => void;
  currentWorkflowId?: string;
  onMappingChange?: (mappedCount: number) => void;
}

interface ColumnMapping {
  [inputVariable: string]: string;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const ImportInput: React.FC<ImportInputProps> = ({ steps, onAddToQueue, currentWorkflowId, onMappingChange }) => {
  const [importMode, setImportMode] = useState<'file' | 'googlesheet'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>('');
  const [isLoadingSheet, setIsLoadingSheet] = useState<boolean>(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [visibleInputCount, setVisibleInputCount] = useState<number>(3); // Start with input, input1, input2
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false); // Collapse after adding to queue
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
        const initialMapping = { input: result.data.headers[0] };
        setMapping(initialMapping);
        onMappingChange?.(1);
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
    setVisibleInputCount(3);
    setIsCollapsed(false);
    onMappingChange?.(0);
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
        const initialMapping = { input: result.data.headers[0] };
        setMapping(initialMapping);
        onMappingChange?.(1);
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
    setVisibleInputCount(3);
    setIsCollapsed(false);
    onMappingChange?.(0);
  };

  const handleMappingChangeInternal = (inputVar: string, column: string) => {
    setMapping(prev => {
      const newMapping = { ...prev };
      if (column === '') {
        delete newMapping[inputVar];
      } else {
        newMapping[inputVar] = column;
      }
      onMappingChange?.(Object.keys(newMapping).length);
      return newMapping;
    });
  };

  const handleRemoveInput = (inputVar: string) => {
    // Remove from mapping
    setMapping(prev => {
      const newMapping = { ...prev };
      delete newMapping[inputVar];
      onMappingChange?.(Object.keys(newMapping).length);
      return newMapping;
    });
    // Decrease visible count
    if (visibleInputCount > 3) {
      setVisibleInputCount(prev => prev - 1);
    }
  };

  const handleAddToQueue = () => {
    if (!parsedData || !mapping.input) {
      setError('Bạn phải map ít nhất cột "{{input}}" trước khi thêm vào queue');
      return;
    }

    const newItems: QueueItem[] = parsedData.rows.map(row => {
      const mappedData: Record<string, string> = {};
      Object.keys(mapping).forEach(inputVar => {
        const column = mapping[inputVar];
        mappedData[inputVar] = row[column] || '';
      });

      // Use the mapped {{input}} value as originalPrompt for display
      const primaryInput = mappedData['input'] || '';

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

    // Collapse the import area after adding to queue
    setIsCollapsed(true);
  };

  const getSampleValues = (inputVar: string): string[] => {
    if (!parsedData || !mapping[inputVar]) return [];
    const column = mapping[inputVar];
    return parsedData.rows.slice(0, 3).map(row => row[column] || '-');
  };

  const inputVariables = getVisibleInputVariables();
  const currentStep = !parsedData ? 1 : 2;

  // Collapsed view after adding to queue
  if (isCollapsed && parsedData) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">
              Đã thêm {parsedData.rows.length} dòng vào queue
            </span>
          </div>
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
          >
            Import thêm
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" style={{ minHeight: '280px' }}>
      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${currentStep === 1 ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-green-50 text-green-600 border border-green-200'}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${currentStep === 1 ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
            {currentStep === 1 ? '1' : <CheckCircle2 className="w-3 h-3" />}
          </div>
          <span className="font-medium">Import</span>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${currentStep === 2 ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${currentStep === 2 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-white'}`}>
            2
          </div>
          <span className="font-medium">Mapping</span>
        </div>
      </div>

      {/* Step 1: Import */}
      {currentStep === 1 && (
        <div className="space-y-3">
          {/* Mode Switcher */}
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

          {/* Import Area - Fixed Height */}
          <div style={{ minHeight: '180px' }}>
            {importMode === 'file' ? (
              <div className="border border-slate-300 rounded-lg p-6 h-full flex items-center justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />

                {!file ? (
                  <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer w-full">
                    <Upload className="w-12 h-12 text-slate-400 mb-3" />
                    <p className="text-sm font-medium text-slate-700">Click để chọn file</p>
                    <p className="text-xs text-slate-500 mt-1">CSV, XLSX, XLS (có tiêu đề cột)</p>
                  </label>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-8 h-8 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button onClick={handleRemoveFile} className="p-2 hover:bg-slate-100 rounded-lg">
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-slate-300 rounded-lg p-4 space-y-3 h-full flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">Google Sheet URL</p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && googleSheetUrl.trim()) {
                        handleLoadGoogleSheet();
                      }
                    }}
                  />
                  <button
                    onClick={handleLoadGoogleSheet}
                    disabled={!googleSheetUrl.trim() || isLoadingSheet}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isLoadingSheet ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tải...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Tải dữ liệu</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-500 italic">
                  💡 Sheet phải được chia sẻ công khai hoặc "Anyone with the link can view"
                </p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Mapping */}
      {currentStep === 2 && parsedData && (
        <div className="space-y-3">
          {/* Mapping Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Table Header with Data Info */}
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Mapping {parsedData.headers.length} cột với {parsedData.rows.length} dòng
                <span className="text-slate-500 font-normal ml-1">
                  ({importMode === 'file' ? file?.name : 'Google Sheet'})
                </span>
              </h3>
              <button
                onClick={() => {
                  if (importMode === 'file') {
                    handleRemoveFile();
                  } else {
                    handleClearGoogleSheet();
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
              >
                Đổi file khác
              </button>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              <div className="col-span-2">Biến</div>
              <div className="col-span-3">Trường dữ liệu</div>
              <div className="col-span-7">Data Preview (3 dòng đầu)</div>
            </div>

            {/* Table Body - Fixed Height with Scroll */}
            <div style={{ height: '192px', overflowY: 'auto' }}>
              {inputVariables.map(inputVar => {
                const sampleValues = getSampleValues(inputVar);
                return (
                  <div key={inputVar} className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-slate-100 hover:bg-slate-50 text-xs items-center">
                    <div className="col-span-2 flex items-center gap-1">
                      <span className="px-2 py-1 bg-blue-50 border border-blue-200 rounded font-mono text-blue-700">
                        {`{{${inputVar}}}`}
                      </span>
                      {inputVar === 'input' && <span className="text-red-500">*</span>}
                      {inputVar !== 'input' && visibleInputCount > 3 && (
                        <button
                          onClick={() => handleRemoveInput(inputVar)}
                          className="p-0.5 hover:bg-red-100 rounded"
                          title="Xóa biến này"
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </button>
                      )}
                    </div>

                    <div className="col-span-3">
                      <select
                        value={mapping[inputVar] || ''}
                        onChange={(e) => handleMappingChangeInternal(inputVar, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">-- Không map --</option>
                        {parsedData.headers.map(header => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-7 flex gap-2">
                      {sampleValues.length > 0 ? (
                        sampleValues.map((value, idx) => (
                          <div key={idx} className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-700 truncate" title={value}>
                            {value}
                          </div>
                        ))
                      ) : (
                        <div className="flex-1 px-2 py-1 text-slate-400 italic">
                          Chưa map
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add More Button */}
            {visibleInputCount < 20 && (
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
                <button
                  onClick={() => setVisibleInputCount(prev => prev + 1)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm input variable (tối đa input20)</span>
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 italic">
            * <code className="font-mono text-blue-600">{'{{input}}'}</code> là bắt buộc
          </p>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Add to Queue Button */}
          <button
            onClick={handleAddToQueue}
            disabled={!mapping.input}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            <Upload className="w-4 h-4" />
            <span>Thêm {parsedData.rows.length} dòng vào Queue</span>
          </button>
        </div>
      )}
    </div>
  );
};
