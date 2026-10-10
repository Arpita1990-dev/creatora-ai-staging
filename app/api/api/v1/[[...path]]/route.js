import { proxyMuApiGenerationRequest } from '@/lib/muapiGenerationProxy';

async function proxy(request, { params }) {
    const slug = await params;
    const path = (slug.path || []).join('/');
    const { search } = new URL(request.url);
    return proxyMuApiGenerationRequest(request, path, search);
}

// Proxies /api/api/v1/* -> https://api.muapi.ai/api/v1/*
// This is required because the AiAgent library hardcodes a double /api/api
export const GET = proxy;
export const POST = proxy;
