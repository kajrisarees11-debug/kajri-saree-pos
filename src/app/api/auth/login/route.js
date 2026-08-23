import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';

export async function POST(request) {
  try {
    const { code } = await request.json();

    // Single PIN Login for the POS
    const validPin = process.env.ADMIN_PIN || '98765';

    if (code === validPin) {
      // Create JWT using jose (edge compatible)
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret_for_local_dev');
      
      const token = await new SignJWT({ role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);

      // Set cookie
      const cookieStore = await cookies();
      cookieStore.set('pos_auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
