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
  Tag,
  RotateCcw,
  Eye,
  Download
} from 'lucide-react';
import { EmailListSkeleton } from './LoadingSkeleton';
import { API_BASE } from '../config/api';
import AttachmentViewerModal, { formatFileSize, getAttachmentIcon } from './AttachmentViewerModal';
import { getEmailAttachments, hasEmailAttachment } from './DesktopClient';
import ThreadPriorityBadge, { getThreadPriority } from './ThreadPriorityBadge';
import { useTheme } from '../context/ThemeContext';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../config/languages';

const LABEL_COLORS = [
  'bg-red-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
];

export default function MailDashboard({
  viewMode = 'desktop',
  authToken,
  currentUser,
  onOpenAuth,
  onOpenCompose,
  onLogout,
  triggerToast,
  onActiveChatChange,
  onLanguageChange,
  onProfileUpdate
}) {
  const { theme, isDark } = useTheme();

  // Mobile Screen Width Detection (<768px)
  const [isScreenMobile, setIsScreenMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsScreenMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // In-Chat Search State (filters messages within the open conversation)
  const [isThreadSearchOpen, setIsThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState('');

  // Data State
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Spike Mail Conversational Navigation & Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Prevent background body scrolling while mobile drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [drawerOpen]);
  const [activeFolder, setActiveFolder] = useState('home'); // 'home' | 'drafts' | 'spam' | 'trash'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'unread' | 'attachments' | 'favorites'
  const [selectedContactKey, setSelectedContactKey] = useState(null);

  // Custom Folders / Labels State (synced with DesktopClient zapmail_custom_labels)
  const [customLabels, setCustomLabels] = useState(() => {
    try {
      const saved = localStorage.getItem('zapmail_custom_labels');
      return saved ? JSON.parse(saved) : ['Work', 'Personal', 'Finance'];
    } catch {
      return ['Work', 'Personal', 'Finance'];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('zapmail_custom_labels', JSON.stringify(customLabels));
    } catch {
      // ignore
    }
  }, [customLabels]);

  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [chatLabelDropdownOpen, setChatLabelDropdownOpen] = useState(false);

  // Urgent Mail Helper & Counts
  const isUrgentEmail = (e) => {
    if (!e) return false;
    const content = `${e.subject || ''} ${e.body || ''}`;
    return getThreadPriority(content).level === 'urgent';
  };

  const urgentUnreadCount = React.useMemo(() => {
    return emails.filter((e) => {
      const f = (e.folder || 'INBOX').toUpperCase();
      if (f === 'TRASH' || f === 'SPAM' || f === 'DRAFTS' || Boolean(e.isDraft)) return false;
      return isUrgentEmail(e) && !e.read;
    }).length;
  }, [emails]);

  const handleAddCustomLabel = (name) => {
    const trimmed = (name || newLabelName).trim();
    if (!trimmed) return;
    if (!customLabels.includes(trimmed)) {
      setCustomLabels((prev) => [...prev, trimmed]);
      if (triggerToast) triggerToast(`📁 Folder/Label "${trimmed}" created`);
    }
    setNewLabelName('');
    setIsAddingLabel(false);
  };

  const handleToggleEmailLabel = async (emailId, labelName) => {
    if (!emailId || !labelName) return;
    const targetEmail = emails.find((e) => e.id === emailId);
    if (!targetEmail) return;

    let currentLabels = [];
    if (Array.isArray(targetEmail.labels)) {
      currentLabels = targetEmail.labels;
    } else if (typeof targetEmail.labels === 'string') {
      try {
        currentLabels = JSON.parse(targetEmail.labels);
      } catch {
        currentLabels = [];
      }
    }

    const hasLabel = currentLabels.includes(labelName);
    const nextLabels = hasLabel
      ? currentLabels.filter((l) => l !== labelName)
      : [...currentLabels, labelName];

    // Optimistically update
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, labels: nextLabels } : e))
    );

    if (triggerToast) {
      triggerToast(hasLabel ? `Removed label "${labelName}"` : `🏷️ Added label "${labelName}"`);
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

      await fetch(`${API_BASE}/api/messages/${emailId}/labels`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          label: labelName,
          action: hasLabel ? 'remove' : 'add',
          labels: nextLabels
        })
      });
    } catch {
      // ignore
    }
  };

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
    const phone = currentUser?.phoneNumber || '';
    const defaults = {
      displayName: currentUser?.name || currentUser?.phoneNumber || 'ZapMail User',
      phone,
      title: 'ZapMail Member',
      signature: 'Sent via ZapMail Conversational Telecom Gateway',
      language: currentUser?.language || 'en',
      status: 'Active',             // 'Active' | 'Away' | 'DND' | 'In Meeting'
      avatarColor: 'from-emerald-500 to-teal-600',
      avatarImage: currentUser?.avatarUrl || null,
      aliases: [
        currentUser?.email || '',
      ].filter(Boolean),
      newAliasInput: ''
    };
    // Read from the shared cross-platform key (also written by desktop UI)
    try {
      const sharedKey = phone ? `zapmail_profile_prefs_${phone}` : null;
      const legacyKey = 'phonemail_profile_settings';
      const sharedRaw = sharedKey ? localStorage.getItem(sharedKey) : null;
      const legacyRaw = localStorage.getItem(legacyKey);
      const shared = sharedRaw ? JSON.parse(sharedRaw) : null;
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      // Merge: shared key takes priority (desktop writes here), legacy as fallback
      const merged = { ...defaults, ...(legacy || {}), ...(shared || {}) };
      // avatarGradient (desktop field) maps to avatarColor (mobile field)
      if (shared?.avatarGradient && !shared?.avatarColor) {
        merged.avatarColor = shared.avatarGradient;
      }
      return merged;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    if (currentUser) {
      // Reload shared prefs for this user (also written by desktop UI)
      let savedStatus = 'Active';
      let savedColor = 'from-emerald-500 to-teal-600';
      try {
        const sharedRaw = localStorage.getItem(`zapmail_profile_prefs_${currentUser.phoneNumber}`);
        if (sharedRaw) {
          const parsed = JSON.parse(sharedRaw);
          if (parsed.status) savedStatus = parsed.status;
          // avatarGradient (desktop field name) maps to avatarColor (mobile field name)
          if (parsed.avatarColor) savedColor = parsed.avatarColor;
          else if (parsed.avatarGradient) savedColor = parsed.avatarGradient;
        }
      } catch {}
      setAccountDetails((prev) => ({
        ...prev,
        displayName: currentUser.name || prev.displayName,
        phone: currentUser.phoneNumber || prev.phone,
        avatarImage: currentUser.avatarUrl !== undefined ? currentUser.avatarUrl : prev.avatarImage,
        language: currentUser.language || prev.language,
        status: savedStatus,
        avatarColor: savedColor,
        aliases: currentUser.email && !prev.aliases.includes(currentUser.email)
          ? [currentUser.email, ...prev.aliases]
          : prev.aliases
      }));
    }
  }, [currentUser]);

  const fileInputRef = useRef(null);
  const inlineFileInputRef = useRef(null);

  // Attachment Preview Modal State
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Inline Chat Compose State (Spike Mail Bottom Input)
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [inlineAttachments, setInlineAttachments] = useState([]);
  const [attachedFile, setAttachedFile] = useState(null);
  const replyInputRef = useRef(null);

  // -------------------------------------------------------------
  // Offline Outbox Queue Helpers (phonemail_pending_outbox)
  // -------------------------------------------------------------
  const getPendingOutbox = () => {
    try {
      const saved = localStorage.getItem('phonemail_pending_outbox');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const savePendingOutbox = (items) => {
    try {
      localStorage.setItem('phonemail_pending_outbox', JSON.stringify(items));
    } catch (err) {
      console.warn('[Outbox] Failed to save outbox to localStorage:', err);
    }
  };

  // 6-Second Undo Trash Tracker
  const pendingTrashActionsRef = useRef({});

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
  const messagesEndRef = chatMessagesEndRef;

  const isMobile = viewMode === 'mobile' || isScreenMobile;

  // Reset in-chat search when active thread changes
  useEffect(() => {
    setIsThreadSearchOpen(false);
    setThreadSearchQuery('');
  }, [selectedContactKey]);

  // -------------------------------------------------------------
  // Fetch All Emails from Backend & Merge Pending Outbox Items
  // -------------------------------------------------------------
  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (currentUser?.phoneNumber) {
        headers['x-user-phone'] = currentUser.phoneNumber;
      }
      if (currentUser?.email) {
        headers['x-user-email'] = currentUser.email;
      }

      // Fetch all user messages for conversational grouping strictly for this user
      const res = await fetch(`${API_BASE}/api/mail`, { headers });
      if (res.ok) {
        const data = await res.json();
        const serverList = Array.isArray(data) ? data : data.data || [];
        const pending = getPendingOutbox();
        const serverIds = new Set(serverList.map((e) => e.id));
        const activePending = pending.filter((p) => !serverIds.has(p.id) && !serverIds.has(p.tempId));
        setEmails([...activePending, ...serverList]);
      }
    } catch {
      // offline fallback: preserve optimistic messages
      const pending = getPendingOutbox();
      setEmails((prev) => {
        const prevIds = new Set(prev.map((e) => e.id));
        const activePending = pending.filter((p) => !prevIds.has(p.id));
        return [...activePending, ...prev];
      });
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Outbox Auto-Sync when Connectivity is Restored
  // -------------------------------------------------------------
  const syncOutbox = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const pending = getPendingOutbox();
    if (!pending || pending.length === 0) return;

    let successCount = 0;
    const remaining = [];

    for (const item of pending) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
        if (currentUser?.email) headers['x-user-email'] = currentUser.email;

        const res = await fetch(`${API_BASE}/api/mail/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: item.to || item.recipientEmail,
            subject: item.subject,
            body: item.body,
            from: item.from || currentUser?.email || '',
            attachments: item.attachments || []
          })
        });

        if (res.ok) {
          const data = await res.json();
          successCount++;
          // Update message in state to remove isPending, revealing double checkmark (✓✓)
          setEmails((prev) =>
            prev.map((m) =>
              m.id === item.id || m.id === item.tempId
                ? { ...m, id: data.email?.id || m.id, isPending: false }
                : m
            )
          );
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    savePendingOutbox(remaining);

    if (successCount > 0) {
      if (triggerToast) {
        triggerToast(`🔄 Connection restored: ${successCount} queued outbox message${successCount === 1 ? '' : 's'} delivered (✓✓)!`);
      }
      fetchEmails();
    }
  };

  // Online / Offline Listeners for Native Outbox Sync
  useEffect(() => {
    window.addEventListener('online', syncOutbox);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncOutbox();
    }
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const pending = getPendingOutbox();
        if (pending.length > 0) syncOutbox();
      }
    }, 8000);

    return () => {
      window.removeEventListener('online', syncOutbox);
      clearInterval(interval);
    };
  }, [authToken, currentUser?.phoneNumber]);

  // Reset cached mail and selection immediately on account switch or logout
  useEffect(() => {
    setEmails([]);
    setSelectedContactKey(null);
    setQuotedMessage(null);
    if (authToken || currentUser?.phoneNumber) {
      fetchEmails();
    }
  }, [currentUser?.phoneNumber, currentUser?.email, authToken]);

  useEffect(() => {
    if (authToken || currentUser?.phoneNumber) {
      const interval = setInterval(fetchEmails, 4000);
      return () => clearInterval(interval);
    }
  }, [authToken, currentUser?.phoneNumber]);

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
    const userEmail = (currentUser?.email || '').toLowerCase();
    const userPhone = currentUser?.phoneNumber || '';

    const threadMap = {};

    // Filter emails belonging to the current activeFolder
    const folderEmails = emails.filter((email) => {
      const f = (email.folder || 'INBOX').toUpperCase();
      if (activeFolder === 'drafts') return f === 'DRAFTS' || Boolean(email.isDraft);
      if (activeFolder === 'spam') return f === 'SPAM';
      if (activeFolder === 'trash') return f === 'TRASH';
      // Unified Bi-directional Threading: In inbox/chat view, merge both incoming (INBOX) and outgoing replies (SENT)
      return f !== 'TRASH' && f !== 'SPAM' && !email.isDraft;
    });

    folderEmails.forEach((email) => {
      const sender = (email.senderEmail || '').toLowerCase();
      const recipient = (email.recipientEmail || '').toLowerCase();

      // Check if message is outgoing (optimistic flag, SENT folder, or sender match)
      const isOutgoing = Boolean(
        email.isOutgoing ||
        (email.folder && email.folder.toUpperCase() === 'SENT') ||
        (userEmail && sender === userEmail) ||
        (userPhone && sender.includes(userPhone))
      );

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

        let normalizedKey = contactRaw.toLowerCase().trim();
        let targetEmail = contactRaw;

        // Friendly name: check resolved user name first
        const explicitContactName = isOutgoing ? email.recipientName : email.senderName;
        const phoneMatch = contactRaw.match(/(\d{10})/);
        const contactPhone = phoneMatch ? phoneMatch[1] : null;

        // Normalize phone handle contactKeys to prevent split threads (e.g. 9876543210 vs 9876543210@zapmail.com)
        if (contactPhone && (normalizedKey === contactPhone || normalizedKey.includes('@zapmail.com') || normalizedKey.includes('@phonemail.com'))) {
          normalizedKey = `${contactPhone}@zapmail.com`;
          targetEmail = `${contactPhone}@zapmail.com`;
        }

        contactKey = normalizedKey;
        contactEmail = targetEmail;

        if (explicitContactName) {
          contactName = explicitContactName;
        } else if (contactPhone) {
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

        // Color theme generator based on contact key (matte red palette)
        const colors = [
          'bg-[#B50000]',
          'bg-[#990000]',
          'bg-[#800000]',
          'bg-[#A01010]',
          'bg-[#8F1010]',
          'bg-[#A50000]'
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
        hasAttachment: hasEmailAttachment(email)
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

    // Dedicated Urgent Mailbox filter: strictly filter to threads containing urgent emails or matching urgency keywords
    if (activeFolder === 'urgent') {
      return list.filter((t) =>
        t.messages.some((m) => isUrgentEmail(m)) ||
        (t.lastMessage && isUrgentEmail(t.lastMessage))
      );
    }

    // Custom Label filter: strictly filter to threads containing emails with this label
    if (activeFolder.startsWith('label:')) {
      const targetLabel = activeFolder.replace('label:', '');
      return list.filter((t) =>
        t.messages.some((m) => {
          let emailLabels = [];
          if (Array.isArray(m.labels)) {
            emailLabels = m.labels;
          } else if (typeof m.labels === 'string') {
            try { emailLabels = JSON.parse(m.labels); } catch {}
          }
          return emailLabels.includes(targetLabel);
        })
      );
    }

    return list;
  }, [emails, currentUser, favorites, activeFolder]);

  // Apply Quick Filter Chips and Search
  const filteredThreads = React.useMemo(() => {
    let result = threads;

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

  // Active thread priority assessment
  const activeThreadPriority = React.useMemo(() => {
    if (!activeThread?.lastMessage) return null;
    return getThreadPriority(`${activeThread.lastMessage.subject || ''} ${activeThread.lastMessage.body || ''}`);
  }, [activeThread]);

  // Notify parent of active chat state (placed after activeThread is declared to avoid TDZ)
  useEffect(() => {
    if (onActiveChatChange) {
      onActiveChatChange(Boolean(selectedContactKey && activeThread));
    }
  }, [selectedContactKey, activeThread, onActiveChatChange]);

  // Messages to display inside active thread (filtered if in-chat search query is provided)
  const threadMessagesToDisplay = React.useMemo(() => {
    if (!activeThread) return [];
    if (!threadSearchQuery.trim()) return activeThread.messages;
    const q = threadSearchQuery.toLowerCase().trim();
    return activeThread.messages.filter(
      (m) =>
        (m.body && m.body.toLowerCase().includes(q)) ||
        (m.subject && m.subject.toLowerCase().includes(q)) ||
        (m.senderEmail && m.senderEmail.toLowerCase().includes(q))
    );
  }, [activeThread, threadSearchQuery]);

  // Fetch AI Smart Replies when active thread changes (inspect last received message)
  useEffect(() => {
    if (activeThread && activeThread.messages.length > 0) {
      const lastReceived =
        [...activeThread.messages].reverse().find((m) => !m.isOutgoing) || activeThread.lastMessage;
      if (lastReceived) {
        fetchSmartReplies(lastReceived);
      }
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
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
      if (currentUser?.email) headers['x-user-email'] = currentUser.email;

      await fetch(`${API_BASE}/api/mail/${emailId}/read`, {
        method: 'PATCH',
        headers
      });
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, read: 1 } : e)));
    } catch {
      // offline
    }
  };

  // Move message to trash with optimistic state update & 6-second Undo
  const handleMoveToTrash = (emailId) => {
    const targetEmail = emails.find((e) => e.id === emailId);
    if (!targetEmail) return;

    const previousEmails = emails;
    // Optimistically update local state immediately
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, folder: 'TRASH', deletedAt: new Date().toISOString() } : e))
    );

    const actionKey = `msg_${emailId}_${Date.now()}`;
    const timeoutId = setTimeout(async () => {
      delete pendingTrashActionsRef.current[actionKey];
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
        if (currentUser?.email) headers['x-user-email'] = currentUser.email;

        await fetch(`${API_BASE}/api/messages/${emailId}/folder`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ folder: 'TRASH' })
        });
      } catch (err) {
        console.error('Failed to commit move to trash', err);
      }
    }, 6000);

    pendingTrashActionsRef.current[actionKey] = {
      timeoutId,
      previousEmails
    };

    if (triggerToast) {
      triggerToast({
        text: 'Conversation moved to Trash',
        actionLabel: 'Undo',
        duration: 6000,
        onAction: () => {
          clearTimeout(timeoutId);
          delete pendingTrashActionsRef.current[actionKey];
          setEmails(previousEmails);
        }
      });
    }
  };

  // Move entire conversation thread to Trash with 6-second Undo
  const handleMoveThreadToTrash = (contactKey) => {
    const thread = threads.find((t) => t.contactKey === contactKey);
    if (!thread || thread.messages.length === 0) return;

    const msgIds = thread.messages.map((m) => m.id);
    const previousEmails = emails;

    // Optimistically update
    setEmails((prev) =>
      prev.map((e) => (msgIds.includes(e.id) ? { ...e, folder: 'TRASH', deletedAt: new Date().toISOString() } : e))
    );
    setSelectedContactKey(null);

    const actionKey = `thread_${contactKey}_${Date.now()}`;
    const timeoutId = setTimeout(async () => {
      delete pendingTrashActionsRef.current[actionKey];
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
        if (currentUser?.email) headers['x-user-email'] = currentUser.email;

        await Promise.all(
          msgIds.map((id) =>
            fetch(`${API_BASE}/api/messages/${id}/folder`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ folder: 'TRASH' })
            })
          )
        );
      } catch (err) {
        console.error('Failed to commit thread move to trash', err);
      }
    }, 6000);

    pendingTrashActionsRef.current[actionKey] = {
      timeoutId,
      previousEmails
    };

    if (triggerToast) {
      triggerToast({
        text: 'Conversation moved to Trash',
        actionLabel: 'Undo',
        duration: 6000,
        onAction: () => {
          clearTimeout(timeoutId);
          delete pendingTrashActionsRef.current[actionKey];
          setEmails(previousEmails);
          setSelectedContactKey(contactKey);
        }
      });
    }
  };

  // Move email(s) out of SPAM back to INBOX ("Not Spam")
  const handleMarkNotSpam = async (target) => {
    let msgIds = [];
    if (typeof target === 'string') {
      msgIds = [target];
    } else if (target?.messages) {
      msgIds = target.messages.map((m) => m.id);
    }
    if (msgIds.length === 0) return;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
      if (currentUser?.email) headers['x-user-email'] = currentUser.email;

      await Promise.all(
        msgIds.map((id) =>
          fetch(`${API_BASE}/api/messages/${id}/folder`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ folder: 'INBOX' })
          })
        )
      );
      setEmails((prev) =>
        prev.map((e) => (msgIds.includes(e.id) ? { ...e, folder: 'INBOX' } : e))
      );
      if (triggerToast) triggerToast('📥 Moved back to Inbox');
    } catch {
      if (triggerToast) triggerToast('Failed to move to Inbox');
    }
  };

  // Restore message from Trash back to Inbox
  const handleRestoreMessage = async (emailId) => {
    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
      if (currentUser?.email) headers['x-user-email'] = currentUser.email;

      const res = await fetch(`${API_BASE}/api/messages/${emailId}/restore`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, folder: 'INBOX', deletedAt: null } : e)));
        if (triggerToast) triggerToast('📥 Restored to Inbox');
      } else {
        if (triggerToast) triggerToast('Failed to restore message');
      }
    } catch {
      // offline
    }
  };

  // Permanently delete message from DB
  const handlePermanentDelete = async (emailId) => {
    try {
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
      if (currentUser?.email) headers['x-user-email'] = currentUser.email;

      const res = await fetch(`${API_BASE}/api/mail/${emailId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (triggerToast) triggerToast('Permanently deleted');
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
    if (triggerToast) {
      triggerToast({
        text: `↩️ Quoted message from ${msg.isOutgoing ? 'You' : activeThread.contactName}`,
        duration: 1800,
        isQuoteToast: true
      });
    }
  };

  const handleOpenTraditionalReply = (msg) => {
    if (!activeThread) return;
    const origSubj = msg?.subject || activeThread.lastMessage?.subject || 'ZapMail Conversation';
    const cleanSubj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    onOpenCompose(
      activeThread.contactEmail,
      cleanSubj,
      true, // isLockedTo = true
      true, // isReply = true
      msg?.body || activeThread.lastMessage?.body || ''
    );
  };

  // Handle native file picking for inline chat attachments
  const handleInlineFilePick = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        if (triggerToast) triggerToast(`⚠️ ${file.name} exceeds 5MB limit`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const att = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          filename: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: event.target.result
        };
        setInlineAttachments((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    });
    if (inlineFileInputRef.current) inlineFileInputRef.current.value = '';
  };

  // -------------------------------------------------------------
  // Send Inline Chat Message (Spike Mail Bottom Input)
  // -------------------------------------------------------------
  const handleSendInlineReply = async (e, directText = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const content = (directText !== null ? directText : inlineReplyText).trim();
    if (!activeThread || !content) return;

    setIsSendingReply(true);
    const targetRecipient = activeThread.contactEmail;

    // Subject Visibility & Selection Rules:
    // When replying/tagging: Re: <Original Subject>
    // When starting a new email thread or typing inlineSubject: inlineSubject
    let subject;
    if (quotedMessage) {
      const origSubj = quotedMessage.subject || activeThread.lastMessage?.subject || 'ZapMail Conversation';
      subject = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    } else if (inlineSubject.trim()) {
      subject = inlineSubject.trim();
    } else {
      const lastSubj = activeThread.lastMessage?.subject || 'ZapMail Conversation';
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

    const fullBody = activeThread.isGroup ? `[Group Thread: ${activeThread.contactEmail}]\n\n${finalBody}` : finalBody;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const senderEmail = currentUser?.email?.replace(/@phonemail\.com/gi, '@zapmail.com') ||
      (currentUser?.phoneNumber ? `${currentUser.phoneNumber}@zapmail.com` : 'user@zapmail.com');

    const optimisticMsg = {
      id: tempId,
      tempId,
      isPending: true,
      senderEmail,
      senderPhone: currentUser?.phoneNumber || '',
      recipientEmail: targetRecipient,
      recipientPhone: targetRecipient,
      subject,
      body: fullBody,
      createdAt: new Date().toISOString(),
      read: 1,
      folder: 'SENT',
      isOutgoing: true,
      hasAttachment: inlineAttachments.length > 0,
      attachments: inlineAttachments
    };

    // Optimistically insert message immediately into local thread state array
    setEmails((prev) => [...prev, optimisticMsg]);

    // Ensure the chat viewport auto-scrolls smoothly to the bottom immediately
    setTimeout(() => {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 40);

    // Enforce Single-Reply Constraint: mark quoted message as replied!
    if (quotedMessage) {
      setRepliedMessageIds((prev) => Array.from(new Set([...prev, quotedMessage.id])));
    }

    setInlineReplyText('');
    setAttachedFile(null);
    const attachmentsToSend = [...inlineAttachments];
    setInlineAttachments([]);
    setQuotedMessage(null);
    setInlineSubject('');
    setIsSubjectOpen(false);

    // If offline, immediately queue to outbox and notify user
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const pendingItem = {
        ...optimisticMsg,
        to: targetRecipient,
        attachments: attachmentsToSend
      };
      const currentQueue = getPendingOutbox();
      savePendingOutbox([...currentQueue, pendingItem]);
      if (triggerToast) {
        triggerToast('📡 Offline: message queued in Outbox (🕒). Will send automatically once online.');
      }
      setIsSendingReply(false);
      return;
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
      if (currentUser?.email) headers['x-user-email'] = currentUser.email;

      const res = await fetch(`${API_BASE}/api/mail/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: targetRecipient,
          subject,
          body: fullBody,
          from: senderEmail,
          attachments: attachmentsToSend
        })
      });

      const data = await res.json();
      if (res.ok) {
        // Clear isPending and update with persisted email data
        setEmails((prev) =>
          prev.map((m) =>
            m.id === tempId || m.tempId === tempId
              ? { ...(data.email || m), isPending: false, isOutgoing: true }
              : m
          )
        );

        setTimeout(() => {
          chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 40);

        if (triggerToast) {
          triggerToast(
            data.smsAlertSent
              ? `✅ Sent & Carrier SMS dispatched to ${data.smsNotification?.recipientPhone || 'recipient'}!`
              : '✅ Message sent!'
          );
        }
      } else {
        // Queue in Outbox if API rejected
        const pendingItem = {
          ...optimisticMsg,
          to: targetRecipient,
          attachments: attachmentsToSend
        };
        const currentQueue = getPendingOutbox();
        savePendingOutbox([...currentQueue, pendingItem]);
        if (triggerToast) triggerToast('⚠️ Could not deliver immediately: Queued in Outbox (🕒)');
      }
    } catch {
      // Network drop: queue into outbox
      const pendingItem = {
        ...optimisticMsg,
        to: targetRecipient,
        attachments: attachmentsToSend
      };
      const currentQueue = getPendingOutbox();
      savePendingOutbox([...currentQueue, pendingItem]);
      if (triggerToast) triggerToast('📡 Connection dropped: Queued in Outbox (🕒)');
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
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      if (currentUser?.phoneNumber) headers['x-user-phone'] = currentUser.phoneNumber;
      if (currentUser?.email) headers['x-user-email'] = currentUser.email;

      const res = await fetch(`${API_BASE}/api/messages/suggest-replies`, {
        method: 'POST',
        headers,
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

      const res = await fetch(`${API_BASE}/api/ai/summarize`, {
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
      const target = currentUser ? currentUser.email : '';
      if (!target) return;
      const res = await fetch(`${API_BASE}/api/mail/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'judge@hackathon.org',
          to: target,
          subject: 'Hackathon Evaluation: Live Chat Feature Feedback',
          body: `Hello ${currentUser?.name || 'ZapMail User'}! We love the new conversational feed. The unified chat stream makes phone-emailing feel completely effortless.`
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
          const phone = next.phone || currentUser?.phoneNumber || '';
          if (phone) {
            const existing = JSON.parse(localStorage.getItem(`zapmail_profile_prefs_${phone}`) || '{}');
            localStorage.setItem(`zapmail_profile_prefs_${phone}`, JSON.stringify({ ...existing, avatarImage: base64Url }));
          }
        } catch {}
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
        const phone = next.phone || currentUser?.phoneNumber || '';
        if (phone) {
          const existing = JSON.parse(localStorage.getItem(`zapmail_profile_prefs_${phone}`) || '{}');
          localStorage.setItem(`zapmail_profile_prefs_${phone}`, JSON.stringify({ ...existing, avatarImage: null }));
        }
      } catch {}
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
    const formatted = clean.includes('@') ? clean : `${clean}@zapmail.com`;
    if (!accountDetails.aliases.includes(formatted)) {
      setAccountDetails((prev) => ({
        ...prev,
        aliases: [...prev.aliases, formatted],
        newAliasInput: ''
      }));
      if (triggerToast) triggerToast(`✅ Added alias: ${formatted}`);
    }
  };

  const handleSaveSettings = async () => {
    try {
      // Write to BOTH keys: shared cross-platform key + legacy key
      const phone = accountDetails.phone || currentUser?.phoneNumber || '';
      const sharedPrefs = {
        status: accountDetails.status,
        avatarColor: accountDetails.avatarColor,
        // avatarGradient is the desktop field name — write both so desktop can read it
        avatarGradient: accountDetails.avatarColor,
        avatarImage: accountDetails.avatarImage,
        displayName: accountDetails.displayName
      };
      try {
        if (phone) localStorage.setItem(`zapmail_profile_prefs_${phone}`, JSON.stringify(sharedPrefs));
        localStorage.setItem('phonemail_profile_settings', JSON.stringify(accountDetails));
      } catch {}
      if (accountDetails.language) {
        localStorage.setItem('phonemail_language', accountDetails.language);
      }

      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          name: accountDetails.displayName,
          avatarUrl: accountDetails.avatarImage,
          language: accountDetails.language,
          phoneNumber: accountDetails.phone,
          status: accountDetails.status,
          avatarGradient: accountDetails.avatarColor
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user && onProfileUpdate) {
          onProfileUpdate(data.user);
        }
      }
    } catch (e) {
      console.error('Failed to save profile settings:', e);
    }
    setSettingsModalOpen(false);
    if (triggerToast) triggerToast('💾 Account profile settings & preferences saved!');
  };

  return (
    <div className="relative flex flex-col flex-1 h-full w-full overflow-hidden font-sans select-none bg-[#3C3D3C] text-slate-100">
      
      {/* ------------------------------------------------------------- */}
      {/* MAIN CONVERSATIONAL BODY (Thread List + Chat View)            */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Contact Thread List Column */}
        <aside
          className={`${
            isMobile
              ? activeThread && selectedContactKey
                ? 'hidden'
                : 'w-full flex-1 flex flex-col'
              : 'w-80 lg:w-96 border-r flex flex-col shrink-0 border-[#4E4F4E]'
          } bg-[#3C3D3C] overflow-hidden`}
        >
          {/* ------------------------------------------------------------- */}
          {/* 1. TOP NAVIGATION BAR (Home Screen Context)                   */}
          {/* Fully unmounted / hidden when in an active conversation thread */}
          {/* ------------------------------------------------------------- */}
          <header className="shrink-0 sticky top-0 z-30 pt-3 pb-2.5 px-3.5 sm:px-4 border-b flex flex-col gap-2.5 bg-[#2C2D2C] border-[#4E4F4E]">
            {/* Top Bar: Drawer Menu, prominent iOS 'Chats' Title, and Profile/Refresh Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Top-Left Slide-Out Drawer Toggle Button */}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="p-1.5 -ml-1 rounded-xl transition cursor-pointer shrink-0 text-slate-300 hover:text-white hover:bg-[#343534]"
                  title="Open navigation menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold tracking-tight px-1 pb-2 text-white">Inbox</h1>
              </div>

              {/* Right Side Actions: Simulate, Refresh, Profile Avatar */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Quick Simulation Action */}
                <button
                  type="button"
                  onClick={handleQuickInboundSimulation}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#242524] hover:bg-[#343534] text-purple-300 border border-purple-500/40 text-xs font-semibold transition cursor-pointer shadow-xs"
                  title="Simulate incoming email from contact"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  <span>Simulate</span>
                </button>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={fetchEmails}
                  className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#343534] transition cursor-pointer shrink-0"
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
                    {/* Inner Circular Avatar Container */}
                    <div
                      style={getAvatarBgStyle(accountDetails.avatarColor)}
                      className={`w-8 h-8 rounded-full overflow-hidden ${getAvatarBgClass(
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

                  {/* Online Indicator Green Badge */}
                  <span
                    className="absolute bottom-0 right-0 z-10 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 pointer-events-none"
                    title="Online"
                  />
                </div>
              </div>
            </div>

            {/* Full-Width Search Bar */}
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search conversations, contacts, or phone numbers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-[#242524] border border-[#4E4F4E] rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#B50000] focus:ring-1 focus:ring-[#B50000] transition shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
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
                        ? 'bg-[#B50000] text-white shadow-none'
                        : 'bg-[#2C2D2C] text-slate-400 hover:text-slate-200 hover:bg-[#484948] border border-[#4E4F4E]'
                    }`}
                  >
                    <span>{chip.label}</span>
                    {chip.count > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          isActive ? 'bg-black/30 text-white' : 'bg-[#242524] text-slate-400'
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

          {/* List Header caption */}
          <div className="px-4 py-2 bg-[#2C2D2C]/60 border-b border-[#4E4F4E] flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
              {activeFolder === 'home'
                ? `Unified Chats (${filteredThreads.length})`
                : activeFolder === 'urgent'
                ? `🚨 Urgent (${filteredThreads.length})`
                : activeFolder.startsWith('label:')
                ? `🏷️ ${activeFolder.replace('label:', '')} (${filteredThreads.length})`
                : `${activeFolder.toUpperCase()} (${filteredThreads.length})`}
            </span>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Spike Feed Active
            </span>
          </div>

          {/* Spam Warning Banner if viewing Spam folder */}
          {activeFolder === 'spam' && (
            <div className="px-4 py-2.5 bg-amber-950/80 border-b border-amber-500/40 flex items-center justify-between gap-2 text-xs text-amber-200">
              <div className="flex items-center gap-2 min-w-0">
                <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Items in Spam are flagged by automated filters</span>
              </div>
            </div>
          )}

          {/* Scrollable Conversation List */}
          <div className="flex-1 overflow-y-auto">
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
                    onClick={() => {
                      if (activeFolder === 'drafts') {
                        const draftMsg = thread.lastMessage || thread.messages[0];
                        if (draftMsg && onOpenCompose) {
                          onOpenCompose(
                            draftMsg.recipientEmail || '',
                            draftMsg.subject || '',
                            false,
                            false,
                            draftMsg.body || '',
                            getEmailAttachments(draftMsg),
                            draftMsg.id
                          );
                          return;
                        }
                      }
                      setSelectedContactKey(thread.contactKey);
                    }}
                    className={`px-3.5 pt-3.5 cursor-pointer transition select-none flex items-start gap-3 border-l-4 ${
                      isSelected
                        ? 'bg-[#484948]/50 border-[#B50000]'
                        : 'hover:bg-[#484948]/25 border-transparent'
                    } ${thread.unreadCount > 0 ? 'bg-[#2C2D2C]/40' : ''}`}
                  >
                    {/* Contact Avatar Circle with Initial or Group Icon */}
                    <div
                      className={`w-11 h-11 rounded-2xl ${thread.avatarGradient || 'bg-[#B50000]'} flex items-center justify-center text-white font-extrabold text-sm shadow-md shrink-0`}
                    >
                      {thread.isGroup ? (
                        <Users className="w-5 h-5 text-white" />
                      ) : (
                        thread.contactName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM'
                      )}
                    </div>

                    {/* Thread Details with indented divider line (starts where contact name text begins) */}
                    <div className="flex-1 min-w-0 pb-3.5 border-b border-[#4E4F4E]">
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={`text-base font-semibold truncate ${
                            thread.unreadCount > 0 ? 'text-white font-bold' : 'text-slate-100'
                          }`}
                        >
                          {thread.contactName}
                        </span>
                        <span className="text-xs text-slate-400 font-mono shrink-0 ml-2">
                          {lastMsg?.createdAt
                            ? new Date(lastMsg.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : ''}
                        </span>
                      </div>

                      {/* Subject snippet */}
                      {lastMsg?.subject && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`text-sm truncate ${
                              thread.unreadCount > 0 ? 'font-semibold text-slate-100' : 'text-slate-300 font-medium'
                            }`}
                          >
                            {lastMsg.subject}
                          </span>
                          <ThreadPriorityBadge text={`${lastMsg.subject} ${lastMsg.body || ''}`} />
                        </div>
                      )}

                      {/* Latest message snippet */}
                      <p className="text-sm text-gray-300 line-clamp-1 leading-snug">
                        {lastMsg?.isOutgoing ? <span className="text-[#FF8585] font-medium">You: </span> : null}
                        {snippet}
                      </p>

                      {/* Pill badges */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {thread.hasPhoneHandle && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                              <Phone className="w-3 h-3" /> SMS Bridge
                            </span>
                          )}
                          {thread.hasAttachments && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-300 bg-[#242524] px-2 py-0.5 rounded border border-[#4E4F4E] font-mono">
                              <Paperclip className="w-3 h-3" /> Doc
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {thread.isFavorite && (
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          )}
                          {thread.unreadCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#B50000] text-white shadow-none">
                              {thread.unreadCount}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">
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
          } bg-[#3C3D3C] relative overflow-hidden`}
        >
          {activeThread ? (
            <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
              
              {/* Chat Thread Header Bar */}
              <div className="shrink-0 sticky top-0 z-30 h-14 px-3.5 sm:px-4 bg-[#2C2D2C] border-b border-[#4E4F4E] flex items-center justify-between gap-3">
                {/* Left: Back arrow button (shrink-0) + Avatar circle (shrink-0) */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedContactKey(null);
                        setIsThreadSearchOpen(false);
                        setThreadSearchQuery('');
                      }}
                      className="p-1.5 -ml-1 text-slate-300 hover:text-white rounded-full hover:bg-[#484948] cursor-pointer shrink-0 transition-colors"
                      title="Back to conversations"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}

                  <div className="relative shrink-0">
                    <div
                      className={`w-9 h-9 rounded-full ${activeThread.avatarGradient || 'bg-[#B50000]'} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md`}
                    >
                      {activeThread.isGroup ? (
                        <Users className="w-4 h-4 text-white" />
                      ) : (
                        activeThread.contactName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM'
                      )}
                    </div>
                    {activeThreadPriority?.level === 'urgent' && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-600 border-2 border-[#2C2D2C] shadow-sm animate-pulse"
                        title="Urgent Thread"
                      />
                    )}
                  </div>
                </div>

                {/* Middle section: Display contact name on top and email/phone below with full breathing room */}
                <div className="flex-1 min-w-0 pr-1 sm:pr-2">
                  <h3 className="font-bold text-sm text-white truncate leading-tight flex items-center gap-1.5">
                    {activeThread.isGroup && <Users className="w-3.5 h-3.5 text-[#FF8585] shrink-0" />}
                    <span className="truncate">{activeThread.contactName}</span>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono truncate leading-tight mt-0.5">
                    {activeThread.contactEmail}
                  </div>
                </div>

                {/* Right section: Grouped flex container with icon-only circular action buttons */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
                  {/* Dedicated In-Chat Search Icon */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsThreadSearchOpen((prev) => !prev)}
                      className={`p-1.5 sm:p-2 rounded-full hover:bg-[#484948] transition-colors cursor-pointer ${
                        isThreadSearchOpen
                          ? 'text-[#FF8585] bg-[#B50000]/15'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Search messages in this thread"
                      aria-label="Search messages"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. Favorite / Star Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        handleToggleFavorite(activeThread.contactKey);
                        toggleTooltip('favorite');
                      }}
                      className={`p-1.5 sm:p-2 rounded-full hover:bg-[#484948] transition-colors cursor-pointer ${
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
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-[#242524] border border-[#4E4F4E] text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
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
                      className={`p-1.5 sm:p-2 rounded-full hover:bg-[#484948] transition-colors cursor-pointer ${
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
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-[#242524] border border-[#4E4F4E] text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        {isSummarizing ? 'Summarizing...' : 'AI Summary'}
                      </div>
                    )}
                  </div>


                  {/* Label / Tag Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setChatLabelDropdownOpen((prev) => !prev)}
                      className={`p-1.5 sm:p-2 rounded-full hover:bg-[#484948] transition-colors cursor-pointer ${
                        chatLabelDropdownOpen ? 'text-[#FF8585] bg-[#B50000]/15' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Labels / Folders"
                      aria-label="Labels / Folders"
                    >
                      <Tag className="w-4 h-4" />
                    </button>
                    {chatLabelDropdownOpen && (
                      <div className="absolute top-10 right-0 z-40 w-48 bg-[#242524] border border-[#4E4F4E] rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150">
                        <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 font-mono">
                          Labels / Folders
                        </div>
                        {customLabels.map((lbl, idx) => {
                          const dotColor = LABEL_COLORS[idx % LABEL_COLORS.length];
                          const lastMsg = activeThread.lastMessage;
                          let msgLabels = [];
                          if (lastMsg) {
                            if (Array.isArray(lastMsg.labels)) msgLabels = lastMsg.labels;
                            else if (typeof lastMsg.labels === 'string') {
                              try { msgLabels = JSON.parse(lastMsg.labels); } catch {}
                            }
                          }
                          const isTagged = msgLabels.includes(lbl);
                          return (
                            <button
                              key={lbl}
                              type="button"
                              onClick={() => {
                                if (lastMsg) {
                                  handleToggleEmailLabel(lastMsg.id, lbl);
                                }
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                                isTagged ? 'bg-[#B50000]/20 text-white font-semibold' : 'text-slate-300 hover:bg-[#484948]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
                                <span className="truncate">{lbl}</span>
                              </div>
                              {isTagged && <Check className="w-3.5 h-3.5 text-[#FF8585] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Traditional Email View Switcher */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        toggleTooltip('traditional');
                        const origSubj = activeThread.lastMessage?.subject || 'ZapMail Conversation';
                        const cleanSubj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
                        onOpenCompose(
                          activeThread.contactEmail,
                          cleanSubj,
                          true, // isLockedTo = true
                          true, // isReply = true
                          activeThread.lastMessage?.body || ''
                        );
                      }}
                      className="p-1.5 sm:p-2 rounded-full hover:bg-[#242524] text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Traditional Email View (Locked to contact)"
                      aria-label="Traditional Email View"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    {activeTooltip === 'traditional' && (
                      <div className="absolute -bottom-8 right-0 z-30 px-2 py-0.5 rounded-md bg-[#242524] border border-[#4E4F4E] text-slate-200 text-[10px] font-semibold whitespace-nowrap shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        Traditional View
                      </div>
                    )}
                  </div>

                  {/* 5. Folder State Actions: Trash / Restore / Not Spam */}
                  {activeFolder === 'spam' ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => handleMarkNotSpam(activeThread)}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-[#242524] text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                        title="Not Spam (Move to Inbox)"
                        aria-label="Not Spam"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  ) : activeFolder === 'trash' ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const ids = activeThread.messages.map((m) => m.id);
                          ids.forEach((id) => handleRestoreMessage(id));
                        }}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-[#242524] text-[#FF8585] hover:text-white transition-colors cursor-pointer"
                        title="Restore Conversation to Inbox"
                        aria-label="Restore"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ids = activeThread.messages.map((m) => m.id);
                          ids.forEach((id) => handlePermanentDelete(id));
                          setSelectedContactKey(null);
                        }}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-[#484948] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                        title="Delete Conversation Permanently"
                        aria-label="Delete Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => handleMoveThreadToTrash(activeThread.contactKey)}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-[#484948] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Move Conversation to Trash"
                        aria-label="Move to Trash"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Dedicated In-Chat Search Filter Bar */}
              {isThreadSearchOpen && (
                <div className="px-3.5 py-2 bg-[#242524] border-b border-[#4E4F4E] flex items-center gap-2 shrink-0 animate-in fade-in slide-in-from-top-2 duration-150">
                  <Search className="w-4 h-4 text-[#FF8585] shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    placeholder={`Search within messages...`}
                    value={threadSearchQuery}
                    onChange={(e) => setThreadSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none"
                  />
                  {threadSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setThreadSearchQuery('')}
                      className="p-1 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsThreadSearchOpen(false);
                      setThreadSearchQuery('');
                    }}
                    className="text-xs text-slate-400 hover:text-[#FF8585] font-medium px-1 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* AI Quick Summary Card if present */}
              {aiSummaries[activeThread.contactKey] && (
                <div className="mx-4 mt-3 p-3.5 bg-[#2C2D2C] border border-[#4E4F4E] rounded-2xl shadow-lg flex items-start justify-between gap-3 animate-in fade-in duration-200 shrink-0">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#FF8585] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold text-[#FF8585] uppercase tracking-wider block">
                        Thread Summary (AI Engine)
                      </span>
                      <p className="text-xs text-slate-200 mt-0.5 leading-relaxed font-sans">
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

              {/* Floating Priority Pill Banner: Floats cleanly below the header without overlapping contact info or controls */}
              {activeThreadPriority && activeThreadPriority.level !== 'normal' && (
                <div className="flex justify-center py-2 px-3 shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div
                    className={`backdrop-blur-md px-3.5 py-1 rounded-full border shadow-md flex items-center gap-2 text-xs font-semibold tracking-wide transition-all ${
                      activeThreadPriority.level === 'urgent'
                        ? 'bg-[#3A1414]/90 border-red-500/50 text-red-200 shadow-red-950/40 ring-1 ring-red-500/25'
                        : 'bg-[#3A2A14]/90 border-amber-500/50 text-amber-200 shadow-amber-950/40 ring-1 ring-amber-500/25'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        activeThreadPriority.level === 'urgent' ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="uppercase text-[10px] font-mono tracking-wider font-bold">
                      {activeThreadPriority.label}
                    </span>
                    <span className="text-[11px] text-slate-300 font-normal">
                      {activeThreadPriority.level === 'urgent' ? '• Action Required' : '• Scheduled Review'}
                    </span>
                  </div>
                </div>
              )}

              {/* Conversational Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
                {activeFolder === 'spam' && (
                  <div className="p-3.5 bg-amber-950/70 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-3 text-amber-200 text-xs shrink-0 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Items in Spam are flagged by automated filters</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMarkNotSpam(activeThread)}
                      className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition"
                    >
                      Not Spam
                    </button>
                  </div>
                )}

                {activeFolder === 'drafts' && (
                  <div className="p-3.5 bg-[#242524] border border-[#4E4F4E] rounded-2xl flex items-center justify-between gap-3 text-white text-xs shrink-0 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#FF8585] shrink-0" />
                      <span>Viewing saved draft</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const draftMsg = activeThread.lastMessage || activeThread.messages[0];
                        if (draftMsg && onOpenCompose) {
                          onOpenCompose(
                            draftMsg.recipientEmail || '',
                            draftMsg.subject || '',
                            false,
                            false,
                            draftMsg.body || '',
                            getEmailAttachments(draftMsg),
                            draftMsg.id
                          );
                        }
                      }}
                      className="px-3 py-1 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition shadow-none"
                    >
                      Resume Editing
                    </button>
                  </div>
                )}
                {threadMessagesToDisplay.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 text-xs">
                    <Search className="w-8 h-8 mx-auto mb-2 text-slate-600 stroke-1" />
                    <p className="font-semibold text-slate-400">No matching messages</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      No messages matched "{threadSearchQuery}" in this conversation.
                    </p>
                  </div>
                ) : (
                  threadMessagesToDisplay.map((msg, idx) => {
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
                          className={`absolute top-1/2 -translate-y-1/2 text-[#FF8585] flex items-center gap-1 text-xs font-bold pointer-events-none transition ${
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
                        className={`max-w-[88%] sm:max-w-[78%] rounded-3xl p-4 shadow-none transition select-text ${
                          isOut
                            ? 'bg-[#B50000] text-white border border-[#990000] rounded-br-xs'
                            : 'bg-[#2C2D2C] border border-[#4E4F4E] text-slate-100 rounded-bl-xs'
                        }`}
                      >
                        {/* Inline Subject Header for Distinct Starting Emails (Click-to-Expand & Horizontal Scroll) */}
                        {msg.subject && (isDistinctStartingEmail || !msg.subject.toLowerCase().startsWith('re:')) && (
                          <div
                            onClick={(e) => toggleExpandSubject(msg.id, e)}
                            title={msg.subject}
                            className={`text-[11px] font-bold pb-2 mb-2 border-b flex items-start justify-between gap-2.5 cursor-pointer select-none transition-colors group/subj ${
                              isOut
                                ? 'border-white/20 text-white hover:bg-black/10'
                                : 'border-[#4E4F4E] text-slate-300 hover:bg-[#242524]'
                            } p-1 -m-1 rounded-xl`}
                          >
                            <div className="flex items-start gap-1.5 min-w-0 flex-1">
                              {/* Tag Icon + Subtle Chevron Indicator */}
                              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                <Tag className={`w-3.5 h-3.5 ${isOut ? 'text-white/80' : 'text-[#FF8585]'} shrink-0`} />
                                {isSubjectExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-white/80 transition-transform duration-200 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-white/70 group-hover/subj:text-white transition-transform duration-200 shrink-0" />
                                )}
                              </div>

                              <span className={`text-[10px] font-mono ${isOut ? 'text-white/80' : 'text-[#FF8585]'} uppercase tracking-wider shrink-0 mt-0.5`}>
                                Subject:
                              </span>

                              {/* Subject Text with Click-to-Expand and Horizontal Scroll Support */}
                              <div
                                className={`font-semibold text-slate-100 font-sans flex-1 min-w-0 flex items-center gap-1.5 ${
                                  isSubjectExpanded
                                    ? 'whitespace-normal break-words leading-relaxed flex-wrap'
                                    : 'truncate overflow-x-auto whitespace-nowrap no-scrollbar'
                                }`}
                              >
                                <span>{msg.subject}</span>
                                <ThreadPriorityBadge text={`${msg.subject} ${msg.body || ''}`} />
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
                                ? 'bg-black/25 border-white/40 text-white'
                                : 'bg-[#242524] border-[#B50000] text-slate-300'
                            }`}
                          >
                            <div className={`flex items-center gap-1 font-semibold text-[10px] ${isOut ? 'text-white/90' : 'text-[#FF8585]'} mb-0.5`}>
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
                              className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${isOut ? 'text-white hover:underline' : 'text-[#FF8585] hover:text-white underline'} cursor-pointer`}
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

                        {/* Attachments Section in Chat Bubble */}
                        {(() => {
                          const cleanAtts = getEmailAttachments(msg);
                          if (!cleanAtts || cleanAtts.length === 0) return null;

                          return (
                            <div className={`mt-2.5 pt-2 border-t space-y-1.5 ${isOut ? 'border-white/20' : 'border-[#4E4F4E]'}`}>
                              {cleanAtts.map((att, attIdx) => {
                                const AttIcon = getAttachmentIcon(att.filename, att.mimeType);
                                const isImg = (att.mimeType && att.mimeType.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename || '');
                                const imgUrl = att.url || att.dataUrl;

                                return (
                                  <div
                                    key={att.id || attIdx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewAttachment(att);
                                    }}
                                    className={`flex items-center justify-between p-2 rounded-2xl border transition cursor-pointer select-none group/att ${
                                      isOut
                                        ? 'bg-black/25 hover:bg-black/40 border-white/20'
                                        : 'bg-[#242524] hover:bg-[#242524]/80 border-[#4E4F4E]'
                                    }`}
                                    title="Click to preview & download"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <div className={`w-8 h-8 rounded-xl ${isOut ? 'bg-white/20 text-white' : 'bg-[#B50000]/20 text-[#FF8585]'} flex items-center justify-center shrink-0 overflow-hidden`}>
                                        {isImg && imgUrl ? (
                                          <img src={imgUrl} alt={att.filename} className="w-full h-full object-cover" />
                                        ) : (
                                          <AttIcon className="w-4 h-4" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold truncate text-slate-100 group-hover/att:text-[#FF8585] transition-colors">
                                          {att.filename}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          {formatFileSize(att.size)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                      <span className="p-1 rounded-lg text-slate-400 group-hover/att:text-white">
                                        <Eye className="w-3.5 h-3.5" />
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Bubble Footer: Timestamp, Read Status, & Actions */}
                        <div
                          className={`mt-2 pt-1 flex items-center justify-between gap-2 text-[10px] font-mono border-t ${
                            isOut ? 'border-white/20 text-white/80' : 'border-[#4E4F4E] text-slate-400'
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
                            {isOut && (
                              msg.isPending ? (
                                <span title="Queued in Outbox - will send once online" className="text-white/80 animate-pulse text-[11px] leading-none">
                                  🕒
                                </span>
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5 text-white/90" />
                              )
                            )}
                            {isReplied && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#B50000]/20 text-[#FF8585] border border-[#B50000]/30 font-sans">
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
                                  isOut ? 'hover:bg-black/20 text-white' : 'hover:bg-[#242524] text-slate-400 hover:text-white'
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
                                isOut ? 'hover:bg-black/20 text-white' : 'hover:bg-[#242524] text-slate-400 hover:text-[#FF8585]'
                              }`}
                              title="Traditional Reply (Locked To:)"
                            >
                              <FileText className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpandedEmail(msg)}
                              className={`p-1 rounded-md transition cursor-pointer ${
                                isOut ? 'hover:bg-black/20 text-white' : 'hover:bg-[#242524] text-slate-400 hover:text-white'
                              }`}
                              title="Expand / Full email view"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>

                            {activeFolder === 'spam' ? (
                              <button
                                type="button"
                                onClick={() => handleMarkNotSpam(msg.id)}
                                className="p-1 rounded-md transition cursor-pointer hover:bg-[#242524] text-amber-300 hover:text-amber-100"
                                title="Not Spam (Move to Inbox)"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            ) : activeFolder === 'trash' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRestoreMessage(msg.id)}
                                  className="p-1 rounded-md transition cursor-pointer hover:bg-[#242524] text-slate-400 hover:text-[#FF8585]"
                                  title="Restore message to Inbox"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePermanentDelete(msg.id)}
                                  className="p-1 rounded-md transition cursor-pointer hover:bg-[#242524] text-slate-400 hover:text-[#FF8585]"
                                  title="Delete permanently"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMoveToTrash(msg.id)}
                                className={`p-1 rounded-md transition cursor-pointer ${
                                  isOut ? 'hover:bg-black/20 text-white' : 'hover:bg-[#242524] text-slate-400 hover:text-[#FF8585]'
                                }`}
                                title="Move to Trash"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatMessagesEndRef} />
            </div>

              {/* ------------------------------------------------------- */}
              {/* Spike Mail Inline Bottom Composer or Trash Notice       */}
              {/* ------------------------------------------------------- */}
              {activeFolder === 'trash' ? (
                <div className="w-full bg-[#2C2D2C] border-t border-[#4E4F4E] p-3 flex items-center justify-between text-xs text-[#FF8585]">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-[#FF8585] shrink-0" />
                    <span>Viewing messages in Trash. Click the restore button (↺) on any message to move it back to Inbox.</span>
                  </div>
                </div>
              ) : (
              <div className="w-full bg-[#2C2D2C] border-t border-[#4E4F4E] shrink-0 space-y-2 p-2 sm:p-3 pb-safe box-border overflow-hidden">
                
                {/* 1-Click Smart Reply Chips */}
                <div className="w-full overflow-x-auto no-scrollbar flex items-center gap-2 pb-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3 text-[#FF8585]" />
                    <span>Quick:</span>
                  </span>
                  {smartReplies.map((reply, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendInlineReply(null, reply)}
                      className="px-3 py-1 rounded-full border border-red-500/30 bg-red-950/20 text-xs text-white hover:bg-red-500/20 transition cursor-pointer shrink-0 shadow-none text-left active:scale-95 whitespace-nowrap"
                      title="1-tap instant send quick reply"
                    >
                      💬 {reply}
                    </button>
                  ))}
                </div>

                {/* Quoted Message Preview Banner above bottom input */}
                {quotedMessage && (
                  <div className="w-full flex items-center justify-between p-2.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs text-white animate-in fade-in slide-in-from-bottom-2 box-border">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Reply className="w-3.5 h-3.5 text-[#FF8585] shrink-0" />
                      <div className="truncate">
                        <span className="font-bold text-[#FF8585]">
                          Replying to {quotedMessage.isOutgoing ? 'Your message' : activeThread.contactName}:
                        </span>{' '}
                        <span className="italic text-gray-300 font-sans">
                          "{(quotedMessage.body || '').replace(/\[In reply to[^\]]+\]\s*/g, '').slice(0, 70)}"
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuotedMessage(null)}
                      className="p-1 text-gray-400 hover:text-white rounded-lg shrink-0 ml-2 cursor-pointer"
                      title="Cancel Quote"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Collapsible Subject Input Bar (Hidden when replying/tagging, Visible when starting new thread or toggled) */}
                {!quotedMessage && (isSubjectOpen || activeThread.messages.length === 0) && (
                  <div className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs animate-in fade-in duration-150 box-border">
                    <Tag className="w-3.5 h-3.5 text-[#FF8585] shrink-0" />
                    <span className="text-[11px] font-bold text-gray-400 shrink-0 uppercase tracking-wider font-mono">
                      Subject:
                    </span>
                    <input
                      type="text"
                      placeholder={activeThread.lastMessage?.subject || 'Enter email subject...'}
                      value={inlineSubject}
                      onChange={(e) => setInlineSubject(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border-none text-white placeholder-gray-400 focus:outline-none text-xs"
                    />
                    {activeThread.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSubjectOpen(false);
                          setInlineSubject('');
                        }}
                        className="text-gray-400 hover:text-white p-0.5 cursor-pointer shrink-0"
                        title="Collapse subject bar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Real File Attachment Badges */}
                {inlineAttachments.length > 0 && (
                  <div className="w-full flex flex-wrap gap-2 p-2 bg-[#242524] rounded-xl border border-[#4E4F4E]">
                    {inlineAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2C2D2C] border border-[#4E4F4E] text-xs text-white"
                      >
                        <Paperclip className="w-3 h-3 text-[#FF8585]" />
                        <span className="font-medium max-w-[140px] truncate">{att.filename}</span>
                        <span className="text-[10px] text-gray-400 font-mono">({formatFileSize(att.size)})</span>
                        <button
                          type="button"
                          onClick={() => setInlineAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                          className="text-gray-400 hover:text-[#FF8585] ml-1 p-0.5 cursor-pointer"
                          title="Remove attachment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
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
                        const origSubj = activeThread.lastMessage?.subject || 'ZapMail Conversation';
                        const cleanSubj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
                        onOpenCompose(
                          activeThread.contactEmail,
                          cleanSubj,
                          true, // isLockedTo = true
                          false
                        );
                      }}
                      className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#242524] transition cursor-pointer"
                      title="Switch to Traditional Email View (Locked to contact)"
                    >
                      <FileText className="w-4 h-4" />
                    </button>

                    {/* Native File Input and Paperclip Button */}
                    <input
                      ref={inlineFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
                      onChange={handleInlineFilePick}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => inlineFileInputRef.current?.click()}
                      className="p-2 rounded-xl text-gray-400 hover:text-[#FF8585] hover:bg-[#242524] transition cursor-pointer"
                      title="Attach documents or images (.pdf, .png, .jpg, .docx)"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Collapsible Subject Toggle Button (Hidden when replying/tagging) */}
                    {!quotedMessage && activeThread.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsSubjectOpen((prev) => !prev)}
                        className={`p-2 rounded-xl transition cursor-pointer ${
                          isSubjectOpen || inlineSubject ? 'text-[#FF8585] bg-[#B50000]/20' : 'text-gray-400 hover:text-[#FF8585] hover:bg-[#242524]'
                        }`}
                        title={isSubjectOpen ? "Hide Subject field" : "Edit / Add Subject"}
                      >
                        <Tag className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Input Element: Message Judge / contact name */}
                  <input
                    ref={replyInputRef}
                    type="text"
                    placeholder={
                      quotedMessage
                        ? `Reply to ${quotedMessage.isOutgoing ? 'your message' : activeThread.contactName}...`
                        : `Message ${activeThread.contactName}...`
                    }
                    value={inlineReplyText}
                    onChange={(e) => setInlineReplyText(e.target.value)}
                    className="flex-1 min-w-0 w-full py-2.5 px-4 bg-[#242524] border border-[#4E4F4E] rounded-2xl text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000] focus:ring-1 focus:ring-[#B50000] shadow-inner"
                  />

                  {/* Circular Send Button */}
                  <button
                    type="submit"
                    disabled={isSendingReply || !inlineReplyText.trim()}
                    className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#B50000] hover:bg-[#990000] disabled:opacity-50 text-white shadow-none transition transform active:scale-95 cursor-pointer"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 font-mono">
                  <span>Press Enter to send inline message</span>
                  {activeThread.hasPhoneHandle && (
                    <span className="text-[#FF8585] flex items-center gap-1 font-medium">
                      <Phone className="w-3 h-3 text-[#FF8585]" /> Carrier SMS Alert enabled
                    </span>
                  )}
                </div>
              </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-[#2C2D2C] border border-[#4E4F4E] flex items-center justify-center text-[#FF8585] mb-4 shadow-xl">
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
      {/* 5. SLIDE-OUT MENU DRAWER (Hardware-Accelerated Slide-In)       */}
      {/* ------------------------------------------------------------- */}
      {/* Backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sliding Drawer Panel */}
      <aside
        aria-label="Navigation Drawer"
        className={`fixed top-0 bottom-0 left-0 z-50 w-80 max-w-[85vw] bg-[#2C2D2C] border-r border-[#4E4F4E] flex flex-col justify-between p-5 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl overflow-hidden will-change-transform transform transition-transform ${
          drawerOpen
            ? 'translate-x-0 duration-300 ease-out'
            : '-translate-x-full duration-200 ease-in pointer-events-none'
        }`}
      >
            <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
              {/* Drawer Top Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#4E4F4E]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#B50000] flex items-center justify-center text-white shadow-none">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-100">ZapMail</h3>
                    <p className="text-[10px] text-emerald-400 font-mono">Spike Conversational Mail</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg active:scale-95 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Compose Button */}
              <div className="mt-4 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    if (onOpenCompose) onOpenCompose();
                  }}
                  className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold text-base shadow-lg shadow-red-950/40 border border-red-500/30 transition-all duration-200 ease-out active:scale-[0.98] active:bg-red-700 cursor-pointer"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>Compose</span>
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-2">
                {[
                  {
                    id: 'home',
                    label: 'Home (Unified Stream)',
                    icon: Inbox,
                    count: emails.filter((e) => !e.folder || e.folder === 'INBOX').length
                  },
                  {
                    id: 'urgent',
                    label: '🚨 Urgent',
                    icon: AlertOctagon,
                    count: emails.filter((e) => {
                      const f = (e.folder || 'INBOX').toUpperCase();
                      if (f === 'TRASH' || f === 'SPAM' || f === 'DRAFTS' || Boolean(e.isDraft)) return false;
                      return isUrgentEmail(e);
                    }).length,
                    badge: urgentUnreadCount > 0 ? urgentUnreadCount : null,
                    isUrgentTab: true
                  },
                  {
                    id: 'drafts',
                    label: 'Drafts',
                    icon: FileText,
                    count: emails.filter((e) => e.folder === 'DRAFTS' || e.isDraft).length
                  },
                  {
                    id: 'spam',
                    label: 'Spam',
                    icon: AlertOctagon,
                    count: emails.filter((e) => e.folder === 'SPAM').length
                  },
                  {
                    id: 'trash',
                    label: 'Trash',
                    icon: Trash2,
                    count: emails.filter((e) => e.folder === 'TRASH').length
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeFolder === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveFolder(item.id);
                        setSelectedContactKey(null);
                        setDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between py-3 px-4 rounded-xl text-base font-medium transition-transform duration-100 ease-out active:bg-red-500/10 active:scale-[0.98] cursor-pointer ${
                        isActive
                          ? 'bg-[#B50000] text-white font-semibold shadow-md'
                          : 'text-slate-300 hover:text-white hover:bg-[#484948]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.badge ? (
                          <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                            {item.badge}
                          </span>
                        ) : (
                          item.count > 0 && (
                            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                              isActive ? 'bg-white/20 text-white' : 'bg-[#242524] text-slate-400 border border-[#4E4F4E]'
                            }`}>
                              {item.count}
                            </span>
                          )
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>

              {/* Custom Labels / Folders Section (Gmail-Style) */}
              <div className="mt-5 pt-4 border-t border-[#4E4F4E]">
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Labels / Folders
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingLabel((prev) => !prev)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#484948] transition active:scale-95 cursor-pointer"
                    title="Create Custom Label"
                  >
                    <Plus className="w-4 h-4 text-[#FF8585]" />
                  </button>
                </div>

                {/* Inline create label form */}
                {isAddingLabel && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddCustomLabel();
                    }}
                    className="flex items-center gap-1.5 mb-2.5 p-1.5 bg-[#242524] rounded-xl border border-red-500/40"
                  >
                    <input
                      type="text"
                      placeholder="New label name..."
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none px-2 py-1"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-lg bg-[#B50000] text-white text-xs font-semibold hover:bg-[#990000] transition active:scale-95 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingLabel(false);
                        setNewLabelName('');
                      }}
                      className="p-1 text-slate-400 hover:text-white rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}

                {/* Custom Labels List */}
                <div className="space-y-1.5">
                  {customLabels.map((lbl, idx) => {
                    const folderId = `label:${lbl}`;
                    const isActive = activeFolder === folderId;
                    const dotColor = LABEL_COLORS[idx % LABEL_COLORS.length];
                    const count = emails.filter((e) => {
                      const f = (e.folder || 'INBOX').toUpperCase();
                      if (f === 'TRASH') return false;
                      let emailLabels = [];
                      if (Array.isArray(e.labels)) {
                        emailLabels = e.labels;
                      } else if (typeof e.labels === 'string') {
                        try { emailLabels = JSON.parse(e.labels); } catch {}
                      }
                      return emailLabels.includes(lbl);
                    }).length;

                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => {
                          setActiveFolder(folderId);
                          setSelectedContactKey(null);
                          setDrawerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between py-3 px-4 rounded-xl text-base font-medium transition-transform duration-100 ease-out active:bg-red-500/10 active:scale-[0.98] cursor-pointer group ${
                          isActive
                            ? 'bg-[#B50000] text-white font-semibold shadow-md'
                            : 'text-slate-300 hover:bg-[#484948]/60 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${dotColor} ring-2 ring-black/20`} />
                          <span className="truncate">{lbl}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {count > 0 && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                                isActive ? 'bg-white/20 text-white' : 'bg-[#242524] text-slate-400 border border-[#4E4F4E]'
                              }`}
                            >
                              {count}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomLabels((prev) => prev.filter((item) => item !== lbl));
                              if (activeFolder === folderId) setActiveFolder('home');
                              if (triggerToast) triggerToast(`Removed label "${lbl}"`);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-400 transition rounded"
                            title="Delete label"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Settings & Preferences Quick Links */}
              <div className="mt-5 pt-4 border-t border-[#4E4F4E] space-y-2 pb-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 px-1 tracking-wider block">
                  Preferences & Tools
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSettingsTab('language');
                    setSettingsModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#484948] rounded-xl transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-[#FF8585]" />
                    <span>Language: {accountDetails.language || 'English'}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#FF8585]">Change</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    handleQuickInboundSimulation();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#484948] rounded-xl transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#FF8585]" />
                  <span>Simulate Incoming Email</span>
                </button>
              </div>
            </div>

            {/* Drawer User Card Footer */}
            <div className="pt-4 border-t border-[#4E4F4E]">
              {currentUser ? (
                <div className="flex items-center justify-between p-2.5 bg-[#242524] rounded-2xl border border-[#4E4F4E]">
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
                      {/* Status dot — reflects accountDetails.status */}
                      <span
                        className={`absolute bottom-0 right-0 z-10 w-2 h-2 rounded-full ring-2 ring-slate-950 pointer-events-none ${
                          accountDetails.status === 'Away'       ? 'bg-yellow-400' :
                          accountDetails.status === 'DND'        ? 'bg-red-500' :
                          accountDetails.status === 'In Meeting' ? 'bg-purple-500' :
                          'bg-emerald-400'
                        }`}
                        title={accountDetails.status || 'Online'}
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
                  className="w-full py-2.5 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-none"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* 6. ACCOUNT SETTINGS MODAL (Top-Right Profile Screen)          */}
      {/* ------------------------------------------------------------- */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#242524] border-b border-[#4E4F4E] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#B50000] flex items-center justify-center text-white shadow-none">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Account & Profile Settings</h3>
                  <p className="text-[11px] text-slate-400">Manage your ZapMail identity and language preferences</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#484948] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-[#4E4F4E] bg-[#242524]/60 p-2 gap-1.5">
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
                        ? 'bg-[#B50000] text-white shadow-none'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#484948]/60'
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
                      Primary ZapMail Handle
                    </h4>
                    <div className="p-3 bg-[#242524] rounded-2xl border border-[#4E4F4E] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="font-mono text-sm text-emerald-300 font-bold">
                          {currentUser?.email || (accountDetails.phone ? `${accountDetails.phone}@zapmail.com` : 'user@zapmail.com')}
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
                          className="p-2.5 bg-[#242524] rounded-xl border border-[#4E4F4E] flex items-center justify-between text-xs font-mono text-slate-300"
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
                        placeholder="e.g. user.alias@zapmail.com"
                        value={accountDetails.newAliasInput}
                        onChange={(e) =>
                          setAccountDetails((prev) => ({ ...prev, newAliasInput: e.target.value }))
                        }
                        className="flex-1 px-3 py-2 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#B50000]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-bold cursor-pointer"
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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      User Language Preference
                    </h4>
                    <span className="text-[10px] text-[#FF8585] font-semibold">
                      Current: {accountDetails.language || 'English'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Choose your regional language preference. Saved directly to your ZapMail user profile.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUPPORTED_LANGUAGES.map((l) => {
                      const isSelected =
                        accountDetails.language === l.label ||
                        accountDetails.language === l.code ||
                        (l.code === 'en' && !accountDetails.language);
                      return (
                        <button
                          key={l.code}
                          type="button"
                          onClick={async () => {
                            setAccountDetails((prev) => ({ ...prev, language: l.label }));
                            try {
                              localStorage.setItem('phonemail_language', l.label);
                              if (authToken) {
                                await fetch(`${API_BASE}/api/auth/language`, {
                                  method: 'PATCH',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${authToken}`
                                  },
                                  body: JSON.stringify({ language: l.label })
                                });
                              }
                              if (triggerToast) triggerToast(`✅ Language preference set to ${l.label}`);
                            } catch {
                              // non-blocking
                            }
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium cursor-pointer transition ${
                            isSelected
                              ? 'bg-[#B50000]/15 border-[#B50000] text-[#FF8585] font-bold shadow-none'
                              : 'bg-[#242524] border-[#4E4F4E] text-slate-300 hover:bg-[#484948]/60 hover:border-[#4E4F4E]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{l.label}</span>
                            <span className="text-[10px] opacity-60 font-normal">({l.native})</span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[#FF8585] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
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
                      className="w-full px-3 py-2 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-[#B50000]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Registered Phone</label>
                    <input
                      type="text"
                      disabled
                      value={accountDetails.phone}
                      className="w-full px-3 py-2 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs text-slate-500 font-mono"
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
                      className="w-full px-3 py-2 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs text-slate-200 focus:outline-none focus:border-[#B50000]"
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
                      className="w-full p-2.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs text-slate-200 resize-none focus:outline-none focus:border-[#B50000]"
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
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity duration-200 text-white">
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
                        className="absolute -bottom-1 -right-1 p-2 rounded-2xl bg-red-600 hover:bg-red-500 text-white shadow-lg ring-2 ring-slate-900 transition cursor-pointer"
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
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#242524] hover:bg-[#343534] text-slate-200 text-xs font-semibold border border-[#4E4F4E] shadow-none transition cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#FF8585]" />
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
                  <div className="pt-4 border-t border-[#4E4F4E] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-[#FF8585]" />
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
                          { name: 'ZapMail Teal', hex: '#00a884' },
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
                    <div className="pt-2 flex items-center justify-between p-3 bg-[#242524] rounded-xl border border-[#4E4F4E]">
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
                        className="w-24 px-2.5 py-1 text-xs font-mono bg-[#2C2D2C] border border-[#4E4F4E] rounded-lg text-slate-200 text-center uppercase focus:outline-none focus:border-[#B50000]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#242524] border-t border-[#4E4F4E] flex items-center justify-end gap-2">
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
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#B50000] hover:bg-[#990000] text-white shadow-none cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-200">
          <div className="bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#4E4F4E] flex items-start justify-between gap-4 bg-[#242524]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#B50000]/20 text-[#FF8585] font-bold">
                    Email Thread View
                  </span>
                  {expandedEmail.isOutgoing ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#242524] text-slate-300">
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
                <h3 className="text-base sm:text-lg font-bold text-slate-100 break-words" title={expandedEmail.subject || 'ZapMail Message'}>
                  {expandedEmail.subject || 'ZapMail Message'}
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
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-[#484948] transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Body Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4 font-sans text-sm text-slate-200 leading-relaxed">
              {expandedEmail.quotedSnippet && (
                <div className="p-3 bg-[#242524] border-l-4 border-[#B50000] rounded-r-xl text-xs text-slate-300">
                  <div className="font-bold text-[#FF8585] mb-1 flex items-center gap-1">
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
            <div className="p-4 bg-[#242524] border-t border-[#4E4F4E] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setExpandedEmail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#343534] transition cursor-pointer"
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#2C2D2C] hover:bg-[#343534] text-slate-200 border border-[#4E4F4E] flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Reply className="w-3.5 h-3.5 text-[#FF8585]" />
                  <span>Quote in Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const msgToReply = expandedEmail;
                    setExpandedEmail(null);
                    handleOpenTraditionalReply(msgToReply);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#B50000] hover:bg-[#990000] text-white flex items-center gap-1.5 shadow-none transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Reply in Traditional View</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. ATTACHMENT VIEWER MODAL */}
      <AttachmentViewerModal
        isOpen={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        attachment={previewAttachment}
      />
    </div>
  );
}
