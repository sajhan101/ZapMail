import React, { useState, useEffect } from 'react';
import { X, Send, Sparkles, AlertCircle, Phone, Mail, Lock, Users, ArrowLeft } from 'lucide-react';
import { getApiBaseUrl } from '../config/api';

export default function ComposeModal({
  isOpen,
  onClose,
  onEmailSent,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  authToken,
  currentUser,
  isLockedTo = false,
  isReply = false
}) {
  const safeInitialTo = typeof initialTo === 'string' ? initialTo : '';
  const safeInitialSubject = typeof initialSubject === 'string' ? initialSubject : '';
  const safeInitialBody = typeof initialBody === 'string' ? initialBody : '';

  const [to, setTo] = useState(safeInitialTo);
  const [subject, setSubject] = useState(safeInitialSubject);
  const [body, setBody] = useState(safeInitialBody);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      const cleanTo = typeof initialTo === 'string' ? initialTo : '';
      const cleanSubj = typeof initialSubject === 'string' ? initialSubject : '';
      const cleanBody = typeof initialBody === 'string' ? initialBody : '';

      setTo(cleanTo);
      setSubject(
        isReply
          ? cleanSubj.startsWith('Re:')
            ? cleanSubj
            : `Re: ${cleanSubj || '(No Subject)'}`
          : cleanSubj
      );
      setBody(cleanBody);
      setError('');
    }
  }, [isOpen, initialTo, initialSubject, initialBody, isReply]);

  if (!isOpen) return null;

  // Multi-recipient & Group Chat detection
  const safeToString = typeof to === 'string' ? to : '';
  const recipientList = safeToString
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((addr) => {
      const cleanDigits = addr.replace(/\D/g, '');
      if (cleanDigits.length === 10 && !addr.includes('@')) {
        return `${cleanDigits}@phonemail.com`;
      }
      return addr;
    });

  const isGroup = !isLockedTo && recipientList.length >= 2;
  const isSinglePhone =
    recipientList.length === 1 &&
    (recipientList[0].includes('@phonemail.com') || recipientList[0].replace(/\D/g, '').length === 10);

  const handleSend = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setError('');

    if (recipientList.length === 0) {
      setError('Please provide at least one recipient address or 10-digit phone number');
      return;
    }

    setIsSending(true);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const apiBase = getApiBaseUrl();
      // If group chat, dispatch to each recipient and format group header
      const sendPromises = recipientList.map((target) =>
        fetch(`${apiBase}/api/mail/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: target,
            subject: (typeof subject === 'string' ? subject : '').trim() || '(No Subject)',
            body: isGroup
              ? `[Group Thread: ${recipientList.join(', ')}]\n\n${(typeof body === 'string' ? body : '').trim()}`
              : (typeof body === 'string' ? body : '').trim(),
            from: currentUser?.email || '9876543210@phonemail.com'
          })
        }).then((res) => res.json())
      );

      const results = await Promise.all(sendPromises);
      const firstResult = results[0];

      if (firstResult && firstResult.error) {
        setError(firstResult.error);
        return;
      }

      if (onEmailSent) {
        onEmailSent({
          ...firstResult,
          isGroup,
          groupRecipients: recipientList,
          subject: subject.trim(),
          body: body.trim()
        });
      }
      onClose();
    } catch {
      setError('Failed to contact email dispatch server. Verify backend is running.');
    } finally {
      setIsSending(false);
    }
  };

  const handleInsertSample = (phoneSample, subjSample, bodySample) => {
    if (isLockedTo) return;
    setTo(phoneSample);
    setSubject(subjSample);
    setBody(bodySample);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              {isGroup ? <Users className="w-4 h-4 text-emerald-400" /> : <Mail className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>{isReply ? 'Traditional Reply' : isGroup ? 'New Group Message' : 'Traditional Email Composer'}</span>
                {isLockedTo && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> 1-on-1 Locked
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isLockedTo
                  ? 'Strict 1-on-1 recipient locking enabled (Spike Threading)'
                  : 'Send to [phone]@phonemail.com or multiple addresses for a Group Chat'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSend} className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>To:</span>
                {isLockedTo && (
                  <span className="text-[10px] text-amber-400 font-normal flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Read-only (Secondary recipients prohibited in active 1-on-1)
                  </span>
                )}
              </label>

              {isSinglePhone && (
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <Phone className="w-3 h-3" /> SMS Carrier alert active
                </span>
              )}

              {isGroup && (
                <span className="text-[10px] text-indigo-400 font-medium flex items-center gap-1 font-mono">
                  <Users className="w-3 h-3" /> Group Chat Thread ({recipientList.length} members)
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder={
                  isLockedTo
                    ? 'Current contact'
                    : 'e.g. 5559876543@phonemail.com, 9123456780@phonemail.com'
                }
                value={typeof to === 'string' ? to : ''}
                disabled={isLockedTo}
                readOnly={isLockedTo}
                onChange={(e) => {
                  if (!isLockedTo) setTo(e?.target?.value || '');
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-mono text-xs transition border ${
                  isLockedTo
                    ? 'bg-slate-950/60 border-slate-800 text-indigo-300 cursor-not-allowed opacity-90'
                    : 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                }`}
                required
              />
              {isLockedTo && (
                <Lock className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {!isLockedTo && (
              <p className="text-[10px] text-slate-500 mt-1">
                Tip: Enter 2 or more comma-separated recipients to automatically route to a dedicated Group Chat stream.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Subject
            </label>
            <input
              type="text"
              placeholder="Subject preview line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-xs sm:text-sm"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Message Body
              </label>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Smart 1-Click Starters:</span>
              </div>
            </div>

            {/* Smart reply / template chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                'Confirmed, that time works perfectly for me!',
                'Thank you for the update, will review and get back shortly.',
                'Could we please reschedule to 30 minutes later?'
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setBody(chip)}
                  className="text-[11px] px-2.5 py-1 bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-700/40 rounded-full transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                  title="Click to insert smart starter"
                >
                  <span>💬 {chip}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              placeholder="Type your email body here. Phone-based users will be alerted via SMS instantly..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none leading-relaxed"
              required
            />
          </div>

          {/* Quick presets (only when not locked to a specific 1-on-1 contact) */}
          {!isLockedTo && (
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 font-medium block mb-2">
                Quick Starters / Group Test:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleInsertSample(
                      '5559876543@phonemail.com',
                      'Meeting Agenda for Monday',
                      'Hi! Here is the agenda for our upcoming product demo.'
                    )
                  }
                  className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  1-on-1 (5559876543)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleInsertSample(
                      '9876543210@phonemail.com, 9123456780@phonemail.com',
                      'Project Hackathon Team Sync',
                      'Welcome everyone to the hackathon group chat thread!'
                    )
                  }
                  className="text-[11px] px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 rounded-lg border border-indigo-700/50 transition cursor-pointer flex items-center gap-1"
                >
                  <Users className="w-3 h-3" /> Group Demo (2 Recipients)
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : isGroup ? 'Create Group Thread' : 'Send Email'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
