<#
.SYNOPSIS
  Generates a short two-voice meeting recording for verify-m4.mjs.

.DESCRIPTION
  Uses the Windows speech synthesiser with two different voices, so
  diarization has two genuinely distinct speakers to separate. The script is
  written so the analysis has something real to find: a decision, three action
  items with clear owners, and a name mentioned but not present.

  About 78 seconds, 2.4 MB, 16 kHz mono. Not committed - regenerate it.

.EXAMPLE
  .\scripts\make-test-recording.ps1 -Out .\test-meeting.wav
  node scripts/verify-m4.mjs <email> <password> .\test-meeting.wav
#>
param(
  [string]$Out = "$PSScriptRoot\..\test-meeting.wav"
)

Add-Type -AssemblyName System.Speech

$voices = (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() |
  ForEach-Object { $_.VoiceInfo.Name }
if ($voices.Count -lt 2) {
  Write-Error "Two installed voices are needed so there are two speakers to separate. Found: $($voices -join ', ')"
  exit 1
}
$a = $voices[0]
$b = $voices[1]

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$s.SetOutputToWaveFile($Out, $fmt)
$s.Rate = 0

$lines = @(
  @($a, "Okay, let's get started. This is the weekly sync on the mobile app launch. The main thing today is whether we ship the beta on Friday or push to next Tuesday."),
  @($b, "I think we should push to Tuesday. The crash rate on Android is still at two percent, and we said the threshold was under one."),
  @($a, "That's fair. What's driving the crashes?"),
  @($b, "It's the image cache. When the cache fills up on older devices, the app runs out of memory. I have a fix but it needs another round of testing."),
  @($a, "Alright. Let's decide: we push the beta to Tuesday. You own the image cache fix and get it into testing by Thursday. I'll update the release notes and tell the marketing team about the new date."),
  @($b, "Sounds good. One more thing. We still need someone to write the onboarding copy. Should I take that too?"),
  @($a, "No, you've got enough. I'll ask Priya to draft the onboarding copy. If she can't, it comes back to me."),
  @($b, "Perfect. Then the plan is: cache fix by Thursday, beta on Tuesday, and the onboarding copy from Priya."),
  @($a, "That's the plan. Thanks everyone.")
)

foreach ($l in $lines) {
  $s.SelectVoice($l[0])
  $s.Speak($l[1])
  $s.Speak(" ")
}
$s.SetOutputToNull()
$s.Dispose()

$f = Get-Item $Out
"wrote $($f.FullName) ($([math]::Round($f.Length / 1KB)) KB) with voices: $a, $b"
