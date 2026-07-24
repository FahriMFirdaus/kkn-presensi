import { createClient } from '@supabase/supabase-js';

export function getSupabaseServer(cookies: any) {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  // Attach tokens to the client instance using non-conflicting property names
  (client as any).kknAccessToken = accessToken;
  (client as any).kknRefreshToken = refreshToken;

  return client;
}

export async function getUserProfile(client: ReturnType<typeof getSupabaseServer>) {
  const accessToken = (client as any).kknAccessToken;
  const refreshToken = (client as any).kknRefreshToken;

  if (accessToken && refreshToken) {
    // Await setSession to ensure the auth state is established before any queries are run
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return null;

  const { data: profile, error: dbError } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (dbError || !profile) {
    // Fallback profile if database triggers haven't finished or are not configured
    return {
      id: user.id,
      full_name: user.user_metadata?.full_name || 'Member',
      nim: user.user_metadata?.nim || '',
      prodi: user.user_metadata?.prodi || '',
      division: user.user_metadata?.division || '',
      role: user.user_metadata?.role || 'member',
    };
  }

  return profile;
}
