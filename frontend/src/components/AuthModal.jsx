import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Lock,
  Phone,
  KeyRound,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  RefreshCw,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Smartphone,
  Globe,
  User
} from 'lucide-react';
import { API_BASE } from '../config/api';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../config/languages';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, onProfileUpdate }) {

  // 2-Step Authentication:
  // Step 1: Phone + Password
  // Step 2: 6-Digit SMS OTP
  const [step, setStep] = useState(1);
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState(DEFAULT_LANGUAGE);

  // OTP State (Step 2)
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const [isNewUser, setIsNewUser] = useState(false);
  const [isKnownUser, setIsKnownUser] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const otpInputRef = useRef(null);

  // Timer countdown for OTP resend
  useEffect(() => {
    let timer;
    if (otpCooldown > 0) {
      timer = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Clean 10-digit preview
  const digitsOnly = phoneNumber.replace(/\D/g, '').slice(0, 10);
  const emailPreview = digitsOnly.length === 10 ? `${digitsOnly}@zapmail.com` : '';

  // Check if phone number is already registered when 10 digits are entered
  useEffect(() => {
    if (digitsOnly.length === 10) {
      const checkUser = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/check-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: digitsOnly })
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
  }, [digitsOnly]);

  // Focus OTP input when transitioning to Step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  if (!isOpen) return null;

  // STEP 1: Submit credentials (Phone + Password)
  const handleStep1Submit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (digitsOnly.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/step1-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: digitsOnly,
          password,
          countryCode,
          name: fullName.trim() || 'ZapMail User'
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Authentication error. Please check your credentials.');
        setLoading(false);
        return;
      }

      // Step 1 success!
      setIsNewUser(Boolean(data.isNewUser));
      setOtpCooldown(45);
      setStep(2);
      setOtpCode('');
    } catch {
      setError('Failed to reach ZapMail authentication server. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Resend OTP
  const handleResendOtp = async () => {
    if (otpCooldown > 0 || isResending) return;
    setIsResending(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/step1-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: digitsOnly,
          password,
          countryCode,
          name: fullName.trim() || 'ZapMail User'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setOtpCooldown(45);
      } else {
        setError(data.error || 'Failed to resend SMS code.');
      }
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // STEP 2: Verify OTP
  const handleStep2Submit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the complete 6-digit verification code sent via SMS.');
      return;
    }

    setLoading(true);

    try {
      const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768;
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: digitsOnly,
          otp: otpCode.trim(),
          password,
          name: fullName.trim() || 'ZapMail User',
          registeredVia: isMobileDevice ? 'MOBILE_APP' : 'WEB',
          language: preferredLanguage
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid verification code. Please check your SMS and try again.');
        setLoading(false);
        return;
      }

      // Success! Pass token and user to parent
      if (onAuthSuccess) {
        onAuthSuccess(data.user, data.token);
      }
      if (onProfileUpdate) {
        onProfileUpdate(data.user);
      }
      onClose();
    } catch {
      setError('Network error connecting to ZapMail backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md border border-[#4E4F4E] rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 animate-in zoom-in-95 duration-200 transition-colors bg-[#2C2D2C] text-white">
        
        {/* Top Header Actions (Close Button) */}
        <div className="absolute top-5 right-5 flex items-center gap-1.5">
          <button
            onClick={onClose}
            className="p-1.5 rounded-full transition cursor-pointer text-gray-400 hover:text-white hover:bg-[#242524]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Header */}
        <div className="text-center mb-6">
          {step === 2 && (
            <div className="flex items-center justify-start mb-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError('');
                }}
                className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-semibold transition cursor-pointer bg-[#242524] hover:bg-[#3C3D3C] text-gray-300 hover:text-white border border-[#4E4F4E]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Edit Credentials</span>
              </button>
            </div>
          )}

          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#B50000]/15 text-[#FF8585] border border-[#B50000]/30 mb-2.5">
            <KeyRound className="w-6 h-6" />
          </div>

          {/* 2-Step indicator pill */}
          <div className="flex justify-center mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold border bg-[#242524] border-[#4E4F4E]">
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
          </div>

          <h3 className="text-xl font-bold tracking-tight text-white">
            {step === 1
              ? 'ZapMail 2-Step Auth'
              : isNewUser
              ? 'Activate New Account'
              : 'Verify Your Identity'}
          </h3>
          <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed text-gray-300">
            {step === 1
              ? 'Phone number & password are required. An SMS verification code will be sent to confirm ownership.'
              : isNewUser
              ? `Enter the 6-digit SMS code sent to ${countryCode} ${digitsOnly} to create and activate your account.`
              : `Enter the 6-digit SMS code sent to ${countryCode} ${digitsOnly} to complete login.`}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#B50000]/15 border border-[#B50000]/30 text-[#FF8585] text-xs flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#FF8585]" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Phone + Password Form */}
        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            {/* Full Name Field */}
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
                    setError('');
                  }}
                  className="w-full py-3 px-3 bg-transparent text-sm font-semibold placeholder-gray-500 focus:outline-none text-white"
                  required={!isKnownUser}
                />
              </div>
            </div>

            {/* Phone Number Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-300">
                  Phone Number (10 digits)
                </label>
                {digitsOnly.length === 10 && (
                  isKnownUser ? (
                    <span className="text-[10px] text-[#FF8585] font-semibold flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> Existing Account
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#FF8585] font-semibold flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> New Registration
                    </span>
                  )
                )}
              </div>

              <div className="flex items-center rounded-xl overflow-hidden transition shadow-sm border bg-[#242524] border-[#4E4F4E] focus-within:border-[#B50000]">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="text-xs font-semibold px-2.5 py-3 border-r focus:outline-none cursor-pointer bg-[#242524] text-white border-[#4E4F4E]"
                >
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+971">🇦🇪 +971</option>
                </select>

                <input
                  type="tel"
                  placeholder="98765 43210"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setError('');
                  }}
                  className="flex-1 py-3 px-3 bg-transparent text-sm font-semibold placeholder-gray-400 focus:outline-none tracking-wide text-white"
                  autoFocus
                  required
                />
              </div>

              {emailPreview && (
                <div className="mt-1.5 text-[11px] text-[#FF8585] flex items-center gap-1 font-mono font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Assigned Email: {emailPreview}
                </div>
              )}
            </div>

            {/* Password Field */}
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
                    setError('');
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

            {/* Language Preference Selector */}
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

            {/* Continue to Step 2 Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#B50000] hover:bg-[#990000] text-white font-bold text-sm shadow-lg shadow-[#B50000]/25 transition transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
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
        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-4 animate-in fade-in duration-200">
            {/* Target Phone Pill */}
            <div className="p-3 rounded-xl border flex items-center justify-between bg-[#242524] border-[#4E4F4E]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#FF8585]" />
                <span className="text-xs font-mono font-semibold text-white">
                  {countryCode} {digitsOnly}
                </span>
              </div>
              <span className="text-[10px] text-[#FF8585] font-semibold bg-[#B50000]/15 px-2 py-0.5 rounded-full border border-[#B50000]/30">
                SMS SENT
              </span>
            </div>

            {/* OTP Input */}
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
                    : 'Resend Code'}
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
                    setError('');
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

            {/* Step 2 Verify Button */}
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-[#B50000] hover:bg-[#990000] text-white font-bold text-sm shadow-lg shadow-[#B50000]/25 transition transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
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
