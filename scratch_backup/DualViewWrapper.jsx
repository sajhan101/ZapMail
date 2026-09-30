import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Smartphone,
  Monitor,
  Radio,
  Sparkles,
  PhoneCall,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Inbox,
  Bell
} from 'lucide-react';
import MobileDeviceFrame from './MobileDeviceFrame';
import MailDashboard from './MailDashboard';
import DesktopClient from './DesktopClient';
import WhatsAppOnboarding from './WhatsAppOnboarding';
import AuthModal from './AuthModal';
import ComposeModal from './ComposeModal';
import TelecomModal from './TelecomModal';
import DemoUserSwitcher from './DemoUserSwitcher';

export default function DualViewWrapper({ initialView = 'mobile' }) {
  const [viewMode, setViewMode] = useState(initialView || 'mobile'); // 'mobile' | 'desktop'
  const [backendOnline, setBackendOnline] = useState(false);
  const [dbStats, setDbStats] = useState(null);

  // Authentication State
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('phonemail_token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('phonemail_token'));

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [telecomModalOpen, setTelecomModalOpen] = useState(false);

  // Compose pre-fill & lock constraints
  const [composeTo, setComposeTo] = useState('');
  const [composeSubj, setComposeSubj] = useState('');
  const [composeLockedTo, setComposeLockedTo] = useState(false);
  const [composeIsReply, setComposeIsReply] = useState(false);

  // Toast notifications
  const [toastMsg, setToastMsg] = useState(null);

  // SMS count for floating button badge
  const [smsCount, setSmsCount] = useState(0);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Verify backend health
  const checkBackend = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/health');
      if (res.ok) {
        const data = await res.json();
        setBackendOnline(true);
        setDbStats(data.counts || null);
        if (data.counts?.smsLogs !== undefined) {
          setSmsCount(data.counts.smsLogs);
        }
      } else {
        setBackendOnline(false);
      }
    } catch {
      setBackendOnline(false);
    }
  };

  // Fetch current user from token
  const fetchCurrentUser = async (token) => {
    if (!token) {
      setCurrentUser(null);
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/api/auth/me', {
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
    checkBackend();
    const timer = setInterval(checkBackend, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authToken) {
      fetchCurrentUser(authToken);
    } else {
      setCurrentUser(null);
    }
  }, [authToken]);

  const handleAuthSuccess = (user, token) => {
    if (token) {
      localStorage.setItem('phonemail_token', token);
      setAuthToken(token);
    }
    setCurrentUser(user);
    setShowOnboarding(false);
    triggerToast(`🎉 Welcome, ${user.phoneNumber}! Linked email: ${user.email}`);
  };

  const handleOnboardingComplete = (user, token) => {
    if (token) {
      localStorage.setItem('phonemail_token', token);
      setAuthToken(token);
    }
    setCurrentUser(user);
    setShowOnboarding(false);
    triggerToast(`🎉 Verified! Welcome, ${user.phoneNumber}! Linked email: ${user.email}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('phonemail_token');
    setAuthToken('');
    setCurrentUser(null);
    setShowOnboarding(true);
    triggerToast('Logged out of PhoneMail');
  };

  const handleDemoUserSwitch = (user, token) => {
    if (token) {
      localStorage.setItem('phonemail_token', token);
      setAuthToken(token);
    }
    setCurrentUser(user);
    setShowOnboarding(false);
    triggerToast(`⚡ Switched to ${user.name} (${user.role}) in 1s!`);
    checkBackend();
  };

  const handleDataReset = () => {
    triggerToast('🌱 Database reset to 3 demo users & fresh threads!');
    checkBackend();
  };

  const handleOpenCompose = (to = '', subject = '', isLockedTo = false, isReply = false) => {
    const cleanTo = typeof to === 'string' ? to : '';
    const cleanSubj = typeof subject === 'string' ? subject : '';
    setComposeTo(cleanTo);
    setComposeSubj(cleanSubj);
    setComposeLockedTo(typeof to === 'string' && Boolean(isLockedTo));
    setComposeIsReply(Boolean(isReply));
    setComposeModalOpen(true);
  };

  const [telecomTab, setTelecomTab] = useState('ivr');
  const [telecomReplyPhone, setTelecomReplyPhone] = useState('');
  const [telecomReplyEmail, setTelecomReplyEmail] = useState('');
  const [telecomReplySubj, setTelecomReplySubj] = useState('');

  const handleOpenTelecom = (tab = 'ivr', replyToEmail = '', subject = '') => {
    setTelecomTab(tab || 'ivr');
    setTelecomReplyPhone(currentUser?.phoneNumber || '5559876543');
    setTelecomReplyEmail(replyToEmail || '');
    setTelecomReplySubj(subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : '');
    setTelecomModalOpen(true);
  };

  const handleEmailSent = (result) => {
    if (result.smsAlertSent) {
      triggerToast(`✅ Email sent & SMS alert dispatched to ${result.smsNotification?.recipientPhone || 'recipient'}!`);
      setSmsCount((c) => c + 1);
    } else {
      triggerToast('✅ Email sent successfully!');
    }
    checkBackend();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-full shadow-2xl text-xs font-semibold flex items-center gap-2.5 border border-indigo-400/40 animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Workspace Header Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-xl px-4 lg:px-8 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Left: Branding & Core Tech Stack */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">PhoneMail</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Full-Stack Monorepo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Phone = Email • Express (5000) • SMTP (2525) • SQLite
              </p>
            </div>
          </div>

          {/* Center: Dual-View Mode Switcher Toggle Button */}
          <div className="flex items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('mobile')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                viewMode === 'mobile'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>📱 Mobile App View</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('desktop')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                viewMode === 'desktop'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>💻 Desktop Webmail View</span>
            </button>
          </div>

          {/* Right: Live Status Chips & User Auth */}
          <div className="flex items-center gap-2.5 text-xs">
            {/* API Status */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span className="text-slate-300 font-mono text-[11px]">
                API :5000 {backendOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* SMTP Status */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-slate-300 font-mono text-[11px]">SMTP :2525</span>
            </div>

            {/* Replay WhatsApp Onboarding Flow */}
            <button
              type="button"
              onClick={() => {
                setViewMode('mobile');
                setShowOnboarding(true);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 hover:text-emerald-300 text-xs font-semibold border border-emerald-500/40 transition cursor-pointer"
              title="Replay WhatsApp-style 4-step Onboarding & Auth Flow"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Onboarding</span>
            </button>

            {/* Portal & Web Links */}
            <Link
              to="/register"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition"
            >
              <span>Portal</span>
            </Link>

            <Link
              to="/web"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition"
            >
              <span>Desktop /web</span>
            </Link>

            {/* Quick 1-Sec Switch User / Demo Accounts Selector */}
            <DemoUserSwitcher
              currentUser={currentUser}
              onSwitchUser={handleDemoUserSwitch}
              onDataReset={handleDataReset}
            />

            {/* Auth Button / Pill */}
            {currentUser ? (
              <div className="flex items-center gap-2 bg-indigo-950/60 border border-indigo-500/30 rounded-xl px-2.5 py-1">
                <span className="text-xs font-mono text-indigo-300">{currentUser.phoneNumber}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign Out"
                  className="text-slate-400 hover:text-rose-400 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Responsive Canvas */}
      <main className="flex-1 flex flex-col items-center justify-start overflow-hidden relative">
        {viewMode === 'mobile' ? (
          /* Mobile Device Frame Presentation */
          <div className="w-full flex-1 flex flex-col items-center justify-center p-3 sm:p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black overflow-y-auto">
            <MobileDeviceFrame>
              {showOnboarding ? (
                <WhatsAppOnboarding
                  onComplete={handleOnboardingComplete}
                  onSkip={() => setShowOnboarding(false)}
                  triggerToast={triggerToast}
                />
              ) : (
                <MailDashboard
                  viewMode="mobile"
                  authToken={authToken}
                  currentUser={currentUser}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onOpenCompose={handleOpenCompose}
                  onOpenTelecom={handleOpenTelecom}
                  onLogout={handleLogout}
                  triggerToast={triggerToast}
                />
              )}
            </MobileDeviceFrame>
          </div>
        ) : (
          /* Desktop Webmail View: Classic 3-Column / Gmail-Style Layout with Single-Screen Auth Flow */
          <div className="w-full flex-1 h-[calc(100vh-65px)] bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-300">
            <DesktopClient
              authToken={authToken}
              currentUser={currentUser}
              onAuthSuccess={handleAuthSuccess}
              onLogout={handleLogout}
              onOpenCompose={handleOpenCompose}
              onOpenTelecom={handleOpenTelecom}
              triggerToast={triggerToast}
              onSwitchToMobile={() => setViewMode('mobile')}
            />
          </div>
        )}
      </main>

      {/* 3. PERSISTENT FLOATING BUTTON AT BOTTOM-RIGHT */}
      <button
        type="button"
        onClick={() => {
          setTelecomTab('ivr');
          setTelecomModalOpen(true);
        }}
        className="fixed bottom-6 right-6 z-40 px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm rounded-full shadow-2xl shadow-emerald-600/40 border border-emerald-400/40 flex items-center gap-2.5 transition transform hover:scale-105 active:scale-95 cursor-pointer"
        title="Open Interactive IVR Voice & SMS Dispatcher Simulator"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>
        <PhoneCall className="w-4 h-4" />
        <span>📞 Telecom Simulator</span>
        {smsCount > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-black/40 rounded-full text-xs font-mono text-emerald-200">
            {smsCount}
          </span>
        )}
      </button>

      {/* Interactive Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      <ComposeModal
        isOpen={composeModalOpen}
        onClose={() => setComposeModalOpen(false)}
        onEmailSent={handleEmailSent}
        initialTo={composeTo}
        initialSubject={composeSubj}
        authToken={authToken}
        currentUser={currentUser}
        isLockedTo={composeLockedTo}
        isReply={composeIsReply}
      />

      <TelecomModal
        isOpen={telecomModalOpen}
        onClose={() => setTelecomModalOpen(false)}
        onDataChanged={checkBackend}
        initialTab={telecomTab}
        prefillSenderPhone={telecomReplyPhone}
        prefillReplyToEmail={telecomReplyEmail}
        prefillSubject={telecomReplySubj}
      />
    </div>
  );
}
