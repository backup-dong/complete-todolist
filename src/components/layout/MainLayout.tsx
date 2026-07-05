import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';

export function MainLayout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <ContentArea />
    </div>
  );
}
