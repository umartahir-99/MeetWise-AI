import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meeting } from "./mockData";
import { createSpeakerResolver } from "./speakers";
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
import { useSmoothScroll } from "./useSmoothScroll";
import { isReadable } from "./processing";
import type { UploadDescription } from "./processing";
import { MotionConfig } from "motion/react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, supabase } from "./lib/supabase";
import { useSession } from "./useSession";
import { Auth, SupabaseNotConfigured } from "./components/Auth";
import {
  PLACEHOLDER_NAME,
  loadProfile,
  loadSettings,
  renameAccount,
  saveSettings,
} from "./api/settings";
import { useArchive } from "./useArchive";
import {
  attachRecording,
  createMeeting,
  deleteMeetings,
  markFailed,
  setActionItemDone,
  startProcessing,
  sweepExpired,
} from "./api/meetings";
import {
  SIGNED_URL_REFRESH_MS,
  recordingPath,
  removeRecording,
  signedRecordingUrl,
  uploadRecording,
} from "./api/storage";
import { forgetVoice, nameVoice } from "./api/voices";

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
  // The archive, and the directory that names its voices. Both come from the
  // database now; nothing below this line knows that, which is the point.
  const {
    meetings,
    people,
    voices,
    loading: archiveLoading,
    error: archiveError,
    refresh,
    patch: setMeetings,
    setPeople,
    setVoices,
  } = useArchive(user.id);
  const [view, setView] = useState<View>("landing");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  // Set when a citation names a moment, so the detail view opens on it.
  const [pendingSeekMs, setPendingSeekMs] = useState<number | undefined>(undefined);

  // Which models run, in what language, and how long anything is kept. The
  // defaults are only what is shown until the row arrives from the database -
  // they are the same values as the column defaults, so the swap is invisible.
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // The account name, which lives in `profiles` rather than in the archive.
  // Null while it is still being fetched, so the fallback below can tell that
  // apart from a name that genuinely is the seeded one.
  const [profileName, setProfileName] = useState<string | null>(null);

  // Memoised so the fallback is not a fresh object on every render - `account`
  // is a prop on two sections, and a new identity each time defeats any
  // memoisation below it.
  //
  // Both halves are the signed-in user's now: the id is theirs, so "mine" in
  // the Owed list means the person whose voice resolves to this account, and
  // the name comes from `profiles`.
  const account = useMemo(
    () => ({ id: user.id, name: profileName ?? PLACEHOLDER_NAME }),
    [user.id, profileName]
  );
  // The account is folded into the directory, because the person who owns a
  // recording is a person too — and their name lives in `profiles` rather than
  // in `people`. Without this, a meeting's byline resolves to a raw uuid, and
  // so does the owner field in an export.
  const speakers = useMemo(
    () => createSpeakerResolver({ ...people, [user.id]: account }, voices),
    [people, voices, user.id, account]
  );

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

    // The bucket is private, so a recording has no standing address. One is
    // minted as the meeting opens and lasts an hour - long enough to listen,
    // short enough that a leaked link is not a leaked archive. The player
    // narrates until it arrives, and forever if it never does.
    if (target.audioPath && !target.audioUrl) {
      signedRecordingUrl(target.audioPath)
        .then((url) =>
          setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, audioUrl: url } : m)))
        )
        .catch((failure) => console.error("Could not sign the recording", failure));
    }
  };

  const handleStartUpload = () => {
    returnSection.current = activeSection;
    setView("upload");
  };

  /**
   * A recording enters the pipeline.
   *
   * The row is inserted first and the status screen opens on it straight away,
   * so the wait is watched rather than endured - and so a refresh mid-upload
   * finds a meeting in the archive rather than nothing. Then the file goes up,
   * the row learns where it landed, and the pipeline is told to start. Any
   * step that fails writes a reason the status screen can show, and leaves the
   * row in place so a retry does not begin from zero.
   */
  const handleUploadSubmit = async (description: UploadDescription, file: File) => {
    let created: Meeting;
    try {
      created = await createMeeting(user.id, description);
    } catch (failure) {
      console.error("Could not create the meeting", failure);
      alert("COULD NOT START THE UPLOAD. CHECK YOUR CONNECTION AND TRY AGAIN.");
      return;
    }

    setMeetings((prev) => [created, ...prev]);
    setSelectedMeetingId(created.id);
    setView("processing");

    const path = recordingPath(user.id, created.id, file.name);
    try {
      await uploadRecording(path, file);
      await attachRecording(created.id, path);
      setMeetings((prev) =>
        prev.map((m) => (m.id === created.id ? { ...m, audioPath: path } : m))
      );
      await startProcessing(created.id);
    } catch (failure) {
      const reason =
        failure instanceof Error && /size|too large|exceeded/i.test(failure.message)
          ? "The file is larger than storage accepts. Export the meeting as audio only and try again."
          : failure instanceof Error
            ? failure.message
            : "The upload did not complete.";
      console.error("Upload failed", failure);
      // Written to the row rather than only shown, so the reason survives a
      // refresh and the Realtime subscription paints it wherever it is seen.
      markFailed(created.id, "uploaded", reason).catch(() => {});
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === created.id
            ? { ...m, status: "failed" as const, failedStage: "uploaded" as const, failureReason: reason }
            : m
        )
      );
    }
  };

  /**
   * Re-queues a failed job. The retry starts from the queue, not the upload:
   * the file is still in storage, which is why the status screen can promise
   * that retrying reuses it. A job that failed *during* upload has no file to
   * reuse, so that one is sent back through the upload screen instead.
   */
  const handleRetryProcessing = (id: string) => {
    const target = meetings.find((m) => m.id === id);
    if (!target) return;

    if (!target.audioPath) {
      handleDiscardUpload(id);
      handleStartUpload();
      return;
    }

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
    startProcessing(id).catch((failure) => {
      console.error("Could not restart processing", failure);
      const reason = failure instanceof Error ? failure.message : "Could not restart processing.";
      markFailed(id, "queued", reason).catch(() => {});
    });
  };

  /** Throw the job away: the row, and the file it put in storage. */
  const handleDiscardUpload = (id: string) => {
    const doomed = meetings.find((m) => m.id === id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    setSelectedMeetingId(null);
    setView("landing");
    const target = returnSection.current;
    requestAnimationFrame(() => scrollToSection(target));

    // Row first, then the file. If the row delete fails the archive reloads
    // and the job reappears; a file left behind by a failed second step is
    // orphaned storage rather than a visible bug, and the nightly sweep at M5
    // is for exactly that.
    deleteMeetings([id])
      .then(() => (doomed?.audioPath ? removeRecording(doomed.audioPath) : undefined))
      .catch((failure) => {
        console.error("Could not discard the upload", failure);
        void refresh();
      });
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

    // Applied locally against the person we already know by that name, so the
    // rename lands on screen in the same frame it was typed. When the name is
    // new there is no id to use yet, and the reload below fills it in.
    const existing = Object.values(people).find(
      (person) => person.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) setVoices((prev) => ({ ...prev, [voicePrint]: existing.id }));

    nameVoice(user.id, voicePrint, name)
      .then(({ personId, people: nextPeople }) => {
        setPeople(nextPeople);
        setVoices((prev) => ({ ...prev, [voicePrint]: personId }));
      })
      .catch((failure) => console.error("Could not save that name", failure));
  };

  /** Unlink a voice from its person. It goes back to being "SPEAKER n". */
  const handleForgetVoice = (voicePrint: string) => {
    setVoices((prev) => {
      const next = { ...prev };
      delete next[voicePrint];
      return next;
    });
    forgetVoice(user.id, voicePrint).catch((failure) =>
      console.error("Could not forget that voice", failure)
    );
  };

  /**
   * Tick an action item off, or put it back.
   *
   * Addressed by row id rather than by position in an array: the item lives on
   * its meeting, and the Owed list is a projection over the archive rather than
   * a second copy of it, so an index there means nothing once anything sorts.
   */
  const handleToggleActionItem = (actionItemId: string) => {
    let nextDone = false;

    setMeetings((prev) =>
      prev.map((meeting) => {
        if (!meeting.actionItems.some((a) => a.id === actionItemId)) return meeting;
        return {
          ...meeting,
          actionItems: meeting.actionItems.map((a) => {
            if (a.id !== actionItemId) return a;
            nextDone = !a.done;
            return { ...a, done: nextDone };
          }),
        };
      })
    );

    setActionItemDone(actionItemId, nextDone).catch((failure) =>
      console.error("Could not save that", failure)
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
    renameAccount(user.id, name).catch((failure) =>
      console.error("Could not save your name", failure)
    );
  };

  /**
   * Retention, applied now rather than tonight.
   *
   * The same edge function the nightly scheduler calls, scoped to this user
   * by their token - so the button and the schedule cannot disagree about
   * what "expired" means, and neither can forget the stored file. The archive
   * is re-read afterwards rather than patched, because the server decided
   * what went.
   */
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
    for (const m of doomed) {
      if (m.audioUrl) URL.revokeObjectURL(m.audioUrl);
    }
    const ids = new Set(doomed.map((m) => m.id));
    if (selectedMeetingId && ids.has(selectedMeetingId)) {
      setSelectedMeetingId(null);
      setView("landing");
    }
    sweepExpired()
      .catch((failure) => console.error("Could not delete expired meetings", failure))
      .finally(() => void refresh());
  };

  const handleExport = (format: "json" | "markdown") => {
    if (format === "json") {
      downloadFile(exportFilename("json"), toJson(meetings, speakers), "application/json");
    } else {
      downloadFile(exportFilename("md"), toMarkdown(meetings, speakers), "text/markdown");
    }
  };

  /**
   * Delete every meeting.
   *
   * People and voices are left standing. The names you have taught the archive
   * are worth more than any one recording, and re-teaching them is the tedious
   * part - so emptying the archive does not mean forgetting who everybody is.
   */
  const handleClearArchive = () => {
    if (!confirm("DELETE EVERY MEETING? THIS CANNOT BE UNDONE.")) return;

    const ids = meetings.map((m) => m.id);
    for (const m of meetings) {
      if (m.audioUrl) URL.revokeObjectURL(m.audioUrl);
    }
    setMeetings([]);
    setSelectedMeetingId(null);
    setView("landing");

    // Files first, then rows - the order that cannot orphan a recording. A
    // row deleted from the database says nothing to the bucket.
    const paths = meetings.map((m) => m.audioPath).filter((p): p is string => Boolean(p));
    Promise.all(paths.map(removeRecording))
      .then(() => deleteMeetings(ids))
      .catch((failure) => {
        console.error("Could not clear the archive", failure);
        void refresh();
      });
  };

  // A playback URL lasts an hour. Somebody listening to a long meeting past
  // that mark would hit a dead link mid-play, so while a meeting is open its
  // URL is re-signed a few minutes before it expires. The player never sees
  // the seam: a new `src` on an `<audio>` that is already playing at the same
  // offset is the one transition it handles on its own.
  const openMeetingId = currentMeeting?.id;
  const openAudioPath = currentMeeting?.audioPath;
  useEffect(() => {
    if (view !== "detail" || !openMeetingId || !openAudioPath) return;

    const timer = setInterval(() => {
      signedRecordingUrl(openAudioPath)
        .then((url) =>
          setMeetings((prev) =>
            prev.map((m) => (m.id === openMeetingId ? { ...m, audioUrl: url } : m))
          )
        )
        .catch((failure) => console.error("Could not refresh the recording link", failure));
    }, SIGNED_URL_REFRESH_MS);

    return () => clearInterval(timer);
  }, [view, openMeetingId, openAudioPath, setMeetings]);

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
        // The seeded "You" is a placeholder, not a name; the nav is the one
        // place it reads wrong. It yields to whatever the person gave at
        // sign-up (their own auth metadata), and failing that to the email
        // handle, until the profile itself is named. Nothing here is fixed:
        // a different sign-in remounts the shell and reads that user's rows.
        name:
          profileName === PLACEHOLDER_NAME
            ? String(user.user_metadata?.display_name ?? "")
            : profileName ?? "",
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

  // The archive arrives a moment after the session does. Holding the sections
  // until it lands avoids the worse alternative: five empty states flashing
  // "nothing here yet" at somebody who has twenty meetings.
  if (archiveLoading) {
    return fullScreen(
      activeSection,
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[10px] font-medium tracking-[0.25em] text-driftwood uppercase">
          READING YOUR ARCHIVE…
        </span>
      </div>
    );
  }

  // Only when there is nothing to fall back on. A failed refresh with meetings
  // already on screen keeps them: stale is better than blank, and the error is
  // in the console for whoever is debugging it.
  if (archiveError && !meetings.length) {
    return fullScreen(
      activeSection,
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-[12px] font-medium tracking-[0.2em] text-ember-accent uppercase">
          COULD NOT READ YOUR ARCHIVE
        </span>
        <p className="text-[13px] text-warm-cream/70 max-w-[46ch] leading-[1.6]">
          {archiveError}
        </p>
        <button type="button" className="voice-ghost" onClick={() => void refresh()}>
          TRY AGAIN
        </button>
      </div>
    );
  }

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

  // Keyed on the account: a different user gets a different component
  // instance, so no state from the last session can survive into the next one
  // — and the archive starts from its loading state rather than from theirs.
  return <AppShell key={user.id} user={user} />;
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
