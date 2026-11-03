import { createClient } from "npm:@supabase/supabase-js@2.52.0";

const APP_URL = "https://aaronmark2222.github.io/tsp-band-app-live/";
const APP_ORIGIN = "https://aaronmark2222.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function respond(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== APP_ORIGIN) return respond({ error: "Origin not allowed." }, 403);
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Please sign in again.");
    const accessToken = authorization.slice("Bearer ".length);
    const projectUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !anonKey || !serviceKey) throw new HttpError(500, "Member access is not configured.");
    const authClient = createClient(projectUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: callerData, error: callerError } = await authClient.auth.getUser(accessToken);
    if (callerError || !callerData.user) throw new HttpError(401, "Please sign in again.");
    const adminClient = createClient(projectUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: adminMember, error: adminLookupError } = await adminClient.from("members")
      .select("id,is_admin").eq("user_id", callerData.user.id).maybeSingle();
    if (adminLookupError) throw new HttpError(500, "Could not verify administrator access.");
    if (!adminMember?.is_admin) throw new HttpError(403, "Administrator access is required.");
    const body = await request.json().catch(() => ({}));
    if (body.action === "list_members") {
      const [{ data: members, error: membersError }, { data: emails, error: emailsError }] = await Promise.all([
        adminClient.from("members").select("id,name,user_id,must_change_password,sort_order").order("sort_order"),
        adminClient.from("member_emails").select("member_id,email"),
      ]);
      if (membersError || emailsError) throw new HttpError(500, "Could not load member accounts.");
      const emailByMember = new Map((emails ?? []).map((row) => [row.member_id, row.email]));
      return respond({ members: (members ?? []).map((member) => ({
        id: member.id, name: member.name, user_id: member.user_id,
        linked: Boolean(member.user_id), email: emailByMember.get(member.id) ?? null,
        must_change_password: member.must_change_password, sort_order: member.sort_order,
      })) }, 200);
    }
    const memberId = typeof body.member_id === "string" ? body.member_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) throw new HttpError(400, "Choose a valid band member.");
    const { data: target, error: targetError } = await adminClient.from("members")
      .select("id,name,user_id,must_change_password").eq("id", memberId).maybeSingle();
    if (targetError) throw new HttpError(500, "Could not load that member.");
    if (body.action === "create_member_login") {
      if (!target) throw new HttpError(404, "That member could not be found.");
      if (target.user_id) throw new HttpError(409, "That member already has a sign-in account.");
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid sign-in email.");
      const { data: existingEmail, error: emailLookupError } = await adminClient.from("member_emails")
        .select("member_id").eq("email", email).maybeSingle();
      if (emailLookupError) throw new HttpError(500, "Could not verify that email.");
      if (existingEmail && existingEmail.member_id !== target.id) throw new HttpError(409, "That email is already assigned to another band member.");
      const { data: priorMapping, error: priorError } = await adminClient.from("member_emails")
        .select("email").eq("member_id", target.id).maybeSingle();
      if (priorError) throw new HttpError(500, "Could not load that member's email mapping.");
      const { error: mappingError } = await adminClient.from("member_emails")
        .upsert({ member_id: target.id, email }, { onConflict: "member_id" });
      if (mappingError) throw new HttpError(400, "Could not save that sign-in email.");
      const temporaryPassword = `${crypto.randomUUID()}Aa1!`;
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email, password: temporaryPassword, email_confirm: true, user_metadata: { member_name: target.name },
      });
      if (createError || !created.user) {
        if (priorMapping) await adminClient.from("member_emails").update({ email: priorMapping.email }).eq("member_id", target.id);
        else await adminClient.from("member_emails").delete().eq("member_id", target.id);
        throw new HttpError(400, createError?.message ?? "Could not create the sign-in account.");
      }
      const { data: linked, error: linkError } = await adminClient.from("members")
        .update({ user_id: created.user.id, must_change_password: true }).eq("id", target.id)
        .is("user_id", null).select("id").maybeSingle();
      if (linkError || !linked) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        if (priorMapping) await adminClient.from("member_emails").update({ email: priorMapping.email }).eq("member_id", target.id);
        else await adminClient.from("member_emails").delete().eq("member_id", target.id);
        throw new HttpError(500, "The account was created but could not be linked. Please retry.");
      }
      return respond({ temporary_password: temporaryPassword }, 200);
    }
    if (!target?.user_id) throw new HttpError(404, "That member has no sign-in account linked.");
    if (body.action === "send_reset") {
      const { data: accountData, error: accountError } = await adminClient.auth.admin.getUserById(target.user_id);
      if (accountError || !accountData.user?.email) throw new HttpError(404, "That member has no email sign-in configured.");
      const mailClient = createClient(projectUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await mailClient.auth.resetPasswordForEmail(accountData.user.email, { redirectTo: APP_URL });
      if (error) throw new HttpError(400, error.message);
      return respond({ message: "Password reset email sent." }, 200);
    }
    if (body.action === "temporary_password") {
      const temporaryPassword = `${crypto.randomUUID()}Aa1!`;
      const originalFlag = target.must_change_password;
      const { data: changedMember, error: flagError } = await adminClient.from("members").update({ must_change_password: true })
        .eq("id", target.id).select("id").maybeSingle();
      if (flagError || !changedMember) throw new HttpError(500, "Could not enable the required password change.");
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(target.user_id, { password: temporaryPassword });
      if (passwordError) {
        await adminClient.from("members").update({ must_change_password: originalFlag }).eq("id", target.id);
        throw new HttpError(400, passwordError.message);
      }
      return respond({ temporary_password: temporaryPassword }, 200);
    }
    throw new HttpError(400, "Unknown member access action.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Member access could not be updated.";
    return respond({ error: message }, status);
  }
});
