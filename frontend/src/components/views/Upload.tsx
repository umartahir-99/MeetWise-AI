import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, FileAudio, Record, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
import {
  ACCEPT_ATTR,
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  describeUpload,
  formatBytes,
  formatClock,
  readAudioDuration,
  titleFromFileName,
  validateFile,
} from "@/domain/processing";
import type { UploadDescription } from "@/domain/processing";

interface UploadProps {
  /**
   * Hands over what the screen knows and the file itself. The caller creates
   * the row, moves the file and starts the pipeline - this screen only ever
   * describes a recording, it never processes one.
   */
  onSubmit: (description: UploadDescription, file: File) => void;
  onCancel: () => void;
  /**
   * The other way in: record from this browser instead of bringing a file.
   * It ends in the same `onSubmit` hand-over, so the pipeline is shared.
   */
  onStartLiveCapture: () => void;
}

export const Upload: React.FC<UploadProps> = ({ onSubmit, onCancel, onStartLiveCapture }) => {
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | undefined>();
  const [readingMeta, setReadingMeta] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire per child element; count them so leaving a child does not
  // clear the highlight while the pointer is still over the zone.
  const dragDepth = useRef(0);

  const accept = async (candidate: File) => {
    const problem = validateFile(candidate);
    if (problem) {
      setError(problem);
      setFile(null);
      setDurationSec(undefined);
      return;
    }

    setError(null);
    setFile(candidate);
    setTitle((prev) => prev || titleFromFileName(candidate.name));

    setReadingMeta(true);
    const seconds = await readAudioDuration(candidate);
    setDurationSec(seconds);
    setReadingMeta(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void accept(dropped);
  };

  const clearFile = () => {
    setFile(null);
    setDurationSec(undefined);
    setError(null);
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    onSubmit(describeUpload({ file, title, durationSec }), file);
  };

  return (
    <div className="pt-6 pb-20 px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 animate-fade-in">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-[12px] font-medium tracking-[0.2em] text-warm-cream hover:underline cursor-pointer self-start uppercase active:scale-[0.98]"
        type="button"
      >
        <ArrowLeft size={14} />
        BACK TO MEMORIES
      </button>

      <header className="flex flex-col gap-6">
        <span className="text-[10px] font-medium tracking-[0.25em] text-ember-accent">
          NEW MEMORY / UPLOAD
        </span>
        <h1 className="text-display-custom text-warm-cream leading-[0.9] tracking-normal">
          BRING A<br />
          RECORDING
        </h1>
        <p className="text-[18px] md:text-body-custom text-warm-cream/85 max-w-[54ch] font-normal leading-[1.35]">
          Record the meeting however you already do, then hand the file over. It gets transcribed,
          separated by speaker, and read for decisions and owners.
        </p>
      </header>

      <div className="divider-dashed" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* Dropzone / selected file ---------------------------------------- */}
        {!file ? (
          <div
            className="dropzone"
            data-dragging={dragging ? "true" : undefined}
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) setDragging(false);
            }}
            onDrop={handleDrop}
          >
            <UploadSimple size={32} weight="light" className="text-driftwood" aria-hidden="true" />

            <p className="text-subheading-custom text-warm-cream">DROP A RECORDING HERE</p>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="dropzone__browse"
            >
              OR CHOOSE A FILE
            </button>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void accept(picked);
              }}
            />

            <p className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase text-center">
              {ACCEPTED_EXTENSIONS.slice(0, 5).map((x) => x.toUpperCase()).join(" · ")} — UP TO{" "}
              {formatBytes(MAX_UPLOAD_BYTES)}
            </p>
          </div>
        ) : (
          <div className="upload-file">
            <FileAudio size={26} weight="light" className="text-ember-accent shrink-0" />

            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <span className="text-[15px] text-warm-cream truncate font-normal">{file.name}</span>
              <span className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase">
                {formatBytes(file.size)}
                {readingMeta && " · READING DURATION…"}
                {!readingMeta && durationSec !== undefined && ` · ${formatClock(durationSec)}`}
                {!readingMeta && durationSec === undefined && " · DURATION UNAVAILABLE"}
              </span>
            </div>

            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove selected file"
              className="text-driftwood hover:text-warm-cream transition-colors cursor-pointer shrink-0 active:scale-90"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {error && (
          <p className="upload-error" role="alert">
            <WarningCircle size={16} weight="fill" className="shrink-0" />
            {error}
          </p>
        )}

        {/* Title ------------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <label
            htmlFor="upload-title"
            className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase"
          >
            TITLE
          </label>
          <input
            id="upload-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Taken from the file name"
            className="upload-input"
          />
        </div>

        {/* Submit ----------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-5">
          <motion.button
            type="submit"
            disabled={!file}
            className="hero__cta !mt-0 disabled:opacity-35 disabled:cursor-not-allowed"
            whileHover={file ? { scale: 1.04 } : undefined}
            whileTap={file ? { scale: 0.97 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            START PROCESSING
          </motion.button>

          <span className="text-[10px] font-medium tracking-[0.2em] text-driftwood uppercase max-w-[34ch] leading-[1.6]">
            Your recording is sent for transcription and analysis. You will see each stage as it
            runs.
          </span>
        </div>
      </form>

      <div className="divider-dashed" />

      {/* Live capture: the other way in ------------------------------------ */}
      <section className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-medium tracking-[0.25em] text-driftwood uppercase">
            NO RECORDING YET?
          </span>
          <p className="text-[15px] text-warm-cream/70 font-normal max-w-[48ch] leading-[1.5]">
            Capture the meeting from this browser — your microphone, plus the tab or screen the
            call is in. When you stop, it goes through the same pipeline as an upload.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartLiveCapture}
          className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-driftwood hover:text-ember-accent uppercase cursor-pointer transition-colors active:scale-95 shrink-0"
        >
          <Record size={14} />
          START LIVE CAPTURE
        </button>
      </section>

    </div>
  );
};
