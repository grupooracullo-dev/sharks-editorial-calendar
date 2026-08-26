import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Workspace, EnvironmentType } from '@/types';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  /** Workspaces filtrados por ambiente da organizacao. */
  workspacesByEnv: (env: EnvironmentType) => Workspace[];
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isClient, environments } = useAuth();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    // RLS entrega apenas workspaces acessiveis; o join traz o
    // ambiente da organizacao para filtragem multi-ambiente.
    const { data, error } = await supabase
      .from('workspaces')
      .select('*, organizations(environment)')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[workspaces] load error:', error.message);
    }

    const rows = ((data ?? []) as unknown as Array<Workspace & { organizations: { environment: EnvironmentType } | null }>)
      .map(({ organizations, ...ws }) => ({ ...ws, environment: organizations?.environment ?? 'sharks_company' }));
    setWorkspaces(rows);
    return rows;
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
        // Client: auto-select their workspace (primeiro do seu ambiente)
        setCurrentWorkspace(ws[0] || null);
      } else {
        // Staff: null = "Todos os clientes"
        setCurrentWorkspace(null);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id, isClient, environments.length, loadWorkspaces]);

  const refreshWorkspaces = async () => {
    await loadWorkspaces();
  };

  const workspacesByEnv = (env: EnvironmentType) => workspaces.filter(w => w.environment === env);

  return (
    <WorkspaceContext.Provider
      value={{ currentWorkspace, workspaces, workspacesByEnv, setCurrentWorkspace, refreshWorkspaces, loading }}
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
