import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ParsedData {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ParseResult {
  success: boolean;
  data?: ParsedData;
  error?: string;
}

/**
 * Parse CSV file với hỗ trợ tiếng Việt (UTF-8)
 */
export async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      encoding: 'UTF-8',
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          resolve({
            success: false,
            error: `CSV parse error: ${results.errors[0].message}`
          });
          return;
        }

        const headers = results.meta.fields || [];
        const rows = results.data as Record<string, string>[];

        if (headers.length === 0) {
          resolve({
            success: false,
            error: 'Không tìm thấy tiêu đề cột trong file CSV'
          });
          return;
        }

        resolve({
          success: true,
          data: {
            headers,
            rows
          }
        });
      },
      error: (error) => {
        resolve({
          success: false,
          error: `Failed to read CSV: ${error.message}`
        });
      }
    });
  });
}

/**
 * Parse XLSX file với hỗ trợ tiếng Việt
 */
export async function parseXLSX(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      codepage: 65001 // UTF-8 for Vietnamese support
    });

    // Lấy sheet đầu tiên
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return {
        success: false,
        error: 'File Excel không có sheet nào'
      };
    }

    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON với header
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false
    }) as string[][];

    if (jsonData.length === 0) {
      return {
        success: false,
        error: 'File Excel trống'
      };
    }

    // Dòng đầu tiên là headers
    const headers = jsonData[0].map(h => String(h).trim());

    if (headers.length === 0) {
      return {
        success: false,
        error: 'Không tìm thấy tiêu đề cột trong file Excel'
      };
    }

    // Các dòng còn lại là data
    const rows = jsonData.slice(1).map(row => {
      const rowData: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowData[header] = row[index] !== undefined ? String(row[index]).trim() : '';
      });
      return rowData;
    });

    return {
      success: true,
      data: {
        headers,
        rows
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse XLSX: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Parse file based on extension
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    return parseCSV(file);
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return parseXLSX(file);
  } else {
    return {
      success: false,
      error: 'Định dạng file không được hỗ trợ. Chỉ chấp nhận CSV hoặc XLSX/XLS'
    };
  }
}

/**
 * Extract Google Sheet ID from URL
 * Supports various Google Sheets URL formats
 */
export function parseGoogleSheetUrl(url: string): { sheetId: string; gid?: string } | null {
  try {
    // Pattern 1: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit...
    let match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      const sheetId = match[1];

      // Try to extract gid (sheet tab id) if present
      const gidMatch = url.match(/[#&]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : undefined;

      return { sheetId, gid };
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch and parse data from Google Sheet URL
 */
export async function fetchGoogleSheet(url: string): Promise<ParseResult> {
  try {
    const parsed = parseGoogleSheetUrl(url);

    if (!parsed) {
      return {
        success: false,
        error: 'URL Google Sheet không hợp lệ. Vui lòng sử dụng URL dạng: https://docs.google.com/spreadsheets/d/...'
      };
    }

    // Construct CSV export URL
    let exportUrl = `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/export?format=csv`;
    if (parsed.gid) {
      exportUrl += `&gid=${parsed.gid}`;
    }

    // Fetch CSV data
    const response = await fetch(exportUrl);

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        return {
          success: false,
          error: 'Không thể truy cập Google Sheet. Vui lòng đảm bảo sheet được chia sẻ công khai hoặc "Anyone with the link can view".'
        };
      }
      return {
        success: false,
        error: `Lỗi khi tải Google Sheet: ${response.statusText}`
      };
    }

    const csvText = await response.text();

    // Parse CSV using PapaParse
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        encoding: 'UTF-8',
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            resolve({
              success: false,
              error: `Lỗi parse dữ liệu: ${results.errors[0].message}`
            });
            return;
          }

          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];

          if (headers.length === 0) {
            resolve({
              success: false,
              error: 'Không tìm thấy tiêu đề cột trong Google Sheet'
            });
            return;
          }

          resolve({
            success: true,
            data: {
              headers,
              rows
            }
          });
        },
        error: (error) => {
          resolve({
            success: false,
            error: `Lỗi parse CSV: ${error.message}`
          });
        }
      });
    });
  } catch (error) {
    return {
      success: false,
      error: `Lỗi khi tải Google Sheet: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Generate template variables from input keys
 */
export function extractInputVariables(template: string): string[] {
  const regex = /\{\{(input\d*)\}\}/g;
  const matches = new Set<string>();
  let match;

  while ((match = regex.exec(template)) !== null) {
    matches.add(match[1]); // e.g., "input", "input1", "input2"
  }

  return Array.from(matches).sort((a, b) => {
    // Sort: "input" first, then "input1", "input2", etc.
    if (a === 'input') return -1;
    if (b === 'input') return 1;
    const numA = parseInt(a.replace('input', '')) || 0;
    const numB = parseInt(b.replace('input', '')) || 0;
    return numA - numB;
  });
}
