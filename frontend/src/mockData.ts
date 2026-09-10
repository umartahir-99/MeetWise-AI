export interface TranscriptLine {
  /** Which voice in `Meeting.speakers` said this, not what they are called. */
  speakerId: string;
  text: string;
  /** Offset from the meeting's `startedAt`, in milliseconds. */
  startMs: number;
  /** Offset from `startedAt` where this line stops, in milliseconds. */
  endMs: number;
}

export interface Topic {
  title: string;
  details: string;
}

export interface ActionItem {
  /**
   * The row's own id, once it has one.
   *
   * Ticking an item off used to mean "the third element of this array", which
   * breaks the moment anything reorders. Optional because the fixtures and the
   * live-capture demo build items that were never rows.
   */
  id?: string;
  item: string;
  /** The voice that picked this up, resolved to a name for display. */
  speakerId: string;
  /** Ticked off. Absent means still open, which is the normal case. */
  done?: boolean;
}

/**
 * One voice in one recording.
 *
 * Diarization can tell voices apart but cannot name them - it returns
 * "Speaker 1", "Speaker 2". The slot is that anonymous handle, and everything
 * in the meeting points at it rather than at a name, so naming the voice once
 * renames it everywhere it appears.
 */
export interface SpeakerSlot {
  /** Per-meeting handle. Transcript lines, quotes and action items cite this. */
  id: string;
  /** What diarization called it, shown until somebody names the voice. */
  label: string;
  /**
   * Stands in for a voice fingerprint. The same person across two recordings
   * carries the same print, which is what lets a name given once in one
   * meeting resolve in every other meeting they appear in.
   */
  voicePrint: string;
}

export interface Quote {
  quote: string;
  /** The voice that said it. */
  speakerId: string;
  /**
   * Where this was said, as an offset from the meeting's `startedAt`.
   *
   * The quotes are editorial pulls rather than verbatim transcript lines, so
   * this points at the moment in the recording they came out of - which is
   * what makes a quote playable instead of just quotable.
   */
  startMs: number;
}

/**
 * Where a meeting sits in the ingest pipeline.
 *
 * The MVP path is record -> upload -> process, so a meeting is *not* readable
 * the moment it is created: it lands as `uploaded` and walks the pipeline
 * until it is `ready`. Only `ready` and `failed` are terminal.
 */
export type MeetingStatus =
  | "uploaded"
  | "queued"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "failed";

export interface Meeting {
  id: string;
  title: string;
  /**
   * When the meeting started, as an ISO 8601 instant (UTC).
   *
   * A real timestamp rather than a display string, so the archive can sort and
   * filter on it; every human-readable form is derived at render time by the
   * helpers in `src/datetime.ts`.
   */
  startedAt: string;
  /** How long the meeting ran, in milliseconds. */
  durationMs: number;
  /** Who owns the recording - a key into `MOCK_USERS`. */
  ownerId: string;
  /**
   * The voices diarization found, in first-appearance order. Names are not
   * stored here: they are resolved through the voice directory, so renaming a
   * voice does not mean rewriting a meeting.
   */
  speakers: SpeakerSlot[];
  /**
   * The recording itself. Absent on the seeded fixtures, which have no audio
   * file behind them; an upload carries a blob URL for the chosen file.
   */
  audioUrl?: string;
  gist: string;
  summary: string;
  topics: Topic[];
  decisions: string[];
  actionItems: ActionItem[];
  quotes: Quote[];
  transcript: TranscriptLine[];
  tags: string[];

  /** Pipeline position. Everything below is only populated once processing starts. */
  status: MeetingStatus;

  /** Epoch ms the current stage began — the processing screen derives progress from this. */
  stageStartedAt?: number;
  /** Epoch ms the upload was accepted, for the "elapsed" readout. */
  uploadedAt?: number;
  /** Stage the job died in, so a retry can say what it is retrying. */
  failedStage?: MeetingStatus;
  /** Operator-facing reason shown on the failed screen. */
  failureReason?: string;
  /**
   * Prototype-only. There is no backend, so the failure path has to be
   * triggerable from the client to be reachable at all. Delete this field
   * along with `useProcessingEngine` once a real job runner exists.
   */
  sim?: { failAt?: MeetingStatus; reason?: string };

  /** Original upload, kept so the processing screen can show what is being worked on. */
  source?: {
    fileName: string;
    /** Bytes. */
    fileSize: number;
    /** Seconds, read from the file's own metadata. Undefined if the browser could not decode it. */
    durationSec?: number;
  };
}

