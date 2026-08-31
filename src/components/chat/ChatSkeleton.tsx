export default function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-1 animate-pulse" aria-hidden="true">
      <div className="flex justify-center">
        <div className="h-5 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="flex items-end gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
        <div className="space-y-1.5 max-w-[60%]">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-12 w-52 rounded-2xl rounded-tl-sm bg-gray-200" />
        </div>
      </div>
      <div className="flex items-end gap-2.5 flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
        <div className="h-9 w-40 rounded-2xl rounded-tr-sm bg-gray-200" />
      </div>
      <div className="flex items-end gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
        <div className="h-14 w-64 rounded-2xl rounded-tl-sm bg-gray-200" />
      </div>
    </div>
  );
}
