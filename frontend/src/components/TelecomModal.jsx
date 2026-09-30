import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  PhoneCall,
  PhoneOff,
  MessageSquare,
  Sparkles,
  Volume2,
  CheckCircle2,
  RefreshCw,
  Send,
  AlertCircle,
  Radio,
  Clock,
  Mail,
  Zap,
  Smartphone,
  Reply,
  ArrowRight,
  ShieldCheck,
  Server
} from 'lucide-react';
import { SmsListSkeleton } from './LoadingSkeleton';
import { API_BASE } from '../config/api';

export default function TelecomModal({
  isOpen,
  onClose,
  onDataChanged,
  initialTab = 'ivr',
  prefillSenderPhone = '',
  prefillReplyToEmail = '',
  prefillSubject = ''
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'ivr'); // 'ivr' | 'sms' | 'reply'

  // IVR Call State
  const [callerPhone, setCallerPhone] = useState(prefillSenderPhone || '5559876543');
  const [callState, setCallState] = useState('idle'); // 'idle' | 'calling' | 'connected' | 'ended'
  const [callDuration, setCallDuration] = useState(0);
  const [ivrMessage, setIvrMessage] = useState('Welcome to PhoneMail. Press 1 to register');
  const [ivrLog, setIvrLog] = useState('');
  const [isProcessingKey, setIsProcessingKey] = useState(false);

  // SMS Logs State
  const [smsLogs, setSmsLogs] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [simulatingEmail, setSimulatingEmail] = useState(false);

  // Quick SMS Inbound state
  const [inboundSmsText, setInboundSmsText] = useState('REGISTER');
  const [inboundSmsPhone, setInboundSmsPhone] = useState('5554443333');
  const [inboundSmsResult, setInboundSmsResult] = useState('');

  // Interactive Carrier SMS Reply State (POST /api/telecom/sms-reply)
  const [replyPhone, setReplyPhone] = useState(prefillSenderPhone || '5559876543');
  const [replyToEmail, setReplyToEmail] = useState(prefillReplyToEmail || 'judge@hackathon.org');
  const [replySubject, setReplySubject] = useState(prefillSubject || 'Re: Project Evaluation & Demo Schedule');
  const [replySmsText, setReplySmsText] = useState('Confirmed! We are ready for our live presentation.');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyResult, setReplyResult] = useState(null);

  // AI Summarization & Smart Replies State for Telecom
  const [smsSummaries, setSmsSummaries] = useState({});
  const [summarizingSmsId, setSummarizingSmsId] = useState(null);
  const [smartReplyOptions, setSmartReplyOptions] = useState([
    'Confirmed! We are ready for our live presentation.',
    'Could we please move the call by 15 minutes?',
    'Received! Checking the details now and will confirm shortly.'
  ]);

  // Sync pre-fills if passed
  useEffect(() => {
    if (prefillSenderPhone) setReplyPhone(prefillSenderPhone);
    if (prefillReplyToEmail) setReplyToEmail(prefillReplyToEmail);
    if (prefillSubject) setReplySubject(prefillSubject);
    if (initialTab) setActiveTab(initialTab);
  }, [prefillSenderPhone, prefillReplyToEmail, prefillSubject, initialTab]);

  // Call timer effect
  useEffect(() => {
    let timer;
    if (callState === 'connected') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Fetch SMS logs
  const fetchSmsLogs = async () => {
    try {
      setSmsLoading(true);
      const res = await fetch(`${API_BASE}/api/telecom/sms-logs`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSmsLogs(data);
        }
      }
    } catch {
      // offline
    } finally {
      setSmsLoading(false);
    }
  };

  // Fetch smart replies for Carrier SMS Reply
  const fetchSmsSmartReplies = async (subject, text) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/suggest-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text || '',
          subject: subject || '',
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSmartReplyOptions(data.suggestions.slice(0, 3));
      }
    } catch {
      // fallback preserved
    }
  };

  // Poll SMS logs when modal is open
  useEffect(() => {
    if (!isOpen) return;
    fetchSmsLogs();
    const interval = setInterval(fetchSmsLogs, 3000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  // Fetch smart replies when reply tab is open
  useEffect(() => {
    if (isOpen && activeTab === 'reply') {
      fetchSmsSmartReplies(replySubject, replySmsText);
    }
  }, [isOpen, activeTab, replySubject]);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Start Call
  const handleStartCall = () => {
    const cleanDigits = callerPhone.replace(/\D/g, '');
    if (cleanDigits.length !== 10) {
      alert('Please enter a valid 10-digit phone number');
      return;
    }
    setCallState('calling');
    setIvrMessage('Connecting to Toll-Free 1-800-PHONEMAIL...');
    setIvrLog('');

    setTimeout(() => {
      setCallState('connected');
      setIvrMessage('Welcome to PhoneMail. Press 1 to register your phone number as an email address.');
    }, 1200);
  };

  // End Call
  const handleEndCall = () => {
    setCallState('ended');
    setIvrMessage('Call Disconnected.');
    setTimeout(() => {
      setCallState('idle');
      setIvrMessage('Welcome to PhoneMail. Press 1 to register');
    }, 1000);
  };

  // Keypad Press
  const handleKeyPress = async (digit) => {
    if (callState !== 'connected' || isProcessingKey) return;

    setIsProcessingKey(true);
    const cleanPhone = callerPhone.replace(/\D/g, '');

    if (digit === '1') {
      try {
        setIvrMessage('Processing keypress "1"... Contacting registration engine...');
        const res = await fetch(`${API_BASE}/api/telecom/ivr-call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callerPhone: cleanPhone,
            digitPressed: '1',
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setIvrMessage(data.message || `Account created for ${cleanPhone}@phonemail.com!`);
          setIvrLog(`✅ ${data.message || 'Account successfully activated'}`);
          fetchSmsLogs();
          if (onDataChanged) onDataChanged();
        } else {
          setIvrMessage(data.error || 'Registration failed');
          setIvrLog(`❌ ${data.error || 'IVR error'}`);
        }
      } catch {
        setIvrMessage('System error: Unable to contact telecom IVR server');
      }
    } else {
      setIvrMessage(`Key "${digit}" pressed. (Only '1' is configured for registration in this demo)`);
    }

    setIsProcessingKey(false);
  };

  // Handle AI Summarize on SMS log
  const handleSummarizeSms = async (sms) => {
    if (smsSummaries[sms.id]) {
      setSmsSummaries((prev) => {
        const next = { ...prev };
        delete next[sms.id];
        return next;
      });
      return;
    }
    setSummarizingSmsId(sms.id);
    try {
      const res = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: sms.message,
          subject: sms.subject,
          from: sms.senderEmail,
        }),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setSmsSummaries((prev) => ({
          ...prev,
          [sms.id]: { summary: data.summary, provider: data.provider || 'AI Engine' },
        }));
      }
    } catch {
      // offline
    } finally {
      setSummarizingSmsId(null);
    }
  };

  // Trigger test inbound email to phone
  const handleSimulateInboundEmail = async () => {
    try {
      setSimulatingEmail(true);
      const cleanPhone = callerPhone.replace(/\D/g, '') || '5559876543';
      const res = await fetch(`${API_BASE}/api/mail/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'judge@hackathon.org',
          to: `${cleanPhone}@phonemail.com`,
          subject: 'Hackathon Final Evaluation',
          body: 'Hello team, we loved your PhoneMail architecture. Please confirm your final presentation slot for 3:30 PM.',
        }),
      });

      if (res.ok) {
        await fetchSmsLogs();
        if (onDataChanged) onDataChanged();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSimulatingEmail(false);
    }
  };

  // Trigger inbound SMS text message (keyword REGISTER)
  const handleSendInboundSms = async (e) => {
    e.preventDefault();
    try {
      const cleanPhone = inboundSmsPhone.replace(/\D/g, '');
      const res = await fetch(`${API_BASE}/api/telecom/sms-inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderPhone: cleanPhone,
          text: inboundSmsText,
        }),
      });
      const data = await res.json();
      setInboundSmsResult(data.message || 'SMS processed');
      await fetchSmsLogs();
      if (onDataChanged) onDataChanged();
    } catch {
      setInboundSmsResult('Error dispatching SMS');
    }
  };

  // Trigger Carrier SMS Reply (POST /api/telecom/sms-reply)
  const handleDispatchCarrierReply = async (e) => {
    if (e) e.preventDefault();
    setIsSendingReply(true);
    setReplyResult(null);

    const cleanSender = replyPhone.replace(/\D/g, '');

    try {
      const res = await fetch(`${API_BASE}/api/telecom/sms-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderPhone: cleanSender,
          text: replySmsText,
          replyToEmail: replyToEmail,
          subject: replySubject,
        }),
      });

      const data = await res.json();
      setReplyResult(data);

      if (res.ok) {
        await fetchSmsLogs();
        if (onDataChanged) onDataChanged();
      }
    } catch (err) {
      setReplyResult({
        success: false,
        error: 'Failed to contact telecom carrier server on port 5000',
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  // Open Reply Tab with prefilled data from an SMS log
  const handleOpenReplyForSms = (sms) => {
    setReplyPhone(sms.recipientPhone || '5559876543');
    setReplyToEmail(sms.senderEmail || 'judge@hackathon.org');
    setReplySubject(
      sms.subject
        ? sms.subject.startsWith('Re:')
          ? sms.subject
          : `Re: ${sms.subject}`
        : 'Re: Inbound Email'
    );
    setReplySmsText('Received and confirmed via PhoneMail SMS reply.');
    setReplyResult(null);
    setActiveTab('reply');
  };

  const KEYPAD_BUTTONS = [
    { digit: '1', sub: 'REG' },
    { digit: '2', sub: 'ABC' },
    { digit: '3', sub: 'DEF' },
    { digit: '4', sub: 'GHI' },
    { digit: '5', sub: 'JKL' },
    { digit: '6', sub: 'MNO' },
    { digit: '7', sub: 'PQRS' },
    { digit: '8', sub: 'TUV' },
    { digit: '9', sub: 'WXYZ' },
    { digit: '*', sub: ' ' },
    { digit: '0', sub: '+' },
    { digit: '#', sub: ' ' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">Telecom Carrier Gateway</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  SMS-C Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Interactive IVR Voice Dialpad, Live SMS Feed & Outbound SMS-to-Email Bridge
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher - 3 Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ivr')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'ivr'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>1: IVR Dialpad</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sms')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'sms'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>2: Live SMS Alerts</span>
            {smsLogs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/30 text-emerald-300 font-mono">
                {smsLogs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reply')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'reply'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Reply className="w-3.5 h-3.5" />
            <span>3: SMS-to-Email Bridge</span>
          </button>
        </div>

        {/* Tab 1: IVR Voice Call */}
        {activeTab === 'ivr' && (
          <div className="p-6 overflow-y-auto flex flex-col items-center">
            {/* Phone Number Input Header */}
            <div className="w-full max-w-sm mb-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Simulated Caller Phone Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={callerPhone}
                  onChange={(e) => setCallerPhone(e.target.value)}
                  disabled={callState === 'connected' || callState === 'calling'}
                  placeholder="5559876543"
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                {callState === 'idle' ? (
                  <button
                    type="button"
                    onClick={handleStartCall}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/25 transition cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Toll-Free</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEndCall}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition cursor-pointer"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>End Call</span>
                  </button>
                )}
              </div>
            </div>

            {/* Simulated In-Call Status Banner */}
            <div className="w-full max-w-sm mb-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center relative overflow-hidden shadow-inner">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Radio className={`w-3.5 h-3.5 ${callState === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
                  1-800-PHONEMAIL
                </span>
                <span className="font-mono text-slate-300">
                  {callState === 'connected' ? formatTime(callDuration) : 'Idle'}
                </span>
              </div>

              {/* Automated Voice Prompt Display */}
              <div className="py-2 px-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-indigo-300 flex items-start gap-2 text-left">
                <Volume2 className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                <div className="leading-snug">
                  <span className="font-semibold text-slate-200">IVR Audio: </span>
                  <span className="text-slate-300">"{ivrMessage}"</span>
                </div>
              </div>

              {ivrLog && (
                <div className="mt-2 text-[11px] text-emerald-400 font-mono text-left bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                  {ivrLog}
                </div>
              )}
            </div>

            {/* Numeric Keypad (1 - 9, *, 0, #) */}
            <div className="w-full max-w-xs grid grid-cols-3 gap-3 mb-4">
              {KEYPAD_BUTTONS.map((item) => {
                const isSpecialReg = item.digit === '1';
                return (
                  <button
                    key={item.digit}
                    type="button"
                    onClick={() => handleKeyPress(item.digit)}
                    disabled={callState !== 'connected' || isProcessingKey}
                    className={`h-16 rounded-2xl flex flex-col items-center justify-center transition select-none cursor-pointer ${
                      isSpecialReg && callState === 'connected'
                        ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400 animate-pulse'
                        : callState === 'connected'
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 active:scale-95'
                        : 'bg-slate-900/50 text-slate-600 cursor-not-allowed border border-slate-800/40'
                    }`}
                  >
                    <span className="text-xl font-bold font-mono leading-none">{item.digit}</span>
                    <span className="text-[9px] text-slate-400 font-medium tracking-widest mt-0.5">
                      {item.sub}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Instructions Footer */}
            <p className="text-center text-[11px] text-slate-500 max-w-sm">
              Pressing <span className="font-bold text-indigo-400">1</span> on the keypad registers the caller's phone number as <span className="font-mono text-slate-400">{callerPhone || '5559876543'}@phonemail.com</span> via IVR!
            </p>
          </div>
        )}

        {/* Tab 2: Simulated SMS Inbox */}
        {activeTab === 'sms' && (
          <div className="p-6 overflow-y-auto flex-1 flex flex-col space-y-4">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-slate-200">
                  Live Dispatcher Feed ({smsLogs.length} Alerts Dispatched)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchSmsLogs}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Refresh SMS Logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${smsLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleSimulateInboundEmail}
                  disabled={simulatingEmail}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{simulatingEmail ? 'Sending...' : 'Test Inbound Mail'}</span>
                </button>
              </div>
            </div>

            {/* Inbound SMS Simulator Card */}
            <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs">
              <span className="font-semibold text-slate-300 block mb-1">
                💬 Simulate Inbound SMS Text to Register:
              </span>
              <form onSubmit={handleSendInboundSms} className="flex gap-2">
                <input
                  type="text"
                  value={inboundSmsPhone}
                  onChange={(e) => setInboundSmsPhone(e.target.value)}
                  placeholder="Sender Phone"
                  className="w-32 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                />
                <input
                  type="text"
                  value={inboundSmsText}
                  onChange={(e) => setInboundSmsText(e.target.value)}
                  placeholder="Text 'REGISTER'"
                  className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold cursor-pointer"
                >
                  Send SMS
                </button>
              </form>
              {inboundSmsResult && (
                <p className="mt-2 text-[11px] text-emerald-400 font-mono">
                  {inboundSmsResult}
                </p>
              )}
            </div>

            {/* List of Simulated SMS Logs */}
            <div className="space-y-3">
              {smsLoading && smsLogs.length === 0 ? (
                <SmsListSkeleton count={3} />
              ) : smsLogs.length === 0 ? (
                <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800/80 text-slate-500 text-xs">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 text-slate-600 stroke-1" />
                  <p>No SMS alerts recorded yet.</p>
                  <p className="text-[11px] mt-1 text-slate-500">
                    Send an email to any phone user to see live SMS notifications here!
                  </p>
                </div>
              ) : (
                smsLogs.map((sms) => (
                  <div
                    key={sms.id}
                    className="p-4 bg-slate-950 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition shadow-sm space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                          <Phone className="w-2.5 h-2.5" /> To: +1 {sms.recipientPhone}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          Sender: <strong className="text-slate-300">{sms.senderEmail}</strong>
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {new Date(sms.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    {/* Exact notification message: From: <sender>, Subject: <subject>, Body snippet: <preview> */}
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800/80 text-xs font-mono text-emerald-300 leading-relaxed">
                      💬 "{sms.message}"
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 truncate max-w-[240px]">
                        Subject: <span className="text-slate-400 font-semibold">{sms.subject}</span>
                      </span>

                      <div className="flex items-center gap-2">
                        {/* ✨ Summarize Button on SMS message */}
                        <button
                          type="button"
                          onClick={() => handleSummarizeSms(sms)}
                          disabled={summarizingSmsId === sms.id}
                          className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                          title="Generate 1-2 sentence AI summary of this SMS notification"
                        >
                          <Sparkles className={`w-3 h-3 text-purple-300 ${summarizingSmsId === sms.id ? 'animate-spin' : ''}`} />
                          <span>{summarizingSmsId === sms.id ? 'Summarizing...' : '✨ Summarize'}</span>
                        </button>

                        {/* Interactive Button to reply via SMS directly */}
                        <button
                          type="button"
                          onClick={() => handleOpenReplyForSms(sms)}
                          className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Reply className="w-3 h-3" />
                          <span>Reply via SMS</span>
                        </button>
                      </div>
                    </div>

                    {/* AI Summary display if toggled */}
                    {smsSummaries[sms.id] && (
                      <div className="p-2.5 bg-purple-950/50 rounded-xl border border-purple-500/30 text-xs text-purple-200 animate-in fade-in space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-purple-300 font-semibold">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> AI Quick Summary:
                          </span>
                          <span className="font-mono text-purple-400">{smsSummaries[sms.id].provider}</span>
                        </div>
                        <p className="text-[11px] text-purple-100 italic leading-relaxed">
                          "{smsSummaries[sms.id].summary}"
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Interactive Carrier SMS Reply -> Outbound Email Bridge */}
        {activeTab === 'reply' && (
          <div className="p-6 overflow-y-auto flex-1 flex flex-col space-y-5">
            {/* Header description */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <Zap className="w-4 h-4" />
                <span>Simulate Replying via SMS (POST /api/telecom/sms-reply)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Judges can trigger an outgoing email <strong className="text-slate-200">purely from an SMS action</strong>. The simulated telecom carrier receives the text from a mobile number, wraps it into a standard email message, and dispatches it into the recipient's inbox.
              </p>
            </div>

            {/* Carrier SMS Form */}
            <form onSubmit={handleDispatchCarrierReply} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mobile Sender Phone (10 Digits)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={replyPhone}
                      onChange={(e) => setReplyPhone(e.target.value)}
                      placeholder="5559876543"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Will send from: <code className="text-indigo-400">{replyPhone ? replyPhone.replace(/\D/g, '') : '5559876543'}@phonemail.com</code>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reply To Email (Recipient)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={replyToEmail}
                      onChange={(e) => setReplyToEmail(e.target.value)}
                      placeholder="judge@hackathon.org"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  placeholder="Re: Schedule & Demo"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {/* Clickable Smart Reply Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Smart Carrier Replies (1-Click Options):</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {smartReplyOptions.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReplySmsText(opt)}
                      className="text-xs px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/50 hover:border-indigo-500 rounded-full transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 text-left"
                      title="Click to insert into reply"
                    >
                      <span>💬 {opt}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  SMS Reply Text Content
                </label>
                <textarea
                  rows={3}
                  value={replySmsText}
                  onChange={(e) => setReplySmsText(e.target.value)}
                  placeholder="Type the text reply sent from the mobile phone..."
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSendingReply}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSendingReply
                    ? 'Processing Carrier SMS...'
                    : '📲 Dispatch Carrier SMS Reply (Trigger Outgoing Email)'}
                </span>
              </button>
            </form>

            {/* Carrier Bridge Execution Receipt Card */}
            {replyResult && (
              <div
                className={`p-4 rounded-2xl border text-xs space-y-2.5 animate-in fade-in duration-300 ${
                  replyResult.success
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Carrier SMS-to-Email Bridge Executed!</span>
                </div>

                <p className="text-[11px] text-emerald-300/90">{replyResult.message}</p>

                {replyResult.triggeredEmail && (
                  <div className="p-3 bg-slate-950/90 rounded-xl border border-emerald-500/30 font-mono text-[11px] space-y-1 text-slate-300">
                    <div>
                      <strong className="text-emerald-400">Triggered Email ID:</strong> {replyResult.triggeredEmail.id}
                    </div>
                    <div>
                      <strong className="text-emerald-400">From Handle:</strong> {replyResult.triggeredEmail.senderEmail}
                    </div>
                    <div>
                      <strong className="text-emerald-400">To Recipient:</strong> {replyResult.triggeredEmail.recipientEmail}
                    </div>
                    <div>
                      <strong className="text-emerald-400">Subject:</strong> {replyResult.triggeredEmail.subject}
                    </div>
                    <div className="pt-1 text-slate-400 text-[10px]">
                      Body: <span className="text-slate-200">"{replyResult.triggeredEmail.body}"</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
