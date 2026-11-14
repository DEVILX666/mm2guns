const routes = {
  'users/v1/usernames/users': {
    url: 'https://users.roblox.com/v1/usernames/users',
    method: 'POST'
  },
  'users/v1/users/search': {
    url: 'https://users.roblox.com/v1/users/search',
    method: 'GET',
    query: ['keyword', 'limit']
  },
  'profile': {
    url: 'https://www.roblox.com/users/profile',
    method: 'GET',
    query: ['username'],
    profile: true
  },
  'roproxy/users/v1/users/search': {
    url: 'https://users.roproxy.com/v1/users/search',
    method: 'GET',
    query: ['keyword', 'limit']
  },
  'thumbnails/v1/users/avatar-headshot': {
    url: 'https://thumbnails.roblox.com/v1/users/avatar-headshot',
    method: 'GET',
    query: ['userIds', 'size', 'format', 'isCircular']
  },
  'roproxy/thumbnails/v1/users/avatar-headshot': {
    url: 'https://thumbnails.roproxy.com/v1/users/avatar-headshot',
    method: 'GET',
    query: ['userIds', 'size', 'format', 'isCircular']
  }
};

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

module.exports = function createRobloxProxyHandler(routePath) {
  return async function handler(req, res) {
    const route = routes[routePath];
    if (!route) return sendJson(res, 404, { error: 'Unknown Roblox API route' });
    if (req.method !== route.method) {
      res.setHeader('Allow', route.method);
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const upstreamUrl = new URL(route.url);
    for (const key of route.query || []) {
      const value = req.query[key];
      if (typeof value === 'string') upstreamUrl.searchParams.set(key, value);
    }

    try {
      const options = { method: route.method, redirect: 'follow' };
      if (route.method === 'POST') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(req.body);
      }

      const upstreamResponse = await fetch(upstreamUrl.toString(), options);
      if (route.profile) {
        const retryAfter = upstreamResponse.headers.get('Retry-After');
        if (retryAfter) res.setHeader('Retry-After', retryAfter);
        const match = String(upstreamResponse.url || '').match(/\/users\/(\d+)\/profile/i);
        if (!upstreamResponse.ok || !match) {
          return sendJson(res, upstreamResponse.status === 429 ? 429 : 404, {
            error: 'Roblox profile lookup failed'
          });
        }
        return sendJson(res, 200, { userId: match[1], url: upstreamResponse.url });
      }

      res.statusCode = upstreamResponse.status;
      res.setHeader(
        'Content-Type',
        upstreamResponse.headers.get('Content-Type') || 'application/json; charset=utf-8'
      );
      const retryAfter = upstreamResponse.headers.get('Retry-After');
      if (retryAfter) res.setHeader('Retry-After', retryAfter);
      res.setHeader('Cache-Control', 'no-store');
      res.end(await upstreamResponse.text());
    } catch (error) {
      console.error('Roblox API proxy request failed:', error);
      sendJson(res, 502, { error: 'Roblox API request failed' });
    }
  };
};