/** A person who can own a recording. `Meeting.ownerId` keys into this. */
export interface User {
  id: string;
  name: string;
}

export const MOCK_USERS: Record<string, User> = {
  "u-sarah-chen": { id: "u-sarah-chen", name: "Sarah Chen" },
  "u-david-kerr": { id: "u-david-kerr", name: "David Kerr" },
  "u-alex-rivera": { id: "u-alex-rivera", name: "Alex Rivera" },
  "u-marcus-vance": { id: "u-marcus-vance", name: "Marcus Vance" },
  "u-jane-dong": { id: "u-jane-dong", name: "Jane Dong" },
  "u-elena-rostova": { id: "u-elena-rostova", name: "Elena Rostova" },
  "u-jonathan-ives": { id: "u-jonathan-ives", name: "Jonathan Ives" },
  "u-hector-bennet": { id: "u-hector-bennet", name: "Hector Bennet" }
};

/**
 * voicePrint -> personId: the map that survives any single meeting.
 *
 * Naming a voice writes here, not into the recording, which is why a name
 * given once in one meeting shows up in every other meeting that voice
 * appears in. The seeded meetings ship already named; the sample upload
 * deliberately contains two voices this directory has never heard.
 */
export type VoiceDirectory = Record<string, string>;

export const INITIAL_VOICE_DIRECTORY: VoiceDirectory = {
  "vp-sarah-chen": "u-sarah-chen",
  "vp-david-kerr": "u-david-kerr",
  "vp-alex-rivera": "u-alex-rivera",
  "vp-marcus-vance": "u-marcus-vance",
  "vp-jane-dong": "u-jane-dong",
  "vp-elena-rostova": "u-elena-rostova",
  "vp-jonathan-ives": "u-jonathan-ives",
  "vp-hector-bennet": "u-hector-bennet"
};

/** Whoever is driving the prototype. Stamped onto anything they upload or record. */
export const CURRENT_USER_ID = "u-sarah-chen";

/** Owner display name, falling back to the raw id if it is not a known user. */
export function ownerName(ownerId: string): string {
  return MOCK_USERS[ownerId]?.name ?? ownerId;
}

/** Rough speaking pace, used to estimate how long a line took to say. */
const WORDS_PER_MINUTE = 150;

/**
 * Fills in `endMs` for lines that only carry a start.
 *
 * Real speech-to-text returns both bounds per line. The fixtures - and the
 * live capture, which only knows when a line *arrived* - carry a start only,
 * so the end is estimated from word count and clipped to the next line's start
 * so segments never overlap.
 */
