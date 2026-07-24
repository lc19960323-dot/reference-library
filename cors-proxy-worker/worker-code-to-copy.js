// Cloudflare Worker: CORS Proxy for reference-library app
// Free tier: 100,000 requests/day

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // Check for proxy target URL FIRST (before health check)
    const targetUrl = url.searchParams.get('url');
    if (targetUrl) {
      // Validate target URL
      try {
        const target = new URL(targetUrl);
        if (target.protocol !== 'https:' && target.protocol !== 'http:') {
          return new Response(JSON.stringify({ error: 'Only http/https URLs allowed' }), {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
          });
        }
        const hostname = target.hostname;
        if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') || hostname.match(/^172\.(16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31)\./) ||
            hostname.endsWith('.local') || hostname === '0.0.0.0') {
          return new Response(JSON.stringify({ error: 'Private IPs blocked' }), {
            status: 403,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });
      }

      // Fetch the target URL
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh-CN;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        const contentType = response.headers.get('Content-Type') || '';
        const body = await response.text();

        return new Response(body, {
          status: response.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': contentType || 'text/html; charset=utf-8',
            'X-Proxied-URL': targetUrl,
            'X-Proxy-Version': '1.0',
            'Cache-Control': 'public, max-age=3600',
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          error: 'Fetch failed',
          message: e.message,
          url: targetUrl
        }), {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });
      }
    }

    // Health check (only when no url parameter)
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'cors-proxy',
        version: '1.1',
        timestamp: new Date().toISOString()
      }), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        }
      });
    }

    // Unknown path without url parameter
    return new Response(JSON.stringify({
      error: 'Missing "url" query parameter',
      usage: 'GET /?url=https://example.com'
    }), {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  },
};
