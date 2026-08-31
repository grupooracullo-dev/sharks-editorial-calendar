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
    <div className="absolute bottom-full right-0 mb-2 z-30 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2">
      <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
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
