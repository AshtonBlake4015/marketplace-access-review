import type { ReviewInput } from './review_request.ts';

// Preserve the control-plane payload; only explicit id/scopes evidence grants clearance.
export function observedKeys(value: unknown): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  function visit(item: unknown): void {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (item === null || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    if (typeof record.id === 'string' && Array.isArray(record.scopes) &&
        record.scopes.every(scope => typeof scope === 'string')) {
      if (keys.has(record.id)) throw new Error('Duplicate key evidence');
      keys.set(record.id, record.scopes as string[]);
    }
    Object.values(record).forEach(visit);
  }
  visit(value);
  return keys;
}

export function decide(input: ReviewInput, inventory: unknown) {
  const keys = observedKeys(inventory);
  return input.assignments.map(assignment => {
    const scopes = keys.get(assignment.keyId);
    const extraScopes = scopes?.filter(scope => !assignment.approvedScopes.includes(scope)) ?? [];
    const cleared = scopes !== undefined && extraScopes.length === 0 &&
      !scopes.some(scope => scope.includes('*'));
    return { ...assignment, observedScopes: scopes ?? null, extraScopes,
      decision: cleared ? 'clear' : 'hold',
      handoff: cleared && assignment.orderHandoff ? 'ready' : 'held' };
  });
}
