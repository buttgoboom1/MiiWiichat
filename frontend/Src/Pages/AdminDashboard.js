import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Users, MessageSquare, Server, Activity, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminDashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, usersRes, messagesRes, activitiesRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/users`, { headers }),
        axios.get(`${API}/admin/messages?limit=50`, { headers }),
        axios.get(`${API}/admin/activity?limit=50`, { headers })
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data);
      setMessages(messagesRes.data);
      setActivities(activitiesRes.data);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('User deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const deleteMessage = async (messageId) => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/admin/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Message deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete message');
    }
  };

  const deleteServer = async (serverId) => {
    if (!confirm('Are you sure you want to delete this server? This will delete all channels and messages.')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/admin/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Server deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete server');
    }
  };

  const goBack = () => {
    window.location.href = '/app';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1f22]">
        <div className="text-white text-xl">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1f22] p-6" data-testid="admin-dashboard">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              onClick={goBack}
              variant="ghost"
              className="text-white hover:bg-[#313338]"
              data-testid="back-to-app-btn"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to App
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Admin Dashboard
              </h1>
              <p className="text-[#b5bac1]">Monitor and manage miiwiichat</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-[#313338] border-[#1e1f22]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#b5bac1]">Total Users</CardTitle>
              <Users className="h-4 w-4 text-[#5865f2]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.total_users || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-[#313338] border-[#1e1f22]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#b5bac1]">Online Users</CardTitle>
              <Activity className="h-4 w-4 text-[#23a559]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.online_users || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-[#313338] border-[#1e1f22]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#b5bac1]">Total Servers</CardTitle>
              <Server className="h-4 w-4 text-[#5865f2]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.total_servers || 0}</div>
            </CardContent>
          </Card>

          <Card className="bg-[#313338] border-[#1e1f22]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#b5bac1]">Total Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-[#5865f2]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.total_messages || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="bg-[#313338] border-b border-[#1e1f22]">
            <TabsTrigger value="users" className="data-[state=active]:bg-[#5865f2] data-[state=active]:text-white">
              Users
            </TabsTrigger>
            <TabsTrigger value="messages" className="data-[state=active]:bg-[#5865f2] data-[state=active]:text-white">
              Messages
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-[#5865f2] data-[state=active]:text-white">
              Activity Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <Card className="bg-[#313338] border-[#1e1f22]">
              <CardHeader>
                <CardTitle className="text-white">All Users</CardTitle>
                <CardDescription className="text-[#b5bac1]">Manage registered users</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-4 bg-[#2b2d31] rounded-lg hover:bg-[#35373c] transition-colors"
                        data-testid={`admin-user-${u.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={u.avatar} />
                            <AvatarFallback className="bg-[#5865f2] text-white">
                              {u.username?.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white font-semibold">{u.username}</p>
                            <p className="text-[#b5bac1] text-sm">{u.email}</p>
                            <p className="text-[#949ba4] text-xs">#{u.user_number}</p>
                            {u.is_admin && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-[#f23f42] text-white text-xs rounded">Admin</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[#5865f2] hover:text-white hover:bg-[#5865f2]"
                                data-testid={`view-user-${u.id}-btn`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#313338] border-[#1e1f22] text-white">
                              <DialogHeader>
                                <DialogTitle>User Details</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[#b5bac1] text-sm">Username</p>
                                  <p className="text-white">{u.username}</p>
                                </div>
                                <div>
                                  <p className="text-[#b5bac1] text-sm">Email</p>
                                  <p className="text-white">{u.email}</p>
                                </div>
                                <div>
                                  <p className="text-[#b5bac1] text-sm">User Number</p>
                                  <p className="text-white">#{u.user_number}</p>
                                </div>
                                <div>
                                  <p className="text-[#b5bac1] text-sm">Status</p>
                                  <p className="text-white">{u.status}</p>
                                </div>
                                <div>
                                  <p className="text-[#b5bac1] text-sm">Created At</p>
                                  <p className="text-white">{new Date(u.created_at).toLocaleString()}</p>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          {!u.is_admin && (
                            <Button
                              onClick={() => deleteUser(u.id)}
                              variant="ghost"
                              size="sm"
                              className="text-[#f23f42] hover:text-white hover:bg-[#f23f42]"
                              data-testid={`delete-user-${u.id}-btn`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="mt-6">
            <Card className="bg-[#313338] border-[#1e1f22]">
              <CardHeader>
                <CardTitle className="text-white">Recent Messages</CardTitle>
                <CardDescription className="text-[#b5bac1]">Monitor all messages across servers and DMs</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="flex items-start justify-between p-4 bg-[#2b2d31] rounded-lg hover:bg-[#35373c] transition-colors"
                        data-testid={`admin-message-${msg.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-semibold text-sm">{msg.user?.username || 'Unknown'}</span>
                            <span className="text-[#949ba4] text-xs">#{msg.user?.user_number}</span>
                            <span className="text-[#949ba4] text-xs">{new Date(msg.timestamp).toLocaleString()}</span>
                          </div>
                          {msg.location && (
                            <p className="text-[#5865f2] text-xs mb-1">{msg.location}</p>
                          )}
                          <p className="text-[#b5bac1] text-sm">{msg.content}</p>
                        </div>
                        <Button
                          onClick={() => deleteMessage(msg.id)}
                          variant="ghost"
                          size="sm"
                          className="text-[#f23f42] hover:text-white hover:bg-[#f23f42] ml-2"
                          data-testid={`delete-message-${msg.id}-btn`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <Card className="bg-[#313338] border-[#1e1f22]">
              <CardHeader>
                <CardTitle className="text-white">Activity Log</CardTitle>
                <CardDescription className="text-[#b5bac1]">Track user actions and system events</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="p-4 bg-[#2b2d31] rounded-lg"
                        data-testid={`activity-${activity.id}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-semibold text-sm">{activity.user?.username}</span>
                          <span className="text-[#949ba4] text-xs">#{activity.user?.user_number}</span>
                          <span className="text-[#949ba4] text-xs">{new Date(activity.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block px-2 py-0.5 bg-[#5865f2] text-white text-xs rounded">
                            {activity.action}
                          </span>
                          <span className="text-[#b5bac1] text-xs">
                            {JSON.stringify(activity.details)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}