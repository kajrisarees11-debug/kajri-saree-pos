import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Login/logout must stay reachable without a token, or nobody could ever log in.
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith('/api');
  const isProtectedPage = pathname.startsWith('/dashboard') || pathname.startsWith('/pos');

  if (isApi || isProtectedPage) {
    const token = request.cookies.get('pos_auth_token')?.value;

    if (!token) {
      if (isApi) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    try {
      const secret = getJwtSecret();
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch (error) {
      console.error('[Proxy] Auth check failed for', pathname, '-', error.message);

      if (isApi) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
