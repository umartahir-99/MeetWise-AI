import { supabase } from "../lib/supabase";
import type { User } from "../mockData";
import type { AppSettings } from "../settings";
import { DEFAULT_SETTINGS } from "../settings";
import { fromSettings, toSettings, toUser } from "./mappers";
import type { ProfileRow, UserSettingsRow } from "./rows";

/**
 * Reading and writing the two rows that describe the signed-in person.
 *
 * Both are created by the `handle_new_user` trigger the moment an account
 * exists, so neither read below has to cope with the row being absent in the
 * ordinary case — only with the account having been made before the trigger
 * did, which is why the fallbacks are still here.
 */

export async function loadSettings(userId: string): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<UserSettingsRow>();

  if (error) throw error;
  return data ? toSettings(data) : DEFAULT_SETTINGS;
}

export async function saveSettings(
  userId: string,
  patch: Partial<AppSettings>
): Promise<void> {
  const row = fromSettings(patch);
  if (!Object.keys(row).length) return;

  const { error } = await supabase
    .from("user_settings")
    .update(row)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function loadProfile(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  return data ? toUser(data) : { id: userId, name: "You" };
}

/**
 * Your own display name.
 *
 * It is also the name your voice resolves to, so this is not only a label on
 * an account screen — renaming here renames you across every meeting you spoke
 * in, the same way naming any other voice does.
 */
export async function renameAccount(userId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userId);

  if (error) throw error;
}
