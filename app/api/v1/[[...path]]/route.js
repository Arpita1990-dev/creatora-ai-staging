import { cleanMuApiProxyHeaders, resolveRequestMuApiKey } from '@/lib/muapiProxyCredential';

const MUAPI_BASE = 'https://api.muapi.ai';

async function proxy(request, { params }) {
  try {
    const slug = await params;
    const path = (slug.path || []).join('/');
    const { search } = new URL(request.url);
    const headers = cleanMuApiProxyHeaders(request);
    headers.set('x-api-key', await resolveRequestMuApiKey(request));
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const response = await fetch(`${MUAPI_BASE}/api/v1/${path}${search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
    });
  } catch (error) {
    const authError = /auth|organization|member|MUAPI_NOT_CONNECTED/i.test(error.message || '');
    return Response.json({ error: authError ? 'MuAPI is not connected for this workspace.' : 'MuAPI proxy request failed.' }, { status: authError ? 401 : 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
