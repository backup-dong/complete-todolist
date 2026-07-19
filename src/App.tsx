import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useSyncStore } from '@/stores/syncStore';
import { useListsStore } from '@/stores/listsStore';
import { MainLayout } from '@/components/layout/MainLayout';
import { Settings } from '@/components/settings/Settings';
import { NotificationProvider } from '@/components/common/NotificationProvider';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ToastContainer } from '@/components/common/ToastContainer';
import { LoadingOverlay } from '@/components/common/LoadingOverlay';
import './index.css';

function AppRoutes() {
  const { config, ensureInitialized } = useSyncStore();
  const lists = useListsStore((s) => s.lists);
  const activeListName = useListsStore((s) => s.activeListName);
  const fileCache = useListsStore((s) => s.fileCache);
  const listsFetched = useListsStore((s) => s.listsFetched);
  const initialLoading = useListsStore((s) => s.initialLoading);
  const { fetchLists, setInitialLoading, fetchAllListsContent } = useListsStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!config) {
      setInitialLoading(false);
      navigate('/settings', { replace: true });
      return;
    }
    if (ensureInitialized()) {
      fetchLists().then(() => {
        fetchAllListsContent();
      });
    }
  }, [config, ensureInitialized, fetchLists, navigate, setInitialLoading]);

  useEffect(() => {
    if (lists.length > 0 && !useListsStore.getState().activeListName) {
      useListsStore.getState().selectList(lists[0].name);
    }
  }, [lists]);

  useEffect(() => {
    if (!initialLoading) return;
    if (!config) {
      setInitialLoading(false);
      return;
    }
    if (!listsFetched) return;
    if (lists.length === 0 || (activeListName && fileCache[activeListName])) {
      setInitialLoading(false);
    }
  }, [config, lists, listsFetched, activeListName, fileCache, initialLoading, setInitialLoading]);

  return (
    <Routes>
      <Route path="/" element={<MainLayout />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const initialLoading = useListsStore((s) => s.initialLoading);

  return (
    <NotificationProvider>
      <div className="flex h-full flex-col">
        <AppRoutes />
      </div>
      <ConfirmDialog />
      <ToastContainer />
      {initialLoading && <LoadingOverlay />}
    </NotificationProvider>
  );
}

export default App;
