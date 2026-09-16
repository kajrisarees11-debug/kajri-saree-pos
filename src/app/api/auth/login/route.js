import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';

// Simple in-memory lockout. On Vercel this resets on cold start / across
// lambda instances, but on the single long-lived Electron desktop process
// (and for a single dev server) it meaningfully slows down PIN brute-forcing.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const attemptsByClient = new Map();

function getClientKey(request) {
  return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'local';
}

export async function POST(request) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    const adminPin = process.env.ADMIN_PIN;

    if (!jwtSecret || !adminPin) {
      console.error('[Login] JWT_SECRET / ADMIN_PIN is not configured for this deployment — refusing to authenticate.');
      return NextResponse.json({ success: false, error: 'Login is not configured on this server' }, { status: 500 });
    }

    const clientKey = getClientKey(request);
    const now = Date.now();
    const attempt = attemptsByClient.get(clientKey);
    if (attempt && attempt.count >= MAX_ATTEMPTS && now - attempt.firstAttemptAt < LOCKOUT_MS) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const { code } = await request.json();

    if (code === adminPin) {
      attemptsByClient.delete(clientKey);

      // Create JWT using jose (edge compatible)
      const secret = new TextEncoder().encode(jwtSecret);

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

    if (!attempt || now - attempt.firstAttemptAt >= LOCKOUT_MS) {
      attemptsByClient.set(clientKey, { count: 1, firstAttemptAt: now });
    } else {
      attempt.count += 1;
    }

    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 500 });
  }
}
