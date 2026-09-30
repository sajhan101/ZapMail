import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Shield,
  FileText,
  Mail,
  Smartphone,
  Monitor,
  RefreshCw,
  X,
  Globe,
  User
} from 'lucide-react';
import { API_BASE } from '../config/api';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../config/languages';

export default function RegisterPortal() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const [errorMsg, setErrorMsg] = useState('');
  const [userAlreadyExists, setUserAlreadyExists] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [confirmationData, setConfirmationData] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Clean phone digits
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const emailPreview = cleanPhone.length === 10 ? `${cleanPhone}@phonemail.com` : '';

  // Timer for OTP cooldown
  useEffect(() => {
    let timer;
    if (otpCooldown > 0) {
      timer = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  // 1. Send OTP trigger
  const handleSendOtp = async () => {
    setErrorMsg('');
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit phone number before requesting an OTP');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to send OTP');
        return;
      }

      setOtpCooldown(45);
      triggerToast(`📲 SMS verification code sent to ${cleanPhone} via TextBee!`);
    } catch {
      setErrorMsg('Unable to contact authentication server. Ensure backend is running.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // 2. Submit Registration Portal
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (cleanPhone.length !== 10) {
      setErrorMsg('Phone number must be exactly 10 digits');
      return;
    }

    if (!otp || otp.trim().length < 4) {
      setErrorMsg('Please enter the verification OTP');
      return;
    }

    if (!agreedToTerms) {
      setErrorMsg('You must agree to the Terms of Service to proceed');
      return;
    }

    setIsSubmitting(true);
    setUserAlreadyExists(false);

    try {
      const res = await fetch(`${API_BASE}/api/auth/register-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
          otp: otp.trim(),
          name: name.trim() || 'PhoneMail User',
          registeredVia: 'WEB',
          agreedToTerms: true,
          language
        }),
      });

      const data = await res.json();

      if (res.status === 409 || data.code === 'USER_EXISTS') {
        setUserAlreadyExists(true);
        setErrorMsg('');
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Registration failed');
        return;
      }

      const assignedEmail = data.email || `${cleanPhone}@phonemail.com`;

      // Show confirmation message
      setConfirmationData({
        phoneNumber: cleanPhone,
        email: assignedEmail,
        message: data.message || `Account successfully registered for ${assignedEmail}`,
      });

      triggerToast(`🎉 Account created! Your email handle is ${assignedEmail}`);

      // Immediately reset form fields so the next user can register
      setPhoneNumber('');
      setOtp('');
      setAgreedToTerms(false);
      setOtpCooldown(0);
    } catch {
      setErrorMsg('Could not reach registration endpoint. Verify port 5000.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#3C3D3C] text-slate-100 flex flex-col font-sans selection:bg-[#B50000] selection:text-white relative">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#2C2D2C] text-white px-6 py-3 rounded-full shadow-2xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 border border-[#4E4F4E] animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-4 h-4 text-[#FF8585]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="border-b border-[#4E4F4E] bg-[#2C2D2C] px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#B50000] flex items-center justify-center shadow-md shadow-[#B50000]/25">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">PhoneMail</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#242524] text-gray-300 border border-[#4E4F4E]">
                Web Portal
              </span>
            </div>
            <p className="text-xs text-gray-400">Account Creation Gateway</p>
          </div>
        </div>

        {/* View Switch Links */}
        <div className="flex items-center gap-2">
          <Link
            to="/web"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#242524] hover:bg-[#3C3D3C] text-gray-300 hover:text-white text-xs font-semibold transition border border-[#4E4F4E]"
          >
            <Monitor className="w-3.5 h-3.5 text-[#FF8585]" />
            <span>Desktop Webmail</span>
          </Link>
          <Link
            to="/mobile"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#242524] hover:bg-[#3C3D3C] text-gray-300 hover:text-white text-xs font-semibold transition border border-[#4E4F4E]"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#FF8585]" />
            <span>Mobile App</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-[#3C3D3C]">
        
        {/* Registration Card */}
        <div className="w-full max-w-md bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl shadow-2xl overflow-hidden">
          
          {/* Top Decorative Line */}
          <div className="h-1 bg-[#B50000]" />

          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#B50000]/15 border border-[#B50000]/30 flex items-center justify-center text-[#FF8585]">
                <Shield className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                PhoneMail Portal Registration
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                Instantly turn your phone number into a globally reachable email inbox.
              </p>
            </div>

            {/* Confirmation Banner if registration just completed */}
            {confirmationData && (
              <div className="mb-6 p-4 rounded-2xl bg-[#242524] border border-[#4E4F4E] text-white text-xs space-y-2 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 font-bold text-sm text-[#FF8585]">
                  <CheckCircle2 className="w-4 h-4 text-[#FF8585] shrink-0" />
                  <span>Registration Successful!</span>
                </div>
                <p className="text-[11px] text-gray-300">
                  {confirmationData.message}
                </p>
                <div className="p-2.5 bg-[#2C2D2C] rounded-xl border border-[#4E4F4E] font-mono text-xs text-white flex items-center justify-between">
                  <span>Assigned Handle:</span>
                  <span className="font-bold underline text-[#FF8585]">{confirmationData.email}</span>
                </div>
                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Next user can register below.</span>
                  <Link
                    to="/web"
                    className="font-bold text-[#FF8585] hover:text-white flex items-center gap-1"
                  >
                    Open Webmail <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* Existing User Alert Banner */}
            {userAlreadyExists && (
              <div className="mb-5 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs shadow-lg animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-300">
                      An account already exists for this phone number
                    </p>
                    <p className="text-[11px] text-amber-200/80 mt-0.5 leading-snug">
                      Please sign in with your password to access your messages.
                    </p>
                    <Link
                      to="/web"
                      className="mt-2.5 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#B50000] hover:bg-[#990000] text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
                    >
                      <span>Sign In via Webmail</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message Alert */}
            {errorMsg && !userAlreadyExists && (
              <div className="mb-5 p-3.5 rounded-2xl bg-[#B50000]/15 border border-[#B50000]/30 text-[#FF8585] text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#FF8585] shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Clean Form: Full Name, Phone Number & OTP */}
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Field 0: Full Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Full Name <span className="text-[#FF8585]">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#242524] border border-[#4E4F4E] rounded-xl text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000] transition shadow-inner"
                    required
                  />
                </div>
              </div>

              {/* Field 1: Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Phone Number (10 Digits)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    placeholder="e.g. 5557778888"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    maxLength={10}
                    className="w-full pl-10 pr-4 py-3 bg-[#242524] border border-[#4E4F4E] rounded-xl text-sm font-mono text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000] transition shadow-inner"
                    required
                  />
                </div>
                {emailPreview && (
                  <div className="mt-1.5 text-[11px] text-[#FF8585] flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3 h-3 text-[#FF8585]" />
                    <span>Handle Preview: <strong>{emailPreview}</strong></span>
                  </div>
                )}
              </div>

              {/* Field 2: OTP (with Send OTP / Resend trigger) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    Verification OTP
                  </label>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isSendingOtp || otpCooldown > 0 || cleanPhone.length !== 10}
                    className="text-[11px] font-semibold text-[#FF8585] hover:text-white disabled:text-gray-500 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1"
                  >
                    {isSendingOtp ? (
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Sending...
                      </span>
                    ) : otpCooldown > 0 ? (
                      <span>Resend in {otpCooldown}s</span>
                    ) : (
                      <span>Send OTP</span>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Enter 6-digit OTP code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                    className="w-full pl-10 pr-24 py-3 bg-[#242524] border border-[#4E4F4E] rounded-xl text-sm font-mono tracking-widest text-white placeholder-gray-400 focus:outline-none focus:border-[#B50000] transition shadow-inner"
                    required
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isSendingOtp || otpCooldown > 0 || cleanPhone.length !== 10}
                      className="px-2.5 py-1 bg-[#B50000]/20 hover:bg-[#B50000]/30 text-[#FF8585] border border-[#B50000]/30 rounded-lg text-[10px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {otpCooldown > 0 ? `${otpCooldown}s` : 'Request OTP'}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-gray-400">
                  Verification OTP will be sent to your phone via SMS.
                </p>
              </div>

              {/* Field 3: Preferred Language */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Preferred Language
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-[#242524] border border-[#4E4F4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#B50000] transition shadow-inner cursor-pointer appearance-none"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.id || lang.code} value={lang.label} className="bg-[#242524] text-white">
                        {lang.label} ({lang.native})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                    ▼
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-gray-400">
                  Select your preferred language for your account profile.
                </p>
              </div>

              {/* Agreement Checkbox with Hyperlinked Terms of Service */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#4E4F4E] bg-[#242524] text-[#B50000] focus:ring-[#B50000] cursor-pointer"
                    required
                  />
                  <span className="text-xs text-gray-400 leading-relaxed">
                    I agree to the PhoneMail{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTermsModal(true);
                      }}
                      className="text-[#FF8585] hover:text-white font-semibold underline cursor-pointer"
                    >
                      Terms of Service
                    </button>{' '}
                    and Privacy Policy.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 bg-[#B50000] hover:bg-[#990000] text-white rounded-2xl font-bold text-sm shadow-xl shadow-[#B50000]/25 transition transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating Web Account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>Create PhoneMail Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            </form>

            {/* Quick Demo Pre-fill */}
            <div className="mt-6 pt-5 border-t border-[#4E4F4E] flex items-center justify-between text-xs text-gray-400">
              <span>Sample Number:</span>
              <button
                type="button"
                onClick={() => {
                  setPhoneNumber('5554443322');
                  setOtp('');
                  setAgreedToTerms(true);
                }}
                className="text-[11px] text-[#FF8585] hover:text-white font-semibold cursor-pointer underline"
              >
                Use Sample Phone (5554443322)
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Terms of Service Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#2C2D2C] border border-[#4E4F4E] rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowTermsModal(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#242524]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-6 h-6 text-[#FF8585]" />
              <h2 className="text-base font-bold text-white">
                PhoneMail Terms of Service
              </h2>
            </div>
            <div className="text-xs text-gray-300 space-y-3 max-h-72 overflow-y-auto pr-2 leading-relaxed">
              <p>
                <strong>1. Acceptance of Terms:</strong> By registering with PhoneMail via this portal, your 10-digit phone number is automatically bound to the email address domain <code>@phonemail.com</code>.
              </p>
              <p>
                <strong>2. Telecommunications Forwarding:</strong> You authorize PhoneMail to parse incoming SMTP messages delivered to your address and generate simulated or carrier-grade SMS notifications.
              </p>
              <p>
                <strong>3. Privacy:</strong> Emails are encrypted and stored within your designated local database. Authentication tokens are issued via JWT standards.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-[#4E4F4E] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAgreedToTerms(true);
                  setShowTermsModal(false);
                }}
                className="px-4 py-2 bg-[#B50000] hover:bg-[#990000] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                I Understand & Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
