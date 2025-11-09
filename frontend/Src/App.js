import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import AuthPage from '@/pages/AuthPage';
import MainApp from '@/pages/MainApp';
import AdminDashboard from '@/pages/AdminDashboard';
import { Toaster } from '@/components/ui/sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    handleSessionId();
  }, []);

  const handleSessionId = async () => {
    const hash = window.location.hash;
    if (hash && hash.includes('session_id=')) {
      const sessionId = hash.split('session_id=')[1].split('&')[0];
      
      try {
        const response = await axios.post(`${API}/auth/session`, null, {
          headers: { 'X-Session-ID': sessionId }
        });
        
        const { session_token } = response.data;
        document.cookie = `session_token=${session_token}; path=/; secure; samesite=none; max-age=${7*24*60*60}`;
        
        window.location.hash = '';
        await checkAuth();
      } catch (error) {
        console.error('Session creation failed:', error);
      }
    }
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        withCredentials: true
      });
      
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1f22]">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route 
          path="/" 
          element={user ? <Navigate to="/app" /> : <AuthPage setUser={setUser} />} 
        />
        <Route 
          path="/app" 
          element={user ? <MainApp user={user} setUser={setUser} /> : <Navigate to="/" />} 
        />
        <Route 
          path="/admin" 
          element={user && user.is_admin ? <AdminDashboard user={user} /> : <Navigate to="/" />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;