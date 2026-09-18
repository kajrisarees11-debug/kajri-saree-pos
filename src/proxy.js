import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

// Every API response — success, 401, auth passthrough, all of it — carries
// live POS data or an auth decision and must never be cached. Electron's
// BrowserWindow uses a PERSISTENT disk-backed HTTP cache (stored in
// userData, so it survives app restarts AND reinstalling the .exe itself),
// and with no Cache-Control at all, Chromium is free to heuristically cache
// a GET response — including, once, a response whose write got interrupted
// by the app being force-closed mid-request, which then replays as a
// permanently-empty body on every future launch. This was the root cause of
// "Settings/every page shows no data" recurring even across fresh installs.
// It also closes a second gap: an unauthenticated 401 has no Vary: Cookie
// either, so without no-store it could in principle be cached and served
// back even after a later successful login to the same URL.
function withNoStore(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Login/logout must stay reachable without a token, or nobody could ever log in.
  if (pathname.startsWith('/api/auth')) {
    return withNoStore(NextResponse.next());
  }

  const isApi = pathname.startsWith('/api');
  const isProtectedPage = pathname.startsWith('/dashboard') || pathname.startsWith('/pos');

  if (isApi || isProtectedPage) {
    const token = request.cookies.get('pos_auth_token')?.value;

    if (!token) {
      if (isApi) {
        return withNoStore(NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }));
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    try {
      const secret = getJwtSecret();
      await jwtVerify(token, secret);
      const response = NextResponse.next();
      return isApi ? withNoStore(response) : response;
    } catch (error) {
      console.error('[Proxy] Auth check failed for', pathname, '-', error.message);

      if (isApi) {
        return withNoStore(NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }));
      }
      // Invalid token, redirect to login and clear the bad cookie
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const response = NextResponse.redirect(url);
      response.cookies.delete('pos_auth_token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/pos/:path*', '/api/:path*'],
};
