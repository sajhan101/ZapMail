import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Monitor,
  Quote,
  CheckCircle,
  Plus,
  X
} from 'lucide-react';
import MobileDeviceFrame from './MobileDeviceFrame';
import MailDashboard from './MailDashboard';
import DesktopClient from './DesktopClient';
import WhatsAppOnboarding from './WhatsAppOnboarding';
import AuthModal from './AuthModal';
import ComposeModal from './ComposeModal';
import { API_BASE } from '../config/api';
import { useTheme } from '../context/ThemeContext';

export default function DualViewWrapper({ initialView = 'mobile' }) {
  const { theme, isDark } = useTheme();
  const [viewMode, setViewMode] = useState(initialView || 'mobile'); // 'mobile' | 'desktop'
  const [backendOnline, setBackendOnline] = useState(false);
  const [dbStats, setDbStats] = useState(null);
  const [smsCount, setSmsCount] = useState(0);

  // Responsive mobile screen detection (<768px)
  const [isMobileScreen, setIsMobileScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track if a conversation thread is currently active in MailDashboard
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Authentication State
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('phonemail_token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('phonemail_token'));

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);

  // Compose pre-fill & lock constraints
  const [composeTo, setComposeTo] = useState('');
  const [composeSubj, setComposeSubj] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAttachments, setComposeAttachments] = useState([]);
  const [composeDraftId, setComposeDraftId] = useState(null);
  const [composeLockedTo, setComposeLockedTo] = useState(false);
  const [composeIsReply, setComposeIsReply] = useState(false);

  // Toast notifications (supports string or object { text, actionLabel, onAction, duration, isQuoteToast })
  const [toastData, setToastData] = useState(null);
  const toastTimerRef = useRef(null);

  const triggerToast = (msg) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const isObj = msg && typeof msg === 'object';
    const text = isObj ? msg.text : msg;
    const isQuote = Boolean(
      (isObj && msg.isQuoteToast) ||
      (typeof text === 'string' && text.toLowerCase().includes('quoted'))
    );
    const duration = isObj && msg.duration ? msg.duration : (isQuote ? 1800 : 4000);

    setToastData(isObj ? { ...msg, text, isQuote } : { text, isQuote });
    toastTimerRef.current = setTimeout(() => setToastData(null), duration);
  };

  // Verify backend health
  const checkBackend = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
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
    triggerToast('Logged out of ZapMail');
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    triggerToast(`Profile updated: ${updatedUser.name || updatedUser.phoneNumber}`);
  };

  const handleOpenCompose = (
    to = '',
    subject = '',
    isLockedTo = false,
    isReply = false,
    body = '',
    attachments = [],
    draftId = null
  ) => {
    const cleanTo = typeof to === 'string' ? to : '';
    const cleanSubj = typeof subject === 'string' ? subject : '';
    setComposeTo(cleanTo);
    setComposeSubj(cleanSubj);
    setComposeBody(typeof body === 'string' ? body : '');
    setComposeAttachments(Array.isArray(attachments) ? attachments : []);
    setComposeDraftId(draftId || null);
    setComposeLockedTo(typeof to === 'string' && Boolean(isLockedTo));
    setComposeIsReply(Boolean(isReply));
    setComposeModalOpen(true);
  };

  const handleLanguageChange = async (newLang) => {
    if (currentUser) {
      setCurrentUser((prev) => ({ ...prev, language: newLang }));
      try {
        await fetch(`${API_BASE}/api/auth/language`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({ language: newLang, phoneNumber: currentUser.phoneNumber })
        });
      } catch (err) {
        console.warn('Failed to sync language preference:', err);
      }
    }
    triggerToast(`🌐 Language preference set to ${newLang}`);
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
    <div className="h-screen h-[100dvh] w-full flex flex-col overflow-hidden font-sans bg-[#3C3D3C] text-slate-100 selection:bg-[#B50000] selection:text-white">
      {/* Interactive Bottom Toast Notification with Undo Support */}
      {toastData && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-xs font-semibold flex items-center gap-3 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-[90vw] border bg-[#242524]/95 text-white border-[#B50000]/60 shadow-black/40">
          {toastData.isQuote ? (
            <Quote className="w-4 h-4 text-[#FF8585] shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-[#FF8585] shrink-0" />
          )}
          <span className="truncate">{toastData.text}</span>
          {toastData.onAction && (
            <button
              type="button"
              onClick={() => {
                toastData.onAction();
                setToastData(null);
              }}
              className="px-3.5 py-1 rounded-full bg-[#B50000] hover:bg-[#990000] text-white font-bold text-xs shadow-md transition cursor-pointer shrink-0 active:scale-95"
            >
              {toastData.actionLabel || 'Undo'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setToastData(null)}
            className="text-slate-400 hover:text-[#FF8585] p-1 rounded-lg shrink-0 cursor-pointer ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Discreet Desktop-Only Floating View Switcher (Visible on desktop only when testing mobile simulation) */}
      {!isMobileScreen && viewMode === 'mobile' && (
        <div
          className="fixed top-4 right-4 z-50 hidden md:flex items-center gap-2.5 border border-[#4E4F4E] rounded-full px-3.5 py-1.5 shadow-2xl text-xs font-semibold animate-in fade-in duration-200 bg-[#2C2D2C] text-gray-300"
        >
          <span className="w-2 h-2 rounded-full bg-[#B50000] animate-pulse" />
          <span className="text-gray-400 text-[11px]">Mobile View</span>
          <span className="text-[#4E4F4E]">|</span>
          <button
            type="button"
            onClick={() => setViewMode('desktop')}
            className="text-[#FF8585] hover:text-white flex items-center gap-1.5 transition cursor-pointer font-bold"
            title="Switch to Desktop Webmail View"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop Webmail</span>
          </button>
        </div>
      )}

      {/* Main Responsive Canvas: fills viewport without outer scrolling */}
      <main className="flex-1 w-full h-full overflow-hidden flex flex-col items-center justify-center relative">
        {viewMode === 'mobile' ? (
          /* Mobile Device Frame Presentation (borderless 100% on phone, realistic mockup on desktop) */
          <div
            className="w-full h-full flex flex-col items-center justify-center p-0 md:p-4 overflow-hidden bg-[#3C3D3C]"
          >
            <MobileDeviceFrame>
              {showOnboarding ? (
                <WhatsAppOnboarding
                  onComplete={handleOnboardingComplete}
                  onSkip={() => setShowOnboarding(false)}
                  triggerToast={triggerToast}
                  currentUser={currentUser}
                  onLanguageChange={handleLanguageChange}
                  onProfileUpdate={handleProfileUpdate}
                />
              ) : (
                <MailDashboard
                  viewMode="mobile"
                  authToken={authToken}
                  currentUser={currentUser}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onOpenCompose={handleOpenCompose}
                  onLogout={handleLogout}
                  triggerToast={triggerToast}
                  onActiveChatChange={setIsChatOpen}
                  onLanguageChange={handleLanguageChange}
                  onProfileUpdate={handleProfileUpdate}
                />
              )}
            </MobileDeviceFrame>
          </div>
        ) : (
          /* Desktop Webmail View: Full-height, borderless layout */
          <div className="w-full h-full flex-1 flex flex-col overflow-hidden animate-in fade-in duration-300 bg-[#2C2D2C]">
            <DesktopClient
              authToken={authToken}
              currentUser={currentUser}
              onAuthSuccess={handleAuthSuccess}
              onLogout={handleLogout}
              onOpenCompose={handleOpenCompose}
              triggerToast={triggerToast}
              onSwitchToMobile={() => setViewMode('mobile')}
              onLanguageChange={handleLanguageChange}
              onProfileUpdate={handleProfileUpdate}
            />
          </div>
        )}
      </main>

      {/* 3. PERSISTENT FLOATING ACTIONS CONTAINER:
          - Automatically hidden during onboarding (showOnboarding)
          - Automatically hidden during auth modal (authModalOpen)
          - Automatically hidden inside active chat (isChatOpen)
          - Hidden in desktop webmail view (DesktopClient has its own sidebar Compose)
          - Renders the matte red compose FAB (+) button */}
      {!showOnboarding && !authModalOpen && !isChatOpen && viewMode === 'mobile' && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-200">
          <button
            type="button"
            onClick={() => handleOpenCompose()}
            className="pointer-events-auto px-5 py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full shadow-2xl shadow-red-950/60 border border-red-500/40 flex items-center gap-2.5 text-base font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95 cursor-pointer group"
            title="Start New Email Thread (Compose)"
          >
            <Plus className="w-5 h-5 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
            <span className="tracking-wide">Compose</span>
          </button>
        </div>
      )}

      {/* Interactive Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onLanguageChange={handleLanguageChange}
        onProfileUpdate={handleProfileUpdate}
      />

      <ComposeModal
        isOpen={composeModalOpen}
        onClose={() => setComposeModalOpen(false)}
        onEmailSent={handleEmailSent}
        initialTo={composeTo}
        initialSubject={composeSubj}
        initialBody={composeBody}
        initialAttachments={composeAttachments}
        draftId={composeDraftId}
        authToken={authToken}
        currentUser={currentUser}
        isLockedTo={composeLockedTo}
        isReply={composeIsReply}
        triggerToast={triggerToast}
      />
    </div>
  );
}
