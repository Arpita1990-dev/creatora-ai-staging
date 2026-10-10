import { proxyMuApiGenerationRequest } from '@/lib/muapiGenerationProxy';

async function proxy(request, { params }) {
  const slug = await params;
  const path = (slug.path || []).join('/');
  const { search } = new URL(request.url);
  return proxyMuApiGenerationRequest(request, path, search);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
