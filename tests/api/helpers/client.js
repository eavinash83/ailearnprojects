// Minimal HTTP client with a cookie jar and the Origin header Better Auth requires.
export const BASE_URL = process.env.BASE_URL;

export class Client {
  cookies = new Map();
  constructor({ origin = BASE_URL } = {}) {
    this.origin = origin;
  }

  async request(method, path, { body, headers = {}, origin = this.origin } = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE_URL + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(origin ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const [name, value] = [pair.slice(0, i), pair.slice(i + 1)];
      if (value === '' || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, body: json, text, headers: res.headers };
  }

  get = (path, opts) => this.request('GET', path, opts);
  post = (path, body, opts) => this.request('POST', path, { ...opts, body: body ?? {} });
}
