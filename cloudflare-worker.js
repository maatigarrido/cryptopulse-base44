const PROXIES = [
  { prefix: "/yahoo", origin: "https://query1.finance.yahoo.com", stripPrefix: true },
  { prefix: "/kraken", origin: "https://api.kraken.com", stripPrefix: true },
  { prefix: "/api", origin: "https://app.base44.com", stripPrefix: false },
];

function proxyTarget(requestUrl) {
  const url = new URL(requestUrl);
  const match = PROXIES.find(({ prefix }) => url.pathname.startsWith(`${prefix}/`));
  if (!match) return null;
  const target = new URL(url.href);
  const origin = new URL(match.origin);
  target.protocol = origin.protocol;
  target.hostname = origin.hostname;
  target.pathname = match.stripPrefix ? url.pathname.replace(match.prefix, "") || "/" : url.pathname;
  return target;
}

export default {
  async fetch(request, env) {
    const target = proxyTarget(request.url);
    if (target) {
      const headers = new Headers(request.headers);
      headers.set("host", target.hostname);
      return fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "follow",
      });
    }

    return env.ASSETS.fetch(request);
  },
};
