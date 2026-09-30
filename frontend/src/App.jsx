import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DualViewWrapper from './components/DualViewWrapper';
import DesktopWebmail from './pages/DesktopWebmail';
import RegisterPortal from './pages/RegisterPortal';

export default function App() {
  return (
    <Routes>
      {/* Route 1: / or /mobile (WhatsApp-style mobile view from earlier steps) */}
      <Route path="/" element={<DualViewWrapper initialView="mobile" />} />
      <Route path="/mobile" element={<DualViewWrapper initialView="mobile" />} />

      {/* Route 2: /register (Dedicated Web Account Creation Portal) */}
      <Route path="/register" element={<RegisterPortal />} />

      {/* Route 3: /web (Desktop Gmail-style email client) */}
      <Route path="/web" element={<DesktopWebmail />} />

      {/* Fallback to / */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
