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
    // RLS entrega apenas workspaces acessiveis. O ambiente vem do RPC
    // ws_env_map (SECURITY DEFINER) — o join embedded de organizations
    // era bloqueado pela RLS de organizations para staff single-env,
    // causando classificacao errada (fallback 'sharks_company').
    const [wsRes, envRes] = await Promise.all([
      supabase.from('workspaces').select('*').eq('is_active', true).order('name'),
      supabase.rpc('ws_env_map'),
    ]);

    if (wsRes.error) console.error('[workspaces] load error:', wsRes.error.message);
    if (envRes.error) console.error('[workspaces] env map error:', envRes.error.message);

    const envMap = new Map<string, EnvironmentType>(
      ((envRes.data ?? []) as Array<{ id: string; environment: EnvironmentType }>)
        .map(r => [r.id, r.environment]),
    );

    const rows = ((wsRes.data ?? []) as Workspace[])
      .map(ws => ({ ...ws, environment: envMap.get(ws.id) ?? 'sharks_company' }));
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