export function timed(lines: Omit<TranscriptLine, "endMs">[]): TranscriptLine[] {
  return lines.map((line, i) => {
    const words = line.text.trim().split(/\s+/).length;
    const spokenMs = Math.round((words / WORDS_PER_MINUTE) * 60_000);
    const nextStart = lines[i + 1]?.startMs ?? Number.POSITIVE_INFINITY;
    return { ...line, endMs: Math.min(line.startMs + spokenMs, nextStart) };
  });
}

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: "oryzo-integration",
    title: "Oryzo kick-off: design stack & manufacturing",
    startedAt: "2026-08-22T14:00:00Z",
    durationMs: 45 * 60_000,
    ownerId: "u-sarah-chen",
    speakers: [
      { id: "speaker-1", label: "Speaker 1", voicePrint: "vp-sarah-chen" },
      { id: "speaker-2", label: "Speaker 2", voicePrint: "vp-david-kerr" },
      { id: "speaker-3", label: "Speaker 3", voicePrint: "vp-alex-rivera" }
    ],
    gist: "Aligned on cork border tolerances and mapped out final asset deliveries for the Lusion studio review.",
    summary: "The design team resolved the alignment and tolerances for the Oryzo structure. We decided to preserve the cork-border dividers and use Walnut Shadow for our deepest digital canvas, ensuring a physical-to-digital material continuity that matches our core philosophy of negative space.",
    topics: [
      {
        title: "Cork border specifications",
        details: "Reviewed the physical tolerances of the custom coaster frame. Decided to maintain a 1mm border width to ensure it is warmer than the canvas by one step without feeling bulky."
      },
      {
        title: "Lusion studio asset deliverables",
        details: "Agreed to send the complete package of 3D renders and context photographs by Thursday. Renders will isolate the product against the Walnut Shadow background with upper-right lighting."
      },
      {
        title: "Digital portfolio canvas",
        details: "Established the layout rules. The hero layout will feature a massive display wordmark with tight line-heights, ensuring a stacked block effect."
      }
    ],
    decisions: [
      "Maintain a strict 1.0mm cork border width for the physical prototype.",
      "Utilize Walnut Shadow (#100904) as the absolute canvas for all digital and packaging assets.",
      "Send final assets to Lusion studio by Friday noon."
    ],
    actionItems: [
      {
        item: "Export final 3D meshes and grading instructions",
        speakerId: "speaker-3"
      },
      {
        item: "Draft updated manufacturing partner agreement",
        speakerId: "speaker-1"
      },
      {
        item: "Review render lighting setup with Lusion technical lead",
        speakerId: "speaker-2"
      }
    ],
    quotes: [
      {
        quote: "Our visual vocabulary is restraint. The moment we add a drop shadow or a secondary accent color to the CTA buttons, we weaken the form.",
        speakerId: "speaker-2",
        startMs: 180_000
      },
      {
        quote: "Manufacturing needs a 1.0mm limit, otherwise the cork will tear during high-speed stamping. We cannot push to 0.8mm.",
        speakerId: "speaker-3",
        startMs: 480_000
      }
    ],
    transcript: timed([
      { speakerId: "speaker-1", text: "Welcome everyone. Today we are locking in the final specs for the Oryzo project before sending the bundle to Lusion.", startMs: 0 },
      { speakerId: "speaker-2", text: "I've been reviewing the digital mocks. The Walnut Shadow canvas works perfectly. It behaves like a void behind the coaster render, which is exactly the editorial feel we want.", startMs: 180_000 },
      { speakerId: "speaker-3", text: "On the hardware side, the cork stamping machinery has some limits. If we go thinner than 1.0mm on the border, it tears. So 1.0mm is our absolute floor.", startMs: 480_000 },
      { speakerId: "speaker-2", text: "That is fine. 1.0mm cork border preserves our scale rules. It feels warm, elevated, and creates a deliberate divider.", startMs: 720_000 },
      { speakerId: "speaker-1", text: "Perfect. So that's decided. Alex, can you hand over the finalized meshes to David for rendering?", startMs: 1_080_000 },
      { speakerId: "speaker-3", text: "Yes, I will package them today and drop them in the shared drive. I'll also add the material map settings for the cork texture.", startMs: 1_320_000 },
      { speakerId: "speaker-2", text: "Great. I will set up the lighting: key light from the upper right, nice warm rim lighting, keeping the canvas entirely unlit so it stays pure Walnut Shadow.", startMs: 1_800_000 },
      { speakerId: "speaker-1", text: "Let's summarize actions. Alex delivers meshes. David renders. I will update the timeline and draft the manufacturer agreement.", startMs: 2_400_000 }
    ]),
    tags: ["Design", "Hardware", "Kickoff"],
    status: "ready"
  },
  {
    id: "audio-pipeline-sync",
    title: "Weekly sync: audio pipeline lag & buffers",
    startedAt: "2026-08-18T10:30:00Z",
    durationMs: 45 * 60_000,
    ownerId: "u-marcus-vance",
    speakers: [
      { id: "speaker-1", label: "Speaker 1", voicePrint: "vp-marcus-vance" },
      { id: "speaker-2", label: "Speaker 2", voicePrint: "vp-jane-dong" },
      { id: "speaker-3", label: "Speaker 3", voicePrint: "vp-alex-rivera" }
    ],
    gist: "Resolved the WebAudio context initialization delay and optimized buffer size to decrease lag.",
    summary: "The engineering team diagnosed the root cause of the audio capture lag. By increasing WebAudio cache bounds and reducing buffer sizes to 256 samples, latency was successfully dropped by 80ms, paving the way for real-time streaming transcription tests.",
    topics: [
      {
        title: "WebAudio initialization delay",
        details: "Investigated a 150ms startup delay on Chrome. Found it was caused by eager sample rate conversion. Jane suggested forcing a native sample rate match during construction."
      },
      {
        title: "Buffer block optimizations",
        details: "We swapped the default 1024 sample buffer for 256 samples. This reduced processing lag but increased CPU usage by 4%. The team agreed the trade-off is acceptable."
      }
    ],
    decisions: [
      "Force WebAudio context to instantiate with native sample rate parameters.",
      "Switch buffer size from 1024 to 256 samples across all capturing environments.",
      "Allocate a 2-week verification cycle to test buffer stability on low-end mobile devices."
    ],
    actionItems: [
      {
        item: "Implement native sample rate initialization wrapper",
        speakerId: "speaker-2"
      },
      {
        item: "Run performance profile suite on Android testing deck",
        speakerId: "speaker-3"
      },
      {
        item: "Draft stability reports for mobile browsers",
        speakerId: "speaker-1"
      }
    ],
    quotes: [
      {
        quote: "Real-time capture only works if the user forgets the interface is listening. An 80ms reduction gets us closer to that invisible threshold.",
        speakerId: "speaker-3",
        startMs: 1_320_000
      },
      {
        quote: "The 4% CPU increase is negligible compared to the responsiveness we gain. This is a clear win.",
        speakerId: "speaker-2",
        startMs: 900_000
      }
    ],
    transcript: timed([
      { speakerId: "speaker-1", text: "Let's look at the audio capture performance. The lag is still noticeable when capturing meetings longer than an hour.", startMs: 120_000 },
      { speakerId: "speaker-2", text: "The main bottle-neck is the buffer size. We are using 1024 samples. If we drop it to 256, we can clear the chunks much faster.", startMs: 360_000 },
      { speakerId: "speaker-3", text: "How does that affect memory and CPU overhead on chrome?", startMs: 660_000 },
      { speakerId: "speaker-2", text: "It increases CPU usage by roughly 4%, but it drops the latency by 80ms, which is a massive quality improvement.", startMs: 900_000 },
      { speakerId: "speaker-3", text: "That is absolutely worth it. Let's make that switch. We also need to lock down the native sample rate to avoid browser conversion lag.", startMs: 1_320_000 },
      { speakerId: "speaker-1", text: "I will document this and set up mobile testing profiles. We need to make sure budget phones don't stutter with 256 buffers.", startMs: 2_100_000 }
    ]),
    tags: ["Engineering", "Audio", "Sync"],
    status: "ready"
  },
  {
    id: "design-system-review",
    title: "Product design review: minimal canvas & chrome",
    startedAt: "2026-08-14T16:00:00Z",
    durationMs: 60 * 60_000,
    ownerId: "u-david-kerr",
    speakers: [
      { id: "speaker-1", label: "Speaker 1", voicePrint: "vp-sarah-chen" },
      { id: "speaker-2", label: "Speaker 2", voicePrint: "vp-david-kerr" },
      { id: "speaker-3", label: "Speaker 3", voicePrint: "vp-elena-rostova" }
    ],
    gist: "Reviewed layout grids and finalized rules for card containers and uppercase editorial typography.",
    summary: "Elena and David refined the editorial spacing vocabulary. We banned light-mode section inversion, established card radii at 12px, inputs at 0px with bottom borders, and locked in uppercase weight 500 for UI headers to create a museum-like aesthetic.",
    topics: [
      {
        title: "Editorial typography scaling",
        details: "Audited display sizes. The display headlines must stack as block-like sculptural units. Locked the 0.90 line-height for 41px and 51px headers."
      },
      {
        title: "Theme lock resolution",
        details: "Debated if settings panels should use a lighter fill. Decided to keep the site entirely in dark mode, avoiding any section inversion to prevent visual jarring."
      },
      {
        title: "Card container rules",
        details: "Removed drop shadows entirely. Confirmed that structural hierarchy is built through a 2-step luminance step: Walnut Shadow for canvas, Bark Brown for filled surfaces, and Cork Border for dividers."
      }
    ],
    decisions: [
      "Ban light-mode/inverted panels to maintain dark void aesthetic consistency.",
      "Enforce uppercase weight 500 on all UI chrome and buttons; reserve mixed-case weight 400 for 29px body copy only.",
      "Set card container border-radius to 12px and buttons to 36px/22.5px."
    ],
    actionItems: [
      {
        item: "Replace all card shadows with 1px cork border styles",
        speakerId: "speaker-3"
      },
      {
        item: "Update type token scales in the shared Tailwind config",
        speakerId: "speaker-2"
      },
      {
        item: "Audit button padding to ensure CTA labels do not wrap",
        speakerId: "speaker-1"
      }
    ],
    quotes: [
      {
        quote: "We don't draw boxes around everything. A dashed line is a structural indicator, not a decorative frame.",
        speakerId: "speaker-2",
        startMs: 480_000
      },
      {
        quote: "The 29px mixed-case text is our only conversational voice. Everything else should feel like a carved gallery caption.",
        speakerId: "speaker-3",
        startMs: 900_000
      }
    ],
    transcript: timed([
      { speakerId: "speaker-1", text: "We need to finalize the UI components. The feedback on the dashboard is that the cards feel a bit too standard.", startMs: 120_000 },
      { speakerId: "speaker-2", text: "That is because they have drop shadows. We must remove all shadows. The hierarchy must rely on Walnut Shadow for the canvas and Bark Brown for filled buttons, with Cork Border outline for cards.", startMs: 480_000 },
      { speakerId: "speaker-3", text: "I agree. Shadows look like standard SaaS. We are building a museum gallery, not a CRM database. Let's make card borders 1px Cork Border.", startMs: 900_000 },
      { speakerId: "speaker-2", text: "Yes, and the type must be strictly uppercase 500 for headers. Only the descriptive summaries get mixed-case 29px copy. It is simple, clean, and confident.", startMs: 1_320_000 },
      { speakerId: "speaker-1", text: "Let's update the specifications. Outlined buttons get 22.5px radius, inputs are bottom-border only. This is clean. Elena, can you do the visual audit?", startMs: 2_400_000 },
      { speakerId: "speaker-3", text: "I will go through all screens and strip any drop shadows, adjust the border radii, and correct the button tracking.", startMs: 2_880_000 }
    ]),
    tags: ["Design", "Review", "Recall"],
    status: "ready"
  },
  {
    id: "marketing-strategy",
    title: "Marketing synchronization: editorial launch",
    startedAt: "2026-08-10T11:00:00Z",
    durationMs: 45 * 60_000,
    ownerId: "u-sarah-chen",
    speakers: [
      { id: "speaker-1", label: "Speaker 1", voicePrint: "vp-sarah-chen" },
      { id: "speaker-2", label: "Speaker 2", voicePrint: "vp-marcus-vance" },
      { id: "speaker-3", label: "Speaker 3", voicePrint: "vp-jonathan-ives" }
    ],
    gist: "Reviewed editorial press release strategy and established the core messaging guidelines.",
    summary: "The team aligned on the launch storytelling. We decided to lead with the phrase 'AI Memory, Not Transcripts' to position ourselves against bloated meeting bots, focusing on premium editorial assets and minimal typographic showcases.",
    topics: [
      {
        title: "Editorial positioning",
        details: "Defined the core theme. Avoid generic AI terms. Focus on 'Recall' as a quiet workspace artifact, letting the meetings speak for themselves through structured memories."
      },
      {
        title: "Logo wall styling",
        details: "Finalized the logo treatment. The trusted partner wall will display monochromatic SVG logos only, with no industry category text to maintain visual minimalism."
      }
    ],
    decisions: [
      "Use 'AI Memory, Not Transcripts' as the primary launch slogan.",
      "Display monochromatic partner logos directly under the hero without surrounding borders.",
      "Limit the initial launch press release to three key editorial reviews."
    ],
    actionItems: [
      {
        item: "Draft the launch press release copy using the 20-word limit rule",
        speakerId: "speaker-2"
      },
      {
        item: "Gather SVG vector assets for our five launch partner logos",
        speakerId: "speaker-3"
      },
      {
        item: "Schedule launch day coordination sync",
        speakerId: "speaker-1",
        done: true
      }
    ],
    quotes: [
      {
        quote: "We are selling memory, not transcripts. Nobody wants to read a 40-page log of a sync; they want the decisions and the quotes that drove them.",
        speakerId: "speaker-3",
        startMs: 900_000
      }
    ],
    transcript: timed([
      { speakerId: "speaker-1", text: "Marcus, where are we with the launch tagline? We need something that cuts through the noise.", startMs: 120_000 },
      { speakerId: "speaker-2", text: "I've been thinking about: 'Recall: AI Memory, Not Transcripts.' It immediately highlights our difference. We aren't storing logs, we are storing memory.", startMs: 360_000 },
      { speakerId: "speaker-3", text: "That is strong. It aligns with our editorial stance. The landing page should feel like an digital journal of your company's decisions.", startMs: 900_000 },
      { speakerId: "speaker-1", text: "Agreed. Let's make sure the logo wall under the hero is clean. Monochromatic SVGs, no labels underneath. Let the logos stand as a gallery strip.", startMs: 1_320_000 },
      { speakerId: "speaker-2", text: "I will refine the copy on the site to match. We will keep sections short: headline, summary, and action.", startMs: 2_100_000 }
    ]),
    tags: ["Marketing", "Launch", "Recall"],
    status: "ready"
  },
  {
    id: "security-audit",
    title: "Security audit: encrypted memory cache",
    startedAt: "2026-08-05T09:00:00Z",
    durationMs: 60 * 60_000,
    ownerId: "u-hector-bennet",
    speakers: [
      { id: "speaker-1", label: "Speaker 1", voicePrint: "vp-hector-bennet" },
      { id: "speaker-2", label: "Speaker 2", voicePrint: "vp-jane-dong" },
      { id: "speaker-3", label: "Speaker 3", voicePrint: "vp-alex-rivera" }
    ],
    gist: "Reviewed cache encryption flow and finalized key rotation policies for local devices.",
    summary: "Hector and Jane mapped the encryption requirements for the local client-side memory cache. We confirmed that all transient transcripts are immediately encrypted using AES-GCM-256 before disk write, and keys are rotated every 24 hours.",
    topics: [
      {
        title: "Client-side storage encryption",
        details: "Evaluated storage performance of SQLite vs indexDB. Swapped default serialization to binary structures to prevent text leak in system memory swap files."
      },
      {
        title: "Automatic key rotation",
        details: "Established key rotation intervals. Transient encryption keys will rotate every 24 hours. Old logs will be re-encrypted in the background during idle cycles."
      }
    ],
    decisions: [
      "Use AES-GCM-256 for encrypting all client-side cached transcripts.",
      "Perform re-encryption of legacy data on device idle state triggers only.",
      "Rotate keys automatically every 24 hours, storing hashes in secure enclave."
    ],
    actionItems: [
      {
        item: "Implement IndexDB binary serialization wrappers",
        speakerId: "speaker-2",
        done: true
      },
      {
        item: "Write key rotation scheduler script for client application",
        speakerId: "speaker-1"
      },
      {
        item: "Configure security enclave key storage bridge",
        speakerId: "speaker-3"
      }
    ],
    quotes: [
      {
        quote: "Our promise is total privacy. If someone loses their laptop, their meeting memory should remain as secure as their passwords.",
        speakerId: "speaker-1",
        startMs: 300_000
      }
    ],
    transcript: timed([
      { speakerId: "speaker-1", text: "Let's review the storage encryption plan. We need to be absolutely bulletproof on the client device.", startMs: 300_000 },
      { speakerId: "speaker-2", text: "I have mapped out IndexDB. All text chunks are serialized into binary blobs and encrypted with AES-GCM-256. Plain text never hits the disk.", startMs: 720_000 },
      { speakerId: "speaker-3", text: "How do we handle key storage? We shouldn't keep the key in memory indefinitely.", startMs: 1_200_000 },
      { speakerId: "speaker-1", text: "We will use the system's secure enclave for key storage. We'll also rotate keys every 24 hours. The rotation will trigger background re-encryption of older records.", startMs: 1_680_000 },
      { speakerId: "speaker-2", text: "That is perfect. I will write the serialization wrappers today.", startMs: 2_700_000 }
    ]),
    tags: ["Security", "Audit", "Engineering"],
    status: "ready"
  }
];

