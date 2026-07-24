import type { APIRoute } from 'astro';
import { getSupabaseServer, getUserProfile } from '../../lib/auth';

// Helper to get local date string in YYYY-MM-DD format based on system timezone
const getLocalDateString = () => {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().split('T')[0];
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const serverClient = getSupabaseServer(cookies);
  const profile = await getUserProfile(serverClient);

  if (!profile || profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Tidak diizinkan' }), { status: 403 });
  }

  try {
    const { action, sessionId } = await request.json().catch(() => ({ action: 'create' }));
    const todayStr = getLocalDateString();

    if (action === 'close') {
      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'Session ID wajib diisi untuk menutup sesi' }), { status: 400 });
      }

      // 1. Close all active sessions to ensure none are left open
      const { error } = await serverClient
        .from('sessions')
        .update({ is_active: false })
        .eq('is_active', true);

      if (error) throw error;

      // 2. AUTO-ALPA: Mark all students who haven't recorded presence as 'alpa'
      const { data: members } = await serverClient
        .from('profiles')
        .select('id')
        .eq('role', 'member');

      const { data: existingAttendances } = await serverClient
        .from('attendances')
        .select('user_id')
        .eq('session_id', sessionId);

      const attendedUserIds = new Set((existingAttendances || []).map((att: any) => att.user_id));
      const absentMembers = (members || []).filter((m: any) => !attendedUserIds.has(m.id));

      if (absentMembers.length > 0) {
        const alpaRecords = absentMembers.map((m: any) => ({
          session_id: sessionId,
          user_id: m.id,
          status: 'alpa',
          approval_status: 'approved',
          reason: 'Tidak melakukan presensi harian'
        }));

        const { error: alpaErr } = await serverClient
          .from('attendances')
          .insert(alpaRecords);

        if (alpaErr) {
          console.error('Failed to insert auto-alpa records:', alpaErr);
        }
      }

      return new Response(JSON.stringify({ message: 'Sesi berhasil ditutup dan status anggota yang tidak hadir diubah menjadi Alpa' }), { status: 200 });
    }

    // Default: Create / Open session
    
    // A. LAZY AUTO-CLOSE: Deactivate and run Auto-Alpa for all sessions from older days
    const { data: olderSessions } = await serverClient
      .from('sessions')
      .select('*')
      .eq('is_active', true)
      .lt('date', todayStr);

    if (olderSessions && olderSessions.length > 0) {
      for (const oldSess of olderSessions) {
        // Deactivate older session
        await serverClient
          .from('sessions')
          .update({ is_active: false })
          .eq('id', oldSess.id);

        // Run auto-alpa for this old session
        const { data: members } = await serverClient
          .from('profiles')
          .select('id')
          .eq('role', 'member');

        const { data: existingAttendances } = await serverClient
          .from('attendances')
          .select('user_id')
          .eq('session_id', oldSess.id);

        const attendedUserIds = new Set((existingAttendances || []).map((att: any) => att.user_id));
        const absentMembers = (members || []).filter((m: any) => !attendedUserIds.has(m.id));

        if (absentMembers.length > 0) {
          const alpaRecords = absentMembers.map((m: any) => ({
            session_id: oldSess.id,
            user_id: m.id,
            status: 'alpa',
            approval_status: 'approved',
            reason: 'Sesi hari sebelumnya ditutup otomatis oleh sistem'
          }));

          await serverClient.from('attendances').insert(alpaRecords);
        }
      }
    }

    // B. ONE SESSION PER DAY: Check if a session already exists for today's local date
    const { data: todaySessions } = await serverClient
      .from('sessions')
      .select('*')
      .eq('date', todayStr)
      .order('created_at', { ascending: false })
      .limit(1);

    const existingTodaySession = todaySessions && todaySessions.length > 0 ? todaySessions[0] : null;

    if (existingTodaySession) {
      // Re-activate today's existing session
      const { data: updatedSession, error: updateErr } = await serverClient
        .from('sessions')
        .update({ is_active: true })
        .eq('id', existingTodaySession.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ 
        message: 'Sesi hari ini diaktifkan kembali', 
        session: updatedSession 
      }), { status: 200 });
    }

    // C. CREATE TODAY'S SESSION (First time today)
    const token = `kkn-session-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
    const { data: newSession, error: insertErr } = await serverClient
      .from('sessions')
      .insert({
        token,
        is_active: true,
        date: todayStr
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ message: 'Sesi baru berhasil dibuka', session: newSession }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Gagal memproses sesi' }), { status: 500 });
  }
};
