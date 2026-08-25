import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Workspace } from '@/types';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isClient } = useAuth();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    // RLS returns only workspaces the user can see
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[workspaces] load error:', error.message);
    }

    const ws = (data as unknown as Workspace[]) || [];
    setWorkspaces(ws);
    return ws;
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const ws = await loadWorkspaces();
      if (!mounted) return;

      if (isClient) {
        // Client: auto-select their workspace
        setCurrentWorkspace(ws[0] || null);
      } else {
        // Sharks: null = "Todos os clientes"
        setCurrentWorkspace(null);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id, isClient]);

  const refreshWorkspaces = async () => {
    await loadWorkspaces();
  };

  return (
    <WorkspaceContext.Provider
      value={{ currentWorkspace, workspaces, setCurrentWorkspace, refreshWorkspaces, loading }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
