import { supabase } from "../lib/supabase";
import type { User, VoiceDirectory } from "../mockData";
import { toPeople, toVoiceDirectory } from "./mappers";
import type { PersonRow, VoiceRow } from "./rows";

/**
 * The two tables that turn anonymous voices into people.
 *
 * `people` is everyone the archive knows. `voices` maps a voice print to one of
 * them, and a row with a null `person_id` is a voice nobody has named yet.
 *
 * The indirection is the product feature, not an implementation detail: a name
 * lives against the voice, never inside a recording, which is why naming
 * somebody once renames them in every meeting they have ever spoken in without
 * a single meeting row being touched.
 */

export async function loadPeople(): Promise<Record<string, User>> {
  const { data, error } = await supabase.from("people").select("*").returns<PersonRow[]>();

  if (error) throw error;
  return toPeople(data ?? []);
}

export async function loadVoiceDirectory(): Promise<VoiceDirectory> {
  const { data, error } = await supabase.from("voices").select("*").returns<VoiceRow[]>();

  if (error) throw error;
  return toVoiceDirectory(data ?? []);
}

/**
 * Find the person with this name, or make them.
 *
 * Uniqueness is guarded by an index on `(owner_id, lower(name))` — an
 * expression, which a table constraint cannot express and which `upsert`'s
 * `onConflict` therefore cannot target. So the merge is done in two steps, and
 * the insert is allowed to lose: if another tab created the same person between
 * the lookup and the insert, the index rejects this one and the second lookup
 * returns theirs. Either way there is exactly one "Sarah Chen".
 */
async function personNamed(ownerId: string, name: string): Promise<PersonRow> {
  const find = () =>
    supabase.from("people").select("*").eq("owner_id", ownerId).ilike("name", name)
      .maybeSingle<PersonRow>();

  const { data: existing, error: findError } = await find();
  if (findError) throw findError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("people")
    .insert({ owner_id: ownerId, name })
    .select()
    .single<PersonRow>();

  if (created) return created;

  const { data: raced } = await find();
  if (raced) return raced;
  throw insertError;
}

/**
 * Put a name to a voice.
 *
 * Typing a name that already exists merges this voice into that person rather
 * than making a second one. The name is written against the voice, never into
 * a recording, which is what makes it retroactive: every meeting that voice has
 * spoken in re-resolves on the next render, with no meeting row touched.
 */
export async function nameVoice(
  ownerId: string,
  voicePrint: string,
  name: string
): Promise<{ personId: string; people: Record<string, User> }> {
  const resolved = await personNamed(ownerId, name);

  const { error: voiceError } = await supabase
    .from("voices")
    .upsert(
      { owner_id: ownerId, voice_print: voicePrint, person_id: resolved.id },
      { onConflict: "owner_id,voice_print" }
    );

  if (voiceError) throw voiceError;

  return { personId: resolved.id, people: await loadPeople() };
}

/**
 * Unlink a voice from its person. It goes back to being "SPEAKER n".
 *
 * The person is left alone: they may still own other voices, and forgetting who
 * one recording's speaker was is not a reason to erase somebody from the
 * archive.
 */
export async function forgetVoice(ownerId: string, voicePrint: string): Promise<void> {
  const { error } = await supabase
    .from("voices")
    .update({ person_id: null })
    .eq("owner_id", ownerId)
    .eq("voice_print", voicePrint);

  if (error) throw error;
}
