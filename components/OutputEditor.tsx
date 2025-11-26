import React, { useEffect, useRef, useState } from 'react';
import tinymce from 'tinymce/tinymce';
import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/models/dom';
import 'tinymce/skins/ui/oxide/skin.min.css';
import 'tinymce/skins/content/default/content.min.css';
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/image';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/code';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/media';
import 'tinymce/plugins/table';
import 'tinymce/plugins/help';

interface Props {
  initialHtml: string;
  onSave: (html: string) => void;
  onCancel: () => void;
}

export const OutputEditor: React.FC<Props> = ({ initialHtml, onSave, onCancel }) => {
  const [ready, setReady] = useState(false);
  const [useHtmlMode, setUseHtmlMode] = useState(true);
  const [htmlText, setHtmlText] = useState<string>(initialHtml || '');
  const editorIdRef = useRef('output-editor-' + Math.random().toString(36).slice(2));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let destroyed = false;
    if (!useHtmlMode) {
      tinymce.init({
        selector: '#' + editorIdRef.current,
        plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help',
        toolbar: 'undo redo | formatselect | bold italic underline | alignleft aligncenter alignright | bullist numlist | link image media table | removeformat | code fullscreen',
        toolbar_mode: 'wrap',
        menubar: 'file edit view insert format tools table help',
        height: 500,
        setup: (editor: any) => {
          editor.on('init', () => {
            editor.setContent(htmlText || '');
            if (!destroyed) setReady(true);
          });
        }
      });
    } else {
      setReady(false);
      const ed = tinymce.get(editorIdRef.current);
      if (ed) ed.remove();
    }

    return () => {
      destroyed = true;
      const ed = tinymce.get(editorIdRef.current);
      if (ed) ed.remove();
    };
  }, [useHtmlMode, htmlText]);

  useEffect(() => {
    setHtmlText(initialHtml || '');
  }, [initialHtml]);

  const handleSave = () => {
    const ed = tinymce.get(editorIdRef.current);
    const content = useHtmlMode ? htmlText : (ed ? ed.getContent() : '');
    onSave(content);
  };

  const switchToHtml = () => {
    const ed = tinymce.get(editorIdRef.current);
    const content = ed ? ed.getContent() : htmlText;
    setHtmlText(content);
    setUseHtmlMode(true);
  };

  const switchToRich = () => {
    const ed = tinymce.get(editorIdRef.current);
    if (ed) ed.setContent(htmlText || '');
    setUseHtmlMode(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-[900px] max-w-[95vw] rounded-lg shadow-xl border border-slate-200">
        <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-700">Chỉnh sửa Output</div>
          <div className="flex items-center space-x-2">
            <button onClick={switchToHtml} className={`px-2 py-1 text-xs rounded ${useHtmlMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>HTML</button>
            <button onClick={switchToRich} className={`px-2 py-1 text-xs rounded ${!useHtmlMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Rich Text</button>
            <button onClick={onCancel} className="text-slate-500 hover:text-slate-800 text-xs">Đóng</button>
          </div>
        </div>
        <div className="p-3">
          {useHtmlMode ? (
            <textarea
              value={htmlText}
              onChange={(e) => setHtmlText(e.target.value)}
              className="w-full h-[500px] border border-slate-300 rounded p-2 font-mono text-xs"
            />
          ) : (
            <div ref={containerRef}>
              <textarea id={editorIdRef.current} />
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end space-x-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded bg-slate-100 text-slate-700">Hủy</button>
          <button onClick={handleSave} disabled={!(!useHtmlMode || ready)} className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white disabled:opacity-50">Lưu</button>
        </div>
      </div>
    </div>
  );
};