/** A cited moment: which meeting, and where in it. */
export interface Citation {
  /** The voice quoted, resolved against the cited meeting's speaker slots. */
  speakerId: string;
  text: string;
  meetingTitle: string;
  meetingId: string;
  /** Offset from the cited meeting's `startedAt`, so the answer can be played. */
  startMs: number;
}

export interface MockQuestion {
  question: string;
  answer: string;
  sourceMeetings: string[]; // matching meeting IDs
  citations: Citation[];
}

export const MOCK_QUESTIONS: MockQuestion[] = [
  {
    question: "When is the Oryzo beta release or final asset delivery?",
    answer: "The team decided to send the complete package of 3D renders and context photographs to Lusion studio by Friday noon, August 22, 2026.",
    sourceMeetings: ["oryzo-integration"],
    citations: [
      {
        speakerId: "speaker-1",
        text: "Send final assets to Lusion studio by Friday noon.",
        meetingTitle: "Oryzo kick-off: design stack & manufacturing",
        meetingId: "oryzo-integration",
        startMs: 2_400_000
      }
    ]
  },
  {
    question: "What did we decide about the audio pipeline buffer sizes and lag?",
    answer: "To reduce latency by 80ms, the team decided to switch the audio buffer size from 1024 to 256 samples. This increases Chrome CPU usage by 4%, which was agreed to be a highly acceptable trade-off.",
    sourceMeetings: ["audio-pipeline-sync"],
    citations: [
      {
        speakerId: "speaker-2",
        text: "Switch buffer size from 1024 to 256 samples across all capturing environments.",
        meetingTitle: "Weekly sync: audio pipeline lag & buffers",
        meetingId: "audio-pipeline-sync",
        startMs: 360_000
      },
      {
        speakerId: "speaker-3",
        text: "An 80ms reduction gets us closer to that invisible threshold.",
        meetingTitle: "Weekly sync: audio pipeline lag & buffers",
        meetingId: "audio-pipeline-sync",
        startMs: 1_320_000
      }
    ]
  },
  {
    question: "Who is responsible for auditing card shadows and border radii?",
    answer: "Elena Rostova is responsible for replacing all card shadows with 1px cork border styles. Sarah Chen is auditing button padding to prevent CTA wrap, and David Kerr is updating the typographic tokens in the Tailwind config.",
    sourceMeetings: ["design-system-review"],
    citations: [
      {
        speakerId: "speaker-3",
        text: "Replace all card shadows with 1px cork border styles",
        meetingTitle: "Product design review: minimal canvas & chrome",
        meetingId: "design-system-review",
        startMs: 2_880_000
      }
    ]
  },
  {
    question: "What is the slogan chosen for marketing launch?",
    answer: "The team aligned on the primary launch slogan: 'AI Memory, Not Transcripts'. This tagline was proposed by Marcus Vance and supported by Jonathan Ives to emphasize that Meetwise AI processes conversation into structured summaries rather than storing raw text logs.",
    sourceMeetings: ["marketing-strategy"],
    citations: [
      {
        speakerId: "speaker-2",
        text: "Recall: AI Memory, Not Transcripts. We aren't storing logs, we are storing memory.",
        meetingTitle: "Marketing synchronization: editorial launch",
        meetingId: "marketing-strategy",
        startMs: 360_000
      }
    ]
  },
  {
    question: "How is local data security and privacy handled in Recall?",
    answer: "Recall handles client-side security by encrypting all local memory cache files with AES-GCM-256. Plain text never writes directly to disk. Key rotation triggers automatically every 24 hours using the system secure enclave, and legacy data is re-encrypted when the client device is idle.",
    sourceMeetings: ["security-audit"],
    citations: [
      {
        speakerId: "speaker-2",
        text: "Use AES-GCM-256 for encrypting all client-side cached transcripts.",
        meetingTitle: "Security audit: encrypted memory cache",
        meetingId: "security-audit",
        startMs: 720_000
      },
      {
        speakerId: "speaker-1",
        text: "Old logs will be re-encrypted in the background during idle cycles.",
        meetingTitle: "Security audit: encrypted memory cache",
        meetingId: "security-audit",
        startMs: 1_680_000
      }
    ]
  }
];

