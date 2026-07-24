# 📄 PRODUCT REQUIREMENTS DOCUMENT (PRD) v2.0

**Project Name:** Sistem Presensi KKN Terpusat (Astro.js + Supabase)
**Vibe Coding Target:** Mobile-First Dashboard (UI Siska UNPER) + Antigravity UX

## 1. Overview & Goals

Sistem absensi _all-in-one_ untuk anggota KKN. Menggunakan satu portal web terpusat bagi anggota untuk melakukan presensi mandiri (Hadir via Scan QR Dinamis) atau mengajukan permohonan berhalangan (Sakit/Izin dengan _upload_ bukti). Sekretaris bertindak sebagai Admin yang membuka sesi QR dan melakukan validasi (Approve/Reject) terhadap pengajuan Izin/Sakit tanpa perlu melalui WhatsApp.

## 2. Tech Stack & "Antigravity" Flow

- **Framework:** Astro.js (SSR Mode)
- **UI Library:** React (Astro Islands) untuk QR Scanner & Form Upload.
- **Styling:** Tailwind CSS + Framer Motion (Efek _Antigravity_).
- **Database, Auth & Storage:** Supabase (Database relasional & Storage untuk foto bukti).
- **QR Scanner:** `html5-qrcode` (Sisi Anggota).
- **QR Generator:** `qrcode.react` (Sisi Admin).

## 3. UI/UX & Design System (Siska UNPER Theme + Antigravity)

- **Color Palette:** Primary `bg-red-800` / `bg-rose-900` (Maroon), Accent `bg-yellow-500` (Emas), Background `bg-slate-50`, Text `text-slate-800`.
- **Antigravity UX:** Tombol menu utama menggunakan _Floating Cards_ (Hadir, Sakit, Izin) yang seolah melayang dan responsif terhadap sentuhan (`shadow-md` ke `shadow-2xl`, `hover:-translate-y-2`).
- **Layout:** Mobile-first. _Dashboard_ mahasiswa menampilkan 3 opsi utama yang jelas dan besar di tengah layar. _Dashboard_ admin terbagi menjadi tab "Sesi QR" dan "Approval Pending".

## 4. Core User Flows

- **Alur Anggota (Mahasiswa):**
  1. Login -> Masuk Landing Page/Dashboard.
  2. Menghadapi 3 _Floating Cards_: **[Hadir]**, **[Sakit]**, **[Izin]**.
  3. **Jika pilih Hadir:** Kamera terbuka -> Scan QR di HP Sekre -> Status tercatat "Hadir".
  4. **Jika pilih Sakit/Izin:** Muncul form pop-up/halaman baru -> Input alasan singkat -> Upload foto bukti (surat dokter/foto kondisi) -> Submit. Status menjadi "Pending Approval".
- **Alur Admin (Sekretaris):**
  1. Login -> Masuk Dashboard Admin.
  2. **Sesi Hadir:** Klik "Buka Absensi Hari Ini" -> Muncul QR Code dinamis untuk di-scan anggota di lokasi.
  3. **Panel Approval:** Melihat tabel pengajuan "Pending". Admin bisa klik foto bukti (modal pop-up) lalu memilih tombol `Approve` (Status -> Sakit/Izin) atau `Reject` (Status -> Alpa).

## 5. Database Schema (Supabase)

**Table: `profiles`**

- `id` (uuid, PK, refer to auth.users)
- `full_name` (text)
- `nim` (text, unique)
- `role` (text) -> 'admin' | 'member'

**Table: `sessions`**

- `id` (uuid, PK)
- `date` (date) -> Tanggal presensi (misal: 2026-07-22)
- `token` (text, unique) -> Token _random_ untuk QR Code
- `is_active` (boolean) -> Default `true`

**Table: `attendances`** _(UPDATED)_

- `id` (uuid, PK)
- `session_id` (uuid, FK to sessions.id)
- `user_id` (uuid, FK to profiles.id)
- `status` (text) -> 'hadir', 'izin', 'sakit'
- `reason` (text, nullable) -> Alasan izin/sakit
- `proof_url` (text, nullable) -> URL gambar bukti dari Supabase Storage
- `approval_status` (text) -> 'approved', 'pending', 'rejected' (Default 'approved' khusus untuk yang 'hadir')
- `created_at` (timestamp)

**Storage Bucket:** `attendance_proofs` (Public/Authenticated read-write)

## 6. Implementation Roadmap (Vibe Coding Steps for AI)

_Copy-paste prompt berikut ke AI IDE (Cursor / Windsurf / Copilot) kamu:_

- **Prompt Step 1 (Setup, Theme & Landing Page):** "Initialize an Astro SSR project with Tailwind CSS. Theme colors: dark maroon (bg-red-800) and gold accents (Siska UNPER style). Create a Member Dashboard landing page with an 'antigravity' aesthetic. Display three main large, floating action cards/buttons: 'Hadir', 'Sakit', and 'Izin' using smooth hover/tap transitions (shadow-lg, -translate-y-1)."
- **Prompt Step 2 (Supabase Auth & Storage Setup):** "Integrate Supabase SSR auth in Astro to protect the `/dashboard` routes. Also, setup Supabase Storage client to handle image uploads for the 'attendance_proofs' bucket."
- **Prompt Step 3 (Izin/Sakit Flow & Form):** "Create a React component (`client:load`) for the 'Sakit' and 'Izin' flows. It should be a form asking for a text 'Reason' and a file upload input for 'Proof'. When submitted, upload the image to Supabase Storage, get the public URL, and insert a record into the 'attendances' table with status 'izin'/'sakit', `approval_status` = 'pending', and the `proof_url`."
- **Prompt Step 4 (Admin Dashboard - QR & Approval Panel):** "Create an Admin Dashboard with two sections. Section 1: A button to generate a new active session and display a QR code (`qrcode.react`) with the token URL. Section 2: A 'Pending Approvals' table fetching records from 'attendances' where `approval_status` is 'pending'. Include buttons to 'Approve' or 'Reject' which updates the `approval_status` in Supabase."
- **Prompt Step 5 (Member QR Scanner):** "Create the 'Hadir' flow. When the user clicks the 'Hadir' card, open a React component with `html5-qrcode` scanner. Once it successfully scans a valid session URL, POST to an Astro API route `/api/attend` to insert a record into 'attendances' with status 'hadir' and `approval_status` 'approved'."
