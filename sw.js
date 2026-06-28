const PROJECT_NAME = "PerfectView"; // nombre del proyecto
const VERSION = "49";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Interceptar peticiones a /nc-proxy?url=...
  if (url.includes('/nc-proxy?')) {
    const target = new URL(url).searchParams.get('url');
    if (target) {
      event.respondWith(
        fetch(target, {
          credentials: 'include',
          headers: {
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer':         'https://es.novelcool.com/',
          }
        }).then(resp => new Response(resp.body, {
          status:  resp.status,
          headers: {
            'Content-Type':                resp.headers.get('content-type') || 'text/html',
            'Access-Control-Allow-Origin': '*',
          }
        })).catch(err => new Response('Error: ' + err.message, { status: 500 }))
      );
      return;
    }
  }

  // Todo lo demás — pasar directo sin caché
  event.respondWith(fetch(event.request));
});