import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  // Must match the `path` the cookie was set with (login/route.js), otherwise
  // the browser won't actually clear the session cookie.
  cookieStore.delete({ name: 'pos_auth_token', path: '/' });

  return NextResponse.json({ success: true });
}
