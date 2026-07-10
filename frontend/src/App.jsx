import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="min-h-screen p-4 lg:ml-72 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
