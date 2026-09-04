import React, { useState } from "react";
import { Check, PencilSimple, UserCircle, UserFocus } from "@phosphor-icons/react";
import type { Meeting } from "../mockData";
import type { SpeakerResolver } from "../speakers";
import { countLines, sampleLine } from "../speakers";

interface SpeakerPanelProps {
  meeting: Meeting;
  /** The whole archive, so a voice can say how widely it has been heard. */
  meetings: Meeting[];
  speakers: SpeakerResolver;
  onNameVoice: (voicePrint: string, name: string) => void;
}

/**
 * Putting names to the voices in one recording.
 *
 * Diarization hands back "Speaker 1" and stops there, so this is the step that
 * makes a transcript readable. A name entered here is written to the voice
 * directory rather than to this meeting, so it lands on every other recording
 * the same voice appears in - which is why the copy promises exactly that.
 */
export const SpeakerPanel: React.FC<SpeakerPanelProps> = ({
  meeting,
  meetings,
  speakers,
  onNameVoice,
}) => {
  // One draft per voice, so two unnamed speakers can be typed into freely.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // A named voice only shows its field once the user asks to rename it.
  const [renaming, setRenaming] = useState<string | null>(null);

  const unnamedCount = speakers.unnamed(meeting).length;

  const setDraft = (voicePrint: string, value: string) =>
    setDrafts((prev) => ({ ...prev, [voicePrint]: value }));

  const submit = (voicePrint: string) => {
    const name = (drafts[voicePrint] ?? "").trim();
    if (!name) return;
    onNameVoice(voicePrint, name);
    setDraft(voicePrint, "");
    setRenaming(null);
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cork-border pb-3">
        <div className="flex items-center gap-2">
          <UserFocus size={18} className="text-driftwood" />
          <h2 className="text-subheading-custom text-warm-cream tracking-[0.15em]">
            VOICES IN THIS RECORDING
          </h2>
        </div>
        <span
          className={`text-[10px] font-medium tracking-[0.2em] uppercase ${
            unnamedCount > 0 ? "text-ember-accent" : "text-driftwood"
          }`}
        >
          {unnamedCount > 0
            ? `${unnamedCount} STILL UNNAMED — NAME ONCE, APPLIES EVERYWHERE`
            : "ALL VOICES IDENTIFIED"}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {meeting.speakers.map((slot) => {
          const named = speakers.isNamed(meeting, slot.id);
          const name = speakers.nameOf(meeting, slot.id);
          const heardIn = speakers.heardIn(slot.voicePrint, meetings);
          const showForm = !named || renaming === slot.voicePrint;

          return (
            <div key={slot.id} className={`voice-card ${named ? "" : "voice-card--unnamed"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`text-[13px] font-medium tracking-[0.15em] uppercase ${
                    named ? "text-warm-cream" : "text-ember-accent"
                  }`}
                >
                  {name}
                </span>
                <span className="text-[10px] font-medium tracking-[0.15em] text-driftwood uppercase">
                  {countLines(meeting, slot.id)} LINES
                  {heardIn > 1 && ` · HEARD IN ${heardIn} MEETINGS`}
                </span>
              </div>

              {!named && (
                <p className="text-[13px] text-warm-cream/60 italic leading-relaxed max-w-[62ch]">
                  "{sampleLine(meeting, slot.id)}"
                </p>
              )}

              {showForm ? (
                <form
                  className="voice-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(slot.voicePrint);
                  }}
                >
                  <label className="sr-only" htmlFor={`voice-${slot.id}`}>
                    Name the voice diarization labelled {slot.label}
                  </label>
                  <input
                    id={`voice-${slot.id}`}
                    type="text"
                    list="known-people"
                    className="voice-input"
                    placeholder="Who is this?"
                    value={drafts[slot.voicePrint] ?? ""}
                    onChange={(e) => setDraft(slot.voicePrint, e.target.value)}
                  />
                  <button
                    type="submit"
                    className="voice-save"
                    disabled={!(drafts[slot.voicePrint] ?? "").trim()}
                  >
                    <Check size={13} weight="bold" />
                    SAVE
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="voice-ghost"
                  onClick={() => {
                    setRenaming(slot.voicePrint);
                    setDraft(slot.voicePrint, name);
                  }}
                >
                  <PencilSimple size={12} />
                  RENAME THIS VOICE
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Suggestions, so a voice can be merged into someone already known. */}
      <datalist id="known-people">
        {speakers.people.map((person) => (
          <option key={person.id} value={person.name} />
        ))}
      </datalist>

      <p className="flex items-start gap-2 text-[10px] font-medium tracking-[0.15em] text-driftwood uppercase leading-[1.7] max-w-[70ch]">
        <UserCircle size={13} className="mt-[1px] shrink-0" />
        Names are stored against the voice, not this recording — naming one here
        renames it in every meeting that voice appears in.
      </p>
    </section>
  );
};
