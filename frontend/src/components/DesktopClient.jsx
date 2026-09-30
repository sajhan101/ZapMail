import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Inbox,
  Send,
  Star,
  FileText,
  Trash2,
  Plus,
  Search,
  Paperclip,
  CheckCircle2,
  Clock,
  Sparkles,
  Smartphone,
  Phone,
  User,
  Settings,
  Bell,
  BellOff,
  Shield,
  ShieldCheck,
  Check,
  Copy,
  X,
  Reply,
  Users,
  Forward,
  ChevronDown,
  LogOut,
  RefreshCw,
  Archive,
  Mail,
  AlertCircle,
  ExternalLink,
  Command,
  HelpCircle,
  Tag,
  Maximize2,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  MessageSquare,
  UserCheck,
  UserPlus,
  AlertOctagon,
  RotateCcw,
  Download,
  Edit3,
  Globe,
  Upload
} from 'lucide-react';
import { API_BASE } from '../config/api';
import AttachmentViewerModal, { formatFileSize, getAttachmentIcon } from './AttachmentViewerModal';
import ThreadPriorityBadge, { getThreadPriority } from './ThreadPriorityBadge';
import { useTheme } from '../context/ThemeContext';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../config/languages';

export function getEmailAttachments(email) {
  if (!email) return [];
  let rawList = [];
  if (Array.isArray(email.attachments)) {
    rawList = email.attachments;
  } else if (typeof email.attachments === 'string') {
    const trimmed = email.attachments.trim();
    if (trimmed && trimmed !== '[]' && trimmed !== 'null' && trimmed !== '""') {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) rawList = parsed;
      } catch {
        // Not a JSON array
      }
    }
  }

  if (rawList.length === 0 && email.attachedFile) {
    rawList = [email.attachedFile];
  }

  // Also support simulated [Attachment: filename] in body if no structured attachments exist
  if (rawList.length === 0 && email.body) {
    const match = email.body.match(/\[Attachment:\s*([^\]]+)\]/i);
    if (match) {
      const filename = match[1].trim();
      rawList = [{
        id: `att_sim_${email.id || 'auto'}`,
        filename,
        size: 1258291,
        mimeType: /\.pdf$/i.test(filename) ? 'application/pdf' : 'application/octet-stream'
      }];
    }
  }

  return rawList.map((att, idx) => {
    const filename = att.filename || att.name || `attachment_${idx + 1}`;
    const mimeType = att.mimeType || att.type || (/\.pdf$/i.test(filename) ? 'application/pdf' : (/\.(png|jpe?g|gif|webp)$/i.test(filename) ? 'image/png' : 'application/octet-stream'));
    const url = att.url || att.dataUrl || att.data || null;
    const dataUrl = att.dataUrl || att.data || att.url || null;
    return {
      ...att,
      id: att.id || `att_${email.id || 'gen'}_${idx}`,
      filename,
      mimeType,
      url,
      dataUrl,
      size: att.size || (att.data ? Math.round(att.data.length * 0.75) : 0)
    };
  });
}

export function hasEmailAttachment(email) {
  if (!email) return false;
  if (email.hasAttachment === true || email.hasAttachment === 1 || email.hasAttachment === '1') return true;
  if (email.hasAttachments === true || email.hasAttachments === 1 || email.hasAttachments === '1') return true;
  const list = getEmailAttachments(email);
  return list.length > 0;
}

