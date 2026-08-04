import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is an authenticated admin
    const authHeader = req.headers.get('authorization') ?? '';
    const callerToken = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Validate caller session
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(callerToken);
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès réservé aux administrateurs' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { username, password, role } = await req.json();
    if (!username || !password || !role) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Le mot de passe doit contenir au moins 8 caractères' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const email = `${username.trim().toLowerCase()}@miaoda.com`;

    // Create auth user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: username.trim(), role },
    });
    if (error) throw new Error(error.message);

    // Upsert profile
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: data.user.id,
      username: username.trim(),
      email,
      role,
      is_active: true,
    }, { onConflict: 'id' });
    if (profileErr) throw new Error(profileErr.message);

    return new Response(
      JSON.stringify({ success: true, userId: data.user.id, username: username.trim(), role }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
