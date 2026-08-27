export interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp: string;
}

export interface Topic {
  title: string;
  details: string;
}

export interface ActionItem {
  item: string;
  owner: string;
}

export interface Quote {
  quote: string;
  speaker: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  participants: string[];
  gist: string;
  summary: string;
  topics: Topic[];
  decisions: string[];
  actionItems: ActionItem[];
  quotes: Quote[];
  transcript: TranscriptLine[];
  tags: string[];
}

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: "oryzo-integration",
    title: "ORYZO KICK-OFF: DESIGN STACK & MANUFACTURING",
    date: "AUG 22, 2026",
    time: "14:00 - 14:45",
    duration: "45 MIN",
    participants: ["SARAH CHEN", "DAVID KERR", "ALEX RIVERA"],
    gist: "Aligned on cork border tolerances and mapped out final asset deliveries for the Lusion studio review.",
    summary: "The design team resolved the alignment and tolerances for the Oryzo structure. We decided to preserve the cork-border dividers and use Walnut Shadow for our deepest digital canvas, ensuring a physical-to-digital material continuity that matches our core philosophy of negative space.",
    topics: [
      {
        title: "CORK BORDER SPECIFICATIONS",
        details: "Reviewed the physical tolerances of the custom coaster frame. Decided to maintain a 1mm border width to ensure it is warmer than the canvas by one step without feeling bulky."
      },
      {
        title: "LUSION STUDIO ASSET DELIVERABLES",
        details: "Agreed to send the complete package of 3D renders and context photographs by Thursday. Renders will isolate the product against the Walnut Shadow background with upper-right lighting."
      },
      {
        title: "DIGITAL PORTFOLIO CANVAS",
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
        owner: "ALEX RIVERA"
      },
      {
        item: "Draft updated manufacturing partner agreement",
        owner: "SARAH CHEN"
      },
      {
        item: "Review render lighting setup with Lusion technical lead",
        owner: "DAVID KERR"
      }
    ],
    quotes: [
      {
        quote: "Our visual vocabulary is restraint. The moment we add a drop shadow or a secondary accent color to the CTA buttons, we weaken the form.",
        speaker: "DAVID KERR"
      },
      {
        quote: "Manufacturing needs a 1.0mm limit, otherwise the cork will tear during high-speed stamping. We cannot push to 0.8mm.",
        speaker: "ALEX RIVERA"
      }
    ],
    transcript: [
      { speaker: "SARAH CHEN", text: "Welcome everyone. Today we are locking in the final specs for the Oryzo project before sending the bundle to Lusion.", timestamp: "14:00" },
      { speaker: "DAVID KERR", text: "I've been reviewing the digital mocks. The Walnut Shadow canvas works perfectly. It behaves like a void behind the coaster render, which is exactly the editorial feel we want.", timestamp: "14:03" },
      { speaker: "ALEX RIVERA", text: "On the hardware side, the cork stamping machinery has some limits. If we go thinner than 1.0mm on the border, it tears. So 1.0mm is our absolute floor.", timestamp: "14:08" },
      { speaker: "DAVID KERR", text: "That is fine. 1.0mm cork border preserves our scale rules. It feels warm, elevated, and creates a deliberate divider.", timestamp: "14:12" },
      { speaker: "SARAH CHEN", text: "Perfect. So that's decided. Alex, can you hand over the finalized meshes to David for rendering?", timestamp: "14:18" },
      { speaker: "ALEX RIVERA", text: "Yes, I will package them today and drop them in the shared drive. I'll also add the material map settings for the cork texture.", timestamp: "14:22" },
      { speaker: "DAVID KERR", text: "Great. I will set up the lighting: key light from the upper right, nice warm rim lighting, keeping the canvas entirely unlit so it stays pure Walnut Shadow.", timestamp: "14:30" },
      { speaker: "SARAH CHEN", text: "Let's summarize actions. Alex delivers meshes. David renders. I will update the timeline and draft the manufacturer agreement.", timestamp: "14:40" }
    ],
    tags: ["DESIGN", "HARDWARE", "KICKOFF"]
  },
  {
    id: "audio-pipeline-sync",
    title: "WEEKLY SYNC: AUDIO PIPELINE LAG & BUFFERS",
    date: "AUG 18, 2026",
    time: "10:30 - 11:15",
    duration: "45 MIN",
    participants: ["ALEX RIVERA", "MARCUS VANCE", "JANE DONG"],
    gist: "Resolved the WebAudio context initialization delay and optimized buffer size to decrease lag.",
    summary: "The engineering team diagnosed the root cause of the audio capture lag. By increasing WebAudio cache bounds and reducing buffer sizes to 256 samples, latency was successfully dropped by 80ms, paving the way for real-time streaming transcription tests.",
    topics: [
      {
        title: "WEBAUDIO INITIALIZATION DELAY",
        details: "Investigated a 150ms startup delay on Chrome. Found it was caused by eager sample rate conversion. Jane suggested forcing a native sample rate match during construction."
      },
      {
        title: "BUFFER BLOCK OPTIMIZATIONS",
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
        owner: "JANE DONG"
      },
      {
        item: "Run performance profile suite on Android testing deck",
        owner: "ALEX RIVERA"
      },
      {
        item: "Draft stability reports for mobile browsers",
        owner: "MARCUS VANCE"
      }
    ],
    quotes: [
      {
        quote: "Real-time capture only works if the user forgets the interface is listening. An 80ms reduction gets us closer to that invisible threshold.",
        speaker: "ALEX RIVERA"
      },
      {
        quote: "The 4% CPU increase is negligible compared to the responsiveness we gain. This is a clear win.",
        speaker: "JANE DONG"
      }
    ],
    transcript: [
      { speaker: "MARCUS VANCE", text: "Let's look at the audio capture performance. The lag is still noticeable when capturing meetings longer than an hour.", timestamp: "10:32" },
      { speaker: "JANE DONG", text: "The main bottle-neck is the buffer size. We are using 1024 samples. If we drop it to 256, we can clear the chunks much faster.", timestamp: "10:36" },
      { speaker: "ALEX RIVERA", text: "How does that affect memory and CPU overhead on chrome?", timestamp: "10:41" },
      { speaker: "JANE DONG", text: "It increases CPU usage by roughly 4%, but it drops the latency by 80ms, which is a massive quality improvement.", timestamp: "10:45" },
      { speaker: "ALEX RIVERA", text: "That is absolutely worth it. Let's make that switch. We also need to lock down the native sample rate to avoid browser conversion lag.", timestamp: "10:52" },
      { speaker: "MARCUS VANCE", text: "I will document this and set up mobile testing profiles. We need to make sure budget phones don't stutter with 256 buffers.", timestamp: "11:05" }
    ],
    tags: ["ENGINEERING", "AUDIO", "SYNC"]
  },
  {
    id: "design-system-review",
    title: "PRODUCT DESIGN REVIEW: MINIMAL CANVAS & CHROME",
    date: "AUG 14, 2026",
    time: "16:00 - 17:00",
    duration: "60 MIN",
    participants: ["DAVID KERR", "SARAH CHEN", "ELENA ROSTOVA"],
    gist: "Reviewed layout grids and finalized rules for card containers and uppercase editorial typography.",
    summary: "Elena and David refined the editorial spacing vocabulary. We banned light-mode section inversion, established card radii at 12px, inputs at 0px with bottom borders, and locked in uppercase weight 500 for UI headers to create a museum-like aesthetic.",
    topics: [
      {
        title: "EDITORIAL TYPOGRAPHY SCALING",
        details: "Audited display sizes. The display headlines must stack as block-like sculptural units. Locked the 0.90 line-height for 41px and 51px headers."
      },
      {
        title: "THEME LOCK RESOLUTION",
        details: "Debated if settings panels should use a lighter fill. Decided to keep the site entirely in dark mode, avoiding any section inversion to prevent visual jarring."
      },
      {
        title: "CARD CONTAINER RULES",
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
        owner: "ELENA ROSTOVA"
      },
      {
        item: "Update type token scales in the shared Tailwind config",
        owner: "DAVID KERR"
      },
      {
        item: "Audit button padding to ensure CTA labels do not wrap",
        owner: "SARAH CHEN"
      }
    ],
    quotes: [
      {
        quote: "We don't draw boxes around everything. A dashed line is a structural indicator, not a decorative frame.",
        speaker: "DAVID KERR"
      },
      {
        quote: "The 29px mixed-case text is our only conversational voice. Everything else should feel like a carved gallery caption.",
        speaker: "ELENA ROSTOVA"
      }
    ],
    transcript: [
      { speaker: "SARAH CHEN", text: "We need to finalize the UI components. The feedback on the dashboard is that the cards feel a bit too standard.", timestamp: "16:02" },
      { speaker: "DAVID KERR", text: "That is because they have drop shadows. We must remove all shadows. The hierarchy must rely on Walnut Shadow for the canvas and Bark Brown for filled buttons, with Cork Border outline for cards.", timestamp: "16:08" },
      { speaker: "ELENA ROSTOVA", text: "I agree. Shadows look like standard SaaS. We are building a museum gallery, not a CRM database. Let's make card borders 1px Cork Border.", timestamp: "16:15" },
      { speaker: "DAVID KERR", text: "Yes, and the type must be strictly uppercase 500 for headers. Only the descriptive summaries get mixed-case 29px copy. It is simple, clean, and confident.", timestamp: "16:22" },
      { speaker: "SARAH CHEN", text: "Let's update the specifications. Outlined buttons get 22.5px radius, inputs are bottom-border only. This is clean. Elena, can you do the visual audit?", timestamp: "16:40" },
      { speaker: "ELENA ROSTOVA", text: "I will go through all screens and strip any drop shadows, adjust the border radii, and correct the button tracking.", timestamp: "16:48" }
    ],
    tags: ["DESIGN", "REVIEW", "RECALL"]
  },
  {
    id: "marketing-strategy",
    title: "MARKETING SYNCHRONIZATION: EDITORIAL LAUNCH",
    date: "AUG 10, 2026",
    time: "11:00 - 11:45",
    duration: "45 MIN",
    participants: ["SARAH CHEN", "MARCUS VANCE", "JONATHAN IVES"],
    gist: "Reviewed editorial press release strategy and established the core messaging guidelines.",
    summary: "The team aligned on the launch storytelling. We decided to lead with the phrase 'AI Memory, Not Transcripts' to position ourselves against bloated meeting bots, focusing on premium editorial assets and minimal typographic showcases.",
    topics: [
      {
        title: "EDITORIAL POSITIONING",
        details: "Defined the core theme. Avoid generic AI terms. Focus on 'Recall' as a quiet workspace artifact, letting the meetings speak for themselves through structured memories."
      },
      {
        title: "LOGO WALL STYLING",
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
        owner: "MARCUS VANCE"
      },
      {
        item: "Gather SVG vector assets for our five launch partner logos",
        owner: "JONATHAN IVES"
      },
      {
        item: "Schedule launch day coordination sync",
        owner: "SARAH CHEN"
      }
    ],
    quotes: [
      {
        quote: "We are selling memory, not transcripts. Nobody wants to read a 40-page log of a sync; they want the decisions and the quotes that drove them.",
        speaker: "JONATHAN IVES"
      }
    ],
    transcript: [
      { speaker: "SARAH CHEN", text: "Marcus, where are we with the launch tagline? We need something that cuts through the noise.", timestamp: "11:02" },
      { speaker: "MARCUS VANCE", text: "I've been thinking about: 'Recall: AI Memory, Not Transcripts.' It immediately highlights our difference. We aren't storing logs, we are storing memory.", timestamp: "11:06" },
      { speaker: "JONATHAN IVES", text: "That is strong. It aligns with our editorial stance. The landing page should feel like an digital journal of your company's decisions.", timestamp: "11:15" },
      { speaker: "SARAH CHEN", text: "Agreed. Let's make sure the logo wall under the hero is clean. Monochromatic SVGs, no labels underneath. Let the logos stand as a gallery strip.", timestamp: "11:22" },
      { speaker: "MARCUS VANCE", text: "I will refine the copy on the site to match. We will keep sections short: headline, summary, and action.", timestamp: "11:35" }
    ],
    tags: ["MARKETING", "LAUNCH", "RECALL"]
  },
  {
    id: "security-audit",
    title: "SECURITY AUDIT: ENCRYPTED MEMORY CACHE",
    date: "AUG 05, 2026",
    time: "09:00 - 10:00",
    duration: "60 MIN",
    participants: ["JANE DONG", "ALEX RIVERA", "HECTOR BENNET"],
    gist: "Reviewed cache encryption flow and finalized key rotation policies for local devices.",
    summary: "Hector and Jane mapped the encryption requirements for the local client-side memory cache. We confirmed that all transient transcripts are immediately encrypted using AES-GCM-256 before disk write, and keys are rotated every 24 hours.",
    topics: [
      {
        title: "CLIENT-SIDE STORAGE ENCRYPTION",
        details: "Evaluated storage performance of SQLite vs indexDB. Swapped default serialization to binary structures to prevent text leak in system memory swap files."
      },
      {
        title: "AUTOMATIC KEY ROTATION",
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
        owner: "JANE DONG"
      },
      {
        item: "Write key rotation scheduler script for client application",
        owner: "HECTOR BENNET"
      },
      {
        item: "Configure security enclave key storage bridge",
        owner: "ALEX RIVERA"
      }
    ],
    quotes: [
      {
        quote: "Our promise is total privacy. If someone loses their laptop, their meeting memory should remain as secure as their passwords.",
        speaker: "HECTOR BENNET"
      }
    ],
    transcript: [
      { speaker: "HECTOR BENNET", text: "Let's review the storage encryption plan. We need to be absolutely bulletproof on the client device.", timestamp: "09:05" },
      { speaker: "JANE DONG", text: "I have mapped out IndexDB. All text chunks are serialized into binary blobs and encrypted with AES-GCM-256. Plain text never hits the disk.", timestamp: "09:12" },
      { speaker: "ALEX RIVERA", text: "How do we handle key storage? We shouldn't keep the key in memory indefinitely.", timestamp: "09:20" },
      { speaker: "HECTOR BENNET", text: "We will use the system's secure enclave for key storage. We'll also rotate keys every 24 hours. The rotation will trigger background re-encryption of older records.", timestamp: "09:28" },
      { speaker: "JANE DONG", text: "That is perfect. I will write the serialization wrappers today.", timestamp: "09:45" }
    ],
    tags: ["SECURITY", "AUDIT", "ENGINEERING"]
  }
];

