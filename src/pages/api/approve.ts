import type { APIRoute } from 'astro';
import { getSupabaseServer, getUserProfile } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const serverClient = getSupabaseServer(cookies);
  const profile = await getUserProfile(serverClient);

  if (!profile || profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Tidak diizinkan' }), { status: 403 });
  }

  try {
    const { attendanceId, decision } = await request.json();

    if (!attendanceId || !['approve', 'reject'].includes(decision)) {
      return new Response(JSON.stringify({ error: 'Data parameter tidak valid' }), { status: 400 });
    }

    const approvalStatus = decision === 'approve' ? 'approved' : 'rejected';
    const updates: any = { approval_status: approvalStatus };

    if (decision === 'reject') {
      updates.status = 'alpa';
    }

    const { error } = await serverClient
      .from('attendances')
      .update(updates)
      .eq('id', attendanceId);

    if (error) throw error;

    return new Response(JSON.stringify({ message: `Pengajuan berhasil di-${decision === 'approve' ? 'setujui' : 'tolak'}` }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gagal memproses persetujuan' }), { status: 500 });
  }
};
