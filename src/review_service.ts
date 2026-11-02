import { createServer } from 'node:http';
import { decide } from './access_decision.ts';
import { ReviewRequest } from './review_request.ts';
import { createClient, InfraiError } from './infrai_client.ts';

const request = createClient();
// A review token binds one immutable local request to one document submission.
const reviews = new Map<string, { body: string; result: Promise<unknown> }>();
const server = createServer(async (req, res) => {
  const send = (status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  if (req.method !== 'POST' || req.url !== '/reviews') { send(404, { message: 'Use POST /reviews' }); return; }
  try {
    const token = req.headers['idempotency-key'];
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(token)) {
      send(400, { message: 'Provide an Idempotency-Key of 8–100 letters, digits, underscores or hyphens' }); return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += String(chunk);
      if (Buffer.byteLength(raw) > 32768) { send(413, { message: 'Review body too large' }); return; }
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { send(400, { message: 'Send JSON' }); return; }
    const validation = ReviewRequest.safeParse(parsed);
    if (!validation.success) { send(400, { issues: validation.error.issues }); return; }
    const body = JSON.stringify(validation.data);
    const prior = reviews.get(token);
    if (prior && prior.body !== body) { send(409, { message: 'Review token already bound to another request' }); return; }
    if (!prior && reviews.size >= 100) { send(429, { message: 'Review session capacity reached' }); return; }
    const result = prior?.result ?? (async () => {
      const inventory = await request('GET', '/account/keys/list');
      const decisions = decide(validation.data, inventory);
      const markdown = `# Marketplace access review: ${validation.data.reviewDate}\n\n` +
        'Local reach assignments; observed scopes are reviewed against the supplied approval.\n\n' +
        '```json\n' + JSON.stringify(decisions, null, 2) + '\n```';
      const document = await request('POST', '/pdf/generate', { markdown, page_size: 'A4', orientation: 'portrait', store: false });
      return { reviewDate: validation.data.reviewDate, decisions, inventory, document };
    })();
    if (!prior) reviews.set(token, { body, result });
    send(200, await result);
  } catch (error) {
    if (error instanceof InfraiError) {
      send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.detail });
    } else { send(502, { message: 'Review could not be completed' }); }
  }
});
server.listen(3000, '127.0.0.1');
