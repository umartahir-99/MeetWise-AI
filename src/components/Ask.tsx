import React, { useState } from "react";
import { MOCK_QUESTIONS, MOCK_MEETINGS } from "../mockData";
import type { Meeting } from "../mockData";
import { ArrowRight, ArrowLeft, Quotes, CalendarBlank } from "@phosphor-icons/react";

interface AskProps {
  onSelectMeeting: (id: string) => void;
}

export const Ask: React.FC<AskProps> = ({ onSelectMeeting }) => {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    answer: string;
    sourceMeetings: string[];
    citations: { speaker: string; text: string; meetingTitle: string; meetingId: string }[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const suggestedQuestions = [
    "What did we decide about the audio pipeline buffer sizes and lag?",
    "When is the Oryzo beta release or final asset delivery?",
    "Who is responsible for auditing card shadows and border radii?",
    "What is the slogan chosen for marketing launch?",
    "How is local data security and privacy handled in Recall?"
  ];

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setQuery(searchQuery);

    // Simulate short network buffer
    setTimeout(() => {
      // 1. Look for predefined questions that match
      const matchingPredefined = MOCK_QUESTIONS.find(
        (q) => q.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
               searchQuery.toLowerCase().includes(q.question.toLowerCase())
      );

      if (matchingPredefined) {
        setSearchResult({
          answer: matchingPredefined.answer,
          sourceMeetings: matchingPredefined.sourceMeetings,
          citations: matchingPredefined.citations
        });
      } else {
        // 2. Build a fallback keyword search engine
        const matches: Meeting[] = [];
        const keyword = searchQuery.toLowerCase();
        
        MOCK_MEETINGS.forEach((meeting) => {
          const inTitle = meeting.title.toLowerCase().includes(keyword);
          const inSummary = meeting.summary.toLowerCase().includes(keyword);
          const inGist = meeting.gist.toLowerCase().includes(keyword);
          const inTopics = meeting.topics.some(t => t.title.toLowerCase().includes(keyword) || t.details.toLowerCase().includes(keyword));
          const inTranscript = meeting.transcript.some(t => t.text.toLowerCase().includes(keyword));

          if (inTitle || inSummary || inGist || inTopics || inTranscript) {
            matches.push(meeting);
          }
        });

        if (matches.length > 0) {
          // Construct a dynamic response citing the first matching meeting
          const primaryMatch = matches[0];
          
          // Try to extract a relevant sentence or fall back to the gist
          const matchedTranscriptLine = primaryMatch.transcript.find(t => t.text.toLowerCase().includes(keyword));
          const citationQuote = matchedTranscriptLine 
            ? { speaker: matchedTranscriptLine.speaker, text: matchedTranscriptLine.text, meetingTitle: primaryMatch.title, meetingId: primaryMatch.id }
            : primaryMatch.quotes.length > 0
              ? { speaker: primaryMatch.quotes[0].speaker, text: primaryMatch.quotes[0].quote, meetingTitle: primaryMatch.title, meetingId: primaryMatch.id }
              : { speaker: primaryMatch.participants[0], text: primaryMatch.gist, meetingTitle: primaryMatch.title, meetingId: primaryMatch.id };

          setSearchResult({
            answer: `I found details in the meeting "${primaryMatch.title}". The conversation focused on: ${primaryMatch.gist}`,
            sourceMeetings: matches.map(m => m.id),
            citations: [citationQuote]
          });
        } else {
          // No match found
          setSearchResult({
            answer: "No specific meeting logs match your query. Try asking about 'buffer sizes', 'Oryzo renders', 'security rotation', or 'marketing tags'.",
            sourceMeetings: [],
            citations: []
          });
        }
      }
      setIsSearching(false);
    }, 600);
  };

  const handleClear = () => {
    setQuery("");
    setSearchResult(null);
  };

  return (
    <div className="px-6 md:px-12 max-w-[1000px] mx-auto flex flex-col gap-12 w-full justify-center">
      
      {/* Back button visible when results are shown */}
      {searchResult && (
        <button
          onClick={handleClear}
          className="flex items-center gap-2 text-[12px] font-medium tracking-[0.2em] text-[#ffedd7] hover:underline cursor-pointer self-start uppercase active:scale-[0.98]"
        >
          <ArrowLeft size={14} />
          ASK ANOTHER QUESTION
        </button>
      )}

      {/* Main Search Panel */}
      <div className="flex flex-col gap-8">
        
        {!searchResult && (
          <header className="flex flex-col gap-4">
            <span className="text-[12px] font-medium tracking-[0.2em] text-[#dc5000] uppercase">
              SEMANTIC RETRIEVAL
            </span>
            <h2 className="text-display-custom text-[#ffedd7] leading-[0.9] tracking-normal select-none">
              ASK YOUR
              <br />
              ARCHIVE
            </h2>
          </header>
        )}

        {/* Underline Input Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(query);
          }}
          className="relative flex items-center border-b border-[#ffedd7] py-3 focus-within:border-[#dc5000] transition-colors"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about your meetings..."
            disabled={isSearching}
            className="w-full bg-transparent text-[#ffedd7] placeholder-[#6c5f51] focus:outline-none pr-12 text-[16px] md:text-[20px] font-sans border-0 font-medium"
          />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="absolute right-0 text-[#ffedd7] hover:text-[#dc5000] disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
          >
            {isSearching ? (
              <span className="animate-spin inline-block w-6 h-6 border-2 border-t-transparent border-[#ffedd7] rounded-full" />
            ) : (
              <ArrowRight size={24} />
            )}
          </button>
        </form>

        {/* Suggestion tags (Only visible when no result is loaded) */}
        {!searchResult && !isSearching && (
          <div className="flex flex-col gap-4 mt-4">
            <span className="text-[11px] font-medium tracking-[0.2em] text-[#6c5f51] uppercase">
              SUGGESTED QUERIES
            </span>
            <div className="flex flex-col gap-2 items-start">
              {suggestedQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSearch(q)}
                  className="text-left text-[12px] font-medium tracking-[0.1em] text-[#ffedd7] hover:text-[#dc5000] transition-colors border-b border-dashed border-[#40372e] py-1 cursor-pointer uppercase"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SEARCH RESULT OVERLAY / INFO CARD */}
      {searchResult && (
        <div className="border border-[#40372e] rounded-[12px] bg-[#382416]/10 p-6 md:p-9 flex flex-col gap-8 animate-fade-in">
          <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-[#dc5000] uppercase font-mono">
            <Quotes size={16} />
            <span>AI RESPONSE ENGINE</span>
          </div>

          {/* 29px mixed-case font for response content */}
          <p className="text-body-custom text-[#ffedd7] leading-[1.26] max-w-[65ch] font-normal font-sans">
            {searchResult.answer}
          </p>

          {searchResult.citations.length > 0 && (
            <>
              <div className="divider-dashed" />
              
              <div className="flex flex-col gap-6">
                <span className="text-[11px] font-medium tracking-[0.2em] text-[#6c5f51] uppercase">
                  CITATIONS & CONTEXT
                </span>

                <div className="flex flex-col gap-4">
                  {searchResult.citations.map((cite, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectMeeting(cite.meetingId)}
                      className="group border border-[#40372e]/50 rounded-[12px] p-5 hover:border-[#ffedd7]/50 hover:bg-[#382416]/20 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#100904]/40"
                    >
                      <div className="flex flex-col gap-1 max-w-[80%]">
                        <span className="text-[10px] font-medium tracking-[0.15em] text-[#dc5000] uppercase font-mono">
                          {cite.speaker} — SPEECH TRANSCRIPT
                        </span>
                        <p className="text-[13px] text-[#ffedd7] italic">
                          "{cite.text}"
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.1em] text-[#6c5f51] group-hover:text-[#ffedd7] uppercase whitespace-nowrap transition-colors mt-2 md:mt-0">
                        <CalendarBlank size={14} />
                        <span>{cite.meetingTitle.split(":")[0]}</span>
                        <ArrowRight size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
};
