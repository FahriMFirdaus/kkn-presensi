import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, X, Calendar, Users, QrCode, ClipboardList, Loader2, Maximize2, XCircle, Table, Download, Search, Filter, Upload, AlertCircle, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

interface Session {
  id: string;
  date: string;
  token: string;
  is_active: boolean;
}

interface Attendance {
  id: string;
  status: string;
  reason: string;
  proof_url: string;
  approval_status: string;
  created_at: string;
  profiles: {
    full_name: string;
    nim: string;
    prodi: string;
    division: string;
  };
}

interface RecapItem {
  id: string;
  status: string;
  approval_status: string;
  created_at: string;
  full_name: string;
  nim: string;
  prodi: string;
  division: string;
  date: string;
}

interface Props {
  initialSession: Session | null;
  initialPendings: Attendance[];
  initialRecap: RecapItem[];
  adminNim: string;
}

export default function AdminPortal({ initialSession, initialPendings, initialRecap, adminNim }: Props) {
  const [activeTab, setActiveTab] = useState<'session' | 'approval' | 'recap'>('session');
  const [session, setSession] = useState<Session | null>(initialSession);
  const [pendings, setPendings] = useState<Attendance[]>(initialPendings);
  const [recap, setRecap] = useState<RecapItem[]>(initialRecap);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('semua');

  // Admin Self-Attendance states
  const [adminExcuseMode, setAdminExcuseMode] = useState<'none' | 'sakit' | 'izin'>('none');
  const [adminExcuseReason, setAdminExcuseReason] = useState('');
  const [adminFile, setAdminFile] = useState<File | null>(null);

  // Check if admin has already recorded attendance for the current active session (any status)
  const adminTodayAttendance = session
    ? recap.find(r => r.nim === adminNim && r.date === session.date)
    : null;

  // Poll for new data every 5 seconds (realtime fallback)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/admin?json=true');
        if (res.ok) {
          const data = await res.json();
          setSession(data.session);
          setPendings(data.pendings);
          setRecap(data.recap);
        }
      } catch (err) {
        console.error("Failed to poll data", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleOpenSession = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data.session);
        setMessage({ type: 'success', text: 'Sesi presensi baru berhasil dibuka!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Gagal membuka sesi' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Kesalahan koneksi internet' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', sessionId: session.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession(null);
        setMessage({ type: 'success', text: 'Sesi presensi berhasil ditutup!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Gagal menutup sesi' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Kesalahan koneksi internet' });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSelfAttend = async (status: 'hadir' | 'sakit' | 'izin') => {
    if (!session) return;
    setLoading(true);
    setMessage(null);
    try {
      let res;
      if (status === 'hadir') {
        res = await fetch('/api/attend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.token }),
        });
      } else {
        // Enforce reason and file check for admin permits
        if (!adminExcuseReason.trim()) {
          setMessage({ type: 'error', text: 'Alasan wajib diisi' });
          setLoading(false);
          return;
        }
        if (!adminFile) {
          setMessage({ type: 'error', text: 'Foto/File bukti wajib diunggah' });
          setLoading(false);
          return;
        }

        // Upload proof to Supabase Storage
        const fileExt = adminFile.name.split('.').pop();
        const fileName = `admin-${adminNim}-${Date.now()}.${fileExt}`;
        const filePath = `proofs/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('attendance_proofs')
          .upload(filePath, adminFile, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Gagal mengunggah bukti: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('attendance_proofs')
          .getPublicUrl(filePath);

        res = await fetch('/api/excuse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status,
            reason: adminExcuseReason,
            proofUrl: publicUrl
          }),
        });
      }
      
      const data = await res.json();
      if (res.ok) {
        const isHadir = status === 'hadir';
        setMessage({ 
          type: 'success', 
          text: isHadir 
            ? 'Presensi Hadir Anda berhasil dicatat!' 
            : `Pengajuan ${status.toUpperCase()} Anda berhasil disimpan! Menunggu persetujuan sekretaris lainnya.` 
        });
        
        // Push local update so UI updates immediately
        const newRecapItem: RecapItem = {
          id: `admin-self-${Date.now()}`,
          status,
          approval_status: isHadir ? 'approved' : 'pending',
          created_at: new Date().toISOString(),
          full_name: 'Sekretaris (Anda)',
          nim: adminNim,
          prodi: '-',
          division: 'Sekretaris',
          date: session.date
        };
        setRecap(prev => [newRecapItem, ...prev]);
        setAdminExcuseMode('none');
        setAdminExcuseReason('');
        setAdminFile(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Gagal mencatat presensi' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Kesalahan koneksi internet' });
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (id: string, decision: 'approve' | 'reject') => {
    setActionLoading(id);
    setMessage(null);
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceId: id, decision }),
      });
      const data = await res.json();
      if (res.ok) {
        setPendings(prev => prev.filter(p => p.id !== id));
        setMessage({ type: 'success', text: `Pengajuan berhasil ${decision === 'approve' ? 'disetujui' : 'ditolak'}` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Gagal memproses persetujuan' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Kesalahan koneksi internet' });
    } finally {
      setActionLoading(null);
    }
  };

  // Filter logic for Recap table (Restored status check)
  const filteredRecap = recap.filter((item) => {
    const matchesSearch = 
      item.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.nim.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.prodi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.division.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = 
      statusFilter === 'semua' || 
      item.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Export to Excel / CSV (Restored status column)
  const handleExportCSV = () => {
    const headers = ['No', 'NIM', 'Nama', 'Prodi', 'Divisi', 'Status Kehadiran', 'Tanggal Sesi'];
    const rows = filteredRecap.map((item, idx) => [
      idx + 1,
      `"${item.nim}"`, // Wrap NIM in quotes to prevent Excel formatting issues
      `"${item.full_name}"`,
      `"${item.prodi}"`,
      `"${item.division}"`,
      `"${item.status.toUpperCase()}"`,
      `"${item.date}"`
    ]);

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rekap_presensi_kkn_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusLabelText = (status: string) => {
    switch (status) {
      case 'hadir': return 'Hadir';
      case 'sakit': return 'Sakit';
      case 'izin': return 'Izin';
      default: return 'Alpa';
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'hadir': return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      case 'sakit': return 'bg-rose-50 text-rose-800 border border-rose-200';
      case 'izin': return 'bg-yellow-50 text-amber-800 border border-yellow-200';
      default: return 'bg-red-50 text-red-855 border border-red-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'hadir':
        return <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">Hadir</span>;
      case 'sakit':
        return <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border bg-rose-50 text-rose-700 border-rose-200">Sakit</span>;
      case 'izin':
        return <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border bg-yellow-50 text-amber-700 border-yellow-200">Izin</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border bg-slate-50 text-slate-700 border-slate-200">Alpa</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex bg-slate-200/60 p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('session')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'session' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <QrCode className="w-4 h-4" />
          Sesi QR
        </button>
        <button
          onClick={() => setActiveTab('approval')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
            activeTab === 'approval' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Persetujuan
          {pendings.length > 0 && (
            <span className="absolute top-1.5 right-2 bg-yellow-500 text-emerald-950 font-black text-[8px] px-1.5 py-0.5 rounded-full border border-white animate-bounce">
              {pendings.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('recap')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'recap' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Table className="w-4 h-4" />
          Rekap
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <X className="w-4 h-4 text-rose-600" />
          )}
          {message.text}
        </div>
      )}

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        {activeTab === 'session' && (
          <motion.div
            key="session-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm text-center space-y-6"
          >
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Manajemen Sesi Kehadiran</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Buka sesi presensi untuk memunculkan QR Code</p>
            </div>

            {session && session.is_active ? (
              <div className="space-y-6 flex flex-col items-center">
                <div className="p-4 bg-gradient-to-tr from-yellow-50 to-amber-50 rounded-3xl border border-yellow-200/50 shadow-inner inline-block">
                  <QRCodeSVG 
                    value={session.token} 
                    size={220} 
                    level="H" 
                    includeMargin={true}
                    className="rounded-xl shadow-md"
                  />
                </div>
                
                <div className="space-y-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 animate-pulse border border-emerald-200">
                    Sesi Aktif
                  </span>
                  <p className="text-[10px] text-slate-500 font-bold mt-1">Dibuat: {new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  <p className="text-[8px] font-mono text-slate-400 select-all font-medium mt-0.5">Token: {session.token}</p>
                </div>

                {/* Secretary Self-Attendance Options */}
                <div className="w-full bg-slate-50 border border-slate-200/60 p-4 rounded-2xl flex flex-col items-center gap-3">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider">Presensi Mandiri Anda (Sekretaris)</span>
                  
                  {adminTodayAttendance ? (
                    <div className={`flex flex-col items-center gap-1 text-xs font-bold px-3 py-2.5 rounded-xl w-full justify-center ${getStatusColorClass(adminTodayAttendance.status)}`}>
                      <div className="flex items-center gap-1">
                        <Check className="w-4 h-4 text-emerald-600" />
                        Kehadiran Tercatat ({getStatusLabelText(adminTodayAttendance.status)})
                      </div>
                      {adminTodayAttendance.approval_status === 'pending' && (
                        <span className="text-[9px] font-black text-rose-700 animate-pulse uppercase tracking-wider mt-1">
                          (Menunggu Persetujuan Sekretaris Lain)
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="w-full space-y-3">
                      {adminExcuseMode === 'none' ? (
                        <div className="grid grid-cols-3 gap-2 w-full">
                          <button
                            onClick={() => handleAdminSelfAttend('hadir')}
                            disabled={loading}
                            className="py-2.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                          >
                            Hadir
                          </button>
                          <button
                            onClick={() => setAdminExcuseMode('sakit')}
                            disabled={loading}
                            className="py-2.5 px-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-[10px] font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                          >
                            Sakit
                          </button>
                          <button
                            onClick={() => setAdminExcuseMode('izin')}
                            disabled={loading}
                            className="py-2.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                          >
                            Izin
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 text-left w-full">
                          <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                            <button
                              type="button"
                              onClick={() => {
                                setAdminExcuseMode('none');
                                setAdminExcuseReason('');
                                setAdminFile(null);
                              }}
                              className="flex items-center gap-0.5 text-slate-500 hover:text-slate-700 text-[10px] font-bold"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              Batal
                            </button>
                            <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">Form {adminExcuseMode}</span>
                            <div className="w-8"></div>
                          </div>

                          <div className="space-y-3 mt-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alasan Detail</label>
                              <textarea
                                required
                                rows={2}
                                value={adminExcuseReason}
                                onChange={e => setAdminExcuseReason(e.target.value)}
                                placeholder={`Tuliskan alasan ${adminExcuseMode} Anda...`}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none text-[11px] transition-all bg-white font-semibold"
                              ></textarea>
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bukti Gambar</label>
                              <div className="relative border border-dashed border-slate-200 hover:border-emerald-500 transition-colors rounded-xl p-3 text-center cursor-pointer bg-white group">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={e => setAdminFile(e.target.files?.[0] || null)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="text-slate-400 group-hover:text-emerald-600 transition-colors flex flex-col items-center gap-1">
                                  <Upload className="w-5 h-5" />
                                  <p className="text-[10px] font-bold">{adminFile ? adminFile.name : 'Pilih Foto Bukti'}</p>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAdminSelfAttend(adminExcuseMode)}
                              disabled={loading || !adminExcuseReason.trim() || !adminFile}
                              className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-1.5"
                            >
                              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Kirim Kehadiran'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleCloseSession}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-extrabold transition-all shadow active:scale-98 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : 'Tutup Sesi Presensi'}
                </button>
              </div>
            ) : (
              <div className="space-y-6 py-6">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 border-2 border-dashed border-slate-200">
                  <QrCode className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-600">Sesi Presensi Belum Dibuka</p>
                  <p className="text-[10px] text-slate-400 font-medium">Klik tombol di bawah untuk membuat QR Code presensi hari ini</p>
                </div>
                <button
                  onClick={handleOpenSession}
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white rounded-2xl text-xs font-extrabold transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : 'Buka Absensi Hari Ini'}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'approval' && (
          <motion.div
            key="approval-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {pendings.length === 0 ? (
              <div className="bg-white border border-slate-200 p-8 rounded-3xl text-center text-slate-400">
                <Check className="w-10 h-10 mx-auto text-slate-300 mb-2 border border-slate-200 rounded-full p-2" />
                <p className="text-xs font-bold">Semua Bersih!</p>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Tidak ada pengajuan izin/sakit yang perlu divalidasi.</p>
              </div>
            ) : (
              pendings.map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black text-slate-800">{item.profiles?.full_name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold">NIM: {item.profiles?.nim} | {item.profiles?.prodi} | Divisi: <span className="text-emerald-700 font-extrabold">{item.profiles?.division}</span></p>
                      <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase mt-1.5 ${
                        item.status === 'sakit' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-yellow-50 text-amber-700 border border-yellow-100'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium font-mono">
                      {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Alasan:</p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">{item.reason}</p>
                  </div>

                  {item.proof_url && (
                    <div className="relative group rounded-2xl overflow-hidden border border-slate-200 aspect-[16/9] bg-slate-100 flex items-center justify-center">
                      <img 
                        src={item.proof_url} 
                        alt="Bukti Izin" 
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setSelectedProof(item.proof_url)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-bold"
                      >
                        <Maximize2 className="w-4 h-4" />
                        Perbesar Bukti
                      </button>
                    </div>
                  )}

                  {/* Approval Actions: Prevent self-approval for secretaries */}
                  {item.profiles?.nim === adminNim ? (
                    <div className="w-full bg-slate-50 border border-slate-200 text-slate-400 text-[10px] font-bold py-3 rounded-2xl text-center">
                      🔒 Pengajuan Anda (Menunggu Persetujuan Sekretaris Lain)
                    </div>
                  ) : (
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => handleDecision(item.id, 'reject')}
                        disabled={actionLoading !== null}
                        className="flex-1 py-2 px-3 border border-emerald-800 text-emerald-800 hover:bg-emerald-50 rounded-2xl text-xs font-extrabold transition-all active:scale-98 flex items-center justify-center gap-1.5"
                      >
                        {actionLoading === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        Tolak (Alpa)
                      </button>
                      <button
                        onClick={() => handleDecision(item.id, 'approve')}
                        disabled={actionLoading !== null}
                        className="flex-1 py-2 px-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-extrabold transition-all active:scale-98 shadow flex items-center justify-center gap-1.5"
                      >
                        {actionLoading === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Setujui
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'recap' && (
          <motion.div
            key="recap-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4"
          >
            {/* Recap Title & Export */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Rekap Anggota KKN</h3>
                <p className="text-[10px] text-slate-400 font-medium">Daftar lengkap anggota KKN Kelompok Puspamukti</p>
              </div>
              
              <button
                onClick={handleExportCSV}
                className="py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                Ekspor Excel
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3">
              {/* Filter controls row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Search Bar */}
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Cari NIM, nama, prodi, atau divisi..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none text-xs focus:border-emerald-600 transition-all font-medium bg-slate-50"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 outline-none focus:border-emerald-600 bg-slate-50"
                  >
                    <option value="semua">Semua Status</option>
                    <option value="hadir">Hadir</option>
                    <option value="sakit">Sakit</option>
                    <option value="izin">Izin</option>
                    <option value="alpa">Alpa</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center">
                <span className="text-[10px] text-slate-400 font-bold ml-auto">
                  {filteredRecap.length} data ditemukan
                </span>
              </div>
            </div>

            {/* Excel-like Table container */}
            <div className="overflow-auto border border-slate-100 rounded-2xl shadow-inner max-h-[300px]">
              <table className="w-full text-[10px] text-left border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-slate-200/60 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 border-r border-slate-200/60">NIM</th>
                    <th className="py-2.5 px-3 border-r border-slate-200/60">Nama</th>
                    <th className="py-2.5 px-3 border-r border-slate-200/60">Prodi</th>
                    <th className="py-2.5 px-3 border-r border-slate-200/60">Divisi</th>
                    <th className="py-2.5 px-3 border-r border-slate-200/60 w-20 text-center">Status</th>
                    <th className="py-2.5 px-3">Tanggal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 font-semibold text-slate-700">
                  {filteredRecap.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        Tidak ada data anggota yang sesuai filter
                      </td>
                    </tr>
                  ) : (
                    filteredRecap.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 px-3 border-r border-slate-100 text-center text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 border-r border-slate-100 font-mono text-slate-600">{item.nim}</td>
                        <td className="py-2 px-3 border-r border-slate-100 truncate max-w-[110px]" title={item.full_name}>
                          {item.full_name}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-100 truncate max-w-[90px]" title={item.prodi}>
                          {item.prodi}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-100 font-bold text-emerald-800">
                          {item.division}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-100 text-center">
                          {getStatusBadge(item.status)}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{item.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Proof Lightbox Modal */}
      <AnimatePresence>
        {selectedProof && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedProof(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative bg-white rounded-3xl overflow-hidden max-w-sm w-full border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedProof(null)}
                className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-all z-10"
              >
                <XCircle className="w-5 h-5" />
              </button>
              <img 
                src={selectedProof} 
                alt="Bukti Diperbesar" 
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
