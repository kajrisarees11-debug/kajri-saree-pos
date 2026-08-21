import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Protect /dashboard and /pos routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/pos')) {
    const token = request.cookies.get('pos_auth_token')?.value;

    if (!token) {
      // No token, redirect to login
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    try {
      // Verify token
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret_for_local_dev');
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch (error) {
      // Invalid token, redirect to login
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      // Clear invalid cookie
      const response = NextResponse.redirect(url);
      response.cookies.delete('pos_auth_token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/pos/:path*'],
};
