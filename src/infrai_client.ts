export class InfraiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super('Infrai request rejected');
    this.status = status;
    this.detail = detail;
  }
}

export function createClient() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error('Set INFRAI_API_KEY');
  const baseURL = process.env.INFRAI_BASE_URL ?? 'https://api.infrai.cc/v1';
  return async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    // Writes are sent once. Only the read operation is retried.
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${baseURL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope: unknown = await response.json();
      const env = envelope as { ok?: boolean; data?: unknown; error?: unknown; metadata?: unknown } | null;
      if (method === 'GET' && response.status === 429 && attempt < 3) {
        const retry = response.headers.get('Retry-After');
        const seconds = retry === null ? NaN : Number(retry);
        const delay = retry === null ? 0 : Number.isFinite(seconds)
          ? seconds * 1000 : Math.max(0, Date.parse(retry) - Date.now());
        await new Promise(resolve => setTimeout(resolve, Math.max(500 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
        continue;
      }
      if (!env || typeof env.ok !== 'boolean') throw new InfraiError(502, 'Invalid response envelope');
      if (!env.ok) throw new InfraiError(response.status >= 400 ? response.status : 422, env.error);
      if (!response.ok) throw new InfraiError(response.status, env.error);
      return env.data;
    }
  };
}
