import React from 'react';

export function EmailListSkeleton({ count = 4 }) {
  return (
    <div className="divide-y divide-slate-800/60 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-32 bg-slate-800 rounded-md" />
            <div className="h-3 w-12 bg-slate-800/80 rounded-md" />
          </div>
          <div className="h-3.5 w-48 bg-slate-700/60 rounded-md" />
          <div className="space-y-1.5 pt-1">
            <div className="h-2.5 w-full bg-slate-800/50 rounded-md" />
            <div className="h-2.5 w-4/5 bg-slate-800/40 rounded-md" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="h-4 w-20 bg-slate-800/60 rounded-full" />
            <div className="h-3 w-10 bg-slate-800/50 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmailDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl animate-pulse p-4">
      {/* Subject Header */}
      <div className="pb-5 border-b border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-72 bg-slate-700/80 rounded-lg" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 bg-slate-800 rounded-xl" />
            <div className="h-8 w-8 bg-slate-800 rounded-xl" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-800" />
            <div className="space-y-1.5">
              <div className="h-4 w-36 bg-slate-700/60 rounded" />
              <div className="h-3 w-48 bg-slate-800/50 rounded" />
            </div>
          </div>
          <div className="h-4 w-28 bg-slate-800/60 rounded" />
        </div>
      </div>

      {/* Body Area */}
      <div className="p-6 bg-slate-950/80 rounded-2xl border border-slate-800/80 space-y-3 min-h-[180px]">
        <div className="h-3.5 w-full bg-slate-800/70 rounded" />
        <div className="h-3.5 w-11/12 bg-slate-800/60 rounded" />
        <div className="h-3.5 w-4/5 bg-slate-800/50 rounded" />
        <div className="h-3.5 w-3/4 bg-slate-800/40 rounded pt-3" />
        <div className="h-3.5 w-2/3 bg-slate-800/40 rounded" />
      </div>

      {/* Reply bar placeholder */}
      <div className="h-28 bg-slate-950 rounded-2xl border border-slate-800" />
    </div>
  );
}

export function SmsListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 bg-slate-800 rounded-full" />
            <div className="h-3 w-16 bg-slate-800/60 rounded" />
          </div>
          <div className="p-3 bg-slate-900 rounded-xl space-y-1.5">
            <div className="h-3 w-full bg-slate-800/70 rounded" />
            <div className="h-3 w-4/5 bg-slate-800/50 rounded" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="h-3 w-40 bg-slate-800/60 rounded" />
            <div className="h-6 w-24 bg-slate-800 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
