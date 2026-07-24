import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const nim = formData.get('nim')?.toString();
  const password = formData.get('password')?.toString();

  if (!nim || !password) {
    return redirect(`/login?error=${encodeURIComponent('NIM dan password wajib diisi')}`);
  }

  // Map NIM to a virtual email domain for Supabase Auth authentication
  const email = `${nim.trim()}@kkn.unper.ac.id`;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return redirect(`/login?error=${encodeURIComponent(error?.message === 'Invalid login credentials' ? 'NIM atau password salah' : (error?.message || 'Login gagal'))}`);
    }

    const oneYear = 60 * 60 * 24 * 365; // 1 year in seconds
    cookies.set('sb-access-token', data.session.access_token, { 
      path: '/', 
      httpOnly: true, 
      secure: false, 
      sameSite: 'lax',
      maxAge: oneYear
    });
    cookies.set('sb-refresh-token', data.session.refresh_token, { 
      path: '/', 
      httpOnly: true, 
      secure: false, 
      sameSite: 'lax',
      maxAge: oneYear
    });

    // Get user profile role to redirect correctly
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const role = profile?.role || 'member';

    return redirect(role === 'admin' ? '/admin' : '/dashboard');
  } catch (err: any) {
    console.error('Login error:', err);
    return redirect(`/login?error=${encodeURIComponent('Koneksi gagal atau server Supabase sedang sibuk. Silakan periksa jaringan internet Anda.')}`);
  }
};
