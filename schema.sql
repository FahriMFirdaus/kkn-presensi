-- SCHEMA FOR KKN PRESENSI

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    nim TEXT UNIQUE,
    prodi TEXT,
    division TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-access to profiles" 
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Allow users to update their own profile" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Allow users to insert their own profile" 
ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    token TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-access to sessions"
ON public.sessions FOR SELECT USING (true);

CREATE POLICY "Allow admins to insert/update/delete sessions"
ON public.sessions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
);

-- 3. Attendances Table
CREATE TABLE IF NOT EXISTS public.attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('hadir', 'izin', 'sakit', 'alpa')),
    reason TEXT,
    proof_url TEXT,
    approval_status TEXT NOT NULL CHECK (approval_status IN ('approved', 'pending', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_session UNIQUE (user_id, session_id)
);

-- Enable RLS for Attendances
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to view their own attendance"
ON public.attendances FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own attendance"
ON public.attendances FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow admins to view all attendances"
ON public.attendances FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
);

CREATE POLICY "Allow admins to update attendances"
ON public.attendances FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
);

-- 4. Storage Bucket Setup
-- Note: Create a bucket named 'attendance_proofs' in the Supabase Dashboard Storage section.
-- Enable public access or use these policies:
-- CREATE POLICY "Give public read access to attendance proofs" ON storage.objects FOR SELECT USING (bucket_id = 'attendance_proofs');
-- CREATE POLICY "Give users access to upload proof" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attendance_proofs' AND auth.role() = 'authenticated');
