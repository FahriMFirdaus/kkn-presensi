import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

const USERS = [
  { nim: '2305020022', name: 'SANDI RAHMAT PAMUNGKAS', prodi: 'Agroteknologi Pertanian', division: 'Kormades', role: 'member' },
  { nim: '2201010018', name: 'VERONICA ANASTASYA', prodi: 'Pendidikan Bahasa Inggris', division: 'Humas', role: 'member' },
  { nim: '2303020046', name: 'ZAHIRA TRISNABILA', prodi: 'Teknik Sipil', division: 'Bendahara', role: 'member' },
  { nim: '2303010187', name: 'MOHAMMAD AZAM QOHTHANI', prodi: 'Teknik Informatika', division: 'Pdd', role: 'member' },
  { nim: '2303010033', name: 'FAHRI MUHAMAD FIRDAUS', prodi: 'Teknik Informatika', division: 'Acara', role: 'member' },
  { nim: '2302010149', name: 'IKHSAN WILLY RIZKIA', prodi: 'Manajemen', division: 'Humas', role: 'member' },
  { nim: '2301020018', name: 'DESTRI PUSVITA', prodi: 'Pendidikan Guru Sekolah Dasar', division: 'Konsumsi', role: 'member' },
  { nim: '2301020075', name: 'DIFFA MILATI HANIFA', prodi: 'Pendidikan Guru Sekolah Dasar', division: 'Acara', role: 'member' },
  { nim: '2302020008', name: 'MULFI MUHAMMAD FAUZI', prodi: 'Akuntansi', division: 'Wakil', role: 'member' },
  { nim: '2304010036', name: 'RATNA DEWI KOMALASARI', prodi: 'Farmasi', division: 'Bendahara', role: 'member' },
  { nim: '2302010104', name: 'SRI INTAN TIARAYANI', prodi: 'Manajemen', division: 'Acara', role: 'member' },
  { nim: '2301020120', name: 'VIA NUROKTAVIANI', prodi: 'Pendidikan Guru Sekolah Dasar', division: 'Konsumsi', role: 'member' },
  { nim: '2303010012', name: 'LINDA MARDIANA', prodi: 'Teknik Informatika', division: 'Pdd', role: 'member' },
  { nim: '2302010199', name: 'SITI KHODIJAH', prodi: 'Manajemen', division: 'Sekretaris', role: 'admin' }, // Sekretaris
  { nim: '2302010246', name: 'HASBY FAISAL SIDIQ', prodi: 'Manajemen', division: 'Sekretaris', role: 'admin' } // Sekretaris
];

export const GET: APIRoute = async () => {
  const results = [];

  for (const user of USERS) {
    const email = `${user.nim}@kkn.unper.ac.id`;
    const password = 'puspamukti';

    // Stagger requests to prevent Supabase signup rate limit (1 request per second)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 1. Sign up user via standard Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: user.name,
          nim: user.nim,
          prodi: user.prodi,
          division: user.division,
          role: user.role
        }
      }
    });

    if (authError) {
      // If user already exists, retrieve their ID from profiles and force update their division & info
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('nim', user.nim)
        .maybeSingle();

      if (existingProfile) {
        const { error: dbError } = await supabase
          .from('profiles')
          .upsert({
            id: existingProfile.id,
            full_name: user.name,
            nim: user.nim,
            prodi: user.prodi,
            division: user.division,
            role: user.role
          });

        if (dbError) {
          results.push({ nim: user.nim, name: user.name, status: 'existing-update-failed', error: dbError.message });
        } else {
          results.push({ nim: user.nim, name: user.name, status: 'updated-existing-user-profile' });
        }
      } else {
        results.push({ nim: user.nim, name: user.name, status: 'auth-error-no-profile-found', error: authError.message });
      }
      continue;
    }

    if (authData.user) {
      // 2. Insert into profiles
      const { error: dbError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          full_name: user.name,
          nim: user.nim,
          prodi: user.prodi,
          division: user.division,
          role: user.role
        });

      if (dbError) {
        results.push({ nim: user.nim, name: user.name, status: 'auth-created-db-failed', error: dbError.message });
      } else {
        results.push({ nim: user.nim, name: user.name, status: 'success' });
      }
    }
  }

  return new Response(JSON.stringify({
    message: 'Seeding complete. Checked and updated all accounts with division assignments.',
    results
  }), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
};