/**
 * Scripted speech for the live capture screen.
 *
 * No timestamps: a line is stamped with the real elapsed time at which it
 * arrives on screen, so a saved capture carries true offsets rather than
 * numbers copied out of a fixture.
 */
export const MOCK_LIVE_SPEECH_STREAM: { speaker: string; text: string; associatedTopic?: string }[] = [
  { speaker: "Sarah Chen", text: "Okay, we are rolling. Let's align on the encryption performance for the new local caches." },
  { speaker: "Alex Rivera", text: "Right, the AES-GCM-256 implementation is solid. Jane, did you finish running the IndexedDB speed tests?" },
  { speaker: "Jane Dong", text: "Yes. Binary serialization is showing zero lockups. Writing 10MB of transcript chunks takes less than 3 milliseconds.", associatedTopic: "IndexDB Speed Tests" },
  { speaker: "Sarah Chen", text: "Fantastic. Let's lock in IndexDB as our primary storage. Any issues with key rotation on mobile Chrome?" },
  { speaker: "Alex Rivera", text: "No, the WebCrypto API is fully supported on mobile now. We rotate keys every 24 hours without UI blocking.", associatedTopic: "Key Rotation Security" },
  { speaker: "Sarah Chen", text: "Perfect. That covers security. What about the memory usage? Are we caching transcripts in active memory?" },
  { speaker: "Jane Dong", text: "We keep the last 5 minutes of raw transcripts in active memory to feed the live AI context. Everything older gets immediately encrypted and flushed to IndexedDB.", associatedTopic: "Active Memory Caching" },
  { speaker: "Alex Rivera", text: "That keeps the RAM footprint under 15MB, which is a great budget." },
  { speaker: "Sarah Chen", text: "Excellent work, team. Let's close the sync and schedule the security audit review for Friday." }
];

