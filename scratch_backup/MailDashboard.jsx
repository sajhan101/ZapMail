import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Menu,
  X,
  Plus,
  Send,
  Sparkles,
  Paperclip,
  Star,
  Trash2,
  CheckCheck,
  Check,
  Phone,
  PhoneCall,
  Mail,
  User,
  LogOut,
  KeyRound,
  RefreshCw,
  Volume2,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  FileText,
  AlertOctagon,
  Inbox,
  Clock,
  Reply,
  Globe,
  Camera,
  AtSign,
  Smartphone,
  Sliders,
  Settings,
  Upload,
  Palette,
  Lock,
  Users,
  Maximize2,
  Tag
} from 'lucide-react';
import { EmailListSkeleton } from './LoadingSkeleton';

export default function MailDashboard({
  viewMode = 'desktop',
  authToken,
  currentUser,
  onOpenAuth,
  onOpenCompose,
  onOpenTelecom,
  onLogout,
  triggerToast
}) {
  // Data State
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Spike Mail Conversational Navigation & Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState('home'); // 'home' | 'drafts' | 'spam' | 'trash'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'unread' | 'attachments' | 'favorites'
  const [selectedContactKey, setSelectedContactKey] = useState(null);

  // Favorites & Starred Contacts
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('phonemail_favorites');
      return saved ? JSON.parse(saved) : ['judge@hackathon.org'];
    } catch {
      return ['judge@hackathon.org'];
    }
  });

  // Account Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('picture'); // 'aliases' | 'language' | 'details' | 'picture'
  const [accountDetails, setAccountDetails] = useState(() => {
    const defaults = {
      displayName: currentUser ? (currentUser.name || 'Alex Rivera') : 'Alex Rivera',
      phone: currentUser ? currentUser.phoneNumber : '9876543210',
      title: 'Enterprise Pilot Lead',
      signature: 'Sent via PhoneMail Conversational Telecom Gateway',
      language: 'en',
      avatarColor: 'from-emerald-500 to-teal-600',
      avatarImage: null,
      aliases: [
        currentUser?.email || '9876543210@phonemail.com',
        'alex.ops@phonemail.com',
        'field.lead@phonemail.com'
      ],
      newAliasInput: ''
    };
    try {
      const saved = localStorage.getItem('phonemail_profile_settings');
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return defaults;
  });

  const fileInputRef = useRef(null);

  // Inline Chat Compose State (Spike Mail Bottom Input)
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);

  // AI Summarization & Smart Replies State
  const [aiSummaries, setAiSummaries] = useState({});
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [smartReplies, setSmartReplies] = useState([
    'Confirmed, sounds great!',
    'Thank you, will review shortly.',
    'Could you share more details on this?'
  ]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);

  // Active Header Action Button Tooltip State (Click-to-Reveal Label)
  const [activeTooltip, setActiveTooltip] = useState(null);

  const toggleTooltip = (name) => {
    setActiveTooltip((prev) => (prev === name ? null : name));
  };

  useEffect(() => {
    if (activeTooltip) {
      const timer = setTimeout(() => setActiveTooltip(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [activeTooltip]);

  // Spike Mail Quoting, Subject Bar & Single-Reply States
  const [quotedMessage, setQuotedMessage] = useState(null);
  const [inlineSubject, setInlineSubject] = useState('');
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);
  const [repliedMessageIds, setRepliedMessageIds] = useState(() => {
    try {
      const saved = localStorage.getItem('phonemail_replied_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [expandedSubjectIds, setExpandedSubjectIds] = useState([]);

  const toggleExpandSubject = (msgId, e) => {
    if (e) e.stopPropagation();
    setExpandedSubjectIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  };

  // Swipe-to-Reply Gesture States
  const [swipingMsgId, setSwipingMsgId] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartXRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem('phonemail_replied_ids', JSON.stringify(repliedMessageIds));
    } catch {
      // ignore
    }
  }, [repliedMessageIds]);

  // Auto-scroll anchor for chat thread
  const chatMessagesEndRef = useRef(null);

  const isMobile = viewMode === 'mobile';

  // -------------------------------------------------------------
  // Fetch All Emails from Backend
  // -------------------------------------------------------------
  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Fetch all user messages for conversational grouping
      const res = await fetch('http://localhost:5000/api/mail', { headers });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setEmails(list);
      }
    } catch {
      // offline fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(fetchEmails, 4000);
    return () => clearInterval(interval);
  }, [authToken]);

  // Persist favorites
  useEffect(() => {
    try {
      localStorage.setItem('phonemail_favorites', JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  // Scroll to bottom when conversation opens or updates
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedContactKey, emails.length]);

  // -------------------------------------------------------------
  // Group Emails into Unified Conversational Threads by Contact
  // -------------------------------------------------------------
  const threads = React.useMemo(() => {
    const userEmail = (currentUser?.email || '9876543210@phonemail.com').toLowerCase();
    const userPhone = currentUser?.phoneNumber || '9876543210';

    const threadMap = {};

    emails.forEach((email) => {
      const sender = (email.senderEmail || '').toLowerCase();
      const recipient = (email.recipientEmail || '').toLowerCase();

      // Check if message is outgoing
      const isOutgoing = sender === userEmail || (userPhone && sender.includes(userPhone));

      // Multi-Recipient & Group Chat Detection
      const groupHeaderMatch = email.body && email.body.match(/\[Group Thread:\s*([^\]]+)\]/i);
      const isGroupEmail = Boolean(
        groupHeaderMatch ||
        email.isGroup ||
        recipient.includes(',') ||
        recipient.includes(';')
      );

      let contactKey;
      let contactEmail;
      let contactName;
      let isGroupThread = false;
      let groupMembers = [];

      if (isGroupEmail) {
        isGroupThread = true;
        let memberStr = groupHeaderMatch
          ? groupHeaderMatch[1]
          : isOutgoing
          ? recipient
          : `${sender}, ${recipient}`;

        groupMembers = Array.from(
          new Set(
            memberStr
              .split(/[,;]/)
              .map((m) => m.trim().toLowerCase())
              .filter((m) => Boolean(m) && m !== userEmail)
          )
        ).sort();

        contactKey = `group:${groupMembers.join(',')}`;
        contactEmail = groupMembers.join(', ');
        contactName = `👥 Group (${groupMembers.length + 1} members)`;
      } else {
        // Strict 1-on-1 contact routing
        const contactRaw = isOutgoing ? email.recipientEmail : email.senderEmail;
        if (!contactRaw) return;

        contactKey = contactRaw.toLowerCase().trim();
        contactEmail = contactRaw;

        // Friendly name
        const phoneMatch = contactRaw.match(/(\d{10})/);
        const contactPhone = phoneMatch ? phoneMatch[1] : null;

        if (contactPhone) {
          contactName = `+91 ${contactPhone.slice(0, 5)} ${contactPhone.slice(5)}`;
        } else if (contactRaw.includes('@')) {
          const prefix = contactRaw.split('@')[0];
          contactName = prefix
            .replace(/[._]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
        } else {
          contactName = contactRaw;
        }
      }

      if (!threadMap[contactKey]) {
        const phoneMatch = contactEmail.match(/(\d{10})/);
        const contactPhone = phoneMatch ? phoneMatch[1] : null;

        // Color theme generator based on contact key
        const colors = [
          'from-indigo-500 to-purple-600',
          'from-emerald-500 to-teal-600',
          'from-amber-500 to-orange-600',
          'from-sky-500 to-blue-600',
          'from-rose-500 to-pink-600',
          'from-teal-500 to-cyan-600'
        ];
        const hash = contactKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const avatarGradient = colors[hash % colors.length];

        threadMap[contactKey] = {
          contactKey,
          contactEmail,
          contactPhone,
          contactName,
          isGroup: isGroupThread,
          groupMembers,
          avatarGradient,
          messages: [],
          hasPhoneHandle: Boolean(contactPhone || contactEmail.includes('@phonemail')),
          isFavorite: favorites.includes(contactKey)
        };
      }

      // Check for quoted reply snippet in body
      const quoteMatch = email.body && email.body.match(/\[In reply to ([^:]+):\s*"([^"]+)"\]/);
      const quotedSender = quoteMatch ? quoteMatch[1] : null;
      const quotedSnippet = quoteMatch ? quoteMatch[2] : null;

      threadMap[contactKey].messages.push({
        ...email,
        isOutgoing,
        quotedSender,
        quotedSnippet,
        hasAttachment: /attach|agreement|pdf|checklist|terms|file|spec|doc|invoice/i.test(
          (email.subject || '') + ' ' + (email.body || '')
        )
      });
    });

    // Finalize each thread
    const list = Object.values(threadMap).map((thread) => {
      // Sort messages chronologically (oldest to newest for conversational chat flow)
      thread.messages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

      const lastMsg = thread.messages[thread.messages.length - 1];
      const unreadCount = thread.messages.filter((m) => !m.read && !m.isOutgoing).length;
      const hasAttachments = thread.messages.some((m) => m.hasAttachment);

      return {
        ...thread,
        lastMessage: lastMsg,
        unreadCount,
        hasAttachments,
        isFavorite: favorites.includes(thread.contactKey),
        lastActivity: lastMsg?.createdAt || new Date(0)
      };
    });

    // Sort threads by most recent activity descending (newest chat on top)
    list.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    return list;
  }, [emails, currentUser, favorites]);

  // Apply Quick Filter Chips and Search
  const filteredThreads = React.useMemo(() => {
    let result = threads;

    // Filter by active drawer folder
    if (activeFolder === 'drafts') {
      return []; // Clean empty drafts representation
    }
    if (activeFolder === 'spam') {
      return []; // Clean empty spam representation
    }
    if (activeFolder === 'trash') {
      return []; // Empty trash view
    }

    // Quick filter chips
    if (quickFilter === 'unread') {
      result = result.filter((t) => t.unreadCount > 0);
    } else if (quickFilter === 'attachments') {
      result = result.filter((t) => t.hasAttachments);
    } else if (quickFilter === 'favorites') {
      result = result.filter((t) => t.isFavorite);
    }

    // Search query across contact name, email, phone, subject, or message body
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.contactName.toLowerCase().includes(q) ||
          t.contactEmail.toLowerCase().includes(q) ||
          (t.contactPhone && t.contactPhone.includes(q)) ||
          t.messages.some(
            (m) =>
              (m.subject && m.subject.toLowerCase().includes(q)) ||
              (m.body && m.body.toLowerCase().includes(q))
          )
      );
    }

    return result;
  }, [threads, quickFilter, searchQuery, activeFolder]);

  // Active Selected Conversation Thread
  const activeThread = React.useMemo(() => {
    if (!selectedContactKey) {
      // In desktop view, select the first thread if none is selected
      if (!isMobile && filteredThreads.length > 0) {
        return filteredThreads[0];
      }
      return null;
    }
    return threads.find((t) => t.contactKey === selectedContactKey) || null;
  }, [threads, selectedContactKey, filteredThreads, isMobile]);

  // Fetch AI Smart Replies when active thread changes
  useEffect(() => {
    if (activeThread && activeThread.lastMessage) {
      fetchSmartReplies(activeThread.lastMessage);
    }
  }, [activeThread?.contactKey, activeThread?.messages.length]);

  // Mark all unread messages in thread as read
  useEffect(() => {
    if (activeThread && activeThread.unreadCount > 0) {
      activeThread.messages
        .filter((m) => !m.read && !m.isOutgoing)
        .forEach((m) => handleMarkAsRead(m.id));
    }
  }, [activeThread?.contactKey]);

  // -------------------------------------------------------------
  // Message Actions: Mark as Read & Delete
  // -------------------------------------------------------------
  const handleMarkAsRead = async (emailId) => {
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      await fetch(`http://localhost:5000/api/mail/${emailId}/read`, {
        method: 'PATCH',
        headers
      });
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, read: 1 } : e)));
    } catch {
      // offline
    }
  };

  const handleDeleteMessage = async (emailId) => {
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await fetch(`http://localhost:5000/api/mail/${emailId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (triggerToast) triggerToast('🗑️ Message deleted');
      }
    } catch {
      // offline
    }
  };

  // Toggle Favorite Status
  const handleToggleFavorite = (contactKey) => {
    setFavorites((prev) => {
      const exists = prev.includes(contactKey);
      const updated = exists ? prev.filter((k) => k !== contactKey) : [...prev, contactKey];
      if (triggerToast) {
        triggerToast(exists ? 'Removed from Favorites' : '⭐ Added to Favorites');
      }
      return updated;
    });
  };

  // -------------------------------------------------------------
  // Spike Mail Quoting & Single-Reply Constraint Handlers
  // -------------------------------------------------------------
  const handleQuoteMessage = (msg) => {
    if (repliedMessageIds.includes(msg.id)) {
      if (triggerToast) triggerToast('⚠️ Single-Reply Rule: Each message bubble can only be replied to once.');
      return;
    }
    setQuotedMessage(msg);
    setIsSubjectOpen(false); // Automatically hide Subject field when replying/tagging!
    if (triggerToast) triggerToast(`↩️ Quoted message from ${msg.isOutgoing ? 'You' : activeThread.contactName}`);
  };

  const handleOpenTraditionalReply = (msg) => {
    if (!activeThread) return;
    const origSubj = msg?.subject || activeThread.lastMessage?.subject || 'PhoneMail Conversation';
    const cleanSubj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    onOpenCompose(
      activeThread.contactEmail,
      cleanSubj,
      true, // isLockedTo = true
      true  // isReply = true
    );
  };

  // -------------------------------------------------------------
  // Send Inline Chat Message (Spike Mail Bottom Input)
  // -------------------------------------------------------------
  const handleSendInlineReply = async (e) => {
    if (e) e.preventDefault();
    if (!activeThread || !inlineReplyText.trim()) return;

    setIsSendingReply(true);
    const content = inlineReplyText.trim();
    const targetRecipient = activeThread.contactEmail;

    // Subject Visibility & Selection Rules:
    // When replying/tagging: Re: <Original Subject>
    // When starting a new email thread or typing inlineSubject: inlineSubject
    let subject;
    if (quotedMessage) {
      const origSubj = quotedMessage.subject || activeThread.lastMessage?.subject || 'PhoneMail Conversation';
      subject = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    } else if (inlineSubject.trim()) {
      subject = inlineSubject.trim();
    } else {
      const lastSubj = activeThread.lastMessage?.subject || 'PhoneMail Conversation';
      subject = lastSubj.startsWith('Re:') ? lastSubj : `Re: ${lastSubj}`;
    }

    // Build body with quote banner if quoting
    let finalBody = content;
    if (quotedMessage) {
      const senderName = quotedMessage.isOutgoing ? 'You' : activeThread.contactName;
      const quoteSnippet = (quotedMessage.body || '').replace(/\[In reply to[^\]]+\]\s*/g, '').slice(0, 90).replace(/\n/g, ' ');
      finalBody = `[In reply to ${senderName}: "${quoteSnippet}"]\n\n${content}`;
    }

    if (attachedFile) {
      finalBody = `${finalBody}\n\n[Attachment: ${attachedFile.name}]`;
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('http://localhost:5000/api/mail/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: targetRecipient,
          subject,
          body: activeThread.isGroup ? `[Group Thread: ${activeThread.contactEmail}]\n\n${finalBody}` : finalBody,
          from: currentUser?.email || '9876543210@phonemail.com'
        })
      });

      const data = await res.json();
      if (res.ok) {
        // Enforce Single-Reply Constraint: mark quoted message as replied!
        if (quotedMessage) {
          setRepliedMessageIds((prev) => Array.from(new Set([...prev, quotedMessage.id])));
        }

        setInlineReplyText('');
        setAttachedFile(null);
        setQuotedMessage(null);
        setInlineSubject('');
        setIsSubjectOpen(false);

        if (triggerToast) {
          triggerToast(
            data.smsAlertSent
              ? `✅ Sent & Carrier SMS dispatched to ${data.smsNotification?.recipientPhone || 'recipient'}!`
              : '✅ Message sent!'
          );
        }
        await fetchEmails();
      } else {
        if (triggerToast) triggerToast(data.error || 'Failed to send message');
      }
    } catch {
      if (triggerToast) triggerToast('Error sending message: Server offline');
    } finally {
      setIsSendingReply(false);
    }
  };

  // -------------------------------------------------------------
  // AI Summarization & Smart Replies
  // -------------------------------------------------------------
  const fetchSmartReplies = async (email) => {
    if (!email) return;
    setIsLoadingReplies(true);
    try {
      const res = await fetch('http://localhost:5000/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: email.body,
          subject: email.subject,
          from: email.senderEmail
        })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSmartReplies(data.suggestions.slice(0, 3));
      }
    } catch {
      // fallback preserved
    } finally {
      setIsLoadingReplies(false);
    }
  };

  const handleSummarizeThread = async () => {
    if (!activeThread) return;
    setIsSummarizing(true);
    try {
      // Concatenate thread messages for context
      const threadContent = activeThread.messages
        .map((m) => `${m.isOutgoing ? 'Me' : activeThread.contactName}: ${m.body}`)
        .join('\n');

      const res = await fetch('http://localhost:5000/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: threadContent,
          subject: activeThread.lastMessage?.subject || 'Chat Thread',
          from: activeThread.contactEmail
        })
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setAiSummaries((prev) => ({
          ...prev,
          [activeThread.contactKey]: data.summary
        }));
        if (triggerToast) triggerToast('✨ Thread summarized with AI!');
      }
    } catch {
      if (triggerToast) triggerToast('AI summary error');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Quick Inbound Test Email
  const handleQuickInboundSimulation = async () => {
    try {
      const target = currentUser ? currentUser.email : '9876543210@phonemail.com';
      const res = await fetch('http://localhost:5000/api/mail/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'judge@hackathon.org',
          to: target,
          subject: 'Hackathon Evaluation: Live Chat Feature Feedback',
          body: 'Hello Alex! We love the new Spike Mail conversational feed. The unified chat stream makes phone-emailing feel completely effortless.'
        })
      });
      if (res.ok) {
        await fetchEmails();
        if (triggerToast) triggerToast('📬 Inbound email received & added to chat thread!');
      }
    } catch {
      if (triggerToast) triggerToast('Failed to simulate incoming message');
    }
  };

  // Avatar Background and Image Helpers
  const getAvatarBgStyle = (color) => {
    if (!color) return { backgroundColor: '#00a884' };
    if (color.startsWith('#') || color.startsWith('rgb')) {
      return { backgroundColor: color };
    }
    return {};
  };

  const getAvatarBgClass = (color) => {
    if (color && !color.startsWith('#') && !color.startsWith('rgb')) {
      return `bg-gradient-to-tr ${color}`;
    }
    return '';
  };

  // Avatar Image Upload via FileReader (Base64)
  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      if (triggerToast) triggerToast('⚠️ Please select a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (triggerToast) triggerToast('⚠️ Image too large (Max 5MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target.result;
      setAccountDetails((prev) => {
        const next = { ...prev, avatarImage: base64Url };
        try {
          localStorage.setItem('phonemail_profile_settings', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      if (triggerToast) triggerToast('📸 Profile picture uploaded & preview updated!');
    };
    reader.readAsDataURL(file);
  };

  // Remove uploaded picture to revert to monogram
  const handleRemoveAvatar = () => {
    setAccountDetails((prev) => {
      const next = { ...prev, avatarImage: null };
      try {
        localStorage.setItem('phonemail_profile_settings', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (triggerToast) triggerToast('🗑️ Avatar image removed. Reverted to monogram initials.');
  };

  // Account Settings Helpers
  const handleAddAlias = (e) => {
    e.preventDefault();
    const clean = accountDetails.newAliasInput.trim();
    if (!clean) return;
    const formatted = clean.includes('@') ? clean : `${clean}@phonemail.com`;
    if (!accountDetails.aliases.includes(formatted)) {
      setAccountDetails((prev) => ({
        ...prev,
        aliases: [...prev.aliases, formatted],
        newAliasInput: ''
      }));
      if (triggerToast) triggerToast(`✅ Added alias: ${formatted}`);
    }
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('phonemail_profile_settings', JSON.stringify(accountDetails));
    } catch {
      // ignore
    }
    setSettingsModalOpen(false);
    if (triggerToast) triggerToast('💾 Account profile settings & avatar saved!');
  };

  return (
    <div className="relative flex flex-col flex-1 h-full w-full bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP NAVIGATION BAR (Spike Mail Style)                      */}
      {/* ------------------------------------------------------------- */}
      <header className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800/80 flex flex-col gap-2 shrink-0 z-20">
        <div className="flex items-center gap-3">
          
          {/* Top-Left Slide-Out Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Full-Width Spike Mail Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search conversations, contacts, or phone numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Simulation Action */}
          <button
            type="button"
            onClick={handleQuickInboundSimulation}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 text-xs font-semibold transition cursor-pointer shrink-0 shadow-sm"
            title="Simulate incoming email from contact"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>Simulate</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchEmails}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Refresh conversations"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Top-Right Profile Icon opening Account Settings */}
          <div
            className="relative inline-block overflow-visible shrink-0"
            style={{ overflow: 'visible' }}
          >
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="group relative block p-0 bg-transparent border-0 cursor-pointer focus:outline-none transition transform hover:scale-105 active:scale-95"
              title="Account & Profile Settings"
            >
              {/* Inner Circular Avatar Container: rounded-full and overflow-hidden applied strictly here */}
              <div
                style={getAvatarBgStyle(accountDetails.avatarColor)}
                className={`w-9 h-9 rounded-full overflow-hidden ${getAvatarBgClass(
                  accountDetails.avatarColor
                )} flex items-center justify-center text-white text-xs font-extrabold shadow-md shadow-black/30 group-hover:ring-2 group-hover:ring-emerald-400/50 transition`}
              >
                {accountDetails.avatarImage ? (
                  <img
                    src={accountDetails.avatarImage}
                    alt={accountDetails.displayName || 'Profile'}
                    className="w-full h-full object-cover rounded-full pointer-events-none"
                  />
                ) : (
                  <span>
                    {accountDetails.displayName
                      ? accountDetails.displayName.slice(0, 2).toUpperCase()
                      : currentUser?.phoneNumber
                      ? currentUser.phoneNumber.slice(-2)
                      : '98'}
                  </span>
                )}
              </div>
            </button>

            {/* Online Indicator Green Badge: positioned absolute bottom-0 right-0 with z-10 and thin ring border */}
            <span
              className="absolute bottom-0 right-0 z-10 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 pointer-events-none"
              title="Online"
            />
          </div>
        </div>

        {/* ----------------------------------------------------------- */}
        {/* 2. QUICK FILTER CHIPS (All, Unread, Attachments, Favorites) */}
        {/* ----------------------------------------------------------- */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {[
            { id: 'all', label: 'All', count: threads.length },
            { id: 'unread', label: 'Unread', count: threads.filter((t) => t.unreadCount > 0).length },
            { id: 'attachments', label: 'Attachments', count: threads.filter((t) => t.hasAttachments).length },
            { id: 'favorites', label: 'Favorites', count: threads.filter((t) => t.isFavorite).length },
          ].map((chip) => {
            const isActive = quickFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuickFilter(chip.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
                }`}
              >
                <span>{chip.label}</span>
                {chip.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-black/30 text-white' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 3. MAIN CONVERSATIONAL BODY (Thread List + Chat View)          */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Contact Thread List Column */}
        <aside
          className={`${
            isMobile
              ? activeThread && selectedContactKey
                ? 'hidden'
                : 'w-full flex-1 flex flex-col'
              : 'w-80 lg:w-96 border-r border-slate-800 flex flex-col shrink-0'
          } bg-slate-950/70 overflow-hidden`}
        >
          {/* List Header caption */}
          <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
              {activeFolder === 'home'
                ? `Unified Chats (${filteredThreads.length})`
                : `${activeFolder.toUpperCase()} (0)`}
            </span>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Spike Feed Active
            </span>
          </div>

          {/* Scrollable Conversation List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {isLoading && emails.length === 0 ? (
              <EmailListSkeleton count={4} />
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <Mail className="w-10 h-10 mx-auto mb-2 text-slate-600 stroke-1" />
                <p className="font-semibold text-slate-400">No conversations found</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {searchQuery ? `No results for "${searchQuery}"` : 'Send or simulate an email to start chatting.'}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenCompose && onOpenCompose()}
                  className="mt-4 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 rounded-xl font-semibold text-xs transition cursor-pointer"
                >
                  + Start New Chat
                </button>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = activeThread?.contactKey === thread.contactKey;
                const lastMsg = thread.lastMessage;
                const snippet = lastMsg?.body
                  ? lastMsg.body.replace(/\n+/g, ' ').slice(0, 75)
                  : '(No text content)';

                return (
                  <div
                    key={thread.contactKey}
                    onClick={() => setSelectedContactKey(thread.contactKey)}
                    className={`p-3.5 cursor-pointer transition select-none flex items-start gap-3 border-l-4 ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500'
                        : 'hover:bg-slate-900/60 border-transparent'
                    } ${thread.unreadCount > 0 ? 'bg-slate-900/25' : ''}`}
                  >
                    {/* Contact Avatar Circle with Initial or Group Icon */}
                    <div
                      className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${thread.avatarGradient} flex items-center justify-center text-white font-extrabold text-sm shadow-md shrink-0`}
                    >
                      {thread.isGroup ? (
                        <Users className="w-5 h-5 text-white" />
                      ) : (
                        thread.contactName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM'
                      )}
                    </div>

                    {/* Thread Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={`font-semibold text-xs truncate max-w-[170px] ${
                            thread.unreadCount > 0 ? 'text-white font-bold' : 'text-slate-200'
                          }`}
                        >
                          {thread.contactName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {lastMsg?.createdAt
                            ? new Date(lastMsg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : ''}
                        </span>
                      </div>

                      {/* Subject snippet */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-xs truncate ${
                            thread.unreadCount > 0 ? 'font-bold text-slate-100' : 'text-slate-300 font-medium'
                          }`}
                        >
                          {lastMsg?.subject || '(No Subject)'}
                        </span>
                      </div>

                      {/* Latest message snippet */}
                      <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug">
                        {lastMsg?.isOutgoing ? <span className="text-indigo-400">You: </span> : null}
                        {snippet}
                      </p>

                      {/* Pill badges */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {thread.hasPhoneHandle && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                              <Phone className="w-2.5 h-2.5" /> SMS Bridge
                            </span>
                          )}
                          {thread.hasAttachments && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                              <Paperclip className="w-2.5 h-2.5" /> Doc
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {thread.isFavorite && (
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          )}
                          {thread.unreadCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white shadow-sm">
                              {thread.unreadCount}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ----------------------------------------------------------- */}
        {/* Chat Thread Conversation Stream (Spike Mail Conversational) */}
        {/* ----------------------------------------------------------- */}
        <section
          className={`${
            isMobile
              ? activeThread && selectedContactKey
                ? 'w-full min-w-0 flex-1 flex flex-col'
                : 'hidden'
              : 'flex-1 min-w-0 flex flex-col'
          } bg-slate-900/40 relative overflow-hidden`}
        >
          {activeThread ? (
            <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
              
              {/* Chat Thread Header Bar */}
              <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                {/* Left: Back arrow button (shrink-0) + Avatar circle (shrink-0) */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => setSelectedContactKey(null)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 cursor-pointer shrink-0 transition-colors"
                      title="Back to conversations"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}

                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-tr ${activeThread.avatarGradient} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md`}
                  >
                    {activeThread.isGroup ? (
                      <Users className="w-4 h-4 text-white" />
                    ) : (
                      activeThread.contactName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM'
                    )}
                  </div>
                </div>

                {/* Middle section: Display contact name on top and email/phone below with flex-1 min-w-0 pr-2 */}
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="font-bold text-sm text-slate-100 truncate leading-tight flex items-center gap-1.5">
                    {activeThread.isGroup && <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    <span>{activeThread.contactName}</span>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono truncate leading-tight mt-0.5">
                    {activeThread.contactEmail}
                  </div>
                </div>

                {/* Right section: Grouped flex container with 3 icon-only circular action buttons */}
                <div className="flex items-center gap-1.5 shrink-0 relative">
                  {/* 1. Favorite / Star Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        handleToggleFavorite(activeThread.contactKey);
                        toggleTooltip('favorite');
                      }}
                      className={`p-2 rounded-full hover:bg-slate-800 transition-colors cursor-pointer ${
                        activeThread.isFavorite
                          ? 'text-amber-400 bg-amber-400/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={activeThread.isFavorite ? 'Starred / Favorite' : 'Favorite'}
                      aria-label="Favorite"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          activeThread.isFavorite ? 'fill-amber-400' : ''
                        }`}
                      />
                    </button>
                    {activeTooltip === 'favorite' && (
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        {activeThread.isFavorite ? 'Starred / Favorite' : 'Favorite'}
                      </div>
                    )}
                  </div>

                  {/* 2. AI Summary Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        handleSummarizeThread();
                        toggleTooltip('summary');
                      }}
                      disabled={isSummarizing}
                      className={`p-2 rounded-full hover:bg-slate-800 transition-colors cursor-pointer ${
                        isSummarizing
                          ? 'text-purple-400 bg-purple-400/10'
                          : 'text-slate-400 hover:text-purple-300'
                      }`}
                      title="AI Summary"
                      aria-label="AI Summary"
                    >
                      <Sparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin text-purple-400' : ''}`} />
                    </button>
                    {activeTooltip === 'summary' && (
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        {isSummarizing ? 'Summarizing...' : 'AI Summary'}
                      </div>
                    )}
                  </div>

                  {/* 3. SMS Reply Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        toggleTooltip('reply');
                        if (onOpenTelecom) {
                          onOpenTelecom('reply', activeThread.contactEmail, activeThread.lastMessage?.subject);
                        }
                      }}
                      className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                      title="SMS Reply"
                      aria-label="SMS Reply"
                    >
                      <Reply className="w-4 h-4" />
                    </button>
                    {activeTooltip === 'reply' && (
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        SMS Reply
                      </div>
                    )}
                  </div>

                  {/* 4. Traditional Email View Switcher */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        toggleTooltip('traditional');
                        const origSubj = activeThread.lastMessage?.subject || 'PhoneMail Conversation';
                        const cleanSubj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
                        onOpenCompose(
                          activeThread.contactEmail,
                          cleanSubj,
                          true, // isLockedTo = true
                          false
                        );
                      }}
                      className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                      title="Traditional Email View (Locked to contact)"
                      aria-label="Traditional Email View"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    {activeTooltip === 'traditional' && (
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        Traditional View
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Quick Summary Card if present */}
              {aiSummaries[activeThread.contactKey] && (
                <div className="mx-4 mt-3 p-3.5 bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-slate-900 border border-purple-500/40 rounded-2xl shadow-lg flex items-start justify-between gap-3 animate-in fade-in duration-200 shrink-0">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold text-purple-200 uppercase tracking-wider block">
                        Thread Summary (AI Engine)
                      </span>
                      <p className="text-xs text-purple-100 mt-0.5 leading-relaxed font-sans">
                        "{aiSummaries[activeThread.contactKey]}"
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAiSummaries((prev) => {
                        const copy = { ...prev };
                        delete copy[activeThread.contactKey];
                        return copy;
                      })
                    }
                    className="text-slate-400 hover:text-slate-200 text-xs p-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Conversational Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {activeThread.messages.map((msg, idx) => {
                  const isOut = msg.isOutgoing;
                  const isSmsBridge =
                    msg.body && msg.body.includes('[SMS Reply via Carrier Gateway');
                  const isReplied = repliedMessageIds.includes(msg.id);
                  const isSubjectExpanded = expandedSubjectIds.includes(msg.id);
                  const prevMsg = idx > 0 ? activeThread.messages[idx - 1] : null;

                  // Distinct starting email detection
                  const isDistinctStartingEmail =
                    idx === 0 ||
                    (msg.subject &&
                      (!prevMsg ||
                        !prevMsg.subject ||
                        msg.subject.replace(/^Re:\s*/i, '').trim().toLowerCase() !==
                          prevMsg.subject.replace(/^Re:\s*/i, '').trim().toLowerCase()));

                  const cleanBody = (msg.body || '')
                    .replace(/\[In reply to [^:]+:\s*"[^"]*"\]\s*/g, '')
                    .replace(/\[Group Thread:[^\]]+\]\s*/g, '')
                    .trim();

                  const isLongMessage = cleanBody.length > 280;

                  return (
                    <div
                      key={msg.id || idx}
                      className={`relative flex flex-col ${isOut ? 'items-end' : 'items-start'} group animate-in fade-in duration-200`}
                    >
                      {/* Swipe-to-reply hint indicator (revealed when dragging right) */}
                      {swipingMsgId === msg.id && swipeOffset > 15 && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 text-indigo-400 flex items-center gap-1 text-xs font-bold pointer-events-none transition ${
                            isOut ? 'right-[85%]' : 'left-2'
                          }`}
                        >
                          <Reply className="w-4 h-4 animate-bounce" />
                          <span>{isReplied ? 'Replied' : 'Reply'}</span>
                        </div>
                      )}

                      {/* Message Bubble Container with Swipe Gestures */}
                      <div
                        onTouchStart={(e) => {
                          touchStartXRef.current = e.touches[0].clientX;
                          setSwipingMsgId(msg.id);
                        }}
                        onTouchMove={(e) => {
                          if (swipingMsgId !== msg.id) return;
                          const currentX = e.touches[0].clientX;
                          const diff = currentX - touchStartXRef.current;
                          if (diff > 0 && diff < 85) {
                            setSwipeOffset(diff);
                          }
                        }}
                        onTouchEnd={() => {
                          if (swipingMsgId === msg.id) {
                            if (swipeOffset > 45) {
                              if (!isReplied) {
                                handleQuoteMessage(msg);
                              } else if (triggerToast) {
                                triggerToast('⚠️ Single-Reply Rule: Each message bubble can only be replied to once.');
                              }
                            }
                            setSwipingMsgId(null);
                            setSwipeOffset(0);
                          }
                        }}
                        style={{
                          transform: swipingMsgId === msg.id ? `translateX(${swipeOffset}px)` : 'none',
                          transition: swipingMsgId === msg.id ? 'none' : 'transform 0.15s ease-out'
                        }}
                        className={`max-w-[88%] sm:max-w-[78%] rounded-3xl p-4 shadow-md transition select-text ${
                          isOut
                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-xs'
                            : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-xs'
                        }`}
                      >
                        {/* Inline Subject Header for Distinct Starting Emails (Click-to-Expand & Horizontal Scroll) */}
                        {msg.subject && (isDistinctStartingEmail || !msg.subject.toLowerCase().startsWith('re:')) && (
                          <div
                            onClick={(e) => toggleExpandSubject(msg.id, e)}
                            title={msg.subject}
                            className={`text-[11px] font-bold pb-2 mb-2 border-b flex items-start justify-between gap-2.5 cursor-pointer select-none transition-colors group/subj ${
                              isOut
                                ? 'border-indigo-400/30 text-indigo-100 hover:bg-indigo-500/20'
                                : 'border-slate-800 text-slate-300 hover:bg-slate-800/40'
                            } p-1 -m-1 rounded-xl`}
                          >
                            <div className="flex items-start gap-1.5 min-w-0 flex-1">
                              {/* Tag Icon + Subtle Chevron Indicator */}
                              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                <Tag className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                                {isSubjectExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-indigo-200 transition-transform duration-200 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-indigo-400/80 group-hover/subj:text-indigo-200 transition-transform duration-200 shrink-0" />
                                )}
                              </div>

                              <span className="text-[10px] font-mono text-indigo-200 uppercase tracking-wider shrink-0 mt-0.5">
                                Subject:
                              </span>

                              {/* Subject Text with Click-to-Expand and Horizontal Scroll Support */}
                              <div
                                className={`font-semibold text-slate-100 font-sans flex-1 min-w-0 ${
                                  isSubjectExpanded
                                    ? 'whitespace-normal break-words leading-relaxed'
                                    : 'truncate overflow-x-auto whitespace-nowrap no-scrollbar'
                                }`}
                              >
                                {msg.subject}
                              </div>
                            </div>

                            {isSmsBridge && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono shrink-0 mt-0.5">
                                SMS-to-Email
                              </span>
                            )}
                          </div>
                        )}

                        {/* Quoted Message Visual Link Banner */}
                        {msg.quotedSnippet && (
                          <div
                            className={`mb-2.5 p-2.5 rounded-2xl border-l-4 text-xs ${
                              isOut
                                ? 'bg-indigo-950/70 border-indigo-400 text-indigo-100'
                                : 'bg-slate-800/90 border-indigo-500 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-1 font-semibold text-[10px] text-indigo-300 mb-0.5">
                              <Reply className="w-3 h-3 shrink-0" />
                              <span>In reply to {msg.quotedSender || 'message'}</span>
                            </div>
                            <p className="line-clamp-2 italic text-[11px] opacity-90 font-sans">
                              "{msg.quotedSnippet}"
                            </p>
                          </div>
                        )}

                        {/* Body Text Truncation for Long Messages */}
                        {isLongMessage ? (
                          <div>
                            <div className="text-xs sm:text-sm whitespace-pre-line leading-relaxed font-sans">
                              {cleanBody.slice(0, 240)}...
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedEmail(msg)}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-300 hover:text-white underline cursor-pointer"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                              Read full email...
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs sm:text-sm whitespace-pre-line leading-relaxed font-sans">
                            {cleanBody || '(No text content)'}
                          </div>
                        )}

                        {/* Bubble Footer: Timestamp, Read Status, & Actions */}
                        <div
                          className={`mt-2 pt-1 flex items-center justify-between gap-2 text-[10px] font-mono border-t ${
                            isOut ? 'border-indigo-500/30 text-indigo-200' : 'border-slate-800/60 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>
                              {msg.createdAt
                                ? new Date(msg.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </span>
                            {isOut && <CheckCheck className="w-3.5 h-3.5 text-sky-300" />}
                            {isReplied && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-sans">
                                <CheckCheck className="w-2.5 h-2.5" /> Replied
                              </span>
                            )}
                          </div>

                          {/* Quick Actions (Reply, Traditional View, Expand, Delete) */}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            {!isReplied ? (
                              <button
                                type="button"
                                onClick={() => handleQuoteMessage(msg)}
                                className={`p-1 rounded-md transition cursor-pointer ${
                                  isOut ? 'hover:bg-indigo-800 text-indigo-200' : 'hover:bg-slate-800 text-slate-400 hover:text-indigo-400'
                                }`}
                                title="Reply / Quote message (Swipe right)"
                              >
                                <Reply className="w-3 h-3" />
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => handleOpenTraditionalReply(msg)}
                              className={`p-1 rounded-md transition cursor-pointer ${
                                isOut ? 'hover:bg-indigo-800 text-indigo-200' : 'hover:bg-slate-800 text-slate-400 hover:text-amber-300'
                              }`}
                              title="Traditional Reply (Locked To:)"
                            >
                              <FileText className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpandedEmail(msg)}
                              className={`p-1 rounded-md transition cursor-pointer ${
                                isOut ? 'hover:bg-indigo-800 text-indigo-200' : 'hover:bg-slate-800 text-slate-400 hover:text-sky-300'
                              }`}
                              title="Expand / Full email view"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className={`p-1 rounded-md transition cursor-pointer ${
                                isOut ? 'hover:bg-indigo-800 text-indigo-200' : 'hover:bg-slate-800 text-slate-400 hover:text-rose-400'
                              }`}
                              title="Delete message"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* ------------------------------------------------------- */}
              {/* Spike Mail Inline Bottom Composer with Smart Replies    */}
              {/* ------------------------------------------------------- */}
              <div className="w-full bg-slate-900/90 border-t border-slate-800 shrink-0 space-y-2 p-2 sm:p-3 box-border overflow-hidden">
                
                {/* 1-Click Smart Reply Chips */}
                <div className="w-full overflow-x-auto no-scrollbar flex items-center gap-2 pb-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Quick:</span>
                  </span>
                  {smartReplies.map((reply, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInlineReplyText(reply)}
                      className="px-3 py-1 rounded-full bg-indigo-950/70 hover:bg-indigo-900 text-indigo-200 text-xs border border-indigo-700/40 hover:border-indigo-500 transition cursor-pointer shrink-0 shadow-sm text-left active:scale-95 whitespace-nowrap"
                    >
                      💬 {reply}
                    </button>
                  ))}
                </div>

                {/* Quoted Message Preview Banner above bottom input */}
                {quotedMessage && (
                  <div className="w-full flex items-center justify-between p-2.5 bg-indigo-950/80 border border-indigo-700/50 rounded-xl text-xs text-indigo-200 animate-in fade-in slide-in-from-bottom-2 box-border">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <div className="truncate">
                        <span className="font-bold text-indigo-300">
                          Replying to {quotedMessage.isOutgoing ? 'Your message' : activeThread.contactName}:
                        </span>{' '}
                        <span className="italic text-slate-300 font-sans">
                          "{(quotedMessage.body || '').replace(/\[In reply to[^\]]+\]\s*/g, '').slice(0, 70)}"
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuotedMessage(null)}
                      className="p-1 text-slate-400 hover:text-white rounded-lg shrink-0 ml-2 cursor-pointer"
                      title="Cancel Quote"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Collapsible Subject Input Bar (Hidden when replying/tagging, Visible when starting new thread or toggled) */}
                {!quotedMessage && (isSubjectOpen || activeThread.messages.length === 0) && (
                  <div className="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs animate-in fade-in duration-150 box-border">
                    <Tag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase tracking-wider font-mono">
                      Subject:
                    </span>
                    <input
                      type="text"
                      placeholder={activeThread.lastMessage?.subject || 'Enter email subject...'}
                      value={inlineSubject}
                      onChange={(e) => setInlineSubject(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border-none text-slate-100 placeholder-slate-500 focus:outline-none text-xs"
                    />
                    {activeThread.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSubjectOpen(false);
                          setInlineSubject('');
                        }}
                        className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer shrink-0"
                        title="Collapse subject bar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Simulated Attachment Indicator Chip */}
                {attachedFile && (
                  <div className="w-full flex items-center justify-between p-2 bg-slate-800 rounded-xl text-xs text-slate-300 border border-slate-700 box-border">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="font-medium truncate">{attachedFile.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="text-slate-400 hover:text-white p-0.5 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Inline Text Input & Send Form */}
                <form
                  onSubmit={handleSendInlineReply}
                  className="w-full flex items-center gap-2 px-3 py-2 box-border"
                >
                  {/* Left Action Icons Container (Document, Paperclip, Tag) */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* In-Chat Traditional View Switcher (occupies camera/media slot) */}
                    <button
                      type="button"
                      onClick={() => {
                        const origSubj = activeThread.lastMessage?.subject || 'PhoneMail Conversation';
                        const cleanSubj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
                        onOpenCompose(
                          activeThread.contactEmail,
                          cleanSubj,
                          true, // isLockedTo = true
                          false
                        );
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                      title="Switch to Traditional Email View (Locked to contact)"
                    >
                      <FileText className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAttachedFile({ name: 'equipment_inspection_checklist.pdf' });
                        if (triggerToast) triggerToast('📎 Attached simulated document');
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition cursor-pointer"
                      title="Attach file / spec"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Collapsible Subject Toggle Button (Hidden when replying/tagging) */}
                    {!quotedMessage && activeThread.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsSubjectOpen((prev) => !prev)}
                        className={`p-2 rounded-xl transition cursor-pointer ${
                          isSubjectOpen || inlineSubject ? 'text-indigo-400 bg-indigo-950/60' : 'text-slate-400 hover:text-indigo-400 hover:bg-slate-800'
                        }`}
                        title={isSubjectOpen ? "Hide Subject field" : "Edit / Add Subject"}
                      >
                        <Tag className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Input Element: Message Judge / contact name */}
                  <input
                    type="text"
                    placeholder={
                      quotedMessage
                        ? `Reply to ${quotedMessage.isOutgoing ? 'your message' : activeThread.contactName}...`
                        : `Message ${activeThread.contactName}...`
                    }
                    value={inlineReplyText}
                    onChange={(e) => setInlineReplyText(e.target.value)}
                    className="flex-1 min-w-0 w-full py-2.5 px-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner"
                  />

                  {/* Circular Send Button */}
                  <button
                    type="submit"
                    disabled={isSendingReply || !inlineReplyText.trim()}
                    className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-md shadow-indigo-600/30 transition transform active:scale-95 cursor-pointer"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
                  <span>Press Enter to send inline message</span>
                  {activeThread.hasPhoneHandle && (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Carrier SMS Alert enabled
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
                <Mail className="w-8 h-8 stroke-1" />
              </div>
              <h3 className="text-base font-bold text-slate-200">Spike Mail Conversational Feed</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                Traditional folders have been unified into conversation threads. Select a contact on the left to chat,
                or click the floating compose button to start a new thread.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. TRADITIONAL COMPOSE FLOATING ACTION BUTTON (FAB)            */}
      {/* ------------------------------------------------------------- */}
      <button
        type="button"
        onClick={() => onOpenCompose && onOpenCompose()}
        className="fixed bottom-20 right-6 sm:bottom-[5.25rem] sm:right-6 z-40 p-3.5 sm:p-4 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full shadow-2xl shadow-indigo-600/40 border border-indigo-400/40 flex items-center justify-center transition transform hover:scale-105 active:scale-95 cursor-pointer group"
        title="Start New Email Thread (Traditional Composer)"
      >
        <Plus className="w-5 h-5 sm:w-6 sm:h-6 group-hover:rotate-90 transition-transform duration-200" />
      </button>

      {/* ------------------------------------------------------------- */}
      {/* 5. SLIDE-OUT MENU DRAWER (Top-Left Hamburger Navigation)       */}
      {/* ------------------------------------------------------------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-72 max-w-[80vw] h-full bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-5 z-10 shadow-2xl animate-in slide-in-from-left duration-250">
            <div>
              {/* Drawer Top Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-100">PhoneMail</h3>
                    <p className="text-[10px] text-emerald-400 font-mono">Spike Conversational Mail</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="mt-5 space-y-1.5">
                {[
                  { id: 'home', label: 'Home (Unified Stream)', icon: Inbox, count: threads.length },
                  { id: 'drafts', label: 'Drafts', icon: FileText, count: 0 },
                  { id: 'spam', label: 'Spam', icon: AlertOctagon, count: 0 },
                  { id: 'trash', label: 'Trash', icon: Trash2, count: 0 },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeFolder === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveFolder(item.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-70">{item.count}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Telecom Quick Links */}
              <div className="mt-6 pt-5 border-t border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 px-1 tracking-wider block">
                  Carrier Simulator
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    if (onOpenTelecom) onOpenTelecom('ivr');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <PhoneCall className="w-4 h-4 text-emerald-400" />
                  <span>Telecom Simulator (IVR & SMS)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    handleQuickInboundSimulation();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Simulate Incoming Email</span>
                </button>
              </div>
            </div>

            {/* Drawer User Card Footer */}
            <div className="pt-4 border-t border-slate-800">
              {currentUser ? (
                <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      className="relative inline-block overflow-visible shrink-0"
                      style={{ overflow: 'visible' }}
                    >
                      <div
                        style={getAvatarBgStyle(accountDetails.avatarColor)}
                        className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold shadow-sm ${getAvatarBgClass(accountDetails.avatarColor)}`}
                      >
                        {accountDetails.avatarImage ? (
                          <img 
                            src={accountDetails.avatarImage} 
                            alt="Profile" 
                            className="w-full h-full object-cover rounded-full pointer-events-none" 
                          />
                        ) : (
                          currentUser.phoneNumber.slice(-2)
                        )}
                      </div>
                      <span 
                        className="absolute bottom-0 right-0 z-10 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950 pointer-events-none"
                        title="Online"
                      />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-slate-100 truncate">{currentUser.phoneNumber}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{currentUser.email}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onLogout();
                    }}
                    title="Sign Out"
                    className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenAuth();
                  }}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. ACCOUNT SETTINGS MODAL (Top-Right Profile Screen)          */}
      {/* ------------------------------------------------------------- */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Account & Profile Settings</h3>
                  <p className="text-[11px] text-slate-400">Manage your PhoneMail identity, aliases, and language</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/50 p-2 gap-1.5">
              {[
                { id: 'aliases', label: 'Alias IDs', icon: AtSign },
                { id: 'language', label: 'Language', icon: Globe },
                { id: 'details', label: 'Personal Details', icon: User },
                { id: 'picture', label: 'Profile Picture', icon: Camera },
              ].map((tab) => {
                const Icon = tab.icon;
                const isSelected = settingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSettingsTab(tab.id)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Tab Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* TAB 1: ALIAS IDs */}
              {settingsTab === 'aliases' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Primary PhoneMail Handle
                    </h4>
                    <div className="p-3 bg-slate-950 rounded-2xl border border-emerald-500/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="font-mono text-sm text-emerald-300 font-bold">
                          {currentUser?.email || '9876543210@phonemail.com'}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                        Default
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Configured Aliases
                    </h4>
                    <div className="space-y-2">
                      {accountDetails.aliases.map((alias, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300"
                        >
                          <span>{alias}</span>
                          <span className="text-[10px] text-slate-500">Active</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleAddAlias} className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-slate-300">Add New Sending Alias</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. alex.project@phonemail.com"
                        value={accountDetails.newAliasInput}
                        onChange={(e) =>
                          setAccountDetails((prev) => ({ ...prev, newAliasInput: e.target.value }))
                        }
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Add Alias
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 2: LANGUAGE SELECTION */}
              {settingsTab === 'language' && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Select Display Language
                  </h4>
                  {[
                    { code: 'en', name: 'English (US / UK)' },
                    { code: 'hi', name: 'हिन्दी (Hindi)' },
                    { code: 'ta', name: 'தமிழ் (Tamil)' },
                    { code: 'te', name: 'తెలుగు (Telugu)' },
                    { code: 'es', name: 'Español (Spanish)' },
                    { code: 'fr', name: 'Français (French)' },
                  ].map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setAccountDetails((prev) => ({ ...prev, language: l.code }))}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium cursor-pointer transition ${
                        accountDetails.language === l.code
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{l.name}</span>
                      {accountDetails.language === l.code && <Check className="w-4 h-4 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              )}

              {/* TAB 3: PERSONAL DETAILS */}
              {settingsTab === 'details' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                    <input
                      type="text"
                      value={accountDetails.displayName}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({ ...prev, displayName: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Registered Phone</label>
                    <input
                      type="text"
                      disabled
                      value={accountDetails.phone}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Role / Designation</label>
                    <input
                      type="text"
                      value={accountDetails.title}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({ ...prev, title: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Default Email Signature</label>
                    <textarea
                      rows={2}
                      value={accountDetails.signature}
                      onChange={(e) =>
                        setAccountDetails((prev) => ({ ...prev, signature: e.target.value }))
                      }
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 resize-none focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: PROFILE PICTURE & AVATAR COLOR */}
              {settingsTab === 'picture' && (
                <div className="space-y-6 py-1">
                  {/* Avatar Preview & Clickable Upload Area */}
                  <div className="flex flex-col items-center justify-center">
                    <div className="relative group">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        style={getAvatarBgStyle(accountDetails.avatarColor)}
                        className={`w-28 h-28 rounded-3xl ${getAvatarBgClass(
                          accountDetails.avatarColor
                        )} flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-black/40 ring-4 ring-slate-800 group-hover:ring-indigo-500/80 transition-all duration-200 cursor-pointer overflow-hidden relative`}
                        title="Click to choose a photo"
                      >
                        {accountDetails.avatarImage ? (
                          <img
                            src={accountDetails.avatarImage}
                            alt="Profile Avatar"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <span>
                            {accountDetails.displayName
                              ? accountDetails.displayName.slice(0, 2).toUpperCase()
                              : currentUser?.phoneNumber
                              ? currentUser.phoneNumber.slice(-2)
                              : 'PM'}
                          </span>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity duration-200 text-slate-100">
                          <Camera className="w-6 h-6 text-white" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            Change Photo
                          </span>
                        </div>
                      </div>

                      {/* Small camera badge button at corner */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 p-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg ring-2 ring-slate-900 transition cursor-pointer"
                        title="Upload Profile Picture"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Hidden Native File Input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="hidden"
                    />

                    {/* Action Buttons: Upload & Remove */}
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/60 shadow-sm transition cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Upload Photo</span>
                      </button>

                      {accountDetails.avatarImage && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 shadow-sm transition cursor-pointer"
                          title="Remove picture and revert to monogram initials"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      Supports JPG, PNG, GIF, or WebP (max 5MB). Monogram initials shown when no image is uploaded.
                    </p>
                  </div>

                  {/* Avatar Background Color Picker Section */}
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold text-slate-200">Avatar Background Color</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {accountDetails.avatarColor.startsWith('#')
                          ? accountDetails.avatarColor.toUpperCase()
                          : 'Theme Gradient'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Personalize the background behind your monogram or transparent avatar:
                    </p>

                    {/* Solid Color Palette Presets */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                        Solid Accent Colors
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: 'PhoneMail Teal', hex: '#00a884' },
                          { name: 'Indigo', hex: '#4f46e5' },
                          { name: 'Purple', hex: '#7c3aed' },
                          { name: 'Pink', hex: '#db2777' },
                          { name: 'Rose', hex: '#e11d48' },
                          { name: 'Orange', hex: '#ea580c' },
                          { name: 'Amber', hex: '#d97706' },
                          { name: 'Emerald', hex: '#059669' },
                          { name: 'Sky', hex: '#0284c7' },
                          { name: 'Slate', hex: '#334155' }
                        ].map((swatch) => {
                          const isSelected = accountDetails.avatarColor.toLowerCase() === swatch.hex.toLowerCase();
                          return (
                            <button
                              key={swatch.hex}
                              type="button"
                              onClick={() => {
                                setAccountDetails((prev) => ({ ...prev, avatarColor: swatch.hex }));
                              }}
                              style={{ backgroundColor: swatch.hex }}
                              className={`w-7 h-7 rounded-xl transition-all transform cursor-pointer flex items-center justify-center shadow-sm ${
                                isSelected
                                  ? 'ring-2 ring-white scale-110 shadow-md'
                                  : 'hover:scale-105 opacity-90 hover:opacity-100'
                              }`}
                              title={swatch.name}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gradient Themes */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                        Modern Gradients
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: 'Emerald Teal', gradient: 'from-emerald-500 to-teal-600' },
                          { name: 'Indigo Purple', gradient: 'from-indigo-500 to-purple-600' },
                          { name: 'Amber Orange', gradient: 'from-amber-500 to-orange-600' },
                          { name: 'Rose Pink', gradient: 'from-rose-500 to-pink-600' },
                          { name: 'Sky Blue', gradient: 'from-sky-500 to-blue-600' }
                        ].map((item) => {
                          const isSelected = accountDetails.avatarColor === item.gradient;
                          return (
                            <button
                              key={item.gradient}
                              type="button"
                              onClick={() => {
                                setAccountDetails((prev) => ({ ...prev, avatarColor: item.gradient }));
                              }}
                              className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${item.gradient} transition-all transform cursor-pointer flex items-center justify-center shadow-sm ${
                                isSelected
                                  ? 'ring-2 ring-white scale-110 shadow-md'
                                  : 'hover:scale-105 opacity-90 hover:opacity-100'
                              }`}
                              title={item.name}
                            >
                              {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom HTML5 Color Picker */}
                    <div className="pt-2 flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="color"
                          value={
                            accountDetails.avatarColor.startsWith('#')
                              ? accountDetails.avatarColor
                              : '#00a884'
                          }
                          onChange={(e) => {
                            setAccountDetails((prev) => ({ ...prev, avatarColor: e.target.value }));
                          }}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0 block"
                          title="Custom Color Picker"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-200">Custom Color Picker</div>
                          <div className="text-[10px] text-slate-400">Click swatch to pick any color</div>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={
                          accountDetails.avatarColor.startsWith('#')
                            ? accountDetails.avatarColor
                            : '#00a884'
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          setAccountDetails((prev) => ({ ...prev, avatarColor: val }));
                        }}
                        placeholder="#00A884"
                        className="w-24 px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-center uppercase focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 7. FULL EMAIL MODAL (Traditional Email View for Long Messages) */}
      {/* ------------------------------------------------------------- */}
      {expandedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/60">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 font-bold">
                    Email Thread View
                  </span>
                  {expandedEmail.isOutgoing ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      Outgoing
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">
                      Incoming
                    </span>
                  )}
                  {expandedEmail.body && expandedEmail.body.includes('[SMS Reply via Carrier Gateway') && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300">
                      SMS Bridge
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-100 break-words" title={expandedEmail.subject || 'PhoneMail Message'}>
                  {expandedEmail.subject || 'PhoneMail Message'}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-sans">
                  <span>
                    <strong className="text-slate-300">From:</strong> {expandedEmail.from || 'Unknown'}
                  </span>
                  <span>
                    <strong className="text-slate-300">To:</strong> {expandedEmail.to || activeThread?.contactEmail}
                  </span>
                  {expandedEmail.createdAt && (
                    <span className="font-mono text-[11px] text-slate-500">
                      {new Date(expandedEmail.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedEmail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Body Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-sans text-sm text-slate-200 leading-relaxed">
              {expandedEmail.quotedSnippet && (
                <div className="p-3 bg-slate-950/70 border-l-4 border-indigo-500 rounded-r-xl text-xs text-slate-300">
                  <div className="font-bold text-indigo-300 mb-1 flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    Quoted from {expandedEmail.quotedSender || 'Message'}:
                  </div>
                  <p className="italic">"{expandedEmail.quotedSnippet}"</p>
                </div>
              )}
              <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-100">
                {(expandedEmail.body || '')
                  .replace(/\[In reply to [^:]+:\s*"[^"]*"\]\s*/g, '')
                  .replace(/\[Group Thread:[^\]]+\]\s*/g, '')}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setExpandedEmail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900 transition cursor-pointer"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const msgToQuote = expandedEmail;
                    setExpandedEmail(null);
                    handleQuoteMessage(msgToQuote);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Reply className="w-3.5 h-3.5" />
                  <span>Quote in Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const msgToReply = expandedEmail;
                    setExpandedEmail(null);
                    handleOpenTraditionalReply(msgToReply);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Reply in Traditional View</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
