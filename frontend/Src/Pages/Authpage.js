import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AuthPage({ setUser }) {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ email: '', username: '', user_number: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, loginData);
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      toast.success('Welcome back!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (registerData.user_number.length !== 8 || !/^\d+$/.test(registerData.user_number)) {
      toast.error('User number must be exactly 8 digits');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/register`, registerData);
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      toast.success('Account created successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const redirectUrl = `${window.location.origin}/app`;
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    window.location.href = authUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#5865f2] via-[#7289da] to-[#5865f2] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>miiwiichat</h1>
          <p className="text-white/80" style={{ fontFamily: 'Inter, sans-serif' }}>Connect, chat, and call with friends</p>
        </div>

        <div className="bg-[#313338] rounded-lg p-8 shadow-2xl">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-[#1e1f22]">
              <TabsTrigger value="login" className="data-[state=active]:bg-[#5865f2]">Login</TabsTrigger>
              <TabsTrigger value="register" className="data-[state=active]:bg-[#5865f2]">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
                <div>
                  <Label htmlFor="login-email" className="text-[#b5bac1]">Email</Label>
                  <Input
                    id="login-email"
                    data-testid="login-email-input"
                    type="email"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    className="bg-[#1e1f22] border-[#1e1f22] text-white"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="login-password" className="text-[#b5bac1]">Password</Label>
                  <Input
                    id="login-password"
                    data-testid="login-password-input"
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    className="bg-[#1e1f22] border-[#1e1f22] text-white"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="login-submit-btn"
                  className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white"
                  disabled={loading}
                >
                  {loading ? 'Logging in...' : 'Login'}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#4e5058]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-[#313338] text-[#b5bac1]">OR</span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleGoogleLogin}
                data-testid="google-login-btn"
                className="w-full bg-white hover:bg-gray-100 text-gray-900 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4" data-testid="register-form">
                <div>
                  <Label htmlFor="register-email" className="text-[#b5bac1]">Email</Label>
                  <Input
                    id="register-email"
                    data-testid="register-email-input"
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    className="bg-[#1e1f22] border-[#1e1f22] text-white"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="register-username" className="text-[#b5bac1]">Username</Label>
                  <Input
                    id="register-username"
                    data-testid="register-username-input"
                    type="text"
                    value={registerData.username}
                    onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                    className="bg-[#1e1f22] border-[#1e1f22] text-white"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="register-user-number" className="text-[#b5bac1]">User Number (8 digits)</Label>
                  <Input
                    id="register-user-number"
                    data-testid="register-user-number-input"
                    type="text"
                    maxLength="8"
                    value={registerData.user_number}
                    onChange={(e) => setRegisterData({ ...registerData, user_number: e.target.value.replace(/\D/g, '') })}
                    className="bg-[#1e1f22] border-[#1e1f22] text-white"
                    placeholder="12345678"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="register-password" className="text-[#b5bac1]">Password</Label>
                  <Input
                    id="register-password"
                    data-testid="register-password-input"
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    className="bg-[#1e1f22] border-[#1e1f22] text-white"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="register-submit-btn"
                  className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white"
                  disabled={loading}
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
