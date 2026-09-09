import type { Meeting } from "./mockData";
import { ownerName } from "./mockData";
import type { SpeakerResolver } from "./speakers";
import { formatMeetingDate, formatOffsetClock, formatWhen } from "./datetime";

/**
 * Getting the archive back out.
 *
 * Export resolves everything the app resolves at render time - speaker slots
 * into names, offsets into clock readings - so the file is readable on its own
 * rather than being a dump of internal ids.
 */

function exportedMeeting(meeting: Meeting, speakers: SpeakerResolver) {
  return {
    id: meeting.id,
    title: meeting.title,
    startedAt: meeting.startedAt,
    durationMs: meeting.durationMs,
    status: meeting.status,
    owner: ownerName(meeting.ownerId),
    participants: speakers.participants(meeting),
    tags: meeting.tags,
    gist: meeting.gist,
    summary: meeting.summary,
    topics: meeting.topics,
    decisions: meeting.decisions,
    actionItems: meeting.actionItems.map((a) => ({
      item: a.item,
      owner: speakers.nameOf(meeting, a.speakerId),
    })),
    quotes: meeting.quotes.map((q) => ({
      quote: q.quote,
      speaker: speakers.nameOf(meeting, q.speakerId),
      startMs: q.startMs,
    })),
    transcript: meeting.transcript.map((line) => ({
      speaker: speakers.nameOf(meeting, line.speakerId),
      text: line.text,
      startMs: line.startMs,
      endMs: line.endMs,
    })),
  };
}

export function toJson(meetings: Meeting[], speakers: SpeakerResolver): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      meetingCount: meetings.length,
      meetings: meetings.map((m) => exportedMeeting(m, speakers)),
    },
    null,
    2
  );
}

export function toMarkdown(meetings: Meeting[], speakers: SpeakerResolver): string {
  const out: string[] = [`# Meeting archive`, ``, `Exported ${new Date().toISOString()}`, ``];

  for (const meeting of meetings) {
    out.push(`---`, ``, `## ${meeting.title}`, ``);
    out.push(
      `${formatMeetingDate(meeting.startedAt)} · ${formatWhen(meeting.startedAt, meeting.durationMs)}`,
      ``
    );
    out.push(`**Participants:** ${speakers.participants(meeting).join(", ") || "—"}`, ``);
    if (meeting.tags.length) out.push(`**Tags:** ${meeting.tags.join(", ")}`, ``);

    if (meeting.summary) out.push(`### Summary`, ``, meeting.summary, ``);

    if (meeting.topics.length) {
      out.push(`### Topics`, ``);
      for (const t of meeting.topics) out.push(`- **${t.title}** — ${t.details}`);
      out.push(``);
    }

    if (meeting.decisions.length) {
      out.push(`### Decisions`, ``);
      for (const d of meeting.decisions) out.push(`- ${d}`);
      out.push(``);
    }

    if (meeting.actionItems.length) {
      out.push(`### Action items`, ``);
      for (const a of meeting.actionItems) {
        out.push(`- ${a.item} — *${speakers.nameOf(meeting, a.speakerId)}*`);
      }
      out.push(``);
    }

    if (meeting.quotes.length) {
      out.push(`### Quotes`, ``);
      for (const q of meeting.quotes) {
        out.push(
          `> ${q.quote}`,
          `>`,
          `> — ${speakers.nameOf(meeting, q.speakerId)}, ${formatOffsetClock(q.startMs)}`,
          ``
        );
      }
    }

    if (meeting.transcript.length) {
      out.push(`### Transcript`, ``);
      for (const line of meeting.transcript) {
        out.push(
          `**${formatOffsetClock(line.startMs)} ${speakers.nameOf(meeting, line.speakerId)}:** ${line.text}`,
          ``
        );
      }
    }
  }

  return out.join("\n");
}

/** Hands the file to the browser. */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `meetwise-archive-2026-08-31.json` */
export function exportFilename(extension: string): string {
  return `meetwise-archive-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
