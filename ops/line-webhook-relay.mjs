// Deploy only after configuring BACKEND_URL; no LINE secret is sent to the relay.
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const signature = request.headers.get('x-line-signature');
    if (!signature) return new Response('Signature required', { status: 401 });
    let target;
    try { target = new URL(env.BACKEND_URL); }
    catch (error) { return new Response('Not configured', { status: 503 }); }
    if (target.protocol !== 'https:' || target.hostname !== 'script.google.com' || !target.pathname.startsWith('/macros/s/')) return new Response('Not configured', { status: 503 });
    if (Number(request.headers.get('content-length') || 0) > 1000000) return new Response('Too large', { status: 413 });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 1000000) return new Response('Too large', { status: 413 });
    try {
      const response = await fetch(target.href, {
        method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ lineWebhook: { rawBody, signature } }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (result.ok) return new Response('OK');
      const invalid = ['LINE_SIGNATURE_REQUIRED', 'LINE_SIGNATURE_INVALID', 'LINE_BODY_INVALID'].includes(result.code);
      return new Response(invalid ? 'Invalid event' : 'Retry later', { status: invalid ? 401 : 503 });
    } catch (error) { return new Response('Retry later', { status: 503 }); }
  },
};