/**
 * What the analysis stage "returns" for an uploaded recording.
 *
 * Stands in for the extraction step: speech-to-text with diarization, then a
 * structured pass that fills the analytical half of `Meeting`. Everything the
 * user supplies (title, duration, upload time) is merged over this in
 * `buildReadyMeeting`, so the same fixture works for any uploaded file.
 */
export const MOCK_UPLOAD_ANALYSIS: Pick<
  Meeting,
  "speakers" | "gist" | "summary" | "topics" | "decisions" | "actionItems" | "quotes" | "transcript" | "tags"
> = {
  speakers: [
    { id: "speaker-1", label: "Speaker 1", voicePrint: "vp-sarah-chen" },
    { id: "speaker-2", label: "Speaker 2", voicePrint: "vp-unheard-7c2" },
    { id: "speaker-3", label: "Speaker 3", voicePrint: "vp-unheard-b19" }
  ],
  gist: "Agreed to ship the ingest queue behind a flag and hold the migration until the backfill finishes.",
  summary:
    "The team walked through the ingest backlog and concluded the queue is ready to go out behind a feature flag. The blocking item is the historical backfill, which is still running and must complete before the schema migration lands. Ownership for the remaining verification work was assigned before the call closed.",
  topics: [
    {
      title: "Ingest queue rollout",
      details:
        "Reviewed throughput from the staging soak. The queue held steady at roughly 40 jobs per minute with no dropped messages, which clears the bar for a flagged rollout to a subset of accounts."
    },
    {
      title: "Historical backfill",
      details:
        "The backfill is about two thirds through the archive. It must finish before the schema migration runs, otherwise older records land without the new status column."
    },
    {
      title: "Failure handling",
      details:
        "Jobs that fail transcription currently retry three times and then stop silently. The group agreed failures need to surface to the person who uploaded the file rather than only to the logs."
    }
  ],
  decisions: [
    "Ship the ingest queue behind a feature flag rather than to everyone at once.",
    "Hold the schema migration until the historical backfill reports complete.",
    "Surface failed jobs to the uploader instead of logging them silently."
  ],
  actionItems: [
    { item: "Enable the ingest flag for the internal account set", speakerId: "speaker-1" },
    { item: "Report backfill completion percentage on Thursday", speakerId: "speaker-2" },
    { item: "Add uploader-facing failure notifications to the job runner", speakerId: "speaker-3" }
  ],
  quotes: [
    {
      quote: "If a job dies and the only place that shows up is a log line, the user has just lost their meeting and doesn't know it yet.",
      speakerId: "speaker-3",
      startMs: 91_000
    }
  ],
  transcript: timed([
    { speakerId: "speaker-1", text: "Let's start with the queue. Where did the soak test land?", startMs: 4_000 },
    { speakerId: "speaker-2", text: "Steady at about forty jobs a minute over six hours. Nothing dropped, and the retry path never fired.", startMs: 11_000 },
    { speakerId: "speaker-1", text: "That is good enough to turn on. I would rather do it behind a flag than open it to everyone though.", startMs: 26_000 },
    { speakerId: "speaker-3", text: "Agreed. Flag it to the internal accounts first and watch it for a week.", startMs: 38_000 },
    { speakerId: "speaker-2", text: "One blocker — the backfill is still running. It is roughly two thirds done. If the migration lands first, the older rows come through without a status.", startMs: 52_000 },
    { speakerId: "speaker-1", text: "Then the migration waits. Can you report the percentage on Thursday?", startMs: 69_000 },
    { speakerId: "speaker-2", text: "I can.", startMs: 75_000 },
    { speakerId: "speaker-3", text: "The other thing is failures. Right now a job retries three times and then just stops. Nobody hears about it.", startMs: 82_000 },
    { speakerId: "speaker-3", text: "If a job dies and the only place that shows up is a log line, the user has just lost their meeting and doesn't know it yet.", startMs: 91_000 },
    { speakerId: "speaker-1", text: "Then that is yours. Get the failure back to whoever uploaded the file.", startMs: 104_000 }
  ]),
  tags: ["Engineering", "Upload"]
};
