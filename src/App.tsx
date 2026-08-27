import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_MEETINGS } from "./mockData";
import type { Meeting } from "./mockData";
import { TopNav } from "./components/TopNav";
import { Home } from "./components/Home";
import { LiveCapture } from "./components/LiveCapture";
import { MeetingDetail } from "./components/MeetingDetail";
import { Ask } from "./components/Ask";
import { Archive } from "./components/Archive";
import { Settings } from "./components/Settings";
import { MotionConfig } from "motion/react";

/** Landing sections, in the order they appear down the page. */
const SECTIONS = ["home", "meetings", "ask", "settings"] as const;
type SectionId = (typeof SECTIONS)[number];

/** Full-screen views that replace the landing page entirely. */
type View = "landing" | "live" | "detail";

function AppShell() {
  const [meetings, setMeetings] = useState<Meeting[]>(MOCK_MEETINGS);
  const [view, setView] = useState<View>("landing");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("home");

  // Where to scroll back to when returning from a full-screen view.
  const returnSection = useRef<SectionId>("home");

  const currentMeeting = meetings.find((m) => m.id === selectedMeetingId);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, []);

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

  const handleSelectMeeting = (id: string) => {
    returnSection.current = activeSection;
    setSelectedMeetingId(id);
    setView("detail");
  };

  const handleBackFromDetail = () => {
    setSelectedMeetingId(null);
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

  const handleClearDb = () => {
    if (confirm("ARE YOU SURE YOU WANT TO CLEAR THE LOCAL ENCLAVE DATABASE? THIS CANNOT BE UNDONE.")) {
      setMeetings(MOCK_MEETINGS);
      alert("LOCAL CACHE CLEARED. DEFAULT MOCK DATA RESTORED.");
    }
  };

  // Full-screen views always open at the top.
  useEffect(() => {
    if (view !== "landing") window.scrollTo(0, 0);
  }, [view]);

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

  if (view === "live") {
    return (
      <LiveCapture
        onSaveMeeting={handleSaveMeeting}
        onCancel={() => {
          setView("landing");
          const target = returnSection.current;
          requestAnimationFrame(() => scrollToSection(target));
        }}
      />
    );
  }

  if (view === "detail" && currentMeeting) {
    return (
      <div className="min-h-screen bg-[#100904] text-[#ffedd7] flex flex-col relative font-sans">
        <TopNav
          activeTab="meetings"
          onNavigate={handleNavigate}
          onStartCapture={handleStartCapture}
        />
        <main className="flex-1 w-full flex flex-col pt-12">
          <MeetingDetail meeting={currentMeeting} onBack={handleBackFromDetail} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#100904] text-[#ffedd7] flex flex-col relative font-sans">
      {/* One nav for the whole page - sticks while every section scrolls under it */}
      <TopNav
        activeTab={activeSection}
        onNavigate={handleNavigate}
        onStartCapture={handleStartCapture}
      />

      <main className="flex-1 w-full flex flex-col">
        {/* 01 - Hero + recent entries */}
        <section id="home" className="landing-section">
          <Home
            meetings={meetings}
            onSelectMeeting={handleSelectMeeting}
            onStartCapture={handleStartCapture}
            onBrowseAll={() => handleNavigate("meetings")}
          />
        </section>

        {/* 02 - Archive. Cream band: the colour shift is the separator here,
            so no dashed rule on either side. */}
        <section id="meetings" className="landing-section landing-section--cream">
          <Archive meetings={meetings} onSelectMeeting={handleSelectMeeting} />
        </section>

        {/* 03 - Ask */}
        <section id="ask" className="landing-section">
          <Ask onSelectMeeting={handleSelectMeeting} />
        </section>

        <div className="landing-rule" />

        {/* 04 - Settings */}
        <section id="settings" className="landing-section">
          <Settings meetingCount={meetings.length} onClearDb={handleClearDb} />
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="py-6 border-t border-[#40372e]/20 px-6 md:px-12 flex justify-between items-center text-[10px] tracking-[0.2em] text-[#6c5f51] uppercase">
        <span>MEMORIES CAPTURED</span>
        <span className="text-[#dc5000]">BUILT FOR EDITORIAL PRODUCTIVITY</span>
      </footer>
    </div>
  );
}

// reducedMotion="user" makes every motion component below respect the
// OS "reduce motion" setting without each one having to check.
function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppShell />
    </MotionConfig>
  );
}

export default App;
