import React from "react";
import { ShieldCheck, HardDrive, Key, Gear } from "@phosphor-icons/react";

interface SettingsProps {
  meetingCount: number;
  onClearDb: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ meetingCount, onClearDb }) => (
    <div className="px-6 md:px-12 max-w-[800px] mx-auto flex flex-col gap-12 w-full">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <span className="text-[12px] font-medium tracking-[0.2em] text-[#dc5000] uppercase">
          SYSTEM PARAMETERS
        </span>
        <h2 className="text-display-custom text-[#ffedd7] leading-[0.9] tracking-normal select-none">
          ENCLAVE
          <br />
          SETTINGS
        </h2>
      </header>

      <div className="divider-dashed" />

      {/* Config Panels */}
      <div className="flex flex-col gap-9">
        
        {/* Database Status */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-[#40372e] pb-2">
            <HardDrive size={16} className="text-[#6c5f51]" />
            <h2 className="text-[14px] font-medium tracking-[0.15em] text-[#ffedd7] uppercase">
              LOCAL STORAGE ENCLAVE
            </h2>
          </div>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-[#ffedd7]">INDEXED LOGS</span>
              <span className="text-[11px] text-[#6c5f51] uppercase">
                Currently caching {meetingCount} active meeting memories in device storage
              </span>
            </div>
            <button
              onClick={onClearDb}
              className="text-[11px] font-medium tracking-[0.15em] text-[#dc5000] hover:underline uppercase text-left cursor-pointer active:scale-95"
            >
              RESET CACHE
            </button>
          </div>
        </div>

        {/* Encryption Status */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-[#40372e] pb-2">
            <ShieldCheck size={16} className="text-[#6c5f51]" />
            <h2 className="text-[14px] font-medium tracking-[0.15em] text-[#ffedd7] uppercase">
              SECURITY & INTEGRITY
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
            <div className="flex items-start gap-3 border border-[#40372e] p-4 rounded-[12px] bg-[#382416]/5">
              <Key size={20} className="text-[#dc5000] mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[#ffedd7] uppercase">AES-GCM-256 ACCREDITATION</span>
                <span className="text-[11px] text-[#6c5f51] leading-relaxed uppercase">
                  TRANSIT DATA ENCRYPTED BEFORE DISK PERSISTENCE. KEY ROTATES EVERY 24 HOURS AUTOMATICALLY.
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3 border border-[#40372e] p-4 rounded-[12px] bg-[#382416]/5">
              <Gear size={20} className="text-[#6c5f51] mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[#ffedd7] uppercase">PROCESSING MODE</span>
                <span className="text-[11px] text-[#6c5f51] leading-relaxed uppercase">
                  ZERO EXTERNAL CLOUD TELEMETRY. TRANSCRIBING COMPLETED ON DEVICE LOCAL PIPELINES.
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="divider-dashed" />

      {/* Legal compliance footer styled in micro-type fallback per design constraints */}
      <footer className="flex flex-col gap-3 items-start opacity-40 font-mono">
        <span className="text-[8px] tracking-[0.1em] text-[#ffedd7] font-medium uppercase font-mono">
          * RECALL CLIENT SYSTEM CONFIG v1.0.8-ALPHA
        </span>
        <span className="text-[8px] tracking-[0.1em] text-[#ffedd7] uppercase font-mono">
          * POWERED BY LOCAL WEBAUDIO CONTEXTS AND CHROMATIC STACKS. LICENSE RESTRICTIONS APPLY.
        </span>
      </footer>

    </div>
);
