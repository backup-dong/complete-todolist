import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';

export function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar onClose={() => setMenuOpen(false)} />
      </div>

      {/* Mobile drawer */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-200 md:hidden',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <Sidebar onClose={() => setMenuOpen(false)} />
      </div>
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <ContentArea onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
