import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Sparkles,
  AlertCircle,
  Phone,
  Mail,
  Lock,
  Users,
  ArrowLeft,
  Paperclip,
  FileText,
  File,
  FileImage,
  FileSpreadsheet,
  Save,
  CheckCircle2
} from 'lucide-react';
import { getApiBaseUrl, API_BASE } from '../config/api';
import { formatFileSize, getAttachmentIcon } from './AttachmentViewerModal';

export default function ComposeModal({
  isOpen,
  onClose,
  onEmailSent,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  initialAttachments = [],
  draftId = null,
  authToken,
  currentUser,
  isLockedTo = false,
  isReply = false,
  triggerToast
}) {
  const safeInitialTo = typeof initialTo === 'string' ? initialTo : '';
  const safeInitialSubject = typeof initialSubject === 'string' ? initialSubject : '';
  const safeInitialBody = typeof initialBody === 'string' ? initialBody : '';

  const [to, setTo] = useState(safeInitialTo);
  const [subject, setSubject] = useState(safeInitialSubject);
  const [body, setBody] = useState(safeInitialBody);
  const [attachments, setAttachments] = useState(Array.isArray(initialAttachments) ? initialAttachments : []);
  const [currentDraftId, setCurrentDraftId] = useState(draftId);

  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [smartReplies, setSmartReplies] = useState([
    'Confirmed, that time works perfectly for me!',
    'Thank you for the update, will review and get back shortly.',
    'Could we please reschedule to 30 minutes later?'
  ]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);

  const fileInputRef = useRef(null);

  // Sync state when modal opens or initial props change
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
      setAttachments(Array.isArray(initialAttachments) ? initialAttachments : []);
      setCurrentDraftId(draftId || null);
      setError('');
    }
  }, [isOpen, initialTo, initialSubject, initialBody, initialAttachments, draftId, isReply]);

  // Fetch Contextual AI Smart Replies when replying
  useEffect(() => {
    if (isOpen && (isReply || initialBody || initialSubject)) {
      setIsLoadingReplies(true);
      fetch(`${API_BASE}/api/messages/suggest-replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
          ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
        },
        body: JSON.stringify({
          content: initialBody || initialSubject || 'New conversation',
          subject: initialSubject,
          from: initialTo
        })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            setSmartReplies(data.suggestions.slice(0, 3));
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingReplies(false));
    }
  }, [isOpen, isReply, initialBody, initialSubject, initialTo, authToken, currentUser]);

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
        return `${cleanDigits}@zapmail.com`;
      }
      return addr;
    });

  const isGroup = !isLockedTo && recipientList.length >= 2;
  const isSinglePhone =
    recipientList.length === 1 &&
    (recipientList[0].includes('@zapmail.com') || recipientList[0].includes('@phonemail.com') || recipientList[0].replace(/\D/g, '').length === 10);

  // Handle native file selection
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      // 5MB limit check
      if (file.size > 5 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 5MB attachment limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const newAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: reader.result,
          url: reader.result
        };
        setAttachments((prev) => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so the same file can be re-selected if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (attId) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  // Save or update draft
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setError('');

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

      const res = await fetch(`${API_BASE}/api/messages/draft`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: currentDraftId,
          to: recipientList.join(', ') || to,
          subject: subject.trim(),
          body: body.trim(),
          attachments
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.draft?.id) {
          setCurrentDraftId(data.draft.id);
        }
        if (triggerToast) {
          triggerToast('💾 Draft saved to Drafts folder');
        }
        if (onEmailSent) {
          onEmailSent({ draft: data.draft, isDraft: true });
        }
        onClose();
      } else {
        setError(data.error || 'Failed to save draft');
      }
    } catch {
      setError('Could not reach backend to save draft.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Send Email
  const handleSend = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setError('');

    if (recipientList.length === 0) {
      setError('Please provide at least one recipient address or 10-digit phone number');
      return;
    }

    setIsSending(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

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
            from: currentUser?.email || '',
            attachments
          })
        }).then((res) => res.json())
      );

      const results = await Promise.all(sendPromises);
      const firstResult = results[0];

      if (firstResult && firstResult.error) {
        setError(firstResult.error);
        return;
      }

      // If this was an existing draft, delete or move it
      if (currentDraftId) {
        try {
          await fetch(`${apiBase}/api/mail/${currentDraftId}`, {
            method: 'DELETE',
            headers
          });
        } catch {
          // ignore draft cleanup failure
        }
      }

      if (onEmailSent) {
        onEmailSent({
          ...firstResult,
          isGroup,
          groupRecipients: recipientList,
          subject: subject.trim(),
          body: body.trim(),
          attachments
        });
      }
      onClose();
    } catch {
      setError('Failed to contact email dispatch server. Verify backend is running.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#242524] border-b border-[#4E4F4E] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#B50000]/15 border border-[#B50000]/30 flex items-center justify-center text-[#FF8585]">
              {isGroup ? <Users className="w-4 h-4 text-[#FF8585]" /> : <Mail className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>
                  {currentDraftId
                    ? 'Resume Saved Draft'
                    : isReply
                    ? 'Traditional Reply'
                    : isGroup
                    ? 'New Group Message'
                    : 'Email Composer'}
                </span>
                {isLockedTo && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#B50000]/20 text-[#FF8585] font-mono flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> 1-on-1 Locked
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-gray-400">
                {isLockedTo
                  ? 'Strict 1-on-1 recipient locking enabled'
                  : 'Send to [phone]@zapmail.com or multiple addresses for a Group Chat'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2C2D2C] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-[#B50000]/15 border border-[#B50000]/30 text-[#FF8585] text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#FF8585]" />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden Native File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Form Body */}
        <form onSubmit={handleSend} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* To Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <span>To:</span>
                {isLockedTo && (
                  <span className="text-[10px] text-amber-400 font-normal flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Read-only (Secondary recipients prohibited in active 1-on-1)
                  </span>
                )}
              </label>

              {isSinglePhone && (
                <span className="text-[10px] text-[#FF8585] font-medium flex items-center gap-1">
                  <Phone className="w-3 h-3" /> SMS Carrier alert active
                </span>
              )}

              {isGroup && (
                <span className="text-[10px] text-[#FF8585] font-medium flex items-center gap-1 font-mono">
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
                    : 'e.g. 5559876543@zapmail.com, 9123456780@zapmail.com'
                }
                value={typeof to === 'string' ? to : ''}
                disabled={isLockedTo}
                readOnly={isLockedTo}
                onChange={(e) => {
                  if (!isLockedTo) setTo(e?.target?.value || '');
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-mono text-xs transition border ${
                  isLockedTo
                    ? 'bg-[#242524] border-[#4E4F4E] text-gray-400 cursor-not-allowed opacity-90'
                    : 'bg-[#242524] border-[#4E4F4E] text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000]'
                }`}
                required
              />
              {isLockedTo && (
                <Lock className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {!isLockedTo && (
              <p className="text-[10px] text-gray-400 mt-1">
                Tip: Enter 2 or more comma-separated recipients to route to a Group Chat stream.
              </p>
            )}
          </div>

          {/* Subject Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Subject
            </label>
            <input
              type="text"
              placeholder="Subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000] transition text-xs sm:text-sm"
              required
            />
          </div>

          {/* Body Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-300">
                Message Body
              </label>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-[#FF8585]" />
                <span className="text-[#FF8585] font-semibold">
                  {isReply ? 'AI Smart Replies:' : 'AI Smart Starters:'}
                </span>
                {isLoadingReplies && (
                  <span className="text-[10px] text-gray-400 font-mono animate-pulse">generating...</span>
                )}
              </div>
            </div>

            {/* Smart reply starters */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {smartReplies.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setBody(chip)}
                  className="text-xs px-3 py-1 border border-red-500/30 bg-red-950/20 text-white hover:bg-red-500/20 rounded-full transition cursor-pointer flex items-center gap-1 shadow-none active:scale-95 text-left"
                >
                  <span>💬 {chip}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              placeholder="Type your message here. Inbound users will be notified via SMS..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000] transition resize-none leading-relaxed"
              required
            />
          </div>

          {/* Attachment Badges Display */}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-[#FF8585]" />
                <span>Attached Documents ({attachments.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => {
                  const Icon = getAttachmentIcon(att.filename, att.mimeType);
                  return (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#242524] border border-[#4E4F4E] text-xs text-white shadow-sm animate-in fade-in"
                    >
                      <Icon className="w-3.5 h-3.5 text-[#FF8585] shrink-0" />
                      <span className="max-w-[150px] truncate font-medium text-[11px]" title={att.filename}>
                        {att.filename}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        ({formatFileSize(att.size)})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="text-gray-400 hover:text-[#FF8585] p-0.5 rounded-full hover:bg-[#3C3D3C] transition cursor-pointer"
                        title="Remove attachment"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attachment Button */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#242524] hover:bg-[#3C3D3C] text-xs font-semibold text-gray-300 hover:text-white border border-[#4E4F4E] transition cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5 text-[#FF8585]" />
              <span>Attach File (PDF, Image, Doc)</span>
            </button>

            <span className="text-[10px] text-gray-400 font-mono">
              Max 5MB per file
            </span>
          </div>

          {/* Modal Actions Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-[#4E4F4E]">
            <button
              type="button"
              disabled={isSavingDraft || isSending}
              onClick={handleSaveDraft}
              className="px-3.5 py-2 rounded-xl bg-[#242524] hover:bg-[#3C3D3C] text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-[#4E4F4E] transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5 text-amber-400" />
              <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2.5 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-[#B50000]/25 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending...' : isGroup ? 'Create Group Thread' : 'Send Email'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
