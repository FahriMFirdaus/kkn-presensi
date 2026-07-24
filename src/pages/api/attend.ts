import type { APIRoute } from 'astro';
import { getSupabaseServer, getUserProfile } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const serverClient = getSupabaseServer(cookies);
  const profile = await getUserProfile(serverClient);

  if (!profile) {
    return new Response(JSON.stringify({ error: 'Tidak diizinkan, silakan login kembali' }), { status: 401 });
  }

  try {
    const { token } = await request.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token presensi tidak valid' }), { status: 400 });
    }

    // 1. Find active session
    const { data: session, error: sessionErr } = await serverClient
      .from('sessions')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: 'Sesi presensi tidak ditemukan atau sudah ditutup oleh admin' }), { status: 404 });
    }

    // 2. Check if already marked attendance for this session
    const { data: existingAttendance } = await serverClient
      .from('attendances')
      .select('*')
      .eq('session_id', session.id)
      .eq('user_id', profile.id)
      .maybeSingle();

    if (existingAttendance) {
      return new Response(JSON.stringify({ error: 'Anda sudah melakukan presensi pada sesi ini' }), { status: 400 });
    }

    // 3. Record attendance
    const { error: insertErr } = await serverClient
      .from('attendances')
      .insert({
        session_id: session.id,
        user_id: profile.id,
        status: 'hadir',
        approval_status: 'approved',
      });

    if (insertErr) {
      throw new Error(insertErr.message);
    }

    return new Response(JSON.stringify({ message: 'Presensi Hadir berhasil dicatat!' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gagal memproses presensi' }), { status: 500 });
  }
};
