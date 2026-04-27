import { useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AttachmentDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper que captura drag&drop e paste de arquivos.
 * Spec: chat-multimodal REQ-1.2 / REQ-1.3
 */
export function AttachmentDropzone({ onFiles, disabled, children, className }: AttachmentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // So muda estado se saiu do container
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }, [disabled, onFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      onFiles(files);
    }
  }, [disabled, onFiles]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className={cn(
        'relative transition-colors',
        isDragging && 'ring-2 ring-primary/50 bg-primary/5 rounded-2xl',
        className
      )}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none rounded-2xl bg-primary/10 border-2 border-dashed border-primary/40">
          <p className="text-sm font-medium text-primary">Solte os arquivos aqui</p>
        </div>
      )}
      {children}
    </div>
  );
}
