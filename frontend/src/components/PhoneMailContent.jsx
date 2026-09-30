import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  Phone,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
  Volume2,
  MessageSquare,
  ShieldCheck,
  Server,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  Sliders,
  ChevronRight,
  User,
  Plus,
  Lock,
  LogOut,
  KeyRound,
  Database,
  PhoneCall,
  Hash,
  Trash2,
  CheckCheck
} from 'lucide-react';
import { API_BASE } from '../config/api';

const INITIAL_EMAILS = [
  {
    id: 'seed-1',
    from: 'support@cloudservice.com',
    to: 'user@phonemail.local',
    subject: 'Your 2FA Verification Code: 849201',
    date: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    text: 'Your security code is 849201. This code expires in 10 minutes. PhoneMail automated SMS forwarder will deliver this to your linked device.',
    read: false,
  },
  {
    id: 'seed-2',
    from: 'billing@utility.org',
    to: 'office@phonemail.local',
    subject: 'Monthly Statement & Payment Receipt',
    date: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    text: 'Your statement for the current billing cycle is ready. Total due: $42.50. Paid automatically via linked account.',
    read: true,
  },
  {
    id: 'seed-3',
    from: 'alex.chen@startup.io',
    to: 'alex@phonemail.local',
    subject: 'Quick update on tomorrow schedule',
    date: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    text: 'Hey Alex, moving our sprint review to 2:30 PM. Can you confirm if that works for you? You can reply directly by SMS to this thread.',
    read: false,
  },
];

