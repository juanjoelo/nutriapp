// Attach as a Cloudflare Worker route to the site's /api/* on a proxied origin.
// Configure COUNTRY_EDGE_KEY as a Worker secret and the same server-only secret.
// No deployment is performed by this file. Never trust a visitor's country header.
export default {
  async fetch(request, env) {
    if (!env.COUNTRY_EDGE_KEY || env.COUNTRY_EDGE_KEY.length < 32)
      return new Response('La configuración regional está pendiente.', { status: 503 });
    const headers = new Headers(request.headers);
    headers.set('cf-ipcountry', request.cf?.country || 'XX');
    headers.set('x-nutriapp-edge-key', env.COUNTRY_EDGE_KEY);
    // Manual redirects keep the server secret from being forwarded to another origin.
    const response = await fetch(new Request(request, { headers, redirect: 'manual' }));
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', 'private, no-store');
    result.headers.delete('x-nutriapp-edge-key');
    return result;
  },
};
