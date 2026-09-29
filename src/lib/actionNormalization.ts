import type { Action, User } from '../types';

/** Flatten the junction-table shape returned by PostgREST. */
export function normalizeAction(row: unknown): Action {
  const action = row as Omit<Action, 'responsibles' | 'products'> & {
    responsibles?: Array<{ users: User | null }>;
    products?: Array<{ product: { id: string; name: string; image_url?: string | null } | null }>;
  };
  return {
    ...action,
    responsibles: (action.responsibles ?? []).flatMap(r => r.users ? [r.users] : []),
    products: (action.products ?? []).flatMap(p => p.product ? [p.product] : []),
  };
}
