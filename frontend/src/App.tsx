import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CURRENT_USER_ID, INITIAL_VOICE_DIRECTORY, MOCK_MEETINGS, MOCK_USERS } from "./mockData";
import type { Meeting, User, VoiceDirectory } from "./mockData";
import { createSpeakerResolver, personIdFor } from "./speakers";
import { countOpen } from "./commitments";
import type { AppSettings } from "./settings";
import { DEFAULT_SETTINGS, expiredMeetings } from "./settings";
import { downloadFile, exportFilename, toJson, toMarkdown } from "./exportArchive";
import PillNav from "./components/PillNav";
import type { PillNavItem } from "./components/PillNav";
import { Home } from "./components/Home";
import { LiveCapture } from "./components/LiveCapture";
import { MeetingDetail } from "./components/MeetingDetail";
import { Ask } from "./components/Ask";
import { Archive } from "./components/Archive";
import { Settings } from "./components/Settings";
import { Upload } from "./components/Upload";
import { Commitments } from "./components/Commitments";
import { Processing } from "./components/Processing";
import { useProcessingEngine } from "./useProcessingEngine";
import { useSmoothScroll } from "./useSmoothScroll";
import { isReadable } from "./processing";
import { MotionConfig } from "motion/react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, supabase } from "./lib/supabase";
import { useSession } from "./useSession";
import { Auth, SupabaseNotConfigured } from "./components/Auth";
import { loadProfile, loadSettings, renameAccount, saveSettings } from "./api/settings";

/** Landing sections, in the order they appear down the page. */
const SECTIONS = ["home", "owed", "meetings", "ask", "settings"] as const;
type SectionId = (typeof SECTIONS)[number];

/** The pills, in the order they sit in the bar. Each href targets a section id. */
const NAV_ITEMS: PillNavItem[] = [
  { label: "Home", href: "#home" },
  // Sits second: the daily reason to open this thing is the list of what you owe.
  { label: "Owed", href: "#owed" },
  { label: "Meetings", href: "#meetings" },
  { label: "Ask", href: "#ask" },
  { label: "Settings", href: "#settings" },
];

/** Full-screen views that replace the landing page entirely. */
type View = "landing" | "upload" | "processing" | "live" | "detail";

