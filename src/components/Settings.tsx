import React, { useMemo, useState } from "react";
import {
  Check,
  DownloadSimple,
  Sparkle,
  Translate,
  Trash,
  UserCircle,
  UserFocus,
  Waveform,
  X,
} from "@phosphor-icons/react";
import type { Meeting, User } from "../mockData";
import type { VoiceEntry } from "../speakers";
import type { AppSettings } from "../settings";
import {
  ANALYSIS_MODELS,
  LANGUAGES,
  RETENTION_OPTIONS,
  TRANSCRIPTION_MODELS,
  expiredMeetings,
  modelNote,
} from "../settings";

interface SettingsProps {
  meetings: Meeting[];
  settings: AppSettings;
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  /** The signed-in person, such as sign-in is in a prototype. */
  account: User;
  onRenameAccount: (name: string) => void;
  /** Every voice the archive has heard, named or not. */
  voices: VoiceEntry[];
  onNameVoice: (voicePrint: string, name: string) => void;
  onForgetVoice: (voicePrint: string) => void;
  onPurgeExpired: () => void;
  onExport: (format: "json" | "markdown") => void;
  onClearArchive: () => void;
}

/** Section heading, since there are now six of them. */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; aside?: string }> = ({
  icon,
  title,
  aside,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cork-border pb-2">
    <div className="flex items-center gap-2">
      <span className="text-driftwood">{icon}</span>
      <h2 className="text-[14px] font-medium tracking-[0.15em] text-warm-cream uppercase">{title}</h2>
    </div>
    {aside && (
      <span className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
        {aside}
      </span>
    )}
  </div>
);

export const Settings: React.FC<SettingsProps> = ({
  meetings,
  settings,
  onChangeSettings,
  account,
  onRenameAccount,
  voices,
  onNameVoice,
  onForgetVoice,
  onPurgeExpired,
  onExport,
  onClearArchive,
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [accountName, setAccountName] = useState(account.name);

  // Both scan a list that does not change while a name is being typed, so they
  // stay off the path of every keystroke in the fields below.
  const unnamed = useMemo(() => voices.filter((v) => v.name === null).length, [voices]);
  const expired = useMemo(
    () => expiredMeetings(meetings, settings.retentionDays),
    [meetings, settings.retentionDays]
  );

  const submitVoice = (voicePrint: string) => {
    const name = (drafts[voicePrint] ?? "").trim();
    if (!name) return;
    onNameVoice(voicePrint, name);
    setDrafts((prev) => ({ ...prev, [voicePrint]: "" }));
  };

  return (
    <div className="px-6 md:px-12 max-w-[800px] mx-auto flex flex-col gap-12 w-full">
      <header className="flex flex-col gap-4">
        <span className="text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase">
          WORKSPACE CONFIGURATION
        </span>
        <h2 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal select-none">
          SETTINGS
        </h2>
      </header>

      <div className="divider-dashed" />

      <div className="flex flex-col gap-12">
        {/* 01 — Account ------------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionHeader icon={<UserCircle size={16} />} title="ACCOUNT" />

          <form
            className="setting-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (accountName.trim()) onRenameAccount(accountName);
            }}
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="account-name"
                className="text-[12px] font-medium text-warm-cream uppercase"
              >
                DISPLAY NAME
              </label>
              <span className="text-[11px] text-driftwood uppercase tracking-[0.1em]">
                Shown on recordings you own and anywhere your voice is recognised
              </span>
            </div>
            <div className="voice-form">
              <input
                id="account-name"
                type="text"
                className="voice-input"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
              <button
                type="submit"
                className="voice-save"
                disabled={!accountName.trim() || accountName.trim() === account.name}
              >
                <Check size={13} weight="bold" />
                SAVE
              </button>
            </div>
          </form>

          <div className="setting-row">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-warm-cream uppercase">
                MEETINGS IN THIS WORKSPACE
              </span>
              <span className="text-[11px] text-driftwood uppercase tracking-[0.1em]">
                {meetings.length} recorded · {voices.length} distinct voices heard
              </span>
            </div>
            <button onClick={onClearArchive} className="voice-ghost shrink-0">
              <Trash size={12} />
              DELETE ALL
            </button>
          </div>
        </section>

        {/* 02 — Models -------------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionHeader
            icon={<Sparkle size={16} />}
            title="TRANSCRIPTION & ANALYSIS"
            aside="APPLIES TO THE NEXT UPLOAD"
          />

          <div className="setting-row setting-row--stack">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label
                htmlFor="stt-model"
                className="text-[12px] font-medium text-warm-cream uppercase"
              >
                SPEECH-TO-TEXT MODEL
              </label>
              <span className="text-[11px] text-driftwood leading-relaxed">
                {modelNote(TRANSCRIPTION_MODELS, settings.transcriptionModel)}
              </span>
            </div>
            <select
              id="stt-model"
              className="setting-select"
              value={settings.transcriptionModel}
              onChange={(e) => onChangeSettings({ transcriptionModel: e.target.value })}
            >
              {TRANSCRIPTION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-row setting-row--stack">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label
                htmlFor="llm-model"
                className="text-[12px] font-medium text-warm-cream uppercase"
              >
                ANALYSIS MODEL
              </label>
              <span className="text-[11px] text-driftwood leading-relaxed">
                {modelNote(ANALYSIS_MODELS, settings.analysisModel)}
              </span>
            </div>
            <select
              id="llm-model"
              className="setting-select"
              value={settings.analysisModel}
              onChange={(e) => onChangeSettings({ analysisModel: e.target.value })}
            >
              {ANALYSIS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* 03 — Language ------------------------------------------------ */}
        <section className="flex flex-col gap-4">
          <SectionHeader icon={<Translate size={16} />} title="SPOKEN LANGUAGE" />

          <div className="setting-row setting-row--stack">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label
                htmlFor="language"
                className="text-[12px] font-medium text-warm-cream uppercase"
              >
                LANGUAGE OF YOUR MEETINGS
              </label>
              <span className="text-[11px] text-driftwood leading-relaxed">
                Naming the language beats detection on short or noisy recordings.
              </span>
            </div>
            <select
              id="language"
              className="setting-select"
              value={settings.language}
              onChange={(e) => onChangeSettings({ language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* 04 — Speaker names ------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionHeader
            icon={<UserFocus size={16} />}
            title="SPEAKER NAMES"
            aside={unnamed > 0 ? `${unnamed} UNNAMED` : "ALL IDENTIFIED"}
          />

          <p className="text-[11px] text-driftwood uppercase leading-relaxed tracking-[0.1em]">
            Diarization separates voices but cannot name them. A name set here applies to every
            meeting that voice appears in, past and future.
          </p>

          <div className="flex flex-col divide-y divide-cork-border/50">
            {voices.map((voice) => (
              <div key={voice.voicePrint} className="voice-row">
                <div className="flex flex-col gap-1 min-w-0">
                  <span
                    className={`text-[12px] font-medium tracking-[0.15em] uppercase ${
                      voice.name ? "text-warm-cream" : "text-ember-accent"
                    }`}
                  >
                    {voice.name ?? voice.label}
                  </span>
                  <span className="text-[10px] font-medium tracking-[0.15em] text-driftwood uppercase">
                    {voice.meetingCount} {voice.meetingCount === 1 ? "MEETING" : "MEETINGS"} ·{" "}
                    {voice.lineCount} LINES
                  </span>
                </div>

                {voice.name ? (
                  <button
                    type="button"
                    onClick={() => onForgetVoice(voice.voicePrint)}
                    className="voice-ghost shrink-0"
                  >
                    <X size={12} />
                    FORGET
                  </button>
                ) : (
                  <form
                    className="voice-form shrink-0"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitVoice(voice.voicePrint);
                    }}
                  >
                    <label className="sr-only" htmlFor={`dir-${voice.voicePrint}`}>
                      Name for {voice.label}
                    </label>
                    <input
                      id={`dir-${voice.voicePrint}`}
                      type="text"
                      className="voice-input"
                      placeholder="Who is this?"
                      value={drafts[voice.voicePrint] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [voice.voicePrint]: e.target.value }))
                      }
                    />
                    <button
                      type="submit"
                      className="voice-save"
                      disabled={!(drafts[voice.voicePrint] ?? "").trim()}
                    >
                      <Check size={13} weight="bold" />
                      SAVE
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 05 — Retention ----------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionHeader icon={<Waveform size={16} />} title="RETENTION" />

          <div className="setting-row setting-row--stack">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label
                htmlFor="retention"
                className="text-[12px] font-medium text-warm-cream uppercase"
              >
                KEEP MEETINGS FOR
              </label>
              <span className="text-[11px] text-driftwood leading-relaxed">
                {expired.length > 0
                  ? `${expired.length} ${expired.length === 1 ? "meeting is" : "meetings are"} older than this window.`
                  : "Nothing in the archive is past this window."}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <select
                id="retention"
                className="setting-select"
                value={settings.retentionDays}
                onChange={(e) => onChangeSettings({ retentionDays: Number(e.target.value) })}
              >
                {RETENTION_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
              {expired.length > 0 && (
                <button onClick={onPurgeExpired} className="voice-ghost shrink-0">
                  <Trash size={12} />
                  DELETE {expired.length}
                </button>
              )}
            </div>
          </div>

          <div className="setting-row">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-[12px] font-medium text-warm-cream uppercase">
                DISCARD AUDIO AFTER PROCESSING
              </span>
              <span className="text-[11px] text-driftwood leading-relaxed">
                Keeps the transcript and drops the recording. Playback stops working for those
                meetings.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.discardAudioAfterProcessing}
              onClick={() =>
                onChangeSettings({
                  discardAudioAfterProcessing: !settings.discardAudioAfterProcessing,
                })
              }
              className={`setting-switch ${settings.discardAudioAfterProcessing ? "setting-switch--on" : ""}`}
            >
              {settings.discardAudioAfterProcessing ? "ON" : "OFF"}
            </button>
          </div>
        </section>

        {/* 06 — Export -------------------------------------------------- */}
        <section className="flex flex-col gap-4">
          <SectionHeader icon={<DownloadSimple size={16} />} title="EXPORT" />

          <div className="setting-row">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-[12px] font-medium text-warm-cream uppercase">
                DOWNLOAD THE ARCHIVE
              </span>
              <span className="text-[11px] text-driftwood leading-relaxed">
                All {meetings.length} meetings with speaker names resolved — summaries, decisions,
                action items, quotes and full transcripts.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button onClick={() => onExport("markdown")} className="voice-save">
                <DownloadSimple size={13} />
                MARKDOWN
              </button>
              <button onClick={() => onExport("json")} className="voice-save">
                <DownloadSimple size={13} />
                JSON
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="divider-dashed" />

      {/* What this build actually is, stated plainly rather than dressed up. */}
      <footer className="flex flex-col gap-3 items-start opacity-50">
        <span className="text-[9px] tracking-[0.15em] text-warm-cream font-medium uppercase leading-[1.8] max-w-[70ch]">
          * PROTOTYPE BUILD. THERE IS NO BACKEND: PROCESSING IS SIMULATED IN THE BROWSER, THE MODEL
          AND LANGUAGE CHOICES ABOVE ARE RECORDED BUT NOT YET SENT ANYWHERE, AND NOTHING SURVIVES A
          PAGE RELOAD. EXPORT AND SPEAKER NAMING WORK FOR REAL.
        </span>
        <span className="text-[9px] tracking-[0.15em] text-warm-cream font-medium uppercase leading-[1.8] max-w-[70ch]">
          * ONCE WIRED UP, RECORDINGS WILL BE SENT TO A THIRD-PARTY TRANSCRIPTION SERVICE AND AN LLM
          PROVIDER FOR ANALYSIS.
        </span>
      </footer>
    </div>
  );
};
