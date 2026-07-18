import { useCallback, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';

export function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; triggered: boolean }>({ x: 0, y: 0, triggered: false });

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

  // 移动端左侧边缘滑入手势
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (mounted) return; // 抽屉已打开
    if (window.innerWidth >= 768) return; // 桌面端不处理
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      triggered: false,
    };
  }, [mounted]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current.triggered) return;
    if (window.innerWidth >= 768) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    // 从左侧边缘 24px 内开始，向右滑动 > 40px 且水平距离 > 垂直距离
    if (touchStartRef.current.x <= 24 && dx > 40 && dx > dy * 1.5) {
      touchStartRef.current.triggered = true;
      openMenu();
    }
  }, [openMenu]);

  return (
    <div
      className="flex h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
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
