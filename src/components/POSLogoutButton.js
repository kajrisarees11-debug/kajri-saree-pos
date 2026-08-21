'use client';
import { useRouter } from 'next/navigation';

export default function POSLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <button onClick={handleLogout} className="text-white hover:text-red-200 text-xs uppercase tracking-widest font-bold ml-2">
      Logout
    </button>
  );
}
