import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CrmEnvironment } from '@/hooks/useLeads';

export interface EnvProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: string;
}

/** Catálogo da agência por ambiente (migration 065) — com realtime. */
export function useEnvProducts(environment: CrmEnvironment | null, onlyActive = true) {
  const [products, setProducts] = useState<EnvProduct[]>([]);

  useEffect(() => {
    if (!environment) {
      setProducts([]);
      return;
    }
    let active = true;
    const load = async () => {
      let query = supabase
        .from('environment_products')
        .select('*')
        .eq('environment', environment)
        .order('name');
      if (onlyActive) query = query.eq('status', 'active');
      const { data, error } = await query;
      if (!active) return;
      if (error) console.error('[products] env catalog error:', error.message);
      setProducts(((data ?? []) as unknown) as EnvProduct[]);
    };

    load();

    const channel = supabase
      .channel(`env-products-${environment}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'environment_products', filter: `environment=eq.${environment}` },
        () => { load(); },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [environment, onlyActive]);

  return products;
}
