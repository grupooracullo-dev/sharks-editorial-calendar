import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import WorkspaceLogo from '@/components/ui/WorkspaceLogo';
import { uploadWorkspaceLogo } from '@/lib/workspaceLogo';

interface LogoUploaderProps {
  name: string;
  logoUrl: string | null;
  onChange: (url: string | null) => void;
}

export default function LogoUploader({ name, logoUrl, onChange }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Envie um arquivo de imagem (PNG, JPG, SVG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 2 MB.');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadWorkspaceLogo(file, logoUrl);
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar o logo');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-4">
      <WorkspaceLogo name={name} logoUrl={logoUrl} size="lg" />
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {logoUrl ? 'Trocar logomarca' : 'Enviar logomarca'}
            </>
          )}
        </button>
        {logoUrl && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={uploading}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg transition-colors disabled:opacity-60"
          >
            <X className="w-4 h-4" />
            Remover
          </button>
        )}
      </div>
    </div>
  );
}