import type { Action, User } from '../types';

/** Flatten the junction-table shape returned by PostgREST. */
export function normalizeAction(row: unknown): Action {
  const action = row as Omit<Action, 'responsibles'> & {
    responsibles?: Array<{ users: User | null }>;
  };
  return {
    ...action,
    responsibles: (action.responsibles ?? []).flatMap(r => r.users ? [r.users] : []),
  };
}
