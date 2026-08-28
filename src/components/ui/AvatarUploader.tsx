import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { uploadAvatar, removeAvatar } from '@/lib/avatarUpload';

interface AvatarUploaderProps {
  name: string;
  avatarUrl: string | null;
  userId: string;
  onChange: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
}

export default function AvatarUploader({ name, avatarUrl, userId, onChange, size = 'lg' }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Envie um arquivo de imagem (PNG, JPG, WEBP, GIF).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 2 MB.');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file, userId);
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar a foto');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!avatarUrl) return;
    setRemoving(true);
    try {
      await removeAvatar(userId);
      onChange(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao remover a foto');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || 'U'} src={avatarUrl} size={size} />
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
          disabled={uploading || removing}
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
              {avatarUrl ? 'Trocar foto' : 'Enviar foto'}
            </>
          )}
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading || removing}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg transition-colors disabled:opacity-60"
          >
            <X className="w-4 h-4" />
            {removing ? 'Removendo...' : 'Remover'}
          </button>
        )}
      </div>
    </div>
  );
}