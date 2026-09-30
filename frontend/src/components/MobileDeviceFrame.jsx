import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';

export default function MobileDeviceFrame({ children }) {
  const [isMobileScreen, setIsMobileScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Current simulated time for desktop frame mockup
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. On Actual Mobile Viewport (<768px): Full Edge-to-Edge Native Screen (Zero Bezel, Zero Webpage Scroll)
  if (isMobileScreen) {
    return (
      <div className="w-full h-full h-[100dvh] flex flex-col overflow-hidden bg-[#3C3D3C] text-slate-100 select-none pt-[env(safe-area-inset-top,0px)] pb-[max(env(safe-area-inset-bottom),12px)]">
        {children}
      </div>
    );
  }

  // 2. On Desktop Viewports (>=768px): Centered Realistic Smartphone Frame Mockup
  return (
    <div className="relative w-auto h-auto mx-auto my-auto flex flex-col items-center select-none animate-in fade-in duration-300">
      {/* Device Exterior / Bezel Chassis */}
      <div className="relative w-[390px] h-[844px] max-h-[calc(100dvh-2rem)] bg-[#242524] rounded-[50px] p-3 shadow-2xl shadow-black/60 ring-1 ring-[#4E4F4E] border-4 border-[#333433] flex flex-col">
        
        {/* Hardware side button accents (Desktop only) */}
        <div className="absolute -left-[7px] top-28 w-[3px] h-10 bg-[#4E4F4E] rounded-l-md" /> {/* Volume Up */}
        <div className="absolute -left-[7px] top-42 w-[3px] h-10 bg-[#4E4F4E] rounded-l-md" /> {/* Volume Down */}
        <div className="absolute -right-[7px] top-32 w-[3px] h-14 bg-[#4E4F4E] rounded-r-md" /> {/* Power Button */}

        {/* Screen Bezel & Display Area */}
        <div className="relative w-full h-full bg-[#2C2D2C] rounded-[40px] overflow-hidden flex flex-col border border-[#4E4F4E] shadow-inner">
          
          {/* Status Bar & Dynamic Island */}
          <div className="relative z-30 h-11 flex items-center justify-between px-6 bg-[#242524] text-xs font-semibold text-slate-300 shrink-0 border-b border-[#363736]">
            <span className="text-[13px] tracking-tight font-medium text-slate-200">
              {currentTime}
            </span>

            {/* Dynamic Island / Camera Notch */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2 h-7 w-28 bg-black rounded-full flex items-center justify-between px-2.5 border border-[#363736] shadow-md">
              <div className="w-2.5 h-2.5 rounded-full bg-[#181918] ring-1 ring-[#363736] flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-[#B50000]/70" />
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

          {/* Internal App Screen Viewport: flex flex-col overflow-hidden to allow children internal scrolling */}
          <div className="relative flex-1 h-full w-full overflow-hidden bg-[#3C3D3C] text-slate-100 flex flex-col">
            {children}
          </div>

          {/* Bottom Home Indicator Bar (Desktop only) */}
          <div className="relative z-30 h-5 bg-[#242524] flex items-center justify-center shrink-0">
            <div className="w-32 h-1 bg-[#5A5B5A] rounded-full" />
          </div>
        </div>
      </div>

      {/* Frame Caption */}
      <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-mono text-[11px]">Mobile Viewport (390 × 844)</span>
      </div>
    </div>
  );
}
