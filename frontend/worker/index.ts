export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BACKEND_ORIGIN: string;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    let origin: URL;
    try {
      origin = new URL(env.BACKEND_ORIGIN);
      if (
        origin.protocol !== 'https:' ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash
      )
        throw new Error();
    } catch {
      return Response.json(
        {
          success: false,
          code: 'BACKEND_NOT_CONFIGURED',
          message: '서버 연결 설정이 필요합니다.',
          data: null,
        },
        { status: 503 },
      );
    }
    const target = new URL(url.pathname + url.search, origin);
    const headers = new Headers(request.headers);
    headers.delete('host');
    try {
      const response = await fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
          redirect: 'manual',
        }),
      );
      const output = new Response(response.body, response);
      output.headers.set('Cache-Control', 'no-store');
      return output;
    } catch {
      return Response.json(
        {
          success: false,
          code: 'BACKEND_UNAVAILABLE',
          message: '서버에 연결하지 못했습니다.',
          data: null,
        },
        { status: 502 },
      );
    }
  },
};
