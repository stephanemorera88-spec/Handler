import { useState, useRef, useEffect } from 'react';

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [value]);

  return (
    <div className="input-bar">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Waiting for response...' : 'Type a message...'}
        disabled={disabled}
        rows={1}
      />
      <button
        className="btn btn-primary send-btn"
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
      >
        &#9650;
      </button>
    </div>
  );
}
