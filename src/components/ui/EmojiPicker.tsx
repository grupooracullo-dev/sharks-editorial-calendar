const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳',
  '😅','😉','🙌','👏','👍','👎','🙏','💪','🤝','👌',
  '❤️','🧡','💛','💚','💙','💜','🔥','✨','🎉','🎊',
  '✅','❌','❓','❗','💡','📌','📅','🚀','🎯','📈',
  '😢','😮','🤔','😴','🤯','😇','🤗','😬',
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="grid grid-cols-8 gap-0.5 max-h-36 overflow-y-auto overscroll-contain">
        {EMOJIS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="w-7 h-7 flex items-center justify-center text-lg rounded-md hover:bg-gray-100 transition-colors"
            aria-label={`Inserir emoji ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
