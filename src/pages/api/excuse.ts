import type { APIRoute } from 'astro';
import { getSupabaseServer, getUserProfile } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const serverClient = getSupabaseServer(cookies);
  const profile = await getUserProfile(serverClient);

  if (!profile) {
    return new Response(JSON.stringify({ error: 'Tidak diizinkan, silakan login kembali' }), { status: 401 });
  }

  try {
    const { status, reason, proofUrl } = await request.json();
    
    if (!status || !['sakit', 'izin'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Status presensi tidak valid' }), { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return new Response(JSON.stringify({ error: 'Alasan wajib diisi' }), { status: 400 });
    }
    if (!proofUrl) {
      return new Response(JSON.stringify({ error: 'Bukti gambar wajib dilampirkan' }), { status: 400 });
    }

    // Find the current active session or session for today
    const { data: sessions, error: sessionErr } = await serverClient
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (sessionErr || !sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ error: 'Sesi presensi untuk hari ini belum dibuat oleh admin' }), { status: 404 });
    }

    // Prefer active session, otherwise latest session
    const activeSession = sessions.find(s => s.is_active) || sessions[0];

    // Check if already registered
    const { data: existingAttendance } = await serverClient
      .from('attendances')
      .select('*')
      .eq('session_id', activeSession.id)
      .eq('user_id', profile.id)
      .maybeSingle();

    if (existingAttendance) {
      return new Response(JSON.stringify({ error: 'Anda sudah mengisi presensi (Hadir/Sakit/Izin) pada sesi ini' }), { status: 400 });
    }

    // Insert attendance (All Sakit/Izin start as 'pending', even for admins/secretaries)
    const { error: insertErr } = await serverClient
      .from('attendances')
      .insert({
        session_id: activeSession.id,
        user_id: profile.id,
        status,
        reason,
        proof_url: proofUrl,
        approval_status: 'pending', // Set to pending so other secretary must approve it
      });

    if (insertErr) {
      throw new Error(insertErr.message);
    }

    return new Response(JSON.stringify({ message: 'Pengajuan Sakit/Izin berhasil disimpan! Menunggu persetujuan sekretaris lainnya.' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gagal memproses pengajuan' }), { status: 500 });
  }
};