export default function DesktopClient({
  authToken,
  currentUser,
  onAuthSuccess,
  onLogout,
  onOpenCompose,
  triggerToast,
  onSwitchToMobile,
  onProfileUpdate
}) {
  const { theme, isDark } = useTheme();
  // -----------------------------------------------------------------
  // 1. MANDATORY 2-STEP AUTHENTICATION FLOW
  // Step 1: Phone + Password
  // Step 2: 6-Digit SMS OTP
  // -----------------------------------------------------------------
  const [authStep, setAuthStep] = useState(1); // 1 = Phone + Password, 2 = SMS OTP
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // OTP state (Step 2)
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const [authError, setAuthError] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [isKnownUser, setIsKnownUser] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // -----------------------------------------------------------------
  // 2. DESKTOP CLIENT DATA & NAVIGATION STATE
  // -----------------------------------------------------------------
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState('inbox'); // 'inbox' | 'sent' | 'starred' | 'drafts' | 'trash'
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState('all'); // 'all' | 'unread' | 'attachments' | 'starred'
  
  // Starred / Trashed email IDs
  const [starredIds, setStarredIds] = useState(() => {
    try {
      const saved = localStorage.getItem('phonemail_desktop_starred');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [trashedIds, setTrashedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('phonemail_desktop_trashed');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Attachment Viewer Preview State
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // AI Summarization State in Reading Pane
  const [aiSummary, setAiSummary] = useState(null);
  const [aiBullets, setAiBullets] = useState([]);
  const [summaryProvider, setSummaryProvider] = useState('ZapMail AI');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [summaryCache, setSummaryCache] = useState({});

  // Custom Folders / Labels State (Gmail-Style)
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
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false);

  // Urgent Mail Helper
  const isUrgentEmail = (e) => {
    if (!e) return false;
    const content = `${e.subject || ''} ${e.body || ''}`;
    return getThreadPriority(content).level === 'urgent';
  };

  // 6-Second Undo Trash Tracker
  const pendingTrashActionsRef = useRef({});

  // UI Modals & Drawers
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);

  // User Profile Customization
  const [profileData, setProfileData] = useState(() => {
    // Load persisted status & gradient from localStorage (keyed by phone so multi-user safe)
    const phone = currentUser?.phoneNumber || '';
    let savedStatus = 'Active';
    let savedGradient = 'from-emerald-500 to-teal-600';
    try {
      const raw = localStorage.getItem(`zapmail_profile_prefs_${phone}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.status) savedStatus = parsed.status;
        if (parsed.avatarGradient) savedGradient = parsed.avatarGradient;
      }
    } catch {}
    return {
      displayName: currentUser?.name || currentUser?.phoneNumber || 'ZapMail User',
      phone: currentUser?.phoneNumber || '',
      email: currentUser?.email || '',
      avatarUrl: currentUser?.avatarUrl || '',
      status: savedStatus,
      avatarGradient: savedGradient,
      signature: 'Best regards,\nZapMail Member'
    };
  });

  useEffect(() => {
    if (currentUser) {
      setProfileData((prev) => ({
        ...prev,
        displayName: currentUser.name || prev.displayName,
        phone: currentUser.phoneNumber || prev.phone,
        email: currentUser.email || prev.email,
        avatarUrl: currentUser.avatarUrl !== undefined ? currentUser.avatarUrl : prev.avatarUrl
      }));
    }
  }, [currentUser]);

  // Load registered users directory from SQLite backend to resolve contact names
  const [knownUsers, setKnownUsers] = useState([]);

  useEffect(() => {
    async function loadDirectory() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/demo-users`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.users)) {
            setKnownUsers(data.users);
          }
        }
      } catch (err) {
        // ignore
      }
    }
    loadDirectory();
  }, []);

  const resolveContactName = (emailOrPhone, explicitName = null) => {
    if (explicitName && explicitName.trim()) return explicitName.trim();
    if (!emailOrPhone) return null;
    const clean = String(emailOrPhone).trim();
    if (currentUser) {
      const userPhoneDigits = (currentUser.phoneNumber || '').replace(/\D/g, '').slice(-10);
      const cleanDigits = clean.replace(/\D/g, '').slice(-10);
      if (clean === currentUser.email || clean === currentUser.phoneNumber || (cleanDigits && cleanDigits === userPhoneDigits)) {
        return currentUser.name || 'You';
      }
    }
    const digits = clean.replace(/\D/g, '').slice(-10);
    const found = knownUsers.find((u) =>
      u.email === clean ||
      u.phoneNumber === clean ||
      (digits.length === 10 && u.phoneNumber && u.phoneNumber.replace(/\D/g, '').slice(-10) === digits)
    );
    if (found?.name) return found.name;
    return null;
  };

  const avatarFileInputRef = useRef(null);

  const handleSaveProfile = async () => {
    try {
      // Persist to shared cross-platform key (read by both desktop & mobile)
      try {
        const phone = profileData.phone || currentUser?.phoneNumber || '';
        if (phone) {
          localStorage.setItem(`zapmail_profile_prefs_${phone}`, JSON.stringify({
            status: profileData.status,
            avatarGradient: profileData.avatarGradient,  // desktop field name
            avatarColor: profileData.avatarGradient,      // mobile field name (same value)
            avatarImage: profileData.avatarUrl || null,
            displayName: profileData.displayName
          }));
        }
      } catch {}

      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      };
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: profileData.displayName,
          avatarUrl: profileData.avatarUrl,
          phoneNumber: profileData.phone,
          status: profileData.status,
          avatarGradient: profileData.avatarGradient
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (onProfileUpdate) {
          onProfileUpdate(data.user);
        }
        setProfileModalOpen(false);
        if (triggerToast) triggerToast('✅ Profile saved successfully');
      } else {
        if (triggerToast) triggerToast(data.error || 'Failed to save profile');
      }
    } catch {
      if (triggerToast) triggerToast('Network error saving profile');
    }
  };

  // Settings State
  const [settingsData, setSettingsData] = useState({
    pushNotifications: true,
    soundAlerts: true,
    carrierSmsForwarding: true,
    keyboardShortcuts: true,
    autoMarkRead: true
  });

  const searchInputRef = useRef(null);

  // -----------------------------------------------------------------
  // Save Starred / Trashed to LocalStorage (User Scoped)
  // -----------------------------------------------------------------
  useEffect(() => {
    if (currentUser?.phoneNumber) {
      try {
        localStorage.setItem(`phonemail_desktop_starred_${currentUser.phoneNumber}`, JSON.stringify(starredIds));
      } catch {
        // ignore
      }
    }
  }, [starredIds, currentUser?.phoneNumber]);

  useEffect(() => {
    if (currentUser?.phoneNumber) {
      try {
        localStorage.setItem(`phonemail_desktop_trashed_${currentUser.phoneNumber}`, JSON.stringify(trashedIds));
      } catch {
        // ignore
      }
    }
  }, [trashedIds, currentUser?.phoneNumber]);

  // Reset emails and reload scoped state on user change
  useEffect(() => {
    if (currentUser?.phoneNumber) {
      setEmails([]);
      setSelectedEmailId(null);
      try {
        const savedStarred = localStorage.getItem(`phonemail_desktop_starred_${currentUser.phoneNumber}`);
        setStarredIds(savedStarred ? JSON.parse(savedStarred) : []);
      } catch {
        setStarredIds([]);
      }
      try {
        const savedTrash = localStorage.getItem(`phonemail_desktop_trashed_${currentUser.phoneNumber}`);
        setTrashedIds(savedTrash ? JSON.parse(savedTrash) : []);
      } catch {
        setTrashedIds([]);
      }
    }
  }, [currentUser?.phoneNumber]);

  // Update profileData when currentUser changes (after login, user switch, etc.)
  useEffect(() => {
    if (currentUser) {
      // Reload localStorage prefs for this user
      let savedStatus = 'Active';
      let savedGradient = 'from-emerald-500 to-teal-600';
      try {
        const raw = localStorage.getItem(`zapmail_profile_prefs_${currentUser.phoneNumber}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.status) savedStatus = parsed.status;
          if (parsed.avatarGradient) savedGradient = parsed.avatarGradient;
        }
      } catch {}
      setProfileData((prev) => ({
        ...prev,
        displayName: currentUser.name || prev.displayName,
        phone: currentUser.phoneNumber || prev.phone,
        email: currentUser.email || `${currentUser.phoneNumber}@zapmail.com`,
        status: savedStatus,
        avatarGradient: savedGradient
      }));
    }
  }, [currentUser]);

  // -----------------------------------------------------------------
  // Fetch Emails from Backend (Scoped to Authenticated User)
  // -----------------------------------------------------------------
  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      const res = await fetch(`${API_BASE}/api/mail`, { headers });
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
    if (authToken || currentUser?.phoneNumber) {
      fetchEmails();
      const interval = setInterval(fetchEmails, 5000);
      return () => clearInterval(interval);
    }
  }, [authToken, currentUser?.phoneNumber]);

  // -----------------------------------------------------------------
  // Handle 2-Step Authentication (Step 1: Phone + Password, Step 2: SMS OTP)
  // -----------------------------------------------------------------
  // Timer countdown for OTP resend
  useEffect(() => {
    let timer;
    if (otpCooldown > 0) {
      timer = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const cleanAuthPhone = phoneNumber.replace(/\D/g, '').slice(0, 10);

  // Check if user is registered when 10 digits entered
  useEffect(() => {
    if (cleanAuthPhone.length === 10) {
      const checkUser = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/check-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: cleanAuthPhone })
          });
          const data = await res.json();
          if (res.ok && data.exists) {
            setIsKnownUser(true);
            setIsNewUser(false);
          } else {
            setIsKnownUser(false);
            setIsNewUser(true);
          }
        } catch {
          // offline
        }
      };
      checkUser();
    } else {
      setIsKnownUser(false);
      setIsNewUser(false);
    }
  }, [cleanAuthPhone]);

  // STEP 1 SUBMIT: Phone + Password Credentials
  const handleStep1Submit = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (cleanAuthPhone.length !== 10) {
      setAuthError('Please enter a valid 10-digit mobile phone number.');
      return;
    }

    if (!password || password.length < 4) {
      setAuthError('Please enter a password of at least 4 characters.');
      return;
    }

    setIsAuthenticating(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/step1-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanAuthPhone,
          password,
          countryCode,
          name: fullName.trim() || 'ZapMail User'
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setAuthError(data.error || 'Authentication error. Please check your credentials.');
        setIsAuthenticating(false);
        return;
      }

      // Step 1 success!
      setIsNewUser(Boolean(data.isNewUser));
      setOtpCooldown(45);
      setAuthStep(2);
      setOtpCode('');

      if (triggerToast) {
        triggerToast(`📲 Verification code sent via SMS to ${countryCode} ${cleanAuthPhone}`);
      }
    } catch {
      setAuthError('Could not reach backend authentication server. Ensure port 5000 is running.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // STEP 2 RESEND OTP
  const handleResendOtp = async () => {
    if (otpCooldown > 0 || isResending) return;
    setIsResending(true);
    setAuthError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/step1-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanAuthPhone,
          password,
          countryCode,
          name: fullName.trim() || 'ZapMail User'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setOtpCooldown(45);
        if (triggerToast) triggerToast(`📲 New verification code sent to ${cleanAuthPhone}!`);
      } else {
        setAuthError(data.error || 'Failed to resend SMS code.');
      }
    } catch {
      setAuthError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // STEP 2 SUBMIT: 6-Digit OTP Verification
  const handleStep2Submit = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (!otpCode || otpCode.trim().length !== 6) {
      setAuthError('Please enter the complete 6-digit verification code sent via SMS.');
      return;
    }

    setIsAuthenticating(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanAuthPhone,
          otp: otpCode.trim(),
          password,
          name: fullName.trim() || 'ZapMail User',
          registeredVia: 'WEB'
        })
      });

      const data = await res.json();

      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Invalid verification code. Please check your SMS and try again.');
        setIsAuthenticating(false);
        return;
      }

      if (triggerToast) {
        if (isNewUser) {
          triggerToast(`🎉 Account created! Welcome to ZapMail Webmail, +91 ${cleanAuthPhone}!`);
        } else {
          triggerToast(`🎉 2-Step verified! Welcome, +91 ${cleanAuthPhone}!`);
        }
      }

      if (onAuthSuccess) {
        onAuthSuccess(data.user, data.token);
      }
      if (onProfileUpdate) {
        onProfileUpdate(data.user);
      }
    } catch {
      setAuthError('Network error connecting to ZapMail backend server.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -----------------------------------------------------------------
  // Filtered Emails computation for Middle List Panel
  // -----------------------------------------------------------------
  const userEmail = currentUser?.email || '';
  const userPhone = currentUser?.phoneNumber || '';

  const displayedEmails = useMemo(() => {
    let list = emails;

    // Filter by Folder
    if (activeFolder === 'inbox') {
      list = list.filter((e) => {
        const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
        const isSpam = e.folder === 'SPAM';
        const isDraft = e.folder === 'DRAFTS' || Boolean(e.isDraft);
        const isSent = e.folder === 'SENT';
        if (isTrash || isSpam || isDraft || isSent) return false;
        // Inbox: incoming or user is recipient
        const isFromMe = e.senderEmail === userEmail || (userPhone && e.senderEmail?.includes(userPhone));
        return !isFromMe || e.recipientEmail === userEmail || e.folder === 'INBOX';
      });
    } else if (activeFolder === 'urgent') {
      list = list.filter((e) => {
        const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
        const isSpam = e.folder === 'SPAM';
        const isDraft = e.folder === 'DRAFTS' || Boolean(e.isDraft);
        if (isTrash || isSpam || isDraft) return false;
        return isUrgentEmail(e);
      });
    } else if (activeFolder.startsWith('label:')) {
      const targetLabel = activeFolder.replace('label:', '');
      list = list.filter((e) => {
        const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
        if (isTrash) return false;
        let emailLabels = [];
        if (Array.isArray(e.labels)) {
          emailLabels = e.labels;
        } else if (typeof e.labels === 'string') {
          try {
            emailLabels = JSON.parse(e.labels);
          } catch {
            emailLabels = [];
          }
        }
        return emailLabels.includes(targetLabel);
      });
    } else if (activeFolder === 'sent') {
      list = list.filter((e) => {
        const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
        const isSpam = e.folder === 'SPAM';
        const isDraft = e.folder === 'DRAFTS' || Boolean(e.isDraft);
        if (isTrash || isSpam || isDraft) return false;
        return e.folder === 'SENT' || e.senderEmail === userEmail || (userPhone && e.senderEmail?.includes(userPhone));
      });
    } else if (activeFolder === 'starred') {
      list = list.filter((e) => starredIds.includes(e.id) && !trashedIds.includes(e.id) && e.folder !== 'TRASH');
    } else if (activeFolder === 'drafts') {
      list = list.filter((e) => (e.folder === 'DRAFTS' || Boolean(e.isDraft)) && !trashedIds.includes(e.id) && e.folder !== 'TRASH');
    } else if (activeFolder === 'spam') {
      list = list.filter((e) => e.folder === 'SPAM' && !trashedIds.includes(e.id) && e.folder !== 'TRASH');
    } else if (activeFolder === 'trash') {
      list = list.filter((e) => trashedIds.includes(e.id) || e.folder === 'TRASH');
    }

    // Filter by List Filter Chips
    if (listFilter === 'unread') {
      list = list.filter((e) => !e.read);
    } else if (listFilter === 'attachments') {
      list = list.filter(hasEmailAttachment);
    } else if (listFilter === 'starred') {
      list = list.filter((e) => starredIds.includes(e.id));
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          (e.senderEmail && e.senderEmail.toLowerCase().includes(q)) ||
          (e.recipientEmail && e.recipientEmail.toLowerCase().includes(q)) ||
          (e.subject && e.subject.toLowerCase().includes(q)) ||
          (e.body && e.body.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [emails, activeFolder, listFilter, searchQuery, starredIds, trashedIds, userEmail, userPhone]);

  // Selected Email Object
  const selectedEmail = useMemo(() => {
    if (!selectedEmailId) {
      return displayedEmails.length > 0 ? displayedEmails[0] : null;
    }
    return emails.find((e) => e.id === selectedEmailId) || displayedEmails[0] || null;
  }, [emails, selectedEmailId, displayedEmails]);

  // Mark selected email as read
  useEffect(() => {
    if (selectedEmail && !selectedEmail.read) {
      handleMarkRead(selectedEmail.id);
    }
  }, [selectedEmail?.id]);

  // Sync AI Summary with cache when selected email changes
  useEffect(() => {
    if (!selectedEmail?.id) {
      setAiSummary(null);
      setAiBullets([]);
      setSummaryProvider('ZapMail AI');
      return;
    }
    const cached = summaryCache[selectedEmail.id];
    if (cached) {
      setAiSummary(cached.summary || '');
      setAiBullets(cached.bullets || []);
      setSummaryProvider(cached.provider || 'ZapMail AI');
      setIsSummaryExpanded(true);
    } else {
      setAiSummary(null);
      setAiBullets([]);
      setSummaryProvider('ZapMail AI');
    }
  }, [selectedEmail?.id, summaryCache]);

  // -----------------------------------------------------------------
  // Action Handlers: Star, Read, Trash, Archive
  // -----------------------------------------------------------------
  const handleToggleStar = (emailId, e) => {
    if (e) e.stopPropagation();
    setStarredIds((prev) => {
      const exists = prev.includes(emailId);
      const next = exists ? prev.filter((id) => id !== emailId) : [...prev, emailId];
      if (triggerToast) triggerToast(exists ? 'Removed from Starred' : '⭐ Added to Starred');
      return next;
    });
  };

  const handleMarkRead = async (emailId) => {
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      await fetch(`${API_BASE}/api/mail/${emailId}/read`, {
        method: 'PATCH',
        headers
      });
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, read: 1 } : e)));
    } catch {
      // offline
    }
  };

  const handleTrashEmail = (emailId, e) => {
    if (e) e.stopPropagation();
    const previousTrashedIds = trashedIds;
    const previousEmails = emails;

    // Optimistically update
    setTrashedIds((prev) => [...new Set([...prev, emailId])]);
    setEmails((prev) =>
      prev.map((item) => (item.id === emailId ? { ...item, folder: 'TRASH', deletedAt: new Date().toISOString() } : item))
    );

    const actionKey = `desktop_trash_${emailId}_${Date.now()}`;
    const timeoutId = setTimeout(async () => {
      delete pendingTrashActionsRef.current[actionKey];
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
          ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
        };
        await fetch(`${API_BASE}/api/messages/${emailId}/folder`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ folder: 'TRASH' })
        });
      } catch (err) {
        console.error('Failed to commit trash to backend', err);
      }
    }, 6000);

    pendingTrashActionsRef.current[actionKey] = {
      timeoutId,
      previousTrashedIds,
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
          setTrashedIds(previousTrashedIds);
          setEmails(previousEmails);
          setSelectedEmailId(emailId);
        }
      });
    }
  };

  const handleRestoreFromTrash = async (emailId, e) => {
    if (e) e.stopPropagation();
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      await fetch(`${API_BASE}/api/messages/${emailId}/restore`, {
        method: 'POST',
        headers
      });
      setTrashedIds((prev) => prev.filter((id) => id !== emailId));
      setEmails((prev) =>
        prev.map((item) => (item.id === emailId ? { ...item, folder: 'INBOX', deletedAt: null } : item))
      );
      if (triggerToast) triggerToast('📥 Restored to Inbox');
    } catch {
      if (triggerToast) triggerToast('Failed to restore from Trash');
    }
  };

  const handlePermanentDelete = async (emailId, e) => {
    if (e) e.stopPropagation();
    try {
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      await fetch(`${API_BASE}/api/mail/${emailId}`, {
        method: 'DELETE',
        headers
      });
      setTrashedIds((prev) => prev.filter((id) => id !== emailId));
      setEmails((prev) => prev.filter((item) => item.id !== emailId));
      if (selectedEmailId === emailId) setSelectedEmailId(null);
      if (triggerToast) triggerToast('Permanently deleted');
    } catch {
      if (triggerToast) triggerToast('Failed to permanently delete');
    }
  };

  const handleMarkNotSpam = async (emailId, e) => {
    if (e) e.stopPropagation();
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };
      await fetch(`${API_BASE}/api/messages/${emailId}/folder`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ folder: 'INBOX' })
      });
      setEmails((prev) =>
        prev.map((item) => (item.id === emailId ? { ...item, folder: 'INBOX' } : item))
      );
      if (triggerToast) triggerToast('📥 Moved back to Inbox');
    } catch {
      if (triggerToast) triggerToast('Failed to mark as not spam');
    }
  };

  // Reply / Forward Handlers
  const handleReply = (email) => {
    if (!email) return;
    const to = email.senderEmail === userEmail ? email.recipientEmail : email.senderEmail;
    const origSubj = email.subject || 'ZapMail Conversation';
    const subj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    onOpenCompose(to, subj, true, true);
  };

  const handleReplyAll = (email) => {
    if (!email) return;
    const participants = [email.senderEmail, email.recipientEmail]
      .filter((addr) => addr && addr !== userEmail)
      .join(', ');
    const origSubj = email.subject || 'ZapMail Conversation';
    const subj = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    onOpenCompose(participants || email.senderEmail, subj, false, true);
  };

  const handleForward = (email) => {
    if (!email) return;
    const origSubj = email.subject || 'ZapMail Conversation';
    const subj = origSubj.startsWith('Fwd:') ? origSubj : `Fwd: ${origSubj}`;
    onOpenCompose('', subj, false, false);
  };

  // -----------------------------------------------------------------
  // AI Summarization Handlers
  // -----------------------------------------------------------------
  const handleSummarize = async () => {
    if (!selectedEmail || isSummarizing) return;

    if (summaryCache[selectedEmail.id]) {
      const cached = summaryCache[selectedEmail.id];
      setAiSummary(cached.summary);
      setAiBullets(cached.bullets || []);
      setSummaryProvider(cached.provider || 'ZapMail AI');
      setIsSummaryExpanded(true);
      return;
    }

    setIsSummarizing(true);
    setIsSummaryExpanded(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(currentUser?.phoneNumber ? { 'x-user-phone': currentUser.phoneNumber } : {}),
        ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
      };

      const res = await fetch(`${API_BASE}/api/messages/${selectedEmail.id}/summarize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: selectedEmail.body || selectedEmail.snippet || '',
          subject: selectedEmail.subject || ''
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const summaryText = data.summary || '';
        const bulletsList = Array.isArray(data.bullets) && data.bullets.length > 0
          ? data.bullets
          : summaryText
              .split('\n')
              .filter((b) => b.trim().length > 0)
              .map((b) => b.replace(/^[•\-\*]\s*/, '').trim());
        const provider = data.provider || 'ZapMail AI Engine';

        setAiSummary(summaryText);
        setAiBullets(bulletsList);
        setSummaryProvider(provider);
        setSummaryCache((prev) => ({
          ...prev,
          [selectedEmail.id]: {
            summary: summaryText,
            bullets: bulletsList,
            provider
          }
        }));
        if (triggerToast) triggerToast('✨ AI Summary generated successfully!');
      } else {
        if (triggerToast) triggerToast(data.error || 'Failed to summarize email.');
      }
    } catch {
      if (triggerToast) triggerToast('Network error while requesting AI summary.');
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
    if (triggerToast) triggerToast('📋 Summary copied to clipboard!');
    setTimeout(() => setSummaryCopied(false), 2000);
  };

  // -----------------------------------------------------------------
  // Keyboard Shortcuts Support
  // -----------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input / textarea
      if (
        ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable
      ) {
        if (e.key === 'Escape') {
          document.activeElement?.blur();
        }
        return;
      }

      // '/' to focus search bar
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // 'c' or 'C' to compose
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onOpenCompose();
      }

      // 'e' or 'E' to archive / trash currently selected email
      if (e.key === 'e' || e.key === 'E') {
        if (selectedEmail) {
          e.preventDefault();
          handleTrashEmail(selectedEmail.id);
        }
      }

      // 'j' or Down Arrow to navigate next email in list
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (displayedEmails.length > 0) {
          const currentIndex = displayedEmails.findIndex((m) => m.id === selectedEmail?.id);
          const nextIndex = Math.min(currentIndex + 1, displayedEmails.length - 1);
          setSelectedEmailId(displayedEmails[nextIndex].id);
        }
      }

      // 'k' or Up Arrow to navigate previous email in list
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (displayedEmails.length > 0) {
          const currentIndex = displayedEmails.findIndex((m) => m.id === selectedEmail?.id);
          const prevIndex = Math.max(currentIndex - 1, 0);
          setSelectedEmailId(displayedEmails[prevIndex].id);
        }
      }

      // '?' to open shortcuts modal
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayedEmails, selectedEmail]);

  // Unread Count
  const inboxUnreadCount = useMemo(() => {
    return emails.filter((e) => {
      const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
      if (isTrash) return false;
      const isSpam = e.folder === 'SPAM';
      if (isSpam) return false;
      const isDraft = e.folder === 'DRAFTS' || Boolean(e.isDraft);
      if (isDraft) return false;
      const isSent = e.folder === 'SENT';
      if (isSent) return false;
      const isFromMe = e.senderEmail === userEmail;
      return (!isFromMe || e.recipientEmail === userEmail || e.folder === 'INBOX') && !e.read;
    }).length;
  }, [emails, trashedIds, userEmail]);

  // Urgent Unread Count
  const urgentUnreadCount = useMemo(() => {
    return emails.filter((e) => {
      const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
      if (isTrash) return false;
      const isSpam = e.folder === 'SPAM';
      if (isSpam) return false;
      const isDraft = e.folder === 'DRAFTS' || Boolean(e.isDraft);
      if (isDraft) return false;
      return isUrgentEmail(e) && !e.read;
    }).length;
  }, [emails, trashedIds]);

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
    } catch (err) {
      console.error('Failed to sync labels to server:', err);
    }
  };

  // -----------------------------------------------------------------
  // RENDER: SINGLE SCREEN AUTHENTICATION FLOW (if not authenticated)
  // -----------------------------------------------------------------
  if (!authToken) {
    return (
      <div className="min-h-screen w-full bg-[#3C3D3C] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans select-none">
        {/* Subtle ambient accent glow */}
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-[#B50000]/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-[#B50000]/5 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />

        {/* Top-Right Toggle to Mobile View */}
        <div className="absolute top-6 right-6 z-20">
          <button
            type="button"
            onClick={onSwitchToMobile}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2C2D2C] border border-[#4E4F4E] text-slate-300 hover:text-white text-xs font-semibold hover:border-[#B50000] transition cursor-pointer shadow-md"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#FF8585]" />
            <span>Switch to Mobile View</span>
          </button>
        </div>

        {/* Clean, Centered Authentication Card */}
        <div className="relative w-full max-w-md bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl shadow-2xl p-7 sm:p-9 z-10 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Card Header & Branding */}
          <div className="text-center mb-6">
            {authStep === 2 && (
              <div className="flex items-center justify-start mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep(1);
                    setAuthError('');
                  }}
                  className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-[#242524] hover:bg-[#3C3D3C] border border-[#4E4F4E] text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit Credentials</span>
                </button>
              </div>
            )}

            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#B50000] text-white shadow-lg shadow-[#B50000]/25 mb-3 border border-[#990000]">
              <Mail className="w-7 h-7" />
            </div>

            {/* 2-Step Progress Indicator */}
            <div className="flex justify-center mb-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#242524] border border-[#4E4F4E] text-[11px] font-semibold">
                <span className={`flex items-center gap-1 ${authStep === 1 ? 'text-[#FF8585]' : 'text-slate-400'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${authStep === 1 ? 'bg-[#B50000]/20 border border-[#B50000] text-[#FF8585]' : 'border border-slate-600 text-slate-500'}`}>1</span>
                  Credentials
                </span>
                <span className="text-slate-500">→</span>
                <span className={`flex items-center gap-1 ${authStep === 2 ? 'text-[#FF8585]' : 'text-slate-400'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${authStep === 2 ? 'bg-[#B50000]/20 border border-[#B50000] text-[#FF8585]' : 'bg-transparent border border-slate-600 text-slate-500'}`}>2</span>
                  SMS OTP
                </span>
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
              {authStep === 1
                ? 'ZapMail Webmail'
                : isNewUser
                ? 'Activate New Account'
                : '2-Step Verification'}
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {authStep === 1
                ? 'Enter your mobile phone number & password. OTP verification is mandatory for all accounts.'
                : isNewUser
                ? `Enter the 6-digit SMS code sent to ${countryCode} ${cleanAuthPhone} to activate your new account.`
                : `Enter the 6-digit SMS code sent to ${countryCode} ${cleanAuthPhone} to verify your identity.`}
            </p>
          </div>

          {/* Standard Error Banner */}
          {authError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in shake duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          {/* STEP 1: Phone + Password Form */}
          {authStep === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              {/* Full Name Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Full Name {!isKnownUser && <span className="text-[#FF8585]">*</span>}
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {isKnownUser ? 'Display name' : 'Your name for email sender ID'}
                  </span>
                </div>
                <div className="relative flex items-center rounded-2xl bg-[#242524] border border-[#4E4F4E] focus-within:border-[#B50000] focus-within:ring-1 focus-within:ring-[#B50000] overflow-hidden shadow-inner transition">
                  <User className="w-4 h-4 text-slate-500 ml-3.5 shrink-0" />
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setAuthError('');
                    }}
                    className="w-full py-3 pl-3 pr-4 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                    required={!isKnownUser}
                  />
                </div>
              </div>

              {/* Phone Number Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Mobile Phone Number (10 digits)
                  </label>
                  {cleanAuthPhone.length === 10 && (
                    isKnownUser ? (
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Registered Account
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#FF8585] font-medium flex items-center gap-1">
                        <UserPlus className="w-3 h-3" /> New User Registration
                      </span>
                    )
                  )}
                </div>
                <div className="flex items-center rounded-2xl bg-[#242524] border border-[#4E4F4E] focus-within:border-[#B50000] focus-within:ring-1 focus-within:ring-[#B50000] overflow-hidden shadow-inner transition">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="bg-[#2C2D2C] text-slate-200 text-xs font-mono font-bold px-3 py-3 border-r border-[#4E4F4E] focus:outline-none cursor-pointer"
                  >
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+971">🇦🇪 +971</option>
                  </select>

                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setAuthError('');
                    }}
                    className="flex-1 py-3 px-3.5 bg-transparent text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none tracking-wide"
                    autoFocus
                    required
                  />
                </div>

                {cleanAuthPhone.length === 10 && (
                  <div className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3 h-3" /> Linked Email: {cleanAuthPhone}@zapmail.com
                  </div>
                )}
              </div>

              {/* Password Input Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Password
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {isKnownUser ? 'Enter account password' : 'Set your password'}
                  </span>
                </div>
                <div className="relative flex items-center rounded-2xl bg-[#242524] border border-[#4E4F4E] focus-within:border-[#B50000] focus-within:ring-1 focus-within:ring-[#B50000] overflow-hidden shadow-inner transition">
                  <Lock className="w-4 h-4 text-slate-500 ml-3.5 shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isKnownUser ? 'Enter your password' : 'Create a secure password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setAuthError('');
                    }}
                    className="w-full py-3 pl-3 pr-10 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Step 1 Continue Button */}
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#B50000] hover:bg-[#990000] text-white font-bold text-sm shadow-md shadow-[#B50000]/25 transition transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Checking credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Step 2</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: 6-Digit SMS OTP Form */}
          {authStep === 2 && (
            <form onSubmit={handleStep2Submit} className="space-y-4 animate-in fade-in duration-200">
              {/* Target Phone Pill */}
              <div className="p-3 rounded-2xl bg-[#242524] border border-[#4E4F4E] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#FF8585]" />
                  <span className="text-xs font-mono font-semibold text-slate-200">
                    {countryCode} {cleanAuthPhone}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  SMS SENT
                </span>
              </div>

              {/* 6-Digit OTP Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    disabled={isResending || otpCooldown > 0}
                    onClick={handleResendOtp}
                    className="text-[11px] font-semibold text-[#FF8585] hover:underline transition cursor-pointer disabled:opacity-50"
                  >
                    {isResending
                      ? 'Sending...'
                      : otpCooldown > 0
                      ? `Resend in ${otpCooldown}s`
                      : 'Resend Code'}
                  </button>
                </div>

                <div className="relative flex items-center rounded-2xl bg-[#242524] border border-[#4E4F4E] focus-within:border-[#B50000] focus-within:ring-1 focus-within:ring-[#B50000] overflow-hidden shadow-inner transition">
                  <MessageSquare className="w-4 h-4 text-slate-500 ml-3.5 shrink-0" />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, ''));
                      setAuthError('');
                    }}
                    className="w-full py-3.5 pl-3 pr-4 bg-transparent text-base font-mono tracking-[0.4em] text-center font-bold text-slate-100 placeholder-slate-500 focus:outline-none"
                    autoFocus
                    autoComplete="one-time-code"
                    required
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Delivered via TextBee Gateway</span>
                  <span className="text-emerald-400">Valid for 5 mins</span>
                </div>
              </div>

              {/* Step 2 Verify Button */}
              <button
                type="submit"
                disabled={isAuthenticating || otpCode.length !== 6}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#B50000] hover:bg-[#990000] text-white font-bold text-sm shadow-md shadow-[#B50000]/25 transition transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying code...</span>
                  </>
                ) : isNewUser ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify & Create Account</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify & Sign In</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  // RENDER: DESKTOP HOME LAYOUT (Traditional Email / Gmail Style)
  // -----------------------------------------------------------------
  return (
    <div className="h-full h-[100dvh] w-full bg-[#2C2D2C] text-slate-100 flex flex-col overflow-hidden font-sans select-none antialiased">
      
      {/* ------------------------------------------------------------- */}
      {/* GLOBAL TOP APP BAR                                             */}
      {/* ------------------------------------------------------------- */}
      <header className="h-16 bg-[#2C2D2C] border-b border-[#4E4F4E] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
        
        {/* Left: Branding & Folder Indicator */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#B50000] border border-[#990000] flex items-center justify-center text-white shadow-md shadow-[#B50000]/25">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                ZapMail
              </h1>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#B50000]/20 text-[#FF8585] border border-[#B50000]/40">
                Webmail
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
              {profileData.email}
            </p>
          </div>
        </div>

        {/* Middle: Global Search Bar with Filter Tags */}
        <div className="flex-1 max-w-2xl mx-auto min-w-0">
          <div className="relative flex items-center w-full bg-[#242524] border border-[#4E4F4E] rounded-2xl focus-within:border-[#B50000] focus-within:ring-1 focus-within:ring-[#B50000] transition shadow-inner">
            <Search className="w-4 h-4 text-slate-400 ml-3.5 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder='Search mail (Press "/" to focus)...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent py-2 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white p-1 mr-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-block mr-3 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-[#2C2D2C] border border-[#4E4F4E] rounded">
              /
            </kbd>
          </div>
        </div>

        {/* Right: Actions, Notifications, & Profile Avatar Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Notifications Toggle */}
          <button
            type="button"
            onClick={() => {
              setNotificationsMuted((prev) => !prev);
              if (triggerToast) {
                triggerToast(notificationsMuted ? '🔔 Notifications unmuted' : '🔕 Notifications muted');
              }
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#484948] transition cursor-pointer"
            title={notificationsMuted ? 'Unmute Notifications' : 'Mute Notifications'}
          >
            {notificationsMuted ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
          </button>

          {/* Keyboard Shortcuts Helper */}
          <button
            type="button"
            onClick={() => setShortcutsModalOpen(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-[#FF8585] hover:bg-[#484948] transition cursor-pointer"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Switch to Mobile View Toggle */}
          <button
            type="button"
            onClick={onSwitchToMobile}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#242524] hover:bg-[#484948] text-slate-300 text-xs font-semibold border border-[#4E4F4E] transition cursor-pointer"
            title="Switch to Mobile App View"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#FF8585]" />
            <span>Mobile App</span>
          </button>

          {/* User Profile Avatar with Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1 pl-2 rounded-full hover:bg-[#484948] transition cursor-pointer border border-transparent hover:border-[#4E4F4E]"
            >
              <div className="relative">
                <div
                  className={`w-8 h-8 rounded-full overflow-hidden bg-gradient-to-tr ${profileData.avatarGradient} flex items-center justify-center text-white font-extrabold text-xs shadow-md`}
                >
                  {profileData.avatarUrl ? (
                    <img src={profileData.avatarUrl} alt={profileData.displayName} className="w-full h-full object-cover" />
                  ) : (
                    profileData.displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM'
                  )}
                </div>
                {/* Online indicator badge — color reflects current status */}
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#2C2D2C] ${
                  profileData.status === 'Away'       ? 'bg-yellow-400' :
                  profileData.status === 'DND'        ? 'bg-red-500' :
                  profileData.status === 'In Meeting' ? 'bg-purple-500' :
                  'bg-emerald-400'  // Active (default)
                }`} />
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block mr-1" />
            </button>

            {/* Profile Dropdown Menu */}
            {userDropdownOpen && (
              <div className="absolute right-0 top-11 w-64 bg-[#2C2D2C] border border-[#4E4F4E] rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 border-b border-[#4E4F4E] mb-1">
                  <div className="font-bold text-sm text-slate-100 truncate">{profileData.displayName}</div>
                  <div className="text-xs text-[#FF8585] font-mono truncate">{profileData.email}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">+91 {profileData.phone}</div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    setProfileModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-[#484948] rounded-xl transition cursor-pointer text-left"
                >
                  <User className="w-4 h-4 text-[#FF8585]" />
                  <span>Profile & Customization</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    setSettingsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-[#484948] rounded-xl transition cursor-pointer text-left"
                >
                  <Settings className="w-4 h-4 text-[#FF8585]" />
                  <span>Client Settings & Language</span>
                </button>

                <div className="pt-1 mt-1 border-t border-[#4E4F4E]">
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 3-COLUMN GMAIL-STYLE MAIN LAYOUT                              */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* =========================================================== */}
        {/* COLUMN 1: LEFT SIDEBAR NAVIGATION                           */}
        {/* =========================================================== */}
        <aside className="w-64 sm:w-72 bg-[#2C2D2C] border-r border-[#4E4F4E] flex flex-col justify-between shrink-0 select-none overflow-hidden">
          
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
            {/* Prominent Compose Button */}
            <button
              type="button"
              onClick={() => onOpenCompose()}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#B50000] hover:bg-[#990000] text-white font-semibold text-base sm:text-lg shadow-md shadow-[#B50000]/25 flex items-center justify-between transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(220,38,38,0.25)] active:translate-y-0 active:scale-[0.99] cursor-pointer group"
              title="Compose New Email (c)"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
                <span>Compose</span>
              </div>
              <kbd className="px-2 py-0.5 rounded text-xs font-mono bg-white/20 text-white/90">
                c
              </kbd>
            </button>

            {/* Standard Navigation Folders & Urgent Smart Mailbox */}
            <nav className="space-y-2">
              {[
                { id: 'inbox', label: 'Inbox', icon: Inbox, count: inboxUnreadCount, isUnread: true },
                { id: 'starred', label: 'Starred', icon: Star, count: starredIds.length },
                { id: 'urgent', label: '🚨 Urgent', icon: AlertOctagon, count: urgentUnreadCount, isUrgent: true },
                { id: 'sent', label: 'Sent Mail', icon: Send, count: emails.filter((e) => (e.folder === 'SENT' || e.senderEmail === userEmail) && e.folder !== 'TRASH' && e.folder !== 'SPAM' && !trashedIds.includes(e.id)).length },
                { id: 'drafts', label: 'Drafts', icon: FileText, count: emails.filter((e) => (e.folder === 'DRAFTS' || Boolean(e.isDraft)) && !trashedIds.includes(e.id) && e.folder !== 'TRASH').length },
                { id: 'spam', label: 'Spam', icon: AlertOctagon, count: emails.filter((e) => e.folder === 'SPAM' && !trashedIds.includes(e.id) && e.folder !== 'TRASH').length },
                { id: 'trash', label: 'Trash', icon: Trash2, count: emails.filter((e) => e.folder === 'TRASH' || trashedIds.includes(e.id)).length }
              ].map((folder) => {
                const Icon = folder.icon;
                const isActive = activeFolder === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setActiveFolder(folder.id)}
                    className={`w-full flex items-center justify-between py-3 px-4 rounded-xl text-[15px] sm:text-base font-medium transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(220,38,38,0.25)] active:translate-y-0 active:scale-[0.99] cursor-pointer ${
                      isActive
                        ? 'bg-[#B50000] text-white shadow-sm'
                        : 'text-slate-300 hover:bg-[#484948] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : folder.isUrgent ? 'text-red-400' : 'text-slate-400'}`} />
                      <span className="truncate">{folder.label}</span>
                    </div>
                    {folder.count > 0 && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold shrink-0 ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : folder.isUrgent
                            ? 'bg-red-600 text-white font-bold shadow-xs'
                            : folder.isUnread
                            ? 'bg-[#B50000]/20 text-[#FF8585]'
                            : 'bg-[#242524] text-slate-400 border border-[#4E4F4E]'
                        }`}
                      >
                        {folder.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Custom Folders / Labels Section (Gmail-Style) */}
            <div className="pt-3 border-t border-[#4E4F4E] space-y-2">
              <div className="flex items-center justify-between px-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#FF8585]" />
                  <span>Labels / Folders</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingLabel((prev) => !prev)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#484948] transition cursor-pointer"
                  title="Create new label / folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Inline Form to Add New Label */}
              {isAddingLabel && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddCustomLabel();
                  }}
                  className="flex items-center gap-1.5 p-1.5 bg-[#242524] rounded-xl border border-[#B50000]/50"
                >
                  <input
                    type="text"
                    autoFocus
                    placeholder="New label name..."
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    className="flex-1 bg-transparent px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none min-w-0"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg bg-[#B50000] text-white text-xs font-semibold hover:bg-[#990000] transition cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingLabel(false);
                      setNewLabelName('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}

              {/* Custom Labels List */}
              <div className="space-y-1.5">
                {customLabels.map((lbl) => {
                  const folderId = `label:${lbl}`;
                  const isActive = activeFolder === folderId;
                  const count = emails.filter((e) => {
                    const isTrash = trashedIds.includes(e.id) || e.folder === 'TRASH';
                    if (isTrash) return false;
                    let emailLabels = [];
                    if (Array.isArray(e.labels)) {
                      emailLabels = e.labels;
                    } else if (typeof e.labels === 'string') {
                      try { emailLabels = JSON.parse(e.labels); } catch {}
                    }
                    return emailLabels.includes(lbl);
                  }).length;

                  return (
                    <div
                      key={lbl}
                      onClick={() => setActiveFolder(folderId)}
                      className={`w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl text-sm font-medium transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(220,38,38,0.25)] active:translate-y-0 active:scale-[0.99] cursor-pointer group ${
                        isActive
                          ? 'bg-[#B50000] text-white shadow-sm'
                          : 'text-slate-300 hover:bg-[#484948] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Tag className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-[#FF8585]'}`} />
                        <span className="truncate">{lbl}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {count > 0 && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : 'bg-[#242524] text-slate-400 border border-[#4E4F4E]'
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
                            if (activeFolder === folderId) setActiveFolder('inbox');
                            if (triggerToast) triggerToast(`Removed label "${lbl}"`);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 transition rounded"
                          title="Delete label"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Carrier Status & Network Indicator */}
            <div className="pt-3 border-t border-[#4E4F4E]">
              <div className="p-3 bg-[#242524] rounded-2xl border border-[#4E4F4E] text-xs">
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 mb-1">
                  <span className="flex items-center gap-1 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    4G / VoLTE Active
                  </span>
                  <span>Carrier Sync</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono truncate">
                  +91 {profileData.phone}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Inbound emails automatically alert your mobile handset via SMS.
                </div>
              </div>
            </div>
          </div>

          {/* Left Sidebar Footer: Profile & Settings Shortcuts */}
          <div className="p-3 sm:p-4 border-t border-[#4E4F4E] space-y-1.5 bg-[#2C2D2C] shrink-0">
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-100 hover:bg-[#484948] transition cursor-pointer text-left"
            >
              <User className="w-4 h-4 text-[#FF8585]" />
              <span>Profile ({profileData.displayName})</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-100 hover:bg-[#484948] transition cursor-pointer text-left"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </button>
          </div>
        </aside>

        {/* =========================================================== */}
        {/* COLUMN 2: MIDDLE LIST PANEL (Traditional Tabular List Rows) */}
        {/* =========================================================== */}
        <div className="w-full sm:w-[380px] lg:w-[420px] bg-[#3C3D3C] border-r border-[#4E4F4E] flex flex-col shrink-0 overflow-hidden">
          
          {/* Middle List Header & Filter Chips */}
          <div className="p-3 border-b border-[#4E4F4E] space-y-2 shrink-0 bg-[#2C2D2C]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 capitalize">
                  {activeFolder}
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  ({displayedEmails.length})
                </span>
              </div>
              <button
                type="button"
                onClick={fetchEmails}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#484948] transition cursor-pointer"
                title="Refresh list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#FF8585]' : ''}`} />
              </button>
            </div>

            {/* Quick Filter Chips (All, Unread, Attachments, Starred) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
                { id: 'attachments', label: 'Has Attachments' },
                { id: 'starred', label: 'Starred' }
              ].map((chip) => {
                const isSelected = listFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setListFilter(chip.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-[#B50000] text-white shadow-sm'
                        : 'bg-[#242524] text-slate-400 hover:text-slate-200 hover:bg-[#484948] border border-[#4E4F4E]'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spam Notice Banner if viewing Spam folder */}
          {activeFolder === 'spam' && (
            <div className="p-3 bg-[#2C2D2C] border-b border-[#4E4F4E] flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Items in Spam are flagged by automated filters</span>
              </div>
            </div>
          )}

          {/* Traditional Email List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#4E4F4E]/60">
            {displayedEmails.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <Mail className="w-8 h-8 stroke-1 text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-400">No emails in {activeFolder}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Try switching folders or clearing search filters.
                </p>
              </div>
            ) : (
              displayedEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                const isStarred = starredIds.includes(email.id);
                const isUnread = !email.read;
                const hasAttachment = hasEmailAttachment(email);
                const isSmsBridge = email.body && email.body.includes('[SMS Reply via Carrier Gateway');

                // Determine display contact
                const isSentFolder = activeFolder === 'sent';
                const contactId = isSentFolder ? email.recipientEmail : email.senderEmail;
                const explicitName = isSentFolder ? email.recipientName : email.senderName;
                const contactName = resolveContactName(contactId, explicitName);

                const cleanSnippet = (email.body || '')
                  .replace(/\[In reply to [^:]+:\s*"[^"]*"\]\s*/g, '')
                  .replace(/\[Group Thread:[^\]]+\]\s*/g, '')
                  .replace(/\[SMS Reply via Carrier Gateway[^\]]+\]\s*/g, '')
                  .trim()
                  .slice(0, 80);

                return (
                  <div
                    key={email.id}
                    onClick={() => {
                      if (activeFolder === 'drafts') {
                        onOpenCompose(
                          email.recipientEmail || '',
                          email.subject || '',
                          false,
                          false,
                          email.body || '',
                          getEmailAttachments(email),
                          email.id
                        );
                        return;
                      }
                      setSelectedEmailId(email.id);
                    }}
                    className={`p-3 sm:p-3.5 transition-all duration-150 ease-out hover:-translate-y-[1px] hover:shadow-[0_2px_12px_rgba(220,38,38,0.15)] hover:border-red-500/40 cursor-pointer select-none group relative border-l-4 ${
                      isSelected
                        ? 'bg-[#484948]/50 border-l-[#B50000]'
                        : isUnread
                        ? 'bg-[#2C2D2C]/60 border-l-transparent hover:bg-[#484948]/30'
                        : 'border-l-transparent hover:bg-[#484948]/20'
                    }`}
                  >
                    {/* Top Row: Sender & Timestamp */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Interactive Star Indicator */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleStar(email.id, e)}
                          className="text-slate-500 hover:text-amber-400 transition cursor-pointer shrink-0"
                          title={isStarred ? 'Unstar' : 'Star'}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              isStarred ? 'text-amber-400 fill-amber-400' : ''
                            }`}
                          />
                        </button>

                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          {isSentFolder && (
                            <span className="text-[11px] uppercase tracking-wider text-[#FF8585] font-bold shrink-0">
                              To:
                            </span>
                          )}
                          <span
                            className={`text-[13.5px] truncate ${
                              isUnread ? 'font-bold text-white' : 'font-semibold text-slate-200'
                            }`}
                          >
                            {contactName || contactId}
                          </span>
                          {contactName && contactName !== contactId && (
                            <span className="text-[11px] text-slate-400 font-mono truncate hidden sm:inline">
                              &lt;{contactId}&gt;
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {email.createdAt
                          ? new Date(email.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : ''}
                      </span>
                    </div>

                    {/* Middle Row: Subject */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={`text-sm truncate ${
                          isUnread ? 'font-bold text-slate-100' : 'font-medium text-slate-300'
                        }`}
                      >
                        {email.subject || '(No Subject)'}
                      </span>
                      {email.folder === 'SPAM' && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide bg-red-600 text-white uppercase leading-none">
                          SPAM
                        </span>
                      )}
                      <ThreadPriorityBadge text={`${email.subject || ''} ${email.body || ''}`} />
                    </div>

                    {/* Bottom Row: Snippet & Indicators */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13.5px] text-slate-300 truncate flex-1 leading-relaxed">
                        {cleanSnippet || '(No content)'}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSmsBridge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono">
                            SMS
                          </span>
                        )}
                        {hasAttachment && (
                          <Paperclip className="w-3 h-3 text-slate-400" />
                        )}
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#B50000] shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Custom Labels Badges on Card */}
                    {(() => {
                      let emailLabels = [];
                      if (Array.isArray(email.labels)) {
                        emailLabels = email.labels;
                      } else if (typeof email.labels === 'string') {
                        try { emailLabels = JSON.parse(email.labels); } catch {}
                      }
                      if (emailLabels.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          {emailLabels.map((lbl) => (
                            <span
                              key={lbl}
                              className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-red-950/40 text-[#FF8585] border border-red-500/30 flex items-center gap-0.5"
                            >
                              <Tag className="w-2.5 h-2.5" />
                              <span>{lbl}</span>
                            </span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Quick Hover Actions (Trash, Restore, Not Spam) */}
                    <div className="absolute right-3 top-3 hidden group-hover:flex items-center gap-1 bg-[#2C2D2C] p-1 rounded-lg border border-[#4E4F4E] shadow-md">
                      {activeFolder === 'spam' ? (
                        <button
                          type="button"
                          onClick={(e) => handleMarkNotSpam(email.id, e)}
                          className="p-1 text-slate-400 hover:text-amber-300 rounded transition cursor-pointer"
                          title="Not Spam (Move to Inbox)"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      ) : activeFolder === 'trash' ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleRestoreFromTrash(email.id, e)}
                            className="p-1 text-slate-400 hover:text-emerald-400 rounded transition cursor-pointer"
                            title="Restore to Inbox"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handlePermanentDelete(email.id, e)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleTrashEmail(email.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer"
                          title="Trash (e)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* =========================================================== */}
        {/* COLUMN 3: MAIN READING PANE (Expanded Email Details)        */}
        {/* =========================================================== */}
        <main className="flex-1 bg-[#2C2D2C] flex flex-col overflow-hidden min-w-0">
          {selectedEmail ? (
            <div className="h-full flex flex-col overflow-hidden">
              
              {/* Reading Pane Action Toolbar */}
              <div className="p-3 sm:px-6 py-3 border-b border-[#4E4F4E] flex items-center justify-between gap-3 bg-[#242524] shrink-0">
                <div className="flex items-center gap-2">
                  {activeFolder === 'trash' || selectedEmail.folder === 'TRASH' ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleRestoreFromTrash(selectedEmail.id, e)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title="Restore to Inbox"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore to Inbox</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handlePermanentDelete(selectedEmail.id, e)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Permanently</span>
                      </button>
                    </>
                  ) : activeFolder === 'spam' || selectedEmail.folder === 'SPAM' ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleMarkNotSpam(selectedEmail.id, e)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title="Mark as Not Spam"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Not Spam</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleTrashEmail(selectedEmail.id, e)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-[#484948] transition cursor-pointer"
                        title="Move to Trash"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : activeFolder === 'drafts' || selectedEmail.folder === 'DRAFTS' || selectedEmail.isDraft ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenCompose) {
                            onOpenCompose(
                              selectedEmail.recipientEmail,
                              selectedEmail.subject,
                              false,
                              false,
                              selectedEmail.body,
                              getEmailAttachments(selectedEmail),
                              selectedEmail.id
                            );
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#B50000]/20 hover:bg-[#B50000]/30 text-[#FF8585] border border-[#B50000]/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title="Resume Editing Draft"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Resume Draft</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleTrashEmail(selectedEmail.id, e)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-[#484948] transition cursor-pointer"
                        title="Discard Draft"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Reply in Header Toolbar */}
                      <button
                        type="button"
                        onClick={() => handleReply(selectedEmail)}
                        className="px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#484948] transition cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                        title="Reply to email (r)"
                      >
                        <Reply className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Reply</span>
                      </button>

                      {/* Summarize with AI */}
                      <button
                        type="button"
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        className="px-3 py-1.5 rounded-xl bg-[#B50000]/20 hover:bg-[#B50000]/30 text-[#FF8585] border border-[#B50000]/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
                        title="Summarize email with AI"
                      >
                        <Sparkles className={`w-3.5 h-3.5 text-[#FF8585] ${isSummarizing ? 'animate-spin' : ''}`} />
                        <span>{isSummarizing ? 'Summarizing...' : '✨ Summarize with AI'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(selectedEmail.id, e)}
                        className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-[#484948] transition cursor-pointer"
                        title="Star / Favorite"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            starredIds.includes(selectedEmail.id) ? 'text-amber-400 fill-amber-400' : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleTrashEmail(selectedEmail.id, e)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-[#484948] transition cursor-pointer"
                        title="Move to Trash (e)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEmails((prev) =>
                            prev.map((e) => (e.id === selectedEmail.id ? { ...e, read: 0 } : e))
                          );
                          if (triggerToast) triggerToast('Marked as unread');
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-[#FF8585] hover:bg-[#484948] transition cursor-pointer"
                        title="Mark as Unread"
                      >
                        <Mail className="w-4 h-4" />
                      </button>

                      {/* Labels / Tags Dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setLabelDropdownOpen((prev) => !prev)}
                          className="px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#484948] transition cursor-pointer flex items-center gap-1.5 text-xs font-medium border border-transparent hover:border-[#4E4F4E]"
                          title="Assign Labels / Folders"
                        >
                          <Tag className="w-3.5 h-3.5 text-[#FF8585]" />
                          <span className="hidden sm:inline">Labels</span>
                          <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>

                        {labelDropdownOpen && (
                          <div className="absolute left-0 top-10 w-52 bg-[#2C2D2C] border border-[#4E4F4E] rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                            <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                              Assign Labels
                            </div>
                            <div className="space-y-1 mt-1">
                              {customLabels.length === 0 ? (
                                <div className="text-xs text-slate-500 px-2 py-1">No custom labels created</div>
                              ) : (
                                customLabels.map((lbl) => {
                                  let emailLabels = [];
                                  if (Array.isArray(selectedEmail.labels)) {
                                    emailLabels = selectedEmail.labels;
                                  } else if (typeof selectedEmail.labels === 'string') {
                                    try { emailLabels = JSON.parse(selectedEmail.labels); } catch {}
                                  }
                                  const has = emailLabels.includes(lbl);

                                  return (
                                    <button
                                      key={lbl}
                                      type="button"
                                      onClick={() => handleToggleEmailLabel(selectedEmail.id, lbl)}
                                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs hover:bg-[#3C3D3C] text-slate-200 transition cursor-pointer text-left"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Tag className="w-3.5 h-3.5 text-[#FF8585]" />
                                        <span>{lbl}</span>
                                      </div>
                                      {has && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedEmail.body && selectedEmail.body.includes('[SMS Reply via Carrier Gateway') && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> SMS Carrier Synced
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                    ID: {selectedEmail.id.slice(0, 12)}
                  </span>
                </div>
              </div>

              {/* Email Content Container */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
                
                {/* Spam Banner if viewing Spam */}
                {selectedEmail.folder === 'SPAM' && (
                  <div className="p-3.5 rounded-2xl bg-[#242524] border border-amber-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-200">
                        Items in Spam are flagged by automated filters.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleMarkNotSpam(selectedEmail.id, e)}
                      className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition shrink-0 cursor-pointer"
                    >
                      Not Spam
                    </button>
                  </div>
                )}

                {/* Subject Heading */}
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight leading-snug">
                      {selectedEmail.subject || '(No Subject)'}
                    </h2>
                    {selectedEmail.folder === 'SPAM' && (
                      <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-bold tracking-widest bg-red-600 text-white uppercase leading-none shadow-sm">
                        SPAM
                      </span>
                    )}
                    <ThreadPriorityBadge text={`${selectedEmail.subject || ''} ${selectedEmail.body || ''}`} />
                  </div>

                  {/* Assigned Custom Labels */}
                  {(() => {
                    let emailLabels = [];
                    if (Array.isArray(selectedEmail.labels)) {
                      emailLabels = selectedEmail.labels;
                    } else if (typeof selectedEmail.labels === 'string') {
                      try { emailLabels = JSON.parse(selectedEmail.labels); } catch {}
                    }
                    if (emailLabels.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {emailLabels.map((lbl) => (
                          <span
                            key={lbl}
                            className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/40 text-[#FF8585] border border-red-500/35 flex items-center gap-1.5 shadow-xs"
                          >
                            <Tag className="w-3 h-3 text-[#FF8585]" />
                            <span>{lbl}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleEmailLabel(selectedEmail.id, lbl)}
                              className="text-slate-400 hover:text-white transition cursor-pointer ml-0.5"
                              title="Remove label"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Sender Metadata Box */}
                {(() => {
                  const senderName = resolveContactName(selectedEmail.senderEmail, selectedEmail.senderName);
                  const recipientName = resolveContactName(selectedEmail.recipientEmail, selectedEmail.recipientName);
                  const senderInitials = senderName
                    ? senderName.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
                    : (selectedEmail.senderEmail.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM');
                  const avatarImg = selectedEmail.senderAvatar || (selectedEmail.senderEmail === userEmail ? currentUser?.avatarUrl : null);

                  return (
                    <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-[#242524] border border-[#4E4F4E]">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-[#B50000] border border-[#990000] flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 overflow-hidden">
                          {avatarImg ? (
                            <img src={avatarImg} alt={senderName || selectedEmail.senderEmail} className="w-full h-full object-cover" />
                          ) : (
                            senderInitials
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            {senderName ? (
                              <>
                                <strong className="text-sm sm:text-[15px] text-slate-100 font-bold truncate">
                                  {senderName}
                                </strong>
                                <span className="text-xs text-slate-400 font-mono truncate">
                                  &lt;{selectedEmail.senderEmail}&gt;
                                </span>
                              </>
                            ) : (
                              <strong className="text-sm sm:text-[15px] text-slate-100 font-bold truncate">
                                {selectedEmail.senderEmail}
                              </strong>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                              via ZapMail
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            to{' '}
                            {recipientName ? (
                              <>
                                <span className="text-slate-200 font-semibold">{recipientName}</span>
                                <span className="text-slate-400 font-mono ml-1.5">&lt;{selectedEmail.recipientEmail}&gt;</span>
                              </>
                            ) : (
                              <span className="text-slate-300 font-mono">{selectedEmail.recipientEmail}</span>
                            )}
                          </div>
                        </div>
                      </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400 font-mono">
                      {selectedEmail.createdAt
                        ? new Date(selectedEmail.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : ''}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {selectedEmail.createdAt
                        ? new Date(selectedEmail.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : ''}
                    </div>
                  </div>
                </div>
              );
            })()}

                {/* AI Summary Card (Loading or Generated) */}
                {(isSummarizing || aiSummary || (aiBullets && aiBullets.length > 0)) && (
                  <div className="rounded-2xl border border-[#B50000]/35 bg-[#2B2222]/70 backdrop-blur-xs p-4 shadow-lg shadow-black/20 space-y-3 transition-all">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-xl bg-[#B50000]/25 text-[#FF8585] flex items-center justify-center border border-[#B50000]/40 shadow-xs shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#FF8585] tracking-wide">
                            AI Executive Summary
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#242524] text-slate-300 border border-[#4E4F4E]">
                            {summaryProvider || 'ZapMail AI'}
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

                {/* Email Body */}
                <div className="font-sans text-sm sm:text-base leading-relaxed text-slate-200 whitespace-pre-wrap selection:bg-[#B50000] selection:text-white">
                  {(selectedEmail.body || '')
                    .replace(/\[In reply to [^:]+:\s*"[^"]*"\]\s*/g, '')
                    .replace(/\[Group Thread:[^\]]+\]\s*/g, '')}
                </div>

                {/* Attachments Section */}
                {(() => {
                  const emailAtts = getEmailAttachments(selectedEmail);
                  if (emailAtts.length === 0) return null;
                  return (
                    <div className="mt-6 pt-4 border-t border-[#4E4F4E]">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5 font-mono">
                        <Paperclip className="w-3.5 h-3.5 text-[#FF8585]" />
                        <span>Attachments ({emailAtts.length} {emailAtts.length === 1 ? 'file' : 'files'})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                        {emailAtts.map((att, idx) => {
                          const IconComponent = getAttachmentIcon(att.filename, att.mimeType);
                          const isImg = (att.mimeType && att.mimeType.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.filename || '');
                          const imgUrl = att.url || att.dataUrl;

                          return (
                            <div
                              key={att.id || idx}
                              onClick={() => setPreviewAttachment(att)}
                              className="p-3 rounded-2xl bg-[#242524] border border-[#4E4F4E] hover:border-[#B50000]/60 hover:bg-[#242524]/90 flex items-center justify-between gap-3 transition cursor-pointer group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#B50000]/20 border border-[#B50000]/30 flex items-center justify-center text-[#FF8585] shrink-0 group-hover:scale-105 transition-transform overflow-hidden">
                                  {isImg && imgUrl ? (
                                    <img src={imgUrl} alt={att.filename} className="w-full h-full object-cover" />
                                  ) : (
                                    <IconComponent className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-200 truncate group-hover:text-[#FF8585] transition-colors">
                                    {att.filename}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {formatFileSize(att.size)}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewAttachment(att);
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-[#B50000]/20 hover:bg-[#B50000]/30 text-[#FF8585] text-xs font-semibold border border-[#B50000]/30 transition cursor-pointer shrink-0"
                                title="Preview Attachment"
                              >
                                Preview
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Bottom Action Controls: Reply, Reply All, Forward / Resume Draft */}
              <div className="p-4 sm:px-6 bg-[#242524] border-t border-[#4E4F4E] flex items-center gap-3 shrink-0">
                {selectedEmail.folder === 'DRAFTS' || selectedEmail.isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenCompose) {
                        onOpenCompose(
                          selectedEmail.recipientEmail,
                          selectedEmail.subject,
                          false,
                          false,
                          selectedEmail.body,
                          getEmailAttachments(selectedEmail),
                          selectedEmail.id
                        );
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#B50000] hover:bg-[#990000] text-white text-xs font-bold shadow-md shadow-[#B50000]/25 flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Resume Editing Draft</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleReply(selectedEmail)}
                      className="px-4 py-2.5 rounded-xl bg-[#B50000] hover:bg-[#990000] text-white text-xs font-bold shadow-md shadow-[#B50000]/25 flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
                    >
                      <Reply className="w-4 h-4" />
                      <span>Reply</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReplyAll(selectedEmail)}
                      className="px-4 py-2.5 rounded-xl bg-[#2C2D2C] hover:bg-[#484948] text-slate-200 text-xs font-bold border border-[#4E4F4E] flex items-center gap-2 transition cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-purple-400" />
                      <span>Reply All</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleForward(selectedEmail)}
                      className="px-4 py-2.5 rounded-xl bg-[#2C2D2C] hover:bg-[#484948] text-slate-200 text-xs font-bold border border-[#4E4F4E] flex items-center gap-2 transition cursor-pointer"
                    >
                      <Forward className="w-4 h-4 text-emerald-400" />
                      <span>Forward</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Clean Empty State */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-[#242524] border border-[#4E4F4E] flex items-center justify-center text-[#FF8585] mb-4 shadow-xl">
                <Mail className="w-8 h-8 stroke-1" />
              </div>
              <h3 className="text-base font-bold text-slate-200">No conversation selected</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                Select an email from the middle list panel to read, or press <kbd className="px-1.5 py-0.5 rounded bg-[#242524] border border-[#4E4F4E] text-slate-300 font-mono">c</kbd> to compose a new message.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PROFILE MODAL / DRAWER                                        */}
      {/* ------------------------------------------------------------- */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-200">
          <div className="bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-[#242524] border-b border-[#4E4F4E] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#B50000]/20 text-[#FF8585] flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Profile Details</h3>
                  <p className="text-[11px] text-slate-400">Manage identity and display status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Avatar Preview & Upload */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div
                    className={`w-16 h-16 rounded-3xl overflow-hidden bg-gradient-to-tr ${profileData.avatarGradient} flex items-center justify-center text-white font-extrabold text-xl shadow-lg shrink-0 border border-[#4E4F4E]`}
                  >
                    {profileData.avatarUrl ? (
                      <img src={profileData.avatarUrl} alt={profileData.displayName} className="w-full h-full object-cover" />
                    ) : (
                      profileData.displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PM'
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/60 rounded-3xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition cursor-pointer text-[10px] text-white font-semibold"
                    title="Upload Profile Picture"
                  >
                    <Upload className="w-4 h-4 mb-0.5" />
                    <span>Upload</span>
                  </button>
                </div>
                <input
                  type="file"
                  ref={avatarFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setProfileData((prev) => ({ ...prev, avatarUrl: reader.result }));
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-100 truncate">{profileData.displayName}</h4>
                  <p className="text-xs text-[#FF8585] font-mono truncate">{profileData.email}</p>
                  <p className="text-[11px] text-slate-400 font-mono">+91 {profileData.phone}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-[#242524] hover:bg-[#343534] border border-[#4E4F4E] text-[11px] text-slate-200 transition cursor-pointer"
                    >
                      Choose Photo
                    </button>
                    {profileData.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setProfileData((prev) => ({ ...prev, avatarUrl: '' }))}
                        className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-[11px] text-red-400 transition cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Display Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={profileData.displayName}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  className="w-full py-2.5 px-3.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-[#B50000]"
                />
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                <select
                  value={profileData.status}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full py-2.5 px-3.5 bg-[#242524] border border-[#4E4F4E] rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-[#B50000] cursor-pointer"
                >
                  <option value="Active">🟢 Active / Available</option>
                  <option value="Away">🟡 Away</option>
                  <option value="DND">🔴 Do Not Disturb</option>
                  <option value="In Meeting">🟣 In a Meeting</option>
                </select>
              </div>

              {/* Avatar Gradient Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Avatar Theme</label>
                <div className="flex gap-2">
                  {[
                    'from-emerald-500 to-teal-600',
                    'from-indigo-500 to-purple-600',
                    'from-amber-500 to-orange-600',
                    'from-rose-500 to-pink-600',
                    'from-sky-500 to-blue-600'
                  ].map((grad) => (
                    <button
                      key={grad}
                      type="button"
                      onClick={() => setProfileData((prev) => ({ ...prev, avatarGradient: grad }))}
                      className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${grad} transition cursor-pointer ${
                        profileData.avatarGradient === grad ? 'ring-2 ring-white scale-110' : 'opacity-80'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#242524] border-t border-[#4E4F4E] flex justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#B50000] hover:bg-[#990000] text-white cursor-pointer shadow-md shadow-[#B50000]/25"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CLIENT SETTINGS MODAL                                         */}
      {/* ------------------------------------------------------------- */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-200">
          <div className="bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-[#242524] border-b border-[#4E4F4E] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#B50000]/20 text-[#FF8585] flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Client Preferences & Settings</h3>
                  <p className="text-[11px] text-slate-400">Configure language, notifications, and signature</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Language Preference Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Preferred Language
                  </h4>
                  <span className="text-[10px] text-[#FF8585] font-semibold font-mono">
                    Profile Saved
                  </span>
                </div>
                <div className="relative flex items-center rounded-2xl bg-[#242524] border border-[#4E4F4E] focus-within:border-[#B50000] overflow-hidden">
                  <Globe className="w-4 h-4 text-slate-500 ml-3 shrink-0" />
                  <select
                    value={profileData.language || 'English'}
                    onChange={async (e) => {
                      const newLang = e.target.value;
                      setProfileData((prev) => ({ ...prev, language: newLang }));
                      try {
                        localStorage.setItem('phonemail_language', newLang);
                        if (authToken) {
                          await fetch(`${API_BASE}/api/auth/language`, {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${authToken}`
                            },
                            body: JSON.stringify({ language: newLang })
                          });
                        }
                        if (triggerToast) triggerToast(`✅ Language preference set to ${newLang}`);
                      } catch {
                        // ignore
                      }
                    }}
                    className="w-full py-2.5 pl-2.5 pr-8 bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.label} className="bg-[#2C2D2C] text-white">
                        {lang.label} ({lang.native})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notification Toggles */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Notifications & Alerts
                </h4>

                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#242524] border border-[#4E4F4E] cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Desktop Push Notifications</div>
                    <div className="text-[10px] text-slate-500">Show system banner on incoming mail</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsData.pushNotifications}
                    onChange={(e) =>
                      setSettingsData((prev) => ({ ...prev, pushNotifications: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#B50000] rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#242524] border border-[#4E4F4E] cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Carrier SMS Alert Dispatch</div>
                    <div className="text-[10px] text-slate-500">Sync incoming emails with mobile handset SMS</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsData.carrierSmsForwarding}
                    onChange={(e) =>
                      setSettingsData((prev) => ({ ...prev, carrierSmsForwarding: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#B50000] rounded cursor-pointer"
                  />
                </label>
              </div>

              {/* Email Signature Settings */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-2">
                  Email Signature
                </h4>
                <textarea
                  rows={3}
                  value={profileData.signature}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, signature: e.target.value }))
                  }
                  className="w-full p-3 bg-[#242524] border border-[#4E4F4E] rounded-2xl text-xs font-sans text-slate-200 focus:outline-none focus:border-[#B50000]"
                  placeholder="Sent via ZapMail..."
                />
              </div>
            </div>

            <div className="p-4 bg-[#242524] border-t border-[#4E4F4E] flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  setSettingsModalOpen(false);
                  try {
                    localStorage.setItem('phonemail_profile_settings', JSON.stringify(profileData));
                    if (profileData.language && authToken) {
                      await fetch(`${API_BASE}/api/auth/language`, {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${authToken}`
                        },
                        body: JSON.stringify({ language: profileData.language })
                      });
                    }
                  } catch {}
                  if (triggerToast) triggerToast('✅ Preferences saved');
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#B50000] hover:bg-[#990000] text-white cursor-pointer shadow-md shadow-[#B50000]/25"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* KEYBOARD SHORTCUTS CHEAT SHEET MODAL                          */}
      {/* ------------------------------------------------------------- */}
      {shortcutsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-200">
          <div className="bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-[#242524] border-b border-[#4E4F4E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Command className="w-4 h-4 text-[#FF8585]" />
                <h3 className="text-sm font-bold text-white">Keyboard Shortcuts</h3>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-2.5 font-mono text-xs">
              {[
                { key: 'c', desc: 'Compose new email' },
                { key: '/', desc: 'Focus global search bar' },
                { key: 'e', desc: 'Archive / move to trash' },
                { key: 'j', desc: 'Navigate to next email' },
                { key: 'k', desc: 'Navigate to previous email' },
                { key: 'Esc', desc: 'Close modals & menus' },
                { key: '?', desc: 'Open shortcuts cheat sheet' }
              ].map((sc) => (
                <div key={sc.key} className="flex items-center justify-between py-1.5 border-b border-[#4E4F4E]/60">
                  <span className="text-slate-300 font-sans">{sc.desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-[#242524] border border-[#4E4F4E] text-[#FF8585] font-bold text-[11px]">
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ATTACHMENT PREVIEW MODAL                                      */}
      {/* ------------------------------------------------------------- */}
      <AttachmentViewerModal
        isOpen={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        attachment={previewAttachment}
      />
    </div>
  );
}
