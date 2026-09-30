import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Lock,
  Phone,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  KeyRound,
  MessageSquare,
  UserCheck,
  UserPlus,
  Globe,
  User
} from 'lucide-react';
import { API_BASE } from '../config/api';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../config/languages';

const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'United States', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', country: 'United Arab Emirates', flag: '🇦🇪' },
];

export default function WhatsAppOnboarding({
  onComplete,
  onSkip,
  triggerToast,
  onProfileUpdate
}) {

  // 2-Step Authentication State:
  // Step 1: Phone Number + Password (mandatory for everyone)
  // Step 2: 6-digit SMS OTP verification (mandatory for everyone)
  const [step, setStep] = useState(1);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isKnownUser, setIsKnownUser] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState(DEFAULT_LANGUAGE);

  // OTP State (Step 2)
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const otpInputRef = useRef(null);

  // Formatted digits only
  const cleanPhone = phoneNumber.replace(/\D/g, '').slice(0, 10);
  const emailPreview = cleanPhone.length === 10 ? `${cleanPhone}@zapmail.com` : '';

  // Timer countdown for OTP resend
  useEffect(() => {
    let timer;
    if (otpCooldown > 0) {
      timer = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Check if phone number is already registered when 10 digits are entered
  useEffect(() => {
    if (cleanPhone.length === 10) {
      const checkUser = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/check-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: cleanPhone })
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
          // offline check silent
        }
      };
      checkUser();
    } else {
      setIsKnownUser(false);
      setIsNewUser(false);
    }
  }, [cleanPhone]);

  // Focus OTP input when transitioning to Step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  // STEP 1 SUBMISSION: Validate Phone & Password, Dispatch SMS OTP
  const handleStep1Submit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit phone number.');
      return;
    }

    if (!password || password.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/step1-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
          password,
          countryCode: selectedCountry?.code || '+91',
          name: fullName.trim() || 'ZapMail User'
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Authentication error. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      // Step 1 Passed!
      setIsNewUser(Boolean(data.isNewUser));
      setOtpCooldown(45);
      setStep(2);
      setOtpCode('');

      if (triggerToast) {
        triggerToast(`📲 SMS verification PIN sent to ${selectedCountry.code} ${cleanPhone}!`);
      }
    } catch {
      setErrorMsg('Cannot reach ZapMail authentication server. Ensure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2 RESEND OTP
  const handleResendOtp = async () => {
    if (otpCooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/step1-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
          password,
          countryCode: selectedCountry?.code || '+91',
          name: fullName.trim() || 'ZapMail User'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setOtpCooldown(45);
        if (triggerToast) {
          triggerToast(`📲 New verification code sent to ${cleanPhone}!`);
        }
      } else {
        setErrorMsg(data.error || 'Failed to resend verification code');
      }
    } catch {
      setErrorMsg('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // STEP 2 SUBMISSION: Verify 6-digit SMS OTP and Complete Login/Registration
  const handleStep2Submit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg('Please enter the complete 6-digit verification code sent via SMS.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
          otp: otpCode.trim(),
          password,
          name: fullName.trim() || 'ZapMail User',
          registeredVia: 'MOBILE_APP',
          language: preferredLanguage
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Invalid verification code. Please check your SMS and try again.');
        setIsLoading(false);
        return;
      }

      // Success! User authenticated
      if (triggerToast) {
        if (isNewUser) {
          triggerToast(`🎉 Account created! Welcome, ${data.user.name || data.user.phoneNumber}!`);
        } else {
          triggerToast(`🎉 2-Step verified! Welcome back, ${data.user.name || data.user.phoneNumber}!`);
        }
      }

      if (onProfileUpdate) {
        onProfileUpdate(data.user);
      }
      onComplete(data.user, data.token);
    } catch {
      setErrorMsg('Network error connecting to ZapMail backend server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full h-[100dvh] flex flex-col justify-between overflow-y-auto select-none font-sans pt-[max(env(safe-area-inset-top),56px)] pb-[max(env(safe-area-inset-bottom),24px)] pb-safe px-5 overscroll-contain bg-[#3C3D3C] text-slate-100">
      
      {/* Top Header / Branding */}
      <div className="shrink-0 text-center pt-1">
        <div className="flex items-center justify-between mb-2">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setErrorMsg('');
              }}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold transition cursor-pointer bg-[#242524] hover:bg-[#2C2D2C] text-gray-300 hover:text-white border border-[#4E4F4E]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Edit Credentials</span>
            </button>
          ) : (
            <div />
          )}

          <div />
        </div>

        <div className="w-13 h-13 mx-auto mb-2.5 rounded-2xl bg-[#B50000] flex items-center justify-center shadow-lg shadow-[#B50000]/25 text-white">
          <Mail className="w-6 h-6 text-white" />
        </div>

        {/* 2-Step Progress Indicator */}
        <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full border border-[#4E4F4E] bg-[#242524] text-[11px] font-semibold">
          <span className={`flex items-center gap-1 ${step === 1 ? 'text-[#FF8585] font-bold' : 'text-gray-400'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
              step === 1 ? 'bg-[#B50000]/20 border border-[#B50000] text-[#FF8585] font-bold' : 'bg-transparent border border-gray-500'
            }`}>1</span>
            Credentials
          </span>
          <span className="text-gray-500">→</span>
          <span className={`flex items-center gap-1 ${step === 2 ? 'text-[#FF8585] font-bold' : 'text-gray-400'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
              step === 2 ? 'bg-[#B50000]/20 border border-[#B50000] text-[#FF8585] font-bold' : 'bg-transparent border border-gray-500'
            }`}>2</span>
            SMS OTP
          </span>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-white">
          {step === 1
            ? 'Sign In / Register'
            : isNewUser
            ? 'Verify New Account'
            : '2-Step Verification'}
        </h2>
        <p className="text-xs mt-1 max-w-[300px] mx-auto leading-relaxed text-gray-300">
          {step === 1
            ? 'Enter your phone number & password. OTP verification is required for all accounts.'
            : isNewUser
            ? `Enter the 6-digit SMS code sent to ${selectedCountry.code} ${cleanPhone} to activate your new account.`
            : `Enter the 6-digit SMS code sent to ${selectedCountry.code} ${cleanPhone} to verify your identity.`}
        </p>
      </div>

      {/* Main Form Body */}
      <div className="flex-1 flex flex-col justify-center max-w-[340px] w-full mx-auto py-2">
        
        {/* Error Banner */}
        {errorMsg && (
          <div className="mb-3.5 p-3 rounded-xl bg-[#B50000]/15 border border-[#B50000]/40 text-[#FF8585] text-xs flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#FF8585]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: Phone Number + Password */}
        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-3.5">
            {/* Full Name Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">
                  Full Name {!isKnownUser && <span className="text-[#FF8585]">*</span>}
                </label>
                <span className="text-[10px] text-gray-400">
                  {isKnownUser ? 'Display name' : 'Your name for email sender ID'}
                </span>
              </div>
              <div className="relative flex items-center rounded-xl overflow-hidden transition shadow-sm border bg-[#242524] border-[#4E4F4E] focus-within:border-[#B50000]">
                <User className="w-4 h-4 ml-3 shrink-0 text-gray-400" />
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setErrorMsg('');
                  }}
                  className="w-full py-3 px-3 bg-transparent text-sm font-semibold placeholder-gray-500 focus:outline-none text-white"
                  required={!isKnownUser}
                />
              </div>
            </div>

            {/* Phone Number Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">
                  Phone Number (10 digits)
                </label>
                {cleanPhone.length === 10 && (
                  isKnownUser ? (
                    <span className="text-[10px] text-[#FF8585] font-semibold flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> Existing Account
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#FF8585] font-semibold flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> New User Registration
                    </span>
                  )
                )}
              </div>

              <div className="flex items-center rounded-xl overflow-hidden transition shadow-sm border bg-[#242524] border-[#4E4F4E] focus-within:border-[#B50000]">
                <select
                  value={selectedCountry.code}
                  onChange={(e) => {
                    const found = COUNTRY_CODES.find((c) => c.code === e.target.value);
                    if (found) setSelectedCountry(found);
                  }}
                  className="bg-transparent text-xs font-semibold px-2.5 py-3 border-r focus:outline-none cursor-pointer text-white border-[#4E4F4E]"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#242524] text-white">
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  placeholder="98765 43210"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setErrorMsg('');
                  }}
                  maxLength={14}
                  className="flex-1 py-3 px-3 bg-transparent text-sm font-semibold placeholder-gray-400 focus:outline-none tracking-wide text-white"
                  autoFocus
                  required
                />
              </div>

              {/* Email Preview Tag */}
              {emailPreview && (
                <div className="mt-1.5 text-[11px] text-[#FF8585] flex items-center gap-1 font-mono font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Email: {emailPreview}
                </div>
              )}
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">
                  Password
                </label>
                <span className="text-[10px] text-gray-400">
                  {isKnownUser ? 'Enter account password' : 'Set your password'}
                </span>
              </div>
              <div className="relative flex items-center rounded-xl overflow-hidden transition shadow-sm border bg-[#242524] border-[#4E4F4E] focus-within:border-[#B50000]">
                <Lock className="w-4 h-4 ml-3 shrink-0 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isKnownUser ? 'Enter your password' : 'Create a secure password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  className="w-full py-3 pl-2.5 pr-10 bg-transparent text-sm placeholder-gray-400 focus:outline-none text-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 transition cursor-pointer text-gray-400 hover:text-white"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Preferred Language Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">
                  Language Preference
                </label>
                <span className="text-[10px] text-gray-400">
                  Saved to profile
                </span>
              </div>
              <div className="relative flex items-center rounded-xl overflow-hidden transition shadow-sm border bg-[#242524] border-[#4E4F4E] focus-within:border-[#B50000]">
                <Globe className="w-4 h-4 ml-3 shrink-0 text-gray-400" />
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="w-full py-3 pl-2.5 pr-8 bg-transparent text-xs font-semibold focus:outline-none cursor-pointer text-white"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option
                      key={lang.code}
                      value={lang.label}
                      className="bg-[#242524] text-white"
                    >
                      {lang.label} ({lang.native})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 1 Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#B50000] hover:bg-[#990000] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#B50000]/25 transition transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoading ? (
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
            </div>
          </form>
        )}

        {/* STEP 2: 6-Digit SMS OTP Verification */}
        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-4 animate-in fade-in duration-200">
            {/* Target Phone Confirmation Pill */}
            <div className="p-3 rounded-xl border flex items-center justify-between bg-[#242524] border-[#4E4F4E]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#FF8585]" />
                <span className="text-xs font-mono font-semibold text-white">
                  {selectedCountry.code} {cleanPhone}
                </span>
              </div>
              <span className="text-[10px] text-[#FF8585] font-semibold bg-[#B50000]/15 px-2 py-0.5 rounded-full border border-[#B50000]/30">
                SMS SENT
              </span>
            </div>

            {/* 6-Digit OTP Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">
                  6-Digit SMS Verification Code
                </label>
                <button
                  type="button"
                  disabled={isResending || otpCooldown > 0}
                  onClick={handleResendOtp}
                  className="text-[11px] font-semibold text-[#FF8585] hover:text-white transition cursor-pointer disabled:opacity-50"
                >
                  {isResending
                    ? 'Sending...'
                    : otpCooldown > 0
                    ? `Resend in ${otpCooldown}s`
                    : 'Resend SMS Code'}
                </button>
              </div>

              <div className="relative flex items-center rounded-xl overflow-hidden transition shadow-sm border bg-[#242524] border-[#4E4F4E] focus-within:border-[#B50000]">
                <MessageSquare className="w-4 h-4 ml-3 shrink-0 text-gray-400" />
                <input
                  ref={otpInputRef}
                  type="text"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ''));
                    setErrorMsg('');
                  }}
                  className="w-full py-3.5 pl-2 pr-3 bg-transparent text-center text-lg font-mono tracking-[0.4em] font-bold placeholder-gray-400 focus:outline-none text-white"
                  autoComplete="one-time-code"
                  required
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                <span>Delivered via TextBee Gateway</span>
                <span className="text-[#FF8585] font-medium">Valid for 5 mins</span>
              </div>
            </div>

            {/* Step 2 Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#B50000] hover:bg-[#990000] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#B50000]/25 transition transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoading ? (
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
            </div>
          </form>
        )}
      </div>

      {/* Pinned Bottom Footer */}
      <div className="shrink-0 pt-2 flex items-center justify-between text-xs text-gray-400">
        <button
          type="button"
          onClick={onSkip}
          className="underline transition cursor-pointer hover:text-white"
        >
          Skip to demo
        </button>

        <div className="inline-flex items-center gap-1.5 text-[11px]">
          <Shield className="w-3.5 h-3.5 text-[#FF8585]" />
          <span>Mandatory 2-Step Authentication</span>
        </div>
      </div>
    </div>
  );
}
