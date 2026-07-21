import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

export default function MessageInput({ placeholder, onSend, disabled }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const submit = (e) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex-shrink-0 px-4 md:px-6 pb-4 pt-2 bg-[#313338]"
    >
      <div className="flex items-center gap-2 bg-[#383a40] rounded-lg px-4 py-1 focus-within:ring-2 focus-within:ring-[#5865f2]/50 transition-shadow">
        <textarea
          ref={inputRef}
          data-testid="message-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={disabled ? 'reconnecting…' : placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] text-[#f2f3f5] placeholder:text-[#6d707a] font-['IBM_Plex_Sans'] py-3 resize-none max-h-40"
        />
        <button
          type="submit"
          data-testid="send-message-btn"
          disabled={disabled || !value.trim()}
          className="p-2 rounded-md text-[#5865f2] hover:text-white hover:bg-[#5865f2] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#5865f2] transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-1 text-[10px] font-mono-ui text-[#5c6069] px-1">
        press <span className="text-[#949ba4]">Enter</span> to send · <span className="text-[#949ba4]">Shift+Enter</span> for a new line
      </div>
    </form>
  );
}
