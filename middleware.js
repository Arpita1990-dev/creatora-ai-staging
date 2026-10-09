import { NextResponse } from 'next/server';
import { getLocaleFromPathname } from './lib/locales';

// Dashboard sections are reached with Next.js client-side navigation. CSP is
// fixed when the browser loads the original document and is not replaced when
// the user moves from `/dashboard` to `/dashboard/credits`. Consequently every
// dashboard document must allow the Razorpay origins used by the billing
// section; otherwise Checkout works after a hard refresh but is blocked when
// Credits & billing is opened from the sidebar.
function isDashboardPath(pathname) {
    return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

function addSecurityHeaders(response, allowCheckout = false) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly.
    //
    // Razorpay Checkout origins (dashboard documents only); no public or auth
    // document receives these permissions. These are the exact
    // hosts Checkout contacts, verified against the CSP violations Chrome
    // reports for the subscription modal:
    //   script-src  checkout.razorpay.com  - v1/checkout.js loader
    //               cdn.razorpay.com       - risk-detection bundle that
    //                                          checkout.js injects at runtime
    //   frame-src   api.razorpay.com, checkout.razorpay.com - the modal iframe
    //                (the modal document is api.razorpay.com/v1/checkout/public)
    //   connect-src api.razorpay.com  - /v1/checkout/public configuration
    //               checkout.razorpay.com
    //               lumberjack.razorpay.com - /v2/logz telemetry the
    //               risk-detection bundle posts to
    // style-src/img-src need no change: 'unsafe-inline' already covers the
    // styles Checkout injects into this document and img-src already allows
    // https: scheme images.
    const razorpayScript = allowCheckout ? ' https://checkout.razorpay.com https://cdn.razorpay.com' : '';
    const razorpayConnect = allowCheckout ? ' https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com' : '';
    const razorpayFrame = allowCheckout ? " frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com;" : '';

    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'${razorpayScript}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai${razorpayConnect}; font-src 'self' data:;${razorpayFrame}`
    );
    return response;
}

export function middleware(request) {
    const url = request.nextUrl;

    if (url.pathname.startsWith('/dashboard') && !request.cookies.get(process.env.AUTH_COOKIE_NAME || 'creatora_refresh')) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', `${url.pathname}${url.search}`);
        return addSecurityHeaders(NextResponse.redirect(loginUrl));
    }

    // Plain response header carrying the locale derived from the URL path
    // (same "set in middleware, read via headers() in the root layout"
    // trick the main muapi client uses — see docs/localization.md).
    const response = NextResponse.next();
    response.headers.set('x-locale', getLocaleFromPathname(url.pathname));
    return addSecurityHeaders(response, isDashboardPath(url.pathname));
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};
