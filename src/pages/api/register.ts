import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get('email')?.toString();
  const password = formData.get('password')?.toString();
  const fullName = formData.get('fullName')?.toString();
  const nim = formData.get('nim')?.toString();
  const prodi = formData.get('prodi')?.toString();
  const role = formData.get('role')?.toString() || 'member';

  if (!email || !password || !fullName || !nim || !prodi) {
    return redirect(`/register?error=${encodeURIComponent('Semua kolom harus diisi')}`);
  }

  try {
    // Sign up user
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          nim,
          prodi,
          role,
        }
      }
    });

    if (signUpError || !authData.user) {
      return redirect(`/register?error=${encodeURIComponent(signUpError?.message || 'Registrasi gagal')}`);
    }

    // Explicitly create profile to ensure it is created (even without trigger)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: fullName,
        nim,
        prodi,
        role,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    }

    // Set cookies if session is active (or require login if email confirmation is enabled, but typically auto-login is active)
    if (authData.session) {
      cookies.set('sb-access-token', authData.session.access_token, { path: '/', httpOnly: true, secure: false, sameSite: 'lax' });
      cookies.set('sb-refresh-token', authData.session.refresh_token, { path: '/', httpOnly: true, secure: false, sameSite: 'lax' });
      
      return redirect(role === 'admin' ? '/admin' : '/dashboard');
    }

    // Redirect to login on success (in case email confirmation is required)
    return redirect('/login?registered=true');
  } catch (err: any) {
    console.error('Register error:', err);
    return redirect(`/register?error=${encodeURIComponent('Koneksi gagal atau server Supabase sedang sibuk. Silakan periksa jaringan internet Anda.')}`);
  }
};