function AppShell({ user }: { user: AuthUser }) {
  const [meetings, setMeetings] = useState<Meeting[]>(MOCK_MEETINGS);
  const [view, setView] = useState<View>("landing");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  // Set when a citation names a moment, so the detail view opens on it.
  const [pendingSeekMs, setPendingSeekMs] = useState<number | undefined>(undefined);

  // Who the archive knows, and which voice belongs to whom. Both sit above
  // every view on purpose: a name given inside one meeting has to hold in all
  // of them, so it cannot live in that meeting's own state.
  const [people, setPeople] = useState<Record<string, User>>(MOCK_USERS);
  const [voices, setVoices] = useState<VoiceDirectory>(INITIAL_VOICE_DIRECTORY);

  const speakers = useMemo(() => createSpeakerResolver(people, voices), [people, voices]);

  // Which models run, in what language, and how long anything is kept. The
  // defaults are only what is shown until the row arrives from the database -
  // they are the same values as the column defaults, so the swap is invisible.
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // The account name, which lives in `profiles` rather than in the archive.
  // Null while it is still being fetched, so the fallback below can tell that
  // apart from a name that genuinely is the seeded one.
  const [profileName, setProfileName] = useState<string | null>(null);

  // Both rows exist from the moment the account does - the `handle_new_user`
  // trigger writes them - so this is a plain read with no create-if-missing
  // dance. They are fetched together because a half-loaded settings screen is
  // worse than a slightly later one.
  useEffect(() => {
    let live = true;
    Promise.all([loadProfile(user.id), loadSettings(user.id)])
      .then(([profile, saved]) => {
        if (!live) return;
        setProfileName(profile.name);
        setSettings(saved);
      })
      .catch((failure) => console.error("Could not load your account", failure));
    return () => {
      live = false;
    };
  }, [user.id]);
  // Memoised so the fallback is not a fresh object on every render - `account`
  // is a prop on two sections, and a new identity each time defeats any
  // memoisation below it.
  //
  // The *name* is already the real one from `profiles`. The *id* is still the
  // fixture's, because the archive it indexes into is still `MOCK_MEETINGS` -
  // swapping it now would empty the Owed list rather than fill it. Both halves
  // become the signed-in user's at M2, when the archive itself moves.
  const account = useMemo(() => {
    const base = people[CURRENT_USER_ID] ?? { id: CURRENT_USER_ID, name: "YOU" };
    return profileName ? { ...base, name: profileName } : base;
  }, [people, profileName]);
  const [activeSection, setActiveSection] = useState<SectionId>("home");

  // Where to scroll back to when returning from a full-screen view.
  const returnSection = useRef<SectionId>("home");

  const currentMeeting = useMemo(
    () => meetings.find((m) => m.id === selectedMeetingId),
    [meetings, selectedMeetingId]
  );

  // Both walk the whole archive, so they are kept off the render path: the
  // badge count scans every action item, and the roster every transcript.
  const openCommitments = useMemo(
    () => countOpen(meetings, speakers, account.id),
    [meetings, speakers, account.id]
  );

  const voiceRoster = useMemo(() => speakers.roster(meetings), [speakers, meetings]);

  // Walks any uploaded meeting through the ingest pipeline.
  useProcessingEngine(meetings, setMeetings, settings.discardAudioAfterProcessing);

  // Page-level smooth scrolling. Nav jumps go through it too, so a click and a
  // wheel move the page the same way instead of two different ways.
  const { scrollTo } = useSmoothScroll();

  const scrollToSection = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      // Lenis does not read `scroll-margin-top`, so the section's own value is
      // applied here - which keeps the nav-height gap on every section and the
      // flush top that `#home` overrides it with.
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      scrollTo(el, { offset: -margin });
    },
    [scrollTo]
  );

  // Nav click: if we're on a full-screen view, come back to the landing page
  // first, then scroll — the section only exists in the DOM once it renders.
  const handleNavigate = useCallback(
    (id: string) => {
      setActiveSection(id as SectionId);
      if (view === "landing") {
        scrollToSection(id);
      } else {
        setSelectedMeetingId(null);
        setView("landing");
        requestAnimationFrame(() => scrollToSection(id));
      }
    },
    [view, scrollToSection]
  );

  // A meeting is only readable once it is `ready`; anything still in the
  // pipeline opens on its status screen instead of an empty detail page.
  const handleSelectMeeting = (id: string, startMs?: number) => {
    const target = meetings.find((m) => m.id === id);
    // Nothing to open. Bail before any state moves, so `view` can never be
    // left pointing at a meeting that is not there.
    if (!target) return;

    returnSection.current = activeSection;
    setSelectedMeetingId(id);
    setPendingSeekMs(startMs);
    setView(isReadable(target) ? "detail" : "processing");
  };

  const handleStartUpload = () => {
    returnSection.current = activeSection;
    setView("upload");
  };

  /** A freshly uploaded file enters the pipeline and opens on its status screen. */
  const handleUploadSubmit = (job: Meeting) => {
    setMeetings((prev) => [job, ...prev]);
    setSelectedMeetingId(job.id);
    setView("processing");
  };

  /** Re-queues a failed job. The retry starts from the queue, not the upload. */
  const handleRetryProcessing = (id: string) => {
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              status: "queued" as const,
              stageStartedAt: Date.now(),
              failedStage: undefined,
              failureReason: undefined,
            }
          : m
      )
    );
  };

  const handleDiscardUpload = (id: string) => {
    setMeetings((prev) => {
      // The blob URL is a live handle on the user's file; drop it with the job.
      const doomed = prev.find((m) => m.id === id);
      if (doomed?.audioUrl) URL.revokeObjectURL(doomed.audioUrl);
      return prev.filter((m) => m.id !== id);
    });
    setSelectedMeetingId(null);
    setView("landing");
    const target = returnSection.current;
    requestAnimationFrame(() => scrollToSection(target));
  };

  const handleBackFromDetail = () => {
    setSelectedMeetingId(null);
    setPendingSeekMs(undefined);
    setView("landing");
    const target = returnSection.current;
    requestAnimationFrame(() => scrollToSection(target));
  };

  const handleStartCapture = () => {
    returnSection.current = activeSection;
    setView("live");
  };

  const handleSaveMeeting = (newMeeting: Meeting) => {
    setMeetings((prev) => [newMeeting, ...prev]);
    setSelectedMeetingId(newMeeting.id);
    setView("detail");
  };

  /**
   * Put a name to a voice.
   *
   * The name is written to the directory, never into the recording, which is
   * what makes it retroactive: every meeting that voice has already spoken in
   * re-resolves to the new name on the next render. Typing a name that is
   * already known merges this voice into that person rather than duplicating.
   */
  const handleNameVoice = (voicePrint: string, rawName: string) => {
    // Stored exactly as typed. The uppercase treatment on speaker labels is a
    // styling decision, so it belongs in CSS, not in the name itself.
    const name = rawName.trim();
    if (!name) return;

    const existing = Object.values(people).find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    const personId = existing?.id ?? personIdFor(name);
    if (!existing) {
      setPeople((prev) => ({ ...prev, [personId]: { id: personId, name } }));
    }
    setVoices((prev) => ({ ...prev, [voicePrint]: personId }));
  };

  /** Unlink a voice from its person. It goes back to being "SPEAKER n". */
  const handleForgetVoice = (voicePrint: string) => {
    setVoices((prev) => {
      const next = { ...prev };
      delete next[voicePrint];
      return next;
    });
  };

  /**
   * Tick an action item off, or put it back.
   *
   * The item lives on its meeting, so that is what gets updated - the
   * commitments view is a projection over the archive, never a second copy.
   */
  const handleToggleActionItem = (meetingId: string, index: number) => {
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              actionItems: m.actionItems.map((a, i) =>
                i === index ? { ...a, done: !a.done } : a
              ),
            }
          : m
      )
    );
  };

  /**
   * A settings change, applied locally and then written.
   *
   * Local first because a dropdown that waits for a round trip before it moves
   * feels broken; only the patch is sent, so two settings changed in two tabs
   * do not overwrite each other.
   */
  const handleChangeSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    saveSettings(user.id, patch).catch((failure) =>
      console.error("Could not save that setting", failure)
    );
  };

  /**
   * Leave.
   *
   * No confirmation: signing out costs nothing to undo, and a dialog guarding
   * a reversible action trains people to dismiss dialogs. `Root` unmounts the
   * whole archive when the session goes, so nothing of this account is left
   * behind for the next one.
   */
  const handleSignOut = () => {
    supabase.auth.signOut().catch((failure) => console.error("Could not sign out", failure));
  };

  /** Your own display name, which is also the name your voice resolves to. */
  const handleRenameAccount = (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    setProfileName(name);
    // Also written into the local directory so the voice this account owns
    // re-resolves immediately, the same way naming any other voice does.
    setPeople((prev) => ({ ...prev, [CURRENT_USER_ID]: { id: CURRENT_USER_ID, name } }));
    renameAccount(user.id, name).catch((failure) =>
      console.error("Could not save your name", failure)
    );
  };

  /** Retention, actually applied: drop everything past the window. */
  const handlePurgeExpired = () => {
    const doomed = expiredMeetings(meetings, settings.retentionDays);
    if (!doomed.length) return;
    if (
      !confirm(
        `DELETE ${doomed.length} MEETING${doomed.length === 1 ? "" : "S"} OLDER THAN THE RETENTION WINDOW? THIS CANNOT BE UNDONE.`
      )
    ) {
      return;
    }
    const ids = new Set(doomed.map((m) => m.id));
    for (const m of doomed) {
      if (m.audioUrl) URL.revokeObjectURL(m.audioUrl);
    }
    setMeetings((prev) => prev.filter((m) => !ids.has(m.id)));
    if (selectedMeetingId && ids.has(selectedMeetingId)) {
      setSelectedMeetingId(null);
      setView("landing");
    }
  };

  const handleExport = (format: "json" | "markdown") => {
    if (format === "json") {
      downloadFile(exportFilename("json"), toJson(meetings, speakers), "application/json");
    } else {
      downloadFile(exportFilename("md"), toMarkdown(meetings, speakers), "text/markdown");
    }
  };

  const handleClearArchive = () => {
    if (confirm("DELETE EVERY MEETING AND RESTORE THE SAMPLE ARCHIVE? THIS CANNOT BE UNDONE.")) {
      setMeetings(MOCK_MEETINGS);
      setPeople(MOCK_USERS);
      setVoices(INITIAL_VOICE_DIRECTORY);
      setSelectedMeetingId(null);
      setView("landing");
    }
  };

  // Full-screen views always open at the top - instantly, since easing a scroll
  // the user did not ask for reads as the new page arriving late.
  useEffect(() => {
    if (view !== "landing") scrollTo(0, { immediate: true });
  }, [view, scrollTo]);

  // Underline whichever section is currently under the nav.
  useEffect(() => {
    if (view !== "landing") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id as SectionId);
      },
      // Band just below the sticky nav, so a section counts as "active"
      // once its top passes under it.
      { rootMargin: "-68px 0px -55% 0px", threshold: 0 }
    );

    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [view]);

  const leaveFullScreen = () => {
    setView("landing");
    const target = returnSection.current;
    requestAnimationFrame(() => scrollToSection(target));
  };

  // One bar, two hosts: the landing page and every full-screen view. The pills
  // carry hrefs so they are real links, but this app navigates by state, so
  // onItemClick cancels the jump and moves the section itself.
  const navBar = (activeTab: string) => (
    <PillNav
      logo="/logo.svg"
      logoAlt="Meetwise AI"
      items={NAV_ITEMS}
      activeHref={`#${activeTab}`}
      onItemClick={(item) => handleNavigate(item.href.slice(1))}
      action={{ label: "Upload Recording", onClick: handleStartUpload }}
      account={{
        name: account.name,
        email: user.email ?? "",
        onSignOut: handleSignOut,
      }}
      ease="power2.easeOut"
      baseColor="var(--color-ember-accent)"
      pillColor="var(--color-pill-rest)"
      pillTextColor="var(--color-warm-cream)"
      hoveredPillTextColor="var(--color-walnut-shadow)"
      theme="dark"
      initialLoadAnimation={false}
    />
  );

  // Every full-screen view wears the same shell: one nav, one main column.
  const fullScreen = (activeTab: string, children: ReactNode) => (
    <div className="min-h-screen bg-walnut-shadow text-warm-cream flex flex-col relative font-sans">
      {navBar(activeTab)}
      <main className="flex-1 w-full flex flex-col pt-12">{children}</main>
    </div>
  );

  if (view === "live") {
    return <LiveCapture onSaveMeeting={handleSaveMeeting} onCancel={leaveFullScreen} />;
  }

  if (view === "upload") {
    return fullScreen(
      "meetings",
      <Upload
        onSubmit={handleUploadSubmit}
        onCancel={leaveFullScreen}
        onStartLiveCapture={handleStartCapture}
      />
    );
  }

  if (view === "processing" && currentMeeting) {
    return fullScreen(
      "meetings",
      <Processing
        meeting={currentMeeting}
        settings={settings}
        onBack={handleBackFromDetail}
        onOpenMeeting={(id) => {
          setSelectedMeetingId(id);
          setView("detail");
        }}
        onRetry={handleRetryProcessing}
        onDiscard={handleDiscardUpload}
      />
    );
  }

  if (view === "detail" && currentMeeting) {
    return fullScreen(
      "meetings",
      <MeetingDetail
        meeting={currentMeeting}
        meetings={meetings}
        onBack={handleBackFromDetail}
        initialSeekMs={pendingSeekMs}
        speakers={speakers}
        onNameVoice={handleNameVoice}
      />
    );
  }

  return (
    <div className="min-h-screen bg-walnut-shadow text-warm-cream flex flex-col relative font-sans">
      {/* One nav for the whole page - sticks while every section scrolls under it */}
      {navBar(activeSection)}

      <main className="flex-1 w-full flex flex-col">
        {/* 01 - Hero + recent entries */}
        <section id="home" className="landing-section">
          <Home
            meetings={meetings}
            onSelectMeeting={handleSelectMeeting}
            onStartUpload={handleStartUpload}
            onBrowseAll={() => handleNavigate("meetings")}
            openCommitments={openCommitments}
            onViewCommitments={() => handleNavigate("owed")}
          />
        </section>

        {/* 02 - What you owe, across every meeting */}
        <section id="owed" className="landing-section">
          <Commitments
            meetings={meetings}
            speakers={speakers}
            account={account}
            onSelectMeeting={handleSelectMeeting}
            onToggleActionItem={handleToggleActionItem}
          />
        </section>

        {/* 03 - Archive. Cream band: the colour shift is the separator here,
            so no dashed rule on either side. */}
        <section id="meetings" className="landing-section landing-section--cream">
          <Archive
            meetings={meetings}
            onSelectMeeting={handleSelectMeeting}
            speakers={speakers}
          />
        </section>

        {/* 04 - Ask */}
        <section id="ask" className="landing-section">
          <Ask meetings={meetings} onSelectMeeting={handleSelectMeeting} speakers={speakers} />
        </section>

        <div className="landing-rule" />

        {/* 05 - Settings */}
        <section id="settings" className="landing-section">
          <Settings
            meetings={meetings}
            settings={settings}
            onChangeSettings={handleChangeSettings}
            account={account}
            onRenameAccount={handleRenameAccount}
            voices={voiceRoster}
            onNameVoice={handleNameVoice}
            onForgetVoice={handleForgetVoice}
            onPurgeExpired={handlePurgeExpired}
            onExport={handleExport}
            onClearArchive={handleClearArchive}
            accountEmail={user.email ?? ""}
            onSignOut={handleSignOut}
          />
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="py-6 border-t border-cork-border/20 px-6 md:px-12 flex justify-between items-center text-[10px] tracking-[0.2em] text-driftwood uppercase">
        <span>MEMORIES CAPTURED</span>
        <span className="text-ember-accent">BUILT FOR EDITORIAL PRODUCTIVITY</span>
      </footer>
    </div>
  );
}

/**
 * Nothing below this renders without a session.
 *
 * The gate sits in its own component rather than at the top of `AppShell`
 * because `AppShell` is all hooks - an early return above them is the one thing
 * React does not allow. Keeping it here also means the whole archive unmounts
 * on sign-out, so no previous user's state can survive into the next session.
 */
function Root() {
  const { session, user, loading } = useSession();

  if (!SUPABASE_CONFIGURED) return <SupabaseNotConfigured />;

  // Held rather than shown as the sign-in page: a returning user has a session
  // in local storage, and flashing the login screen before reading it is a lie
  // about whether they are signed in.
  if (loading) {
    return (
      <div className="min-h-screen bg-walnut-shadow flex items-center justify-center">
        <span className="text-[10px] font-medium tracking-[0.25em] text-driftwood uppercase">
          OPENING YOUR ARCHIVE…
        </span>
      </div>
    );
  }

  if (!session || !user) return <Auth />;

  return <AppShell user={user} />;
}

// reducedMotion="user" makes every motion component below respect the
// OS "reduce motion" setting without each one having to check.
function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Root />
    </MotionConfig>
  );
}

export default App;
