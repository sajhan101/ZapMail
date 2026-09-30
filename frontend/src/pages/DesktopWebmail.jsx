import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Plus,
  Search,
  RefreshCw,
  Mail,
  CheckCheck,
  CheckSquare,
  Square,
  Clock,
  User,
  LogOut,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Phone,
  PhoneCall,
  Volume2,
  ArrowRight,
  Reply,
  Smartphone,
  ExternalLink,
  RotateCcw,
  AlertOctagon,
  Globe,
  ChevronDown,
  Copy,
  Check
} from 'lucide-react';
import AuthModal from '../components/AuthModal';
import ComposeModal from '../components/ComposeModal';
import { EmailListSkeleton, EmailDetailSkeleton } from '../components/LoadingSkeleton';
import ThreadPriorityBadge from '../components/ThreadPriorityBadge';
import { API_BASE } from '../config/api';
import { useTheme } from '../context/ThemeContext';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../config/languages';

export default function DesktopWebmail() {
  const { theme, isDark } = useTheme();
  const [userLanguage, setUserLanguage] = useState(DEFAULT_LANGUAGE);
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'
  const [emails, setEmails] = useState([]);
  const [folderCounts, setFolderCounts] = useState({ inbox: 0, sent: 0, drafts: 0, trash: 0, spam: 0 });
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Authentication
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('phonemail_token') || '');
  const [currentUser, setCurrentUser] = useState(null);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  // Bottom Reply Composer in Reading Pane
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  // AI Summarization & Smart Replies State
  const [aiSummary, setAiSummary] = useState(null);
  const [aiBullets, setAiBullets] = useState([]);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryProvider, setSummaryProvider] = useState('PhoneMail AI');
  const [smartReplies, setSmartReplies] = useState([
    'Confirmed, that works for me!',
    'Thank you for the update, will review shortly.',
    'Could you share more details on this?'
  ]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);

  // Compose modal pre-fill
  const [composeTo, setComposeTo] = useState('');
  const [composeSubj, setComposeSubj] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState(null);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // 1. Fetch User Profile
  const fetchUserProfile = async (token) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
      } else {
        localStorage.removeItem('phonemail_token');
        setAuthToken('');
        setCurrentUser(null);
      }
    } catch {
      // offline
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchUserProfile(authToken);
    }
  }, [authToken]);

  useEffect(() => {
    if (currentUser?.language) {
      setUserLanguage(currentUser.language);
    }
  }, [currentUser]);

  const handleLanguageChange = async (newLang) => {
    setUserLanguage(newLang);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      await fetch(`${API_BASE}/api/auth/language`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ language: newLang })
      });
      triggerToast(`🌐 Language preference updated to ${newLang}`);
    } catch {
      // offline fallback
    }
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    if (updatedUser?.language) setUserLanguage(updatedUser.language);
    triggerToast(`Profile updated: ${updatedUser.name || updatedUser.phoneNumber}`);
  };

  // 2. Fetch Emails
  // 2. Fetch Emails & Folder Counts
  const fetchFolderCounts = async () => {
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      const res = await fetch(`${API_BASE}/api/mail?limit=200`, { headers });
      if (res.ok) {
        const data = await res.json();
        const all = Array.isArray(data) ? data : data.data || [];
        const userPhone = currentUser?.phoneNumber;
        const userEmail = currentUser?.email || (userPhone ? `${userPhone}@phonemail.com` : '');
        setFolderCounts({
          inbox: all.filter((e) => e.folder === 'INBOX' || (!e.folder && e.recipientEmail === userEmail)).length,
          drafts: all.filter((e) => e.folder === 'DRAFTS' || e.isDraft).length,
          trash: all.filter((e) => e.folder === 'TRASH').length,
          spam: all.filter((e) => e.folder === 'SPAM').length,
          sent: all.filter((e) => e.folder === 'SENT' || (e.senderEmail === userEmail && e.folder !== 'TRASH' && e.folder !== 'SPAM' && e.folder !== 'DRAFTS')).length,
        });
      }
    } catch {
      // offline
    }
  };

  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

      let endpoint = '/api/mail';
      if (activeTab === 'inbox' && (authToken || currentUser?.phoneNumber)) {
        endpoint = '/api/mail/inbox';
      } else if (activeTab === 'sent' && (authToken || currentUser?.phoneNumber)) {
        endpoint = '/api/mail/sent';
      } else if (activeTab === 'drafts') {
        endpoint = '/api/messages/by-folder/DRAFTS';
      } else if (activeTab === 'trash') {
        endpoint = '/api/messages/by-folder/TRASH';
      } else if (activeTab === 'spam') {
        endpoint = '/api/messages/by-folder/SPAM';
      }

      const res = await fetch(`${API_BASE}${endpoint}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setEmails(list);

        // Maintain or set selection
        if (selectedEmail) {
          const match = list.find((e) => e.id === selectedEmail.id);
          if (match) setSelectedEmail(match);
          else setSelectedEmail(list[0] || null);
        } else if (list.length > 0) {
          setSelectedEmail(list[0]);
        }
      }
      fetchFolderCounts();
    } catch {
      // offline
    } finally {
      setIsLoading(false);
    }
  };

  // Clear emails and reset state on user switch
  useEffect(() => {
    setEmails([]);
    setSelectedEmail(null);
    setSelectedIds([]);
  }, [currentUser?.phoneNumber]);

  useEffect(() => {
    if (authToken || currentUser?.phoneNumber) {
      fetchEmails();
      const interval = setInterval(fetchEmails, 4000);
      return () => clearInterval(interval);
    }
  }, [authToken, currentUser?.phoneNumber, activeTab]);

  // Handle Mark as Read
  const handleMarkAsRead = async (emailId) => {
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      const res = await fetch(`${API_BASE}/api/mail/${emailId}/read`, {
        method: 'PATCH',
        headers,
      });
      if (res.ok) {
        setEmails((prev) =>
          prev.map((e) => (e.id === emailId ? { ...e, read: 1 } : e))
        );
        if (selectedEmail?.id === emailId) {
          setSelectedEmail((prev) => ({ ...prev, read: 1 }));
        }
        triggerToast('Marked as read');
        fetchFolderCounts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Move to Trash (Soft delete with restore capability)
  const handleMoveToTrash = async (emailId) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      const res = await fetch(`${API_BASE}/api/messages/${emailId}/folder`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ folder: 'TRASH' }),
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (selectedEmail?.id === emailId) {
          setSelectedEmail(null);
        }
        triggerToast('🗑️ Message moved to Trash');
        fetchFolderCounts();
      } else {
        triggerToast('Failed to move message to Trash');
      }
    } catch (e) {
      console.error(e);
      triggerToast('Error moving message to Trash');
    }
  };

  // Restore from Trash back to Inbox
  const handleRestoreEmail = async (emailId) => {
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      const res = await fetch(`${API_BASE}/api/messages/${emailId}/restore`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (selectedEmail?.id === emailId) {
          setSelectedEmail(null);
        }
        triggerToast('📥 Message restored to Inbox');
        fetchFolderCounts();
      } else {
        triggerToast('Failed to restore message');
      }
    } catch (e) {
      console.error(e);
      triggerToast('Error restoring message');
    }
  };

  // Permanent Delete
  const handlePermanentDelete = async (emailId) => {
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      const res = await fetch(`${API_BASE}/api/mail/${emailId}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (selectedEmail?.id === emailId) {
          setSelectedEmail(null);
        }
        triggerToast('Message permanently deleted');
        fetchFolderCounts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Send Reply from bottom of Reading Pane
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!selectedEmail || !replyText.trim()) return;

    setIsReplying(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

      const res = await fetch(`${API_BASE}/api/mail/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: selectedEmail.senderEmail,
          subject: selectedEmail.subject.startsWith('Re:')
            ? selectedEmail.subject
            : `Re: ${selectedEmail.subject}`,
          body: replyText.trim(),
          from: currentUser?.email || 'webmail@phonemail.local',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setReplyText('');
        triggerToast(
          data.smsAlertSent
            ? `✅ Reply sent & SMS alert dispatched to ${data.smsNotification?.recipientPhone || 'recipient'}!`
            : '✅ Reply sent successfully!'
        );
        await fetchEmails();
      } else {
        triggerToast(data.error || 'Failed to send reply');
      }
    } catch {
      triggerToast('Error sending reply: Server offline');
    } finally {
      setIsReplying(false);
    }
  };

  // Fetch smart replies for the selected email
  const fetchSmartReplies = async (email) => {
    if (!email) return;
    setIsLoadingReplies(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/suggest-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: email.body,
          subject: email.subject,
          from: email.senderEmail,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSmartReplies(data.suggestions.slice(0, 3));
      }
    } catch (err) {
      console.error('Failed to fetch smart replies', err);
    } finally {
      setIsLoadingReplies(false);
    }
  };

  // Trigger AI Summarization
  const handleSummarizeEmail = async (email) => {
    const target = email || selectedEmail;
    if (!target || isSummarizing) return;
    setIsSummarizing(true);
    setIsSummaryExpanded(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

      const res = await fetch(`${API_BASE}/api/messages/${target.id}/summarize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: target.body,
          subject: target.subject,
          from: target.senderEmail,
        }),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        const summaryText = data.summary || '';
        const bulletsList = Array.isArray(data.bullets) && data.bullets.length > 0
          ? data.bullets
          : summaryText
              .split('\n')
              .filter((b) => b.trim().length > 0)
              .map((b) => b.replace(/^[•\-\*]\s*/, '').trim());
        setAiSummary(summaryText);
        setAiBullets(bulletsList);
        setSummaryProvider(data.provider || 'PhoneMail AI');
        triggerToast('✨ AI Summary generated!');
      } else {
        triggerToast('Failed to summarize: ' + (data.error || 'Empty response'));
      }
    } catch {
      triggerToast('AI service error');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = () => {
    if (!aiSummary && aiBullets.length === 0) return;
    const textToCopy =
      aiBullets.length > 0 ? aiBullets.map((b) => `• ${b}`).join('\n') : aiSummary;
    navigator.clipboard.writeText(textToCopy);
    setSummaryCopied(true);
    triggerToast('📋 Summary copied to clipboard!');
    setTimeout(() => setSummaryCopied(false), 2000);
  };

  useEffect(() => {
    setAiSummary(null);
    setAiBullets([]);
    setIsSummaryExpanded(true);
    if (selectedEmail) {
      fetchSmartReplies(selectedEmail);
    }
  }, [selectedEmail?.id]);

  // Toggle selection checkboxes
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredEmails.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredEmails.map((e) => e.id));
    }
  };

  const handleToggleSelectRow = (e, id) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Filter emails
  const filteredEmails = emails.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      (item.subject && item.subject.toLowerCase().includes(q)) ||
      (item.senderEmail && item.senderEmail.toLowerCase().includes(q)) ||
      (item.recipientEmail && item.recipientEmail.toLowerCase().includes(q)) ||
      (item.body && item.body.toLowerCase().includes(q))
    );
  });

  const unreadCount = emails.filter((e) => !e.read).length;

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#B50000] selection:text-white overflow-hidden bg-[#3C3D3C] text-slate-100">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#B50000] text-white px-5 py-2.5 rounded-full shadow-2xl text-xs font-semibold flex items-center gap-2 border border-[#990000] animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Gmail-Style Top Search & Workspace Bar */}
      <header className="h-16 border-b border-[#4E4F4E] px-6 flex items-center justify-between shrink-0 gap-4 bg-[#2C2D2C]">
        {/* Left: Branding */}
        <div className="flex items-center gap-3 w-64 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#B50000] border border-[#990000] flex items-center justify-center shadow-md shadow-[#B50000]/25">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">PhoneMail</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#B50000]/20 text-[#FF8585] border border-[#B50000]/30">
                Webmail
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Desktop Gmail Client</p>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search in mail by sender, recipient, subject, or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2 border border-[#4E4F4E] bg-[#242524] text-slate-200 rounded-2xl text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-[#B50000] focus:ring-1 focus:ring-[#B50000] shadow-inner transition"
            />
          </div>
        </div>

        {/* Right: Quick Links, Language & User Badge */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Language Preference Dropdown */}
          <div className="relative">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#4E4F4E] bg-[#242524] text-xs font-semibold text-slate-300">
              <Globe className="w-3.5 h-3.5 text-[#FF8585]" />
              <select
                value={userLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-transparent text-xs font-medium cursor-pointer focus:outline-none pr-1"
                title="Select Language Preference"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id} className="bg-[#2C2D2C] text-slate-100">
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Link
            to="/register"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#4E4F4E] bg-[#242524] hover:bg-[#484948] text-slate-300 hover:text-white transition"
          >
            <span>Portal Registration</span>
          </Link>

          <Link
            to="/mobile"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#4E4F4E] bg-[#242524] hover:bg-[#484948] text-slate-300 hover:text-white transition"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#FF8585]" />
            <span className="hidden md:inline">Mobile App View</span>
          </Link>

          {currentUser ? (
            <div className="flex items-center gap-2.5 border border-[#4E4F4E] rounded-xl px-3 py-1.5 bg-[#242524]">
              <div className="relative inline-block overflow-visible shrink-0" style={{ overflow: 'visible' }}>
                <div className="w-7 h-7 rounded-full overflow-hidden bg-[#B50000] flex items-center justify-center text-white text-xs font-bold shadow-xs">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    (currentUser.name || currentUser.phoneNumber || 'U').charAt(0).toUpperCase()
                  )}
                </div>
                <span className="absolute bottom-0 right-0 z-10 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#2C2D2C] pointer-events-none" />
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-slate-100 leading-tight">{currentUser.name || currentUser.phoneNumber}</div>
                <div className="text-[10px] text-[#FF8585] font-mono leading-tight">{currentUser.email}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('phonemail_token');
                  setAuthToken('');
                  setCurrentUser(null);
                  triggerToast('Signed out of Webmail');
                }}
                title="Sign Out"
                className="text-slate-400 hover:text-red-400 p-1 transition cursor-pointer ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-semibold transition shadow-md shadow-[#B50000]/25 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main 3-Column Desktop Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* COLUMN 1: LEFT SIDEBAR */}
        <aside className="w-64 border-r border-[#4E4F4E] p-4 flex flex-col justify-between shrink-0 bg-[#2C2D2C]">
          <div className="space-y-6">
            
            {/* Compose Button (+) */}
            <button
              type="button"
              onClick={() => setComposeModalOpen(true)}
              className="w-full py-3 px-4 bg-[#B50000] hover:bg-[#990000] text-white rounded-2xl font-bold text-sm shadow-md shadow-[#B50000]/25 flex items-center justify-center gap-2.5 transition transform active:scale-98 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Compose Message</span>
            </button>

            {/* Navigation Links: Inbox, Sent, Drafts, Trash */}
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => { setActiveTab('inbox'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'inbox'
                    ? 'bg-[#B50000] text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-[#484948]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Inbox className="w-4 h-4 text-white" />
                  <span>Inbox</span>
                </div>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                    {unreadCount}
                  </span>
                ) : (
                  <span className="text-xs font-mono text-slate-400">{emails.length}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('sent'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'sent'
                    ? 'bg-[#B50000] text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-[#484948]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>Sent</span>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {activeTab === 'sent' ? emails.length : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('drafts'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'drafts'
                    ? 'bg-[#B50000] text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-[#484948]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Drafts</span>
                </div>
                <span className="text-xs font-mono text-slate-400">{folderCounts.drafts}</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('spam'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'spam'
                    ? 'bg-[#B50000] text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-[#484948]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertOctagon className="w-4 h-4 text-orange-400" />
                  <span>Spam</span>
                </div>
                <span className="text-xs font-mono text-slate-400">{folderCounts.spam}</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('trash'); setSelectedEmail(null); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'trash'
                    ? 'bg-[#B50000] text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-[#484948]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Trash</span>
                </div>
                <span className="text-xs font-mono text-slate-400">{folderCounts.trash}</span>
              </button>
            </nav>
          </div>

          {/* Active User Profile Badge */}
          <div className="pt-4 border-t border-[#4E4F4E]">
            {currentUser ? (
              <div className="p-3 rounded-2xl border flex items-center justify-between bg-[#242524] border-[#4E4F4E]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative inline-block overflow-visible shrink-0" style={{ overflow: 'visible' }}>
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-[#B50000] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs">
                      {currentUser.phoneNumber.slice(-2)}
                    </div>
                    <span className="absolute bottom-0 right-0 z-10 w-2.5 h-2.5 rounded-full bg-[#B50000] ring-2 ring-[#242524] pointer-events-none" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold truncate text-white">
                      {currentUser.phoneNumber}
                    </div>
                    <div className="text-[10px] font-mono truncate text-gray-400">
                      {currentUser.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('phonemail_token');
                    setAuthToken('');
                    setCurrentUser(null);
                    triggerToast('Signed out');
                  }}
                  title="Sign Out"
                  className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer bg-[#B50000] hover:bg-[#990000] text-white shadow-md shadow-[#B50000]/25"
              >
                <KeyRound className="w-4 h-4" />
                <span>Sign In / Register</span>
              </button>
            )}
          </div>
        </aside>

        {/* COLUMN 2: MIDDLE PANE (TABULAR EMAIL LIST) */}
        <section className="w-96 lg:w-[440px] border-r border-[#4E4F4E] flex flex-col shrink-0 overflow-hidden bg-[#3C3D3C]">
          
          {/* Middle Pane Toolbar */}
          <div className="p-3 border-b border-[#4E4F4E] flex items-center justify-between text-xs bg-[#2C2D2C]">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="cursor-pointer text-slate-400 hover:text-slate-200"
                title="Select all"
              >
                {selectedIds.length > 0 && selectedIds.length === filteredEmails.length ? (
                  <CheckSquare className="w-4 h-4 text-[#FF8585]" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={fetchEmails}
                className="p-1 rounded-lg transition cursor-pointer text-slate-400 hover:text-slate-200 hover:bg-[#484948]"
                title="Refresh list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#FF8585]' : ''}`} />
              </button>

              <span className="font-bold text-xs uppercase tracking-wider text-slate-400">
                {activeTab} ({filteredEmails.length})
              </span>
            </div>

            {selectedIds.length > 0 && (
              <span className="text-[11px] text-[#FF8585] font-semibold">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          {/* Tabular Email List Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#4E4F4E]/60">
            {isLoading && emails.length === 0 ? (
              <EmailListSkeleton count={5} />
            ) : filteredEmails.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs">
                <Mail className="w-9 h-9 mx-auto mb-2 text-slate-400 stroke-1" />
                <p>No messages in {activeTab}.</p>
                <button
                  type="button"
                  onClick={() => setComposeModalOpen(true)}
                  className="mt-3 text-[#FF8585] font-semibold hover:underline cursor-pointer"
                >
                  + Compose new message
                </button>
              </div>
            ) : (
              filteredEmails.map((item) => {
                const isSelected = selectedEmail?.id === item.id;
                const isChecked = selectedIds.includes(item.id);
                const isUnread = !item.read;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedEmail(item);
                      if (isUnread) handleMarkAsRead(item.id);
                    }}
                    className={`p-3.5 cursor-pointer transition select-none flex items-start gap-3 border-l-4 ${
                      isSelected
                        ? 'bg-[#484948]/50 border-[#B50000]'
                        : isUnread && activeTab !== 'sent'
                        ? 'bg-[#2C2D2C]/60 border-transparent hover:bg-[#484948]/30'
                        : 'border-transparent hover:bg-[#484948]/20'
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleSelectRow(e, item.id)}
                      className="mt-0.5 cursor-pointer text-slate-400 hover:text-slate-200"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-[#FF8585]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* Email Content Summary */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[13.5px] truncate max-w-[220px] ${
                          isUnread && activeTab !== 'sent'
                            ? 'font-bold text-white'
                            : 'font-semibold text-slate-200'
                        }`}>
                          {activeTab === 'sent'
                            ? `To: ${item.recipientName ? `${item.recipientName} <${item.recipientEmail}>` : item.recipientEmail}`
                            : (item.senderName ? `${item.senderName} <${item.senderEmail}>` : item.senderEmail)}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1">
                        {isUnread && activeTab !== 'sent' && (
                          <span className="w-2 h-2 rounded-full bg-[#B50000] shrink-0" />
                        )}
                        <span className={`text-sm truncate ${
                          isUnread && activeTab !== 'sent'
                            ? 'font-bold text-slate-100'
                            : 'font-medium text-slate-300'
                        }`}>
                          {item.subject || '(No Subject)'}
                        </span>
                        <ThreadPriorityBadge text={`${item.subject || ''} ${item.body || ''}`} />
                      </div>

                      <p className="text-[13.5px] line-clamp-1 leading-relaxed text-slate-300">
                        {item.body || 'No text snippet'}
                      </p>

                      <div className="mt-2 flex items-center justify-between">
                        {item.recipientEmail && item.recipientEmail.includes('@phonemail') && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                            <Phone className="w-2.5 h-2.5" /> SMS Alert Hook
                          </span>
                        )}
                        {item.read ? (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                            <CheckCheck className="w-3 h-3 text-sky-400" /> Read
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#FF8585] font-semibold">Unread</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 3: RIGHT / READING PANE */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-[#2C2D2C]">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col justify-between p-6 max-w-5xl">
              <div className="space-y-6">
                
                {/* Full Headers: Subject, From, To, Date */}
                <div className="pb-5 border-b border-[#4E4F4E] space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <h2 className="text-xl font-extrabold leading-snug text-slate-100 truncate">
                        {selectedEmail.subject || '(No Subject)'}
                      </h2>
                      <ThreadPriorityBadge text={`${selectedEmail.subject || ''} ${selectedEmail.body || ''}`} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSummarizeEmail(selectedEmail)}
                        disabled={isSummarizing}
                        className="px-3 py-1.5 bg-[#B50000]/20 hover:bg-[#B50000]/30 text-[#FF8585] border border-[#B50000]/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
                        title="Generate 1-2 sentence quick summary using AI"
                      >
                        <Sparkles className={`w-3.5 h-3.5 text-[#FF8585] ${isSummarizing ? 'animate-spin' : ''}`} />
                        <span>{isSummarizing ? 'Summarizing...' : '✨ Summarize with AI'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(selectedEmail.id)}
                        title="Mark as Read"
                        className="p-2 rounded-xl transition cursor-pointer text-slate-400 hover:text-emerald-400 hover:bg-[#484948]"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                      {activeTab === 'trash' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRestoreEmail(selectedEmail.id)}
                            title="Restore to Inbox"
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-[#B50000]/20 hover:bg-[#B50000]/30 text-[#FF8585] border border-[#B50000]/40"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-[#FF8585]" />
                            <span>Restore to Inbox</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePermanentDelete(selectedEmail.id)}
                            title="Delete Permanently"
                            className="p-2 rounded-xl transition cursor-pointer text-slate-400 hover:text-rose-400 hover:bg-[#484948]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMoveToTrash(selectedEmail.id)}
                          title="Move to Trash"
                          className="p-2 rounded-xl transition cursor-pointer text-slate-400 hover:text-rose-400 hover:bg-[#484948]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl border border-[#990000] bg-[#B50000] flex items-center justify-center font-bold text-sm text-white">
                        {selectedEmail.senderName
                          ? selectedEmail.senderName.slice(0, 2).toUpperCase()
                          : (selectedEmail.senderEmail ? selectedEmail.senderEmail[0].toUpperCase() : 'U')}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-200">
                          From: {selectedEmail.senderName ? `${selectedEmail.senderName} <${selectedEmail.senderEmail}>` : selectedEmail.senderEmail}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          To: {selectedEmail.recipientName ? `${selectedEmail.recipientName} <${selectedEmail.recipientEmail}>` : selectedEmail.recipientEmail}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono text-slate-400">
                        Date: {selectedEmail.createdAt ? new Date(selectedEmail.createdAt).toLocaleString() : ''}
                      </div>
                      <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        selectedEmail.read
                          ? 'bg-[#242524] text-slate-300 border-[#4E4F4E]'
                          : 'bg-[#B50000]/20 text-[#FF8585] border-[#B50000]/40'
                      }`}>
                        {selectedEmail.read ? 'Read' : 'Unread'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Summary Card (Loading or Generated) */}
                {(isSummarizing || aiSummary || (aiBullets && aiBullets.length > 0)) && (
                  <div className="rounded-2xl border border-[#B50000]/35 bg-[#2B2222]/70 backdrop-blur-xs p-4 shadow-lg shadow-black/20 space-y-3 transition-all">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-xl bg-[#B50000]/25 text-[#FF8585] flex items-center justify-center border border-[#B50000]/40 shadow-xs shrink-0">
                          <Sparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} />
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#FF8585] tracking-wide">
                            AI Executive Summary
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#242524] text-slate-300 border border-[#4E4F4E]">
                            {summaryProvider || 'PhoneMail AI'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Copy Button */}
                        {!isSummarizing && (aiSummary || (aiBullets && aiBullets.length > 0)) && (
                          <button
                            type="button"
                            onClick={handleCopySummary}
                            className="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#3C3D3C] transition cursor-pointer flex items-center gap-1.5 text-[11px] font-medium border border-[#4E4F4E]/60"
                            title="Copy summary to clipboard"
                          >
                            {summaryCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Minimize / Expand Toggle */}
                        {!isSummarizing && (
                          <button
                            type="button"
                            onClick={() => setIsSummaryExpanded((prev) => !prev)}
                            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#3C3D3C] transition cursor-pointer border border-[#4E4F4E]/60"
                            title={isSummaryExpanded ? 'Collapse summary' : 'Expand summary'}
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${
                                isSummaryExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setAiSummary(null);
                            setAiBullets([]);
                          }}
                          className="p-1 text-xs cursor-pointer rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#484948]"
                          title="Dismiss summary"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Loading State */}
                    {isSummarizing && (
                      <div className="flex items-center gap-3 py-2 text-xs text-slate-300">
                        <RefreshCw className="w-4 h-4 text-[#FF8585] animate-spin shrink-0" />
                        <span>Analyzing email thread and synthesizing 2-3 key bullet points...</span>
                      </div>
                    )}

                    {/* Content (Collapsible) */}
                    {!isSummarizing && isSummaryExpanded && (
                      <div className="pt-2 border-t border-[#4E4F4E]/50 text-xs sm:text-[13px] text-slate-200 leading-relaxed font-sans space-y-2">
                        {aiBullets && aiBullets.length > 0 ? (
                          <ul className="space-y-1.5 pl-1">
                            {aiBullets.map((bullet, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-[#FF8585] font-bold text-sm leading-none mt-0.5">•</span>
                                <span className="flex-1 text-slate-200 leading-normal">{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Trash Notification Banner */}
                {activeTab === 'trash' && (
                  <div className="p-3 bg-[#242524] border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>This email is in your Trash folder. You can restore it to your inbox or delete it permanently.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreEmail(selectedEmail.id)}
                      className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore to Inbox</span>
                    </button>
                  </div>
                )}

                {/* Full Body Text */}
                <div className="p-6 rounded-2xl border border-[#4E4F4E] bg-[#242524] text-slate-200 text-sm whitespace-pre-line leading-relaxed min-h-[220px] shadow-inner font-sans">
                  {selectedEmail.body || 'No message content available.'}
                </div>
              </div>

              {/* Bottom 'Reply' Composer (Only in Active Folders) */}
              {activeTab !== 'trash' && (
              <div className="mt-8 pt-6 border-t border-[#4E4F4E]">
                <div className="p-4 rounded-2xl border border-[#4E4F4E] bg-[#242524] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Reply className="w-4 h-4 text-[#FF8585]" />
                    <span className="text-slate-300">
                      Quick Reply to <strong className="text-[#FF8585]">{selectedEmail.senderEmail}</strong>
                    </span>
                  </div>

                  <form onSubmit={handleSendReply} className="space-y-3">
                    {/* Clickable Smart Reply Chips */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold flex items-center gap-1.5 text-slate-300">
                          <Sparkles className="w-3 h-3 text-[#FF8585]" />
                          <span>Smart Replies (1-Click Options):</span>
                        </span>
                        {isLoadingReplies && (
                          <span className="text-[10px] text-slate-500 font-mono animate-pulse">Generating options...</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {smartReplies.map((reply, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setReplyText(reply)}
                            className="text-xs px-3 py-1.5 rounded-full transition cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95 text-left border border-red-500/30 bg-red-950/20 text-white hover:bg-red-500/20"
                            title="Click to insert smart reply"
                          >
                            <span>💬 {reply}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      placeholder={`Type your reply to ${selectedEmail.senderEmail}...`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full p-3 border border-[#4E4F4E] bg-[#2C2D2C] text-slate-100 rounded-xl text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-[#B50000] focus:ring-1 focus:ring-[#B50000] transition resize-none leading-relaxed"
                      required
                    />

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        Dispatches SMS alert if replying to phone handle
                      </span>

                      <button
                        type="submit"
                        disabled={isReplying || !replyText.trim()}
                        className="px-5 py-2 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-[#B50000]/25 transition cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isReplying ? 'Sending Reply...' : 'Send Reply'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="p-4">
              <EmailDetailSkeleton />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-16">
              <Mail className="w-14 h-14 mb-3 stroke-1 text-slate-500" />
              <p className="text-base font-bold text-slate-300">Select an email to read</p>
              <p className="text-xs text-slate-400 mt-1">
                Choose a conversation from the list on the left to view headers and reply.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(user, token) => {
          setAuthToken(token);
          setCurrentUser(user);
          triggerToast(`Logged in as ${user.name || user.phoneNumber}`);
        }}
        onProfileUpdate={handleProfileUpdate}
      />

      <ComposeModal
        isOpen={composeModalOpen}
        onClose={() => setComposeModalOpen(false)}
        onEmailSent={(res) => {
          triggerToast(
            res.smsAlertSent
              ? `✅ Email sent & SMS alert dispatched to phone!`
              : '✅ Email sent!'
          );
          fetchEmails();
        }}
        authToken={authToken}
        currentUser={currentUser}
        initialTo={composeTo}
        initialSubject={composeSubj}
      />
    </div>
  );
}
