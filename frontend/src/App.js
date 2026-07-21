import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Landing from '@/pages/Landing';
import Chat from '@/pages/Chat';
import { getNickname } from '@/lib/identity';
import { Toaster } from 'sonner';
import '@/App.css';

function RequireNickname({ children }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!getNickname()) navigate('/', { replace: true });
  }, [navigate]);
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/chat"
          element={
            <RequireNickname>
              <Chat />
            </RequireNickname>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </BrowserRouter>
  );
}

export default App;
