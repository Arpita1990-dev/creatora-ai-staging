import { NextResponse } from 'next/server';
import { cleanMuApiProxyHeaders, resolveRequestMuApiKey } from '@/lib/muapiProxyCredential';

const MUAPI_BASE = 'https://api.muapi.ai';

function cleanHeaders(request) {
    return cleanMuApiProxyHeaders(request);
}

export async function GET(request) {
    const apiKey = await resolveRequestMuApiKey(request);
    if (!apiKey) {
        return NextResponse.json({ error: 'Unauthorized: Missing API key' }, { status: 401 });
    }

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/get_file_upload_url${search}`;

    const headers = cleanHeaders(request);
    headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

