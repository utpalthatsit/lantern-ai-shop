// Shared authorization helpers for ShopSathi edge functions.
// Browser calls carry a user JWT; internal calls (cron / webhook)
// carry the service-role key, which we treat as trusted.
import { createClient } from "jsr:@supabase/supabase-js@2";

export const SERVICE_ROLE_MARKER = "__service_role__";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Returns the user id for a valid JWT, "__service_role__" for the
// service-role key, or null when unauthenticated.
export async function authedUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return SERVICE_ROLE_MARKER;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null; // anon is public — never trust it for shop data
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Owner or member of the shop? Service role is always allowed.
export async function canAccessShop(shopId: string, userId: string): Promise<boolean> {
  if (userId === SERVICE_ROLE_MARKER) return true;
  const supabase = adminClient();
  const { data: shop } = await supabase.from("shops").select("owner_id").eq("id", shopId).maybeSingle();
  if (shop?.owner_id === userId) return true;
  const { data: member } = await supabase
    .from("shop_members").select("id").eq("shop_id", shopId).eq("user_id", userId).maybeSingle();
  return !!member;
}

export function isUuid(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
