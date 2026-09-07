type Profile = { role: string; is_guardian?: boolean };
type Access = { environment: string; role: string };

export function canDeleteUser(caller: Profile, target: Profile, callerEnvs: Access[], targetEnvs: Access[]): boolean {
  // Guardians cannot be deleted through this endpoint.
  if (target.is_guardian) return false;
  if (caller.is_guardian || caller.role === 'oracullo_admin') return true;
  if (target.role === 'oracullo_admin' || target.role === 'admin_sharks') return false;
  // Deletion removes the entire identity. Shared accounts require global administration.
  if (targetEnvs.length !== 1 || targetEnvs[0].role === 'admin') return false;
  return callerEnvs.some(e => e.role === 'admin' && e.environment === targetEnvs[0].environment);
}
