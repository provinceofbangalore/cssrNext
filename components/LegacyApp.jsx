'use client';

import dynamic from 'next/dynamic';

// The original public and admin screens are loaded client-side so their
// BrowserRouter, localStorage theme/language preferences and existing UX
// remain intact while Next.js owns the application and API deployment.
const LegacyApp = dynamic(() => import('@/legacy/App.jsx'), {
  ssr: false,
  loading: () => (
    <main className="container py-5 text-center">
      <div className="spinner-border text-success" role="status" aria-label="Loading" />
      <p className="mt-3">Loading CSSR.IN…</p>
    </main>
  )
});

export default function LegacyAppShell() {
  return <LegacyApp />;
}