export interface MockQuestion {
  question: string;
  answer: string;
  sourceMeetings: string[]; // matching meeting IDs
  citations: { speaker: string; text: string; meetingTitle: string; meetingId: string }[];
}

export const MOCK_QUESTIONS: MockQuestion[] = [
  {
    question: "When is the Oryzo beta release or final asset delivery?",
    answer: "The team decided to send the complete package of 3D renders and context photographs to Lusion studio by Friday noon, August 22, 2026.",
    sourceMeetings: ["oryzo-integration"],
    citations: [
      {
        speaker: "SARAH CHEN",
        text: "Send final assets to Lusion studio by Friday noon.",
        meetingTitle: "ORYZO KICK-OFF: DESIGN STACK & MANUFACTURING",
        meetingId: "oryzo-integration"
      }
    ]
  },
  {
    question: "What did we decide about the audio pipeline buffer sizes and lag?",
    answer: "To reduce latency by 80ms, the team decided to switch the audio buffer size from 1024 to 256 samples. This increases Chrome CPU usage by 4%, which was agreed to be a highly acceptable trade-off.",
    sourceMeetings: ["audio-pipeline-sync"],
    citations: [
      {
        speaker: "JANE DONG",
        text: "Switch buffer size from 1024 to 256 samples across all capturing environments.",
        meetingTitle: "WEEKLY SYNC: AUDIO PIPELINE LAG & BUFFERS",
        meetingId: "audio-pipeline-sync"
      },
      {
        speaker: "ALEX RIVERA",
        text: "An 80ms reduction gets us closer to that invisible threshold.",
        meetingTitle: "WEEKLY SYNC: AUDIO PIPELINE LAG & BUFFERS",
        meetingId: "audio-pipeline-sync"
      }
    ]
  },
  {
    question: "Who is responsible for auditing card shadows and border radii?",
    answer: "Elena Rostova is responsible for replacing all card shadows with 1px cork border styles. Sarah Chen is auditing button padding to prevent CTA wrap, and David Kerr is updating the typographic tokens in the Tailwind config.",
    sourceMeetings: ["design-system-review"],
    citations: [
      {
        speaker: "ELENA ROSTOVA",
        text: "Replace all card shadows with 1px cork border styles",
        meetingTitle: "PRODUCT DESIGN REVIEW: MINIMAL CANVAS & CHROME",
        meetingId: "design-system-review"
      }
    ]
  },
  {
    question: "What is the slogan chosen for marketing launch?",
    answer: "The team aligned on the primary launch slogan: 'AI Memory, Not Transcripts'. This tagline was proposed by Marcus Vance and supported by Jonathan Ives to emphasize that Meetwise AI processes conversation into structured summaries rather than storing raw text logs.",
    sourceMeetings: ["marketing-strategy"],
    citations: [
      {
        speaker: "MARCUS VANCE",
        text: "Recall: AI Memory, Not Transcripts. We aren't storing logs, we are storing memory.",
        meetingTitle: "MARKETING SYNCHRONIZATION: EDITORIAL LAUNCH",
        meetingId: "marketing-strategy"
      }
    ]
  },
  {
    question: "How is local data security and privacy handled in Recall?",
    answer: "Recall handles client-side security by encrypting all local memory cache files with AES-GCM-256. Plain text never writes directly to disk. Key rotation triggers automatically every 24 hours using the system secure enclave, and legacy data is re-encrypted when the client device is idle.",
    sourceMeetings: ["security-audit"],
    citations: [
      {
        speaker: "JANE DONG",
        text: "Use AES-GCM-256 for encrypting all client-side cached transcripts.",
        meetingTitle: "SECURITY AUDIT: ENCRYPTED MEMORY CACHE",
        meetingId: "security-audit"
      },
      {
        speaker: "HECTOR BENNET",
        text: "Old logs will be re-encrypted in the background during idle cycles.",
        meetingTitle: "SECURITY AUDIT: ENCRYPTED MEMORY CACHE",
        meetingId: "security-audit"
      }
    ]
  }
];

