import { useEffect, useState } from 'react';
import { getIntegration, loadIntegration, subscribeIntegration } from '@/lib/integrationService';
import type { GoogleIntegration } from '@/lib/googleSync';

export function useIntegration(workspaceId?: string | null) {
  const [integration, setIntegration] = useState<GoogleIntegration | null>(() => getIntegration(workspaceId));
  const [loading, setLoading] = useState<boolean>(!!workspaceId);

  useEffect(() => {
    let active = true;

    // valor em cache imediatamente
    setIntegration(getIntegration(workspaceId));

    if (!workspaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    loadIntegration(workspaceId).finally(() => {
      if (active) setLoading(false);
    });

    // um unico canal compartilhado alimentando todos os consumidores
    const unsubscribe = subscribeIntegration(() => {
      if (active) setIntegration(getIntegration(workspaceId));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [workspaceId]);

  return { integration, loading };
}
