import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { ALLOWED_TYPES } from '@/lib/chat-constants';

interface AttachmentPickerProps {
  onPick: (files: FileList) => void;
  disabled?: boolean;
}

export function AttachmentPicker({ onPick, disabled }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onPick(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <button
        type="button"
        aria-label="Anexar arquivo"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Paperclip className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