export const MOCK_LIVE_SPEECH_STREAM: { speaker: string; text: string; timestamp: string; associatedTopic?: string }[] = [
  { speaker: "SARAH CHEN", text: "Okay, we are rolling. Let's align on the encryption performance for the new local caches.", timestamp: "11:20:02" },
  { speaker: "ALEX RIVERA", text: "Right, the AES-GCM-256 implementation is solid. Jane, did you finish running the IndexedDB speed tests?", timestamp: "11:20:10" },
  { speaker: "JANE DONG", text: "Yes. Binary serialization is showing zero lockups. Writing 10MB of transcript chunks takes less than 3 milliseconds.", timestamp: "11:20:25", associatedTopic: "IndexDB Speed Tests" },
  { speaker: "SARAH CHEN", text: "Fantastic. Let's lock in IndexDB as our primary storage. Any issues with key rotation on mobile Chrome?", timestamp: "11:20:38" },
  { speaker: "ALEX RIVERA", text: "No, the WebCrypto API is fully supported on mobile now. We rotate keys every 24 hours without UI blocking.", timestamp: "11:20:45", associatedTopic: "Key Rotation Security" },
  { speaker: "SARAH CHEN", text: "Perfect. That covers security. What about the memory usage? Are we caching transcripts in active memory?", timestamp: "11:20:58" },
  { speaker: "JANE DONG", text: "We keep the last 5 minutes of raw transcripts in active memory to feed the live AI context. Everything older gets immediately encrypted and flushed to IndexedDB.", timestamp: "11:21:12", associatedTopic: "Active Memory Caching" },
  { speaker: "ALEX RIVERA", text: "That keeps the RAM footprint under 15MB, which is a great budget.", timestamp: "11:21:24" },
  { speaker: "SARAH CHEN", text: "Excellent work, team. Let's close the sync and schedule the security audit review for Friday.", timestamp: "11:21:38" }
];
