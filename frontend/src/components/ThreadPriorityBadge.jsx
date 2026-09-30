import React from 'react';

/**
 * Determine conversation priority based on content analysis
 * Urgency rules:
 * - "Urgent" / "ASAP" / "Immediate" / "Critical" -> Urgent (#DC2626)
 * - "Meeting" / "Schedule" / "Deadline" / "Review" -> Important (#D97706)
 * - Default -> Normal (Slate/Neutral)
 */
export function getThreadPriority(text = '') {
  const t = (text || '').toLowerCase();

  if (/\b(urgent|asap|immediate|critical|emergency|action required|alert|priority)\b/i.test(t)) {
    return {
      level: 'urgent',
      label: 'Urgent',
      color: '#DC2626',
      badgeClass: 'bg-red-600/15 text-red-400 border-red-500/40'
    };
  }

  if (/\b(meeting|schedule|deadline|review|sync|calendar|agenda|presentation|due|appointment)\b/i.test(t)) {
    return {
      level: 'important',
      label: 'Important',
      color: '#D97706',
      badgeClass: 'bg-amber-600/15 text-amber-400 border-amber-500/40'
    };
  }

  return {
    level: 'normal',
    label: 'Normal',
    color: '#64748B',
    badgeClass: 'bg-slate-700/30 text-slate-400 border-slate-600/30'
  };
}

export default function ThreadPriorityBadge({ text, className = '', showNormal = false }) {
  const priority = getThreadPriority(text);

  if (!showNormal && priority.level === 'normal') {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 font-mono transition-colors ${priority.badgeClass} ${className}`}
      title={`Thread Priority: ${priority.label}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: priority.color }}
      />
      <span>{priority.label}</span>
    </span>
  );
}