export default function PhoneMailContent({ viewMode = 'desktop' }) {
  const [emails, setEmails] = useState(INITIAL_EMAILS);
  const [selectedEmail, setSelectedEmail] = useState(INITIAL_EMAILS[0]);
  const [smsLogs, setSmsLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' | 'sent' | 'sms' | 'telecom' | 'compose' | 'auth' | 'settings'
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [backendHealth, setBackendHealth] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Authentication State
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('phonemail_token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({
    phoneNumber: '5551234567',
    password: 'SecurePassword123!',
    registeredVia: 'MOBILE_APP',
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Telecom Simulator State
  const [ivrPhone, setIvrPhone] = useState('5559876543');
  const [ivrDigit, setIvrDigit] = useState('1');
  const [ivrResult, setIvrResult] = useState('');
  const [ivrLoading, setIvrLoading] = useState(false);

  const [smsSenderPhone, setSmsSenderPhone] = useState('5558889999');
  const [smsText, setSmsText] = useState('REGISTER');
  const [smsResult, setSmsResult] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);

  // Test email compose state
  const [newEmail, setNewEmail] = useState({
    to: '5559876543@phonemail.com',
    subject: 'Doctor Appointment Reminder',
    text: 'Your appointment is confirmed for tomorrow at 3:00 PM.',
  });

  const isMobile = viewMode === 'mobile';

  // Load current user profile from token
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

  // Fetch emails, SMS logs, and health from backend
  const refreshData = async () => {
    try {
      // 1. Health check & DB statistics
      const healthRes = await fetch(`${API_BASE}/api/health`).catch(() => null);
      if (healthRes && healthRes.ok) {
        const healthData = await healthRes.json();
        setBackendHealth(healthData);
      } else {
        setBackendHealth(null);
      }

      // 2. Fetch emails (inbox, sent, or general)
      let emailUrl = `${API_BASE}/api/emails`;
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
        if (activeTab === 'inbox') {
          emailUrl = `${API_BASE}/api/emails/inbox`;
        } else if (activeTab === 'sent') {
          emailUrl = `${API_BASE}/api/emails/sent`;
        }
      }

      const emailRes = await fetch(emailUrl, { headers }).catch(() => null);
      if (emailRes && emailRes.ok) {
        const resData = await emailRes.json();
        const rawList = Array.isArray(resData) ? resData : resData.data || [];
        if (rawList.length > 0) {
          const formatted = rawList.map((item) => ({
            id: item.id,
            from: item.senderEmail,
            to: item.recipientEmail,
            subject: item.subject,
            date: item.createdAt,
            text: item.body,
            read: Boolean(item.read),
          }));
          setEmails(formatted);
          if (!selectedEmail && formatted.length > 0) {
            setSelectedEmail(formatted[0]);
          }
        } else if (authToken && (activeTab === 'inbox' || activeTab === 'sent')) {
          setEmails([]);
          setSelectedEmail(null);
        }
      }

      // 3. Fetch SMS logs from telecom endpoint
      const smsRes = await fetch(`${API_BASE}/api/telecom/sms-logs`).catch(() => null);
      if (smsRes && smsRes.ok) {
        const smsData = await smsRes.json();
        if (Array.isArray(smsData)) {
          setSmsLogs(smsData);
        }
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 4000);
    return () => clearInterval(interval);
  }, [authToken, activeTab]);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Auth Submit: Login or Register
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload =
      authMode === 'register'
        ? {
            phoneNumber: authForm.phoneNumber,
            password: authForm.password,
            registeredVia: authForm.registeredVia,
          }
        : {
            phoneNumber: authForm.phoneNumber,
            password: authForm.password,
          };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      // Successful Auth
      setAuthToken(data.token);
      localStorage.setItem('phonemail_token', data.token);
      setCurrentUser(data.user);
      triggerToast(authMode === 'register' ? '🎉 Account registered!' : '👋 Logged in successfully!');
      setActiveTab('inbox');
    } catch (err) {
      setAuthError('Unable to connect to auth server');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('phonemail_token');
    setAuthToken('');
    setCurrentUser(null);
    triggerToast('Logged out');
  };

  // Handle IVR Call Simulation
  const handleIvrCall = async (e) => {
    if (e) e.preventDefault();
    setIvrLoading(true);
    setIvrResult('');
    try {
      const res = await fetch(`${API_BASE}/api/telecom/ivr-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerPhone: ivrPhone,
          digitPressed: ivrDigit,
        }),
      });
      const data = await res.json();
      setIvrResult(data.message || JSON.stringify(data));
      triggerToast('📞 IVR Keypress Handled');
      await refreshData();
    } catch {
      setIvrResult('Failed to connect to IVR server');
    } finally {
      setIvrLoading(false);
    }
  };

  // Handle Inbound SMS Simulation
  const handleSmsInbound = async (e) => {
    if (e) e.preventDefault();
    setSmsLoading(true);
    setSmsResult('');
    try {
      const res = await fetch(`${API_BASE}/api/telecom/sms-inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderPhone: smsSenderPhone,
          text: smsText,
        }),
      });
      const data = await res.json();
      setSmsResult(data.message || JSON.stringify(data));
      triggerToast('💬 SMS Inbound Processed');
      await refreshData();
    } catch {
      setSmsResult('Failed to connect to SMS server');
    } finally {
      setSmsLoading(false);
    }
  };

  // Handle Mark as Read
  const handleMarkAsRead = async (emailId) => {
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await fetch(`${API_BASE}/api/emails/${emailId}/read`, {
        method: 'PATCH',
        headers,
      });
      if (res.ok) {
        setEmails((prev) =>
          prev.map((e) => (e.id === emailId ? { ...e, read: true } : e)),
        );
        if (selectedEmail?.id === emailId) {
          setSelectedEmail((prev) => ({ ...prev, read: true }));
        }
        triggerToast('Marked as read');
      }
    } catch {
      // offline
    }
  };

  // Handle Delete Email
  const handleDeleteEmail = async (emailId) => {
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await fetch(`${API_BASE}/api/emails/${emailId}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (selectedEmail?.id === emailId) {
          setSelectedEmail(null);
        }
        triggerToast('🗑️ Email deleted');
      }
    } catch {
      // offline
    }
  };

  // Send Email (authenticated /api/emails/send or unauthenticated test)
  const handleSendEmail = async (e) => {
    if (e) e.preventDefault();
    setIsSending(true);

    try {
      if (authToken) {
        // Core Authenticated Email API
        const res = await fetch(`${API_BASE}/api/emails/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            to: newEmail.to,
            subject: newEmail.subject,
            body: newEmail.text,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          triggerToast(
            data.smsAlertSent
              ? '✅ Email sent & SMS alert dispatched to phone!'
              : '✅ Email sent successfully!',
          );
          await refreshData();
          setActiveTab('sent');
        } else {
          triggerToast(data.error || 'Failed to send email');
        }
      } else {
        // Unauthenticated direct SMTP test
        const res = await fetch(`${API_BASE}/api/send-test-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'tester@phonemail.local',
            to: newEmail.to,
            subject: newEmail.subject,
            text: newEmail.text,
          }),
        });

        if (res.ok) {
          triggerToast('✅ Dispatched to embedded SMTP (Port 2525)!');
          await refreshData();
        } else {
          triggerToast('Error dispatching test email');
        }
      }
    } catch {
      triggerToast('Server offline: Check port 5000');
    } finally {
      setIsSending(false);
    }
  };

  const filteredEmails = emails.filter(
    (item) =>
      item.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.text?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className={`flex flex-col h-full ${isMobile ? 'text-sm' : 'text-base'}`}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg text-xs font-medium flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Container Layout */}
      <div className={`flex-1 flex ${isMobile ? 'flex-col overflow-y-auto' : 'flex-row'}`}>
        {/* Desktop Sidebar (Desktop View Only) */}
        {!isMobile && (
          <aside className="w-64 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between shrink-0">
            <div className="space-y-6">
              {/* Branding Header */}
              <div className="flex items-center gap-3 px-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-lg text-slate-100 leading-tight">PhoneMail</h1>
                  <p className="text-xs text-indigo-400 font-medium">Telecom & SMTP Hub</p>
                </div>
              </div>

              {/* User Profile Pill */}
              {currentUser ? (
                <div className="p-2.5 bg-indigo-950/40 rounded-xl border border-indigo-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      {currentUser.phoneNumber.slice(-2)}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {currentUser.phoneNumber}
                      </div>
                      <div className="text-[10px] text-indigo-300 font-mono truncate">
                        {currentUser.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    title="Logout"
                    className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setActiveTab('auth')}
                  className="w-full py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Sign In / Register</span>
                </button>
              )}

              {/* Navigation Links */}
              <nav className="space-y-1">
                <button
                  onClick={() => {
                    setActiveTab('inbox');
                    setSelectedEmail(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'inbox'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Inbox className="w-4 h-4" />
                    <span>Inbox</span>
                  </div>
                  {activeTab === 'inbox' && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
                      {emails.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveTab('sent');
                    setSelectedEmail(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'sent'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Send className="w-4 h-4 text-sky-400" />
                    <span>Sent</span>
                  </div>
                  {activeTab === 'sent' && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
                      {emails.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('telecom')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'telecom'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <PhoneCall className="w-4 h-4 text-emerald-400" />
                  <span>Telecom Engine</span>
                </button>

                <button
                  onClick={() => setActiveTab('sms')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'sms'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4" />
                    <span>SMS Alerts Log</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
                    {smsLogs.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('compose')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'compose'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span>Compose Mail</span>
                </button>

                <button
                  onClick={() => setActiveTab('auth')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'auth'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Auth & Account</span>
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'settings'
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>Configuration</span>
                </button>
              </nav>
            </div>

            {/* Server Status Indicator Card */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/90 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  Telecom & SQLite Dev
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="space-y-1 font-mono text-[11px] text-slate-400">
                <div className="flex justify-between">
                  <span>Users:</span>
                  <span className="text-emerald-400">{backendHealth?.counts?.users ?? 1}</span>
                </div>
                <div className="flex justify-between">
                  <span>Emails:</span>
                  <span className="text-indigo-400">{backendHealth?.counts?.emails ?? emails.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>SMS Logs:</span>
                  <span className="text-amber-400">{backendHealth?.counts?.smsLogs ?? smsLogs.length}</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Content Area */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* Top Bar inside View */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
            {isMobile ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <Phone className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-100 text-sm">PhoneMail</span>
                    {currentUser && (
                      <span className="ml-2 text-[10px] text-emerald-400 font-mono">
                        {currentUser.phoneNumber}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={refreshData}
                    title="Refresh data"
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTab('compose')}
                    className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className="relative w-80">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sender, subject, keywords..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={refreshData}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('compose')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Compose Email</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Conditional View Tabs */}
          {activeTab === 'telecom' ? (
            /* Telecom Simulator Panel */
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto w-full max-w-3xl mx-auto space-y-6">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-emerald-400" />
                  Telecom Simulator & IVR Engine
                </h2>
                <p className="text-xs text-slate-400">
                  Simulate voice IVR calls and inbound SMS keyword registrations
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. IVR Call Simulator */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-indigo-400" />
                      IVR DTMF Call Simulation
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">POST /api/telecom/ivr-call</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400">Caller Phone Number (10 digits)</label>
                    <input
                      type="text"
                      value={ivrPhone}
                      onChange={(e) => setIvrPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Keypad Digit (Press 1 to Register)</label>
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setIvrDigit(d)}
                          className={`py-2 rounded-lg text-xs font-bold font-mono transition ${
                            ivrDigit === d
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleIvrCall}
                    disabled={ivrLoading}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>{ivrLoading ? 'Dialing...' : `Dial Call & Press "${ivrDigit}"`}</span>
                  </button>

                  {ivrResult && (
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-emerald-400 font-mono">
                      {ivrResult}
                    </div>
                  )}
                </div>

                {/* 2. SMS Inbound Keyword Simulator */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      Inbound SMS Keyword
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">POST /api/telecom/sms-inbound</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400">Sender Phone (10 digits)</label>
                    <input
                      type="text"
                      value={smsSenderPhone}
                      onChange={(e) => setSmsSenderPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400">SMS Text Content</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={smsText}
                        onChange={(e) => setSmsText(e.target.value)}
                        placeholder="REGISTER"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setSmsText('REGISTER')}
                        className="px-2.5 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-lg text-xs font-mono cursor-pointer"
                      >
                        REGISTER
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleSmsInbound}
                    disabled={smsLoading}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{smsLoading ? 'Processing...' : 'Send Inbound SMS'}</span>
                  </button>

                  {smsResult && (
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-indigo-300 font-mono">
                      {smsResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'auth' ? (
            /* Authentication Panel */
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto max-w-md mx-auto w-full">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="text-center space-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 mb-2">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">
                    {authMode === 'register' ? 'Create PhoneMail Account' : 'Sign in to PhoneMail'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {authMode === 'register'
                      ? 'Enter your 10-digit phone number to claim your @phonemail.com address'
                      : 'Access your inbox, sent messages, and SMS forwarder logs'}
                  </p>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                    }}
                    className={`flex-1 py-1.5 rounded-md font-medium transition cursor-pointer ${
                      authMode === 'login' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError('');
                    }}
                    className={`flex-1 py-1.5 rounded-md font-medium transition cursor-pointer ${
                      authMode === 'register' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Register
                  </button>
                </div>

                {authError && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
                    {authError}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Phone Number (10 digits)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={authForm.phoneNumber}
                        onChange={(e) => setAuthForm({ ...authForm, phoneNumber: e.target.value })}
                        placeholder="e.g. 5551234567"
                        maxLength={10}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                        required
                      />
                    </div>
                    {authMode === 'register' && authForm.phoneNumber.length === 10 && (
                      <p className="mt-1 text-[11px] text-emerald-400 font-mono">
                        Auto-assigned: {authForm.phoneNumber}@phonemail.com
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="password"
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  {authMode === 'register' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Registration Channel
                      </label>
                      <select
                        value={authForm.registeredVia}
                        onChange={(e) => setAuthForm({ ...authForm, registeredVia: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="MOBILE_APP">MOBILE_APP (Mobile Screen View)</option>
                        <option value="WEB_CLIENT">WEB_CLIENT (Web Browser)</option>
                        <option value="WEB_PORTAL">WEB_PORTAL (Admin Dashboard)</option>
                        <option value="IVR">IVR (Interactive Voice Response)</option>
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {authLoading
                        ? 'Processing...'
                        : authMode === 'register'
                        ? 'Register & Get JWT'
                        : 'Sign In'}
                    </span>
                  </button>
                </form>

                {currentUser && (
                  <div className="pt-3 border-t border-slate-800 text-xs space-y-2">
                    <span className="text-slate-400 font-medium">Currently Authenticated:</span>
                    <div className="p-2.5 bg-slate-950 rounded-lg font-mono text-[11px] text-slate-300 space-y-1">
                      <div>Phone: {currentUser.phoneNumber}</div>
                      <div>Email: {currentUser.email}</div>
                      <div>Channel: {currentUser.registeredVia}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'sms' ? (
            /* SMS Alerts Logs View */
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto w-full max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    Simulated SMS Notification Alerts
                  </h2>
                  <p className="text-xs text-slate-400">
                    Auto-dispatched to users registered via IVR, WEB_PORTAL, or WEB_CLIENT upon incoming emails
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 bg-slate-800 rounded-full text-slate-300 font-mono">
                  {smsLogs.length} alerts
                </span>
              </div>

              {smsLogs.length === 0 ? (
                <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                  No SMS notification alerts recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {smsLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-slate-200">
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Target Phone: {log.recipientPhone}</span>
                        </div>
                        <span className="text-slate-500 text-[11px] font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">From:</span> {log.senderEmail} |{' '}
                        <span className="text-slate-500">Subject:</span> {log.subject}
                      </div>
                      <div className="p-2.5 bg-slate-950 rounded-lg font-mono text-[11px] text-emerald-300 border border-slate-800/80">
                        {log.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'compose' ? (
            /* Compose Email Form */
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto max-w-xl mx-auto w-full">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="font-semibold text-slate-100 text-base">
                      {currentUser ? `Compose Email (${currentUser.email})` : 'Dispatch Email'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {currentUser
                        ? 'Authenticated send via POST /api/emails/send with SMS trigger'
                        : 'Sign in to send as yourself, or dispatch directly'}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('inbox')}
                    className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <form onSubmit={handleSendEmail} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      To (Recipient Email or 10-digit Phone)
                    </label>
                    <input
                      type="text"
                      value={newEmail.to}
                      onChange={(e) => setNewEmail({ ...newEmail, to: e.target.value })}
                      placeholder="e.g. 5559876543@phonemail.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
                    <input
                      type="text"
                      value={newEmail.subject}
                      onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Message Body</label>
                    <textarea
                      rows={5}
                      value={newEmail.text}
                      onChange={(e) => setNewEmail({ ...newEmail, text: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSending ? 'Sending Message...' : 'Send Email'}</span>
                  </button>
                </form>
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            /* Settings View */
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 max-w-xl mx-auto w-full">
              <h2 className="font-semibold text-slate-100 text-lg">System Configuration</h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Backend HTTP API</span>
                  <span className="font-mono text-emerald-400">{API_BASE}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Email Core Endpoints</span>
                  <span className="font-mono text-indigo-400">/api/emails (inbox, sent, send)</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Telecom Engine</span>
                  <span className="font-mono text-emerald-400">/api/telecom (IVR + SMS)</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Auth Router</span>
                  <span className="font-mono text-indigo-400">/api/auth (JWT Bearer)</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Embedded SMTP Server</span>
                  <span className="font-mono text-indigo-400">localhost:2525</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400">Database Engine</span>
                  <span className="font-mono text-amber-400">SQLite (dev.db via better-sqlite3)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">SMS Notification Alert Rule</span>
                  <span className="text-slate-300 font-mono">IVR, WEB_PORTAL, WEB_CLIENT</span>
                </div>
              </div>
            </div>
          ) : (
            /* Inbox or Sent Split Pane or Mobile List */
            <div className={`flex-1 flex ${isMobile ? 'flex-col overflow-y-auto' : 'flex-row overflow-hidden'}`}>
              {/* Email List Column */}
              <div
                className={`${
                  isMobile
                    ? selectedEmail && viewMode === 'mobile'
                      ? 'hidden'
                      : 'w-full flex-1'
                    : 'w-80 lg:w-96 border-r border-slate-800 flex flex-col'
                } bg-slate-950/80 overflow-y-auto`}
              >
                <div className="p-3 border-b border-slate-800/80 text-xs font-semibold text-slate-400 flex items-center justify-between">
                  <span className="uppercase">
                    {activeTab === 'sent' ? 'Sent Messages' : 'Inbox Messages'} ({filteredEmails.length})
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">SQLite Store</span>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {filteredEmails.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No emails in {activeTab}. Click "Compose Mail" or "Test SMTP Inbound" to create one.
                    </div>
                  ) : (
                    filteredEmails.map((item) => {
                      const isSelected = selectedEmail?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedEmail(item);
                            if (!item.read) handleMarkAsRead(item.id);
                          }}
                          className={`p-3.5 cursor-pointer transition ${
                            isSelected
                              ? 'bg-indigo-950/40 border-l-4 border-indigo-500'
                              : 'hover:bg-slate-900/70 border-l-4 border-transparent'
                          } ${!item.read ? 'bg-slate-900/40' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-xs text-slate-200 truncate max-w-[190px]">
                              {activeTab === 'sent' ? `To: ${item.to}` : item.from}
                            </span>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                              {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-1">
                            {!item.read && activeTab !== 'sent' && (
                              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                            )}
                            <div className="text-xs font-semibold text-slate-300 truncate">
                              {item.subject}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {item.text}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            {item.to.includes('@phonemail') && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <Phone className="w-2.5 h-2.5" /> SMS Alert Hook
                              </span>
                            )}
                            {item.read ? (
                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                <CheckCheck className="w-3 h-3 text-sky-400" /> Read
                              </span>
                            ) : (
                              <span className="text-[10px] text-indigo-400">Unread</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Message Reading Pane */}
              <div
                className={`${
                  isMobile
                    ? selectedEmail
                      ? 'w-full flex-1 flex flex-col p-4'
                      : 'hidden'
                    : 'flex-1 flex flex-col p-6'
                } bg-slate-900/30 overflow-y-auto`}
              >
                {isMobile && selectedEmail && (
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="mb-3 text-xs text-indigo-400 flex items-center gap-1 font-medium hover:underline cursor-pointer"
                  >
                    ← Back to {activeTab}
                  </button>
                )}

                {selectedEmail ? (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    {/* Header */}
                    <div className="space-y-3 pb-4 border-b border-slate-800">
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="text-lg font-bold text-slate-100 leading-snug">
                          {selectedEmail.subject}
                        </h2>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleMarkAsRead(selectedEmail.id)}
                            title="Mark as Read"
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <CheckCheck className="w-4 h-4 text-emerald-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmail(selectedEmail.id)}
                            title="Delete Email"
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 text-rose-400" />
                          </button>
                          <span className="text-xs px-2.5 py-1 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                            {new Date(selectedEmail.date).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-semibold text-xs">
                            {selectedEmail.from[0]?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{selectedEmail.from}</div>
                            <div className="text-slate-500 text-[11px]">To: {selectedEmail.to}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-[10px]">
                            {selectedEmail.read ? 'Read' : 'Unread'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Email Body Content */}
                    <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs sm:text-sm text-slate-300 whitespace-pre-line leading-relaxed min-h-[140px]">
                      {selectedEmail.text || 'No text content in this email.'}
                    </div>

                    {/* PhoneMail Actions Bar */}
                    <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span className="text-xs text-slate-300 font-medium">
                          Telecom Dispatcher: Active
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => triggerToast('Playing simulated voice transcription')}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Listen (TTS)</span>
                        </button>
                        <button
                          onClick={() => triggerToast('SMS reply sent to caller')}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Reply via SMS</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                    <Mail className="w-10 h-10 mb-2 stroke-1 text-slate-600" />
                    <p>Select a message from the list to view details</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mobile Bottom Navigation Bar (Mobile View Only) */}
          {isMobile && (
            <div className="border-t border-slate-800 bg-slate-950 px-3 py-2 flex items-center justify-around shrink-0">
              <button
                onClick={() => {
                  setActiveTab('inbox');
                  setSelectedEmail(null);
                }}
                className={`flex flex-col items-center gap-1 text-[10px] ${
                  activeTab === 'inbox' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
                }`}
              >
                <Inbox className="w-4 h-4" />
                <span>Inbox</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('sent');
                  setSelectedEmail(null);
                }}
                className={`flex flex-col items-center gap-1 text-[10px] ${
                  activeTab === 'sent' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Sent</span>
              </button>

              <button
                onClick={() => setActiveTab('telecom')}
                className={`flex flex-col items-center gap-1 text-[10px] ${
                  activeTab === 'telecom' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                <span>Telecom</span>
              </button>

              <button
                onClick={() => setActiveTab('sms')}
                className={`flex flex-col items-center gap-1 text-[10px] ${
                  activeTab === 'sms' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Alerts</span>
              </button>

              <button
                onClick={() => setActiveTab('auth')}
                className={`flex flex-col items-center gap-1 text-[10px] ${
                  activeTab === 'auth' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Account</span>
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
