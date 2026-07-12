import { useCallback, useState } from 'react';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';

export function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 打开抽屉时先挂载 DOM，再等下一帧再加 translate，确保 transition 生效
  const openMenu = useCallback(() => {
    setMounted(true);
    requestAnimationFrame(() => setMenuOpen(true));
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const handleTransitionEnd = () => {
    if (!menuOpen) {
      setMounted(false);
    }
  };

  return (
    <div className="flex h-svh">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-svh">
        <Sidebar onClose={closeMenu} />
      </div>

      {/* Mobile drawer */}
      {mounted && (
        <div
          className={[
            'fixed inset-y-0 left-0 z-50 w-60 transform transition-transform duration-200 md:hidden',
            menuOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
          onTransitionEnd={handleTransitionEnd}
        >
          <Sidebar onClose={closeMenu} />
        </div>
      )}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--color-backdrop)] md:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <ContentArea onOpenMenu={openMenu} />
    </div>
  );
}
