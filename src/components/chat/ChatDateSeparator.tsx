interface ChatDateSeparatorProps {
  label: string;
}

export default function ChatDateSeparator({ label }: ChatDateSeparatorProps) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-medium text-gray-400 px-2 py-0.5 bg-white border border-gray-100 rounded-full shadow-sm whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}
