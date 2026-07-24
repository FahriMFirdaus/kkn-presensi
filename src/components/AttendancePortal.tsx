import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Camera, FileText, Frown, CheckCircle, ArrowLeft, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Html5QrcodeModule from 'html5-qrcode';

// Resolve CommonJS named export safely for Vite/Astro production bundles
const Html5Qrcode = Html5QrcodeModule.Html5Qrcode;

interface Props {
  userId: string;
  initialTodayAttendance?: any;
}

export default function AttendancePortal({ userId, initialTodayAttendance }: Props) {
  const [mode, setMode] = useState<'home' | 'hadir' | 'sakit' | 'izin'>('home');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<any>(initialTodayAttendance);
  
  const scannerRef = useRef<any>(null);

  // Clear messages when mode changes
  useEffect(() => {
    setMessage(null);
    setReason('');
    setFile(null);
    
    // Stop scanner if leaving "hadir" mode
    if (mode !== 'hadir' && scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch((err: any) => console.error("Error stopping scanner:", err));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [mode]);

  // QR Code Scanner initialization
  useEffect(() => {
    let html5QrCode: any = null;
    let timeoutId: any = null;

    if (mode === 'hadir' && Html5Qrcode) {
      // Delay camera initialization by 150ms to ensure React finishes DOM painting
      timeoutId = setTimeout(() => {
        const element = document.getElementById("reader");
        if (!element) {
          console.warn("Reader element still not found in DOM.");
          return;
        }

        try {
          html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;
        } catch (e: any) {
          console.error("Failed to instantiate Html5Qrcode:", e);
          setMessage({ type: 'error', text: `Inisialisasi pemindai gagal: ${e.message || e}` });
          return;
        }

        const qrCodeSuccessCallback = async (decodedText: string) => {
          // Stop scanner once scanned successfully
          setLoading(true);
          try {
            await html5QrCode.stop();
          } catch (err) {
            console.error("Failed to stop scanner", err);
          }

          try {
            // Submit attendance
            const response = await fetch('/api/attend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: decodedText }),
            });

            const result = await response.json();
            if (response.ok) {
              setMessage({ type: 'success', text: result.message || 'Presensi Hadir berhasil dicatat!' });
              // Set today attendance state so it locks user dashboard
              setTodayAttendance({
                status: 'hadir',
                approval_status: 'approved',
                created_at: new Date().toISOString()
              });
              setMode('home');
            } else {
              setMessage({ type: 'error', text: result.error || 'Gagal melakukan presensi' });
            }
          } catch (err) {
            setMessage({ type: 'error', text: 'Terjadi kesalahan jaringan' });
          } finally {
            setLoading(false);
          }
        };

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        // Highly simplified and robust camera start routine
        const startScanner = async () => {
          try {
            // Start scanning immediately with rear camera preference (environment)
            // This natively triggers permission popups reliably on all browsers (including Safari and Chrome)
            await html5QrCode.start(
              { facingMode: "environment" }, 
              config, 
              qrCodeSuccessCallback, 
              () => {} // silent scan errors
            );
          } catch (err: any) {
            console.warn("Failed starting camera with environment constraint, trying user camera...", err);
            try {
              // Fallback to front camera (user) if back camera setup fails
              await html5QrCode.start(
                { facingMode: "user" }, 
                config, 
                qrCodeSuccessCallback, 
                () => {}
              );
            } catch (fallbackErr: any) {
              console.error("All camera start attempts failed:", fallbackErr);
              setMessage({
                type: 'error',
                text: `Kamera tidak dapat dimuat: ${fallbackErr.message || fallbackErr}. Silakan periksa perizinan browser.`
              });
            }
          }
        };

        startScanner();
      }, 150);
    } else if (mode === 'hadir' && !Html5Qrcode) {
      setMessage({ type: 'error', text: 'Pustaka pemindai kamera tidak termuat dengan benar.' });
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((err: any) => console.error(err));
      }
    };
  }, [mode]);

  const handleExcuseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'Alasan wajib diisi' });
      return;
    }
    if (!file) {
      setMessage({ type: 'error', text: 'Foto/File bukti wajib diunggah' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // 1. Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `proofs/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attendance_proofs')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Gagal mengunggah bukti: ${uploadError.message}`);
      }

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('attendance_proofs')
        .getPublicUrl(filePath);

      // 3. Submit to API
      const statusType = mode === 'sakit' ? 'sakit' : 'izin';
      const response = await fetch('/api/excuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusType,
          reason,
          proofUrl: publicUrl
        }),
      });

      const result = await response.json();
      if (response.ok) {
        setMessage({ type: 'success', text: `Pengajuan ${statusType} berhasil dikirim! Menunggu persetujuan admin.` });
        setTodayAttendance({
          status: statusType,
          approval_status: 'pending',
          reason,
          created_at: new Date().toISOString()
        });
        setMode('home');
      } else {
        setMessage({ type: 'error', text: result.error || 'Gagal mengirim pengajuan' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Terjadi kesalahan sistem' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-grow flex flex-col">
      <AnimatePresence mode="wait">
        {mode === 'home' ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-6"
          >
            {/* Header Vibe */}
            <div className="text-center py-4 bg-gradient-to-br from-emerald-950/5 to-emerald-500/5 rounded-3xl border border-slate-200/40 p-4">
              <span className="text-[10px] tracking-widest text-emerald-800 uppercase font-black">Menu Presensi Mandiri</span>
              <h3 className="text-lg font-extrabold text-slate-800 mt-1">Status Kehadiran Hari Ini</h3>
            </div>

            {todayAttendance ? (
              // Beautiful status card showing they have already checked in
              <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm text-center space-y-6">
                <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                
                <div className="space-y-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-wider ${
                    todayAttendance.status === 'hadir' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                    todayAttendance.status === 'sakit' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                    todayAttendance.status === 'izin' ? 'bg-yellow-100 text-amber-800 border-yellow-200' :
                    'bg-red-100 text-red-800 border-red-200'
                  }`}>
                    {todayAttendance.status}
                  </span>
                  <h4 className="text-base font-black text-slate-800 mt-1">Kehadiran Sudah Tercatat</h4>
                  <p className="text-xs text-slate-400 font-medium">
                    Waktu presensi: {new Date(todayAttendance.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                  </p>
                  
                  {/* If permit Sakit/Izin show approval status */}
                  {(todayAttendance.status === 'sakit' || todayAttendance.status === 'izin') && (
                    <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center gap-1">
                      <span className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider">Status Validasi Sekretaris:</span>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase mt-0.5 ${
                        todayAttendance.approval_status === 'approved' 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                          : todayAttendance.approval_status === 'pending' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse' 
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {todayAttendance.approval_status === 'approved' ? 'Disetujui' : todayAttendance.approval_status === 'pending' ? 'Menunggu Persetujuan' : 'Ditolak (Terhitung Alpa)'}
                      </span>
                    </div>
                  )}

                  {todayAttendance.status === 'alpa' && (
                    <div className="mt-4 p-3.5 bg-red-50 rounded-2xl border border-red-100 flex flex-col items-center gap-1">
                      <p className="text-xs font-bold text-red-800">Anda Dinyatakan Alpa</p>
                      <p className="text-[10px] text-red-600 font-medium">Sesi absen sudah ditutup dan Anda tidak melakukan presensi.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Antigravity floating action cards
              <div className="grid grid-cols-1 gap-5">
                {/* HADIR CARD */}
                <motion.button
                  whileHover={{ y: -6, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMode('hadir')}
                  className="relative overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-3xl shadow-lg border border-emerald-400/20 text-left group"
                >
                  <div className="space-y-1">
                    <h4 className="text-lg font-black tracking-tight">Hadir di Lokasi</h4>
                    <p className="text-xs text-emerald-100/90 font-medium">Scan QR Code dari sekretaris</p>
                  </div>
                  <div className="p-3 bg-white/10 rounded-2xl group-hover:rotate-6 transition-all duration-300">
                    <Camera className="w-7 h-7" />
                  </div>
                </motion.button>

                {/* SAKIT CARD */}
                <motion.button
                  whileHover={{ y: -6, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMode('sakit')}
                  className="relative overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-rose-800 to-red-600 text-white rounded-3xl shadow-lg border border-rose-500/20 text-left group"
                >
                  <div className="space-y-1">
                    <h4 className="text-lg font-black tracking-tight">Sakit</h4>
                    <p className="text-xs text-rose-100/90 font-medium">Kurang fit & sertakan bukti</p>
                  </div>
                  <div className="p-3 bg-white/10 rounded-2xl group-hover:rotate-6 transition-all duration-300">
                    <Frown className="w-7 h-7" />
                  </div>
                </motion.button>

                {/* IZIN CARD */}
                <motion.button
                  whileHover={{ y: -6, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMode('izin')}
                  className="relative overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-teal-800 to-emerald-600 text-white rounded-3xl shadow-lg border border-teal-500/20 text-left group"
                >
                  <div className="space-y-1">
                    <h4 className="text-lg font-black tracking-tight">Izin</h4>
                    <p className="text-xs text-teal-100/90 font-medium">Ada keperluan penting KKN</p>
                  </div>
                  <div className="p-3 bg-white/10 rounded-2xl group-hover:rotate-6 transition-all duration-300">
                    <FileText className="w-7 h-7" />
                  </div>
                </motion.button>
              </div>
            )}
          </motion.div>
        ) : mode === 'hadir' ? (
          <motion.div
            key="hadir"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col flex-grow bg-white border border-slate-200 p-6 rounded-3xl shadow-sm text-center justify-between min-h-[400px]"
          >
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <button 
                onClick={() => setMode('home')}
                className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs font-extrabold active:scale-95 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </button>
              <h3 className="text-xs font-black uppercase text-emerald-800 tracking-wider">Scan QR Presensi</h3>
              <div className="w-16"></div> {/* Spacer */}
            </div>

            <div className="my-4 space-y-4 flex flex-col items-center justify-center flex-grow">
              <div id="reader" className="w-full aspect-square bg-slate-100 rounded-3xl overflow-hidden border border-slate-200 shadow-inner"></div>
              
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700">Arahkan Kamera ke QR Code</p>
                <p className="text-[10px] text-slate-400 font-medium">Pastikan QR Code sekretaris terlihat jelas di dalam bingkai</p>
              </div>

              {/* Informative tips box for permissions */}
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 text-[10px] text-amber-800 text-left font-semibold space-y-1.5 max-w-sm w-full mt-2 shadow-inner">
                <p className="font-black text-amber-900 flex items-center gap-1">💡 Kamera Tidak Aktif?</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>iPhone / iOS (Safari):</strong> Buka Pengaturan HP &gt; Safari &gt; Kamera &gt; ubah menjadi <strong>Izinkan (Allow)</strong>.</li>
                  <li><strong>Android (Chrome):</strong> Klik ikon gembok di sebelah alamat web di atas &gt; Izin Situs &gt; aktifkan <strong>Kamera</strong>.</li>
                  <li>Segarkan (refresh) halaman setelah mengaktifkan izin agar kamera mendeteksi perubahan.</li>
                </ul>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 py-3 rounded-2xl animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sedang memproses presensi Anda...
              </div>
            )}
            
            {message && message.type === 'error' && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-bold rounded-xl flex items-center gap-1.5 mt-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                {message.text}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="excuse"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col gap-6"
          >
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <button 
                onClick={() => setMode('home')}
                className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs font-extrabold active:scale-95 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali
              </button>
              <h3 className="text-xs font-black uppercase text-emerald-800 tracking-wider">Form Pengajuan {mode}</h3>
              <div className="w-16"></div>
            </div>

            <form onSubmit={handleExcuseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Alasan Detail</label>
                <textarea
                  required
                  rows={4}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={`Tuliskan alasan Anda mengajukan ${mode} hari ini...`}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none text-xs transition-all bg-slate-50 font-medium"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Unggah Bukti Gambar</label>
                <div className="relative border-2 border-dashed border-slate-200 hover:border-emerald-500 transition-colors rounded-2xl p-6 text-center cursor-pointer bg-slate-50 group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2 text-slate-400 group-hover:text-emerald-600 transition-colors">
                    <Upload className="w-8 h-8 mx-auto" />
                    <p className="text-xs font-bold">{file ? file.name : 'Pilih Foto Bukti'}</p>
                    <p className="text-[9px] font-medium text-slate-400">Format: JPG, PNG (Max 5MB)</p>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
                  message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {message.text}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white rounded-2xl text-xs font-extrabold transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Kirim Surat ${mode}`}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
