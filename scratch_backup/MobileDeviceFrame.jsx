import React from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';

export default function MobileDeviceFrame({ children }) {
  // Current simulated time
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative w-full h-full md:w-auto md:h-auto mx-auto my-0 md:my-6 flex flex-col items-center select-none animate-in fade-in duration-300">
      {/* Device Exterior / Bezel Chassis (Responsive: borderless 100% on mobile, simulated mockup on desktop) */}
      <div className="relative w-full h-full min-h-screen md:min-h-0 md:w-[390px] md:h-[810px] bg-slate-950 md:bg-slate-900 rounded-none md:rounded-[50px] p-0 md:p-3 md:shadow-2xl md:shadow-indigo-950/50 md:ring-1 md:ring-slate-700/80 md:border-4 md:border-slate-800">
        
        {/* Hardware side button accents (Desktop only) */}
        <div className="hidden md:block absolute -left-[7px] top-28 w-[3px] h-10 bg-slate-700 rounded-l-md" /> {/* Volume Up */}
        <div className="hidden md:block absolute -left-[7px] top-42 w-[3px] h-10 bg-slate-700 rounded-l-md" /> {/* Volume Down */}
        <div className="hidden md:block absolute -right-[7px] top-32 w-[3px] h-14 bg-slate-700 rounded-r-md" /> {/* Power Button */}

        {/* Screen Bezel & Display Area */}
        <div className="relative w-full h-full bg-slate-950 rounded-none md:rounded-[40px] overflow-hidden flex flex-col md:border md:border-slate-800/80 md:shadow-inner">
          
          {/* Status Bar & Dynamic Island (Desktop only) */}
          <div className="hidden md:flex relative z-30 items-center justify-between px-6 pt-3 pb-1 bg-slate-950/90 backdrop-blur-md text-xs font-semibold text-slate-300">
            <span className="text-[13px] tracking-tight font-medium text-slate-200">
              {currentTime}
            </span>

            {/* Dynamic Island / Camera Notch */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2 h-6 w-28 bg-black rounded-full flex items-center justify-between px-2.5 border border-slate-800 shadow-md">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900 ring-1 ring-indigo-950/80 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-indigo-500/70" />
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] text-slate-400 font-mono tracking-tighter">PM:2525</span>
              </div>
            </div>

            {/* Signal & Battery Icons */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <Signal className="w-3.5 h-3.5" />
              <Wifi className="w-3.5 h-3.5" />
              <div className="flex items-center gap-0.5">
                <Battery className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Simulated App Screen Viewport */}
          <div className="relative flex-1 overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col">
            {children}
          </div>

          {/* Bottom Home Indicator Bar (Desktop only) */}
          <div className="hidden md:flex relative z-30 h-6 bg-slate-950/90 backdrop-blur-md items-center justify-center">
            <div className="w-32 h-1 bg-slate-600 rounded-full" />
          </div>
        </div>
      </div>

      {/* Frame Subtitle Caption (Desktop only) */}
      <div className="hidden md:flex mt-3 items-center gap-2 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
        <span>Mobile Screen Simulation (390 × 810)</span>
      </div>
    </div>
  );
}
