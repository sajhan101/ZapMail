import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  ChevronDown,
  Check,
  Sparkles,
  Smartphone,
  PhoneCall,
  Globe,
  RotateCcw,
  Zap,
  ShieldCheck
} from 'lucide-react';
import { API_BASE } from '../config/api';

const FALLBACK_DEMO_USERS = [
  {
    id: 'user_alex_9876543210',
    phoneNumber: '9876543210',
    email: '9876543210@zapmail.com',
    registeredVia: 'MOBILE_APP',
    name: 'Alex Rivera',
    role: 'Primary Sender (Mobile App)',
    badge: '📱 Mobile Sender',
    avatar: 'A',
    color: 'from-indigo-500 to-purple-600',
    borderColor: 'border-indigo-500/50'
  },
  {
    id: 'user_sarah_9123456780',
    phoneNumber: '9123456780',
    email: '9123456780@zapmail.com',
    registeredVia: 'IVR',
    name: 'Sarah Jenkins',
    role: 'Receiver (IVR / Offline SMS)',
    badge: '📞 IVR / Offline SMS',
    avatar: 'S',
    color: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500/50'
  },
  {
    id: 'user_external_client',
    phoneNumber: '5550001111',
    email: 'external_client@gmail.com',
    registeredVia: 'WEB_CLIENT',
    name: 'David Miller',
    role: 'External Client (Partner)',
    badge: '🌐 Web Partner',
    avatar: 'D',
    color: 'from-amber-500 to-orange-600',
    borderColor: 'border-amber-500/50'
  }
];

export default function DemoUserSwitcher({
  currentUser,
  onSwitchUser,
  onDataReset,
  compact = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [demoUsers, setDemoUsers] = useState(FALLBACK_DEMO_USERS);
  const [isResetting, setIsResetting] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch live demo accounts with fresh signed tokens
  const fetchDemoUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/demo-users`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users) && data.users.length > 0) {
          // Merge with styling properties
          const enriched = data.users.map((u, i) => ({
            ...u,
            color:
              i === 0
                ? 'from-indigo-500 to-purple-600'
                : i === 1
                ? 'from-emerald-500 to-teal-600'
                : 'from-amber-500 to-orange-600',
            borderColor:
              i === 0
                ? 'border-indigo-500/50'
                : i === 1
                ? 'border-emerald-500/50'
                : 'border-amber-500/50'
          }));
          setDemoUsers(enriched);
        }
      }
    } catch {
      // offline fallback to FALLBACK_DEMO_USERS
    }
  };

  useEffect(() => {
    fetchDemoUsers();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Detect active demo account
  const activeUser = demoUsers.find(
    (u) =>
      currentUser &&
      (currentUser.phoneNumber === u.phoneNumber ||
        currentUser.email === u.email ||
        currentUser.id === u.id)
  ) || demoUsers[0];

  const handleSelectUser = (user) => {
    setIsOpen(false);
    if (onSwitchUser) {
      onSwitchUser(user, user.token);
    }
  };

  const handleResetData = async () => {
    try {
      setIsResetting(true);
      const res = await fetch(`${API_BASE}/api/auth/seed-demo`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchDemoUsers();
        if (onDataReset) onDataReset();
        setIsOpen(false);
      }
    } catch (e) {
      console.error('Reset failed:', e);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm ${
          isOpen
            ? 'bg-[#B50000]/20 border-[#B50000] text-white ring-2 ring-[#B50000]/30'
            : 'bg-[#2C2D2C] hover:bg-[#3C3D3C] border-[#4E4F4E] hover:border-[#B50000]/60 text-slate-200'
        }`}
        title="Switch active user in 1-second for presentation"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold text-[#FF8585]">
          <Zap className="w-3.5 h-3.5 text-[#FF8585] fill-[#FF8585] animate-pulse" />
          {!compact && <span className="hidden lg:inline text-[11px] uppercase tracking-wider text-[#FF8585] font-mono">Demo:</span>}
        </span>

        {/* Current Active Account Avatar & Name */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded-full bg-[#B50000] flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
          >
            {activeUser.avatar || activeUser.name?.[0] || 'U'}
          </div>
          <span className="text-xs font-semibold text-white max-w-[100px] sm:max-w-[130px] truncate">
            {activeUser.name}
          </span>
          <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-[#242524] text-gray-400 font-mono">
            {activeUser.registeredVia === 'IVR' ? '📞 IVR' : activeUser.registeredVia === 'MOBILE_APP' ? '📱 Mobile' : '🌐 Web'}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#FF8585]' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#2C2D2C] border border-[#4E4F4E] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 divide-y divide-[#4E4F4E]">
          {/* Header */}
          <div className="px-4 py-3 bg-[#242524] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FF8585] fill-[#FF8585]" />
              <div>
                <div className="text-xs font-extrabold text-white tracking-tight">
                  1-Second Demo Accounts Switcher
                </div>
                <div className="text-[10px] text-gray-400">
                  Switch between sender & receiver live during presentation
                </div>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#B50000]/20 text-[#FF8585] font-mono font-bold border border-[#B50000]/30">
              Live
            </span>
          </div>

          {/* User Account Selection List */}
          <div className="p-2 space-y-1.5">
            {demoUsers.map((user) => {
              const isSelected =
                currentUser &&
                (currentUser.phoneNumber === user.phoneNumber ||
                  currentUser.email === user.email ||
                  currentUser.id === user.id);

              return (
                <div
                  key={user.id || user.phoneNumber}
                  onClick={() => handleSelectUser(user)}
                  className={`p-3 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#3C3D3C] border-[#B50000] ring-1 ring-[#B50000]/50 shadow-md shadow-black/40'
                      : 'bg-[#242524] hover:bg-[#3C3D3C] border-[#4E4F4E]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-xl bg-[#B50000] flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0"
                    >
                      {user.avatar || user.name?.[0] || 'U'}
                    </div>

                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white truncate">
                          {user.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#242524] text-gray-300 font-medium shrink-0 border border-[#4E4F4E] font-mono">
                          {user.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#FF8585] font-mono truncate">
                        {user.email}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        Phone: <span className="font-mono text-gray-300">{user.phoneNumber}</span> • {user.role}
                      </div>
                    </div>
                  </div>

                  {/* Active check or Switch button */}
                  <div className="shrink-0">
                    {isSelected ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#FF8585] bg-[#B50000]/15 px-2 py-1 rounded-lg border border-[#B50000]/30">
                        <Check className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-gray-300 hover:text-white bg-[#242524] hover:bg-[#B50000] px-2.5 py-1 rounded-lg transition border border-[#4E4F4E]">
                        Switch
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Reset & Seed Option */}
          <div className="p-3 bg-[#242524] flex items-center justify-between gap-3 text-xs">
            <span className="text-[11px] text-gray-400">
              Need fresh demo threads?
            </span>
            <button
              type="button"
              onClick={handleResetData}
              disabled={isResetting}
              className="px-3 py-1.5 bg-[#2C2D2C] hover:bg-[#3C3D3C] text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-[#4E4F4E] transition cursor-pointer disabled:opacity-50"
              title="Resets database to 3 users and realistic threads"
            >
              <RotateCcw className={`w-3 h-3 text-[#FF8585] ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Re-seeding...' : '🌱 Reset Demo Data'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
