import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Hash, Volume2, Settings, LogOut, Users, Video, Phone, MessageSquare, Menu, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Peer from 'simple-peer';
import io from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

export default function MainApp({ user, setUser }) {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [newServerName, setNewServerName] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [directMessages, setDirectMessages] = useState([]);
  const [selectedDM, setSelectedDM] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const wsRef = useRef(null);
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchServers();
    fetchDirectMessages();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (selectedServer) {
      fetchChannels(selectedServer.id);
    }
  }, [selectedServer]);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id);
      setSelectedDM(null);
    }
  }, [selectedChannel]);

  useEffect(() => {
    if (selectedDM) {
      fetchDMMessages(selectedDM.id);
      setSelectedChannel(null);
    }
  }, [selectedDM]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/ws/${user.id}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'message') {
        if (selectedChannel && data.data.channel_id === selectedChannel.id) {
          setMessages(prev => [...prev, data.data]);
        }
      } else if (data.type === 'dm') {
        if (selectedDM && data.data.dm_id === selectedDM.id) {
          setMessages(prev => [...prev, data.data]);
        }
      } else if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') {
        handleWebRTCSignal(data);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  };

  const fetchServers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/servers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setServers(response.data);
      if (response.data.length > 0) {
        setSelectedServer(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    }
  };

  const fetchChannels = async (serverId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/servers/${serverId}/channels`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChannels(response.data);
      const textChannel = response.data.find(c => c.type === 'text');
      if (textChannel) {
        setSelectedChannel(textChannel);
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  };

  const fetchMessages = async (channelId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/channels/${channelId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const fetchDirectMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/dms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDirectMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch DMs:', error);
    }
  };

  const fetchDMMessages = async (dmId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/dms/${dmId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch DM messages:', error);
    }
  };

  const createServer = async () => {
    if (!newServerName.trim()) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/servers?name=${encodeURIComponent(newServerName)}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Server created!');
      setNewServerName('');
      fetchServers();
    } catch (error) {
      toast.error('Failed to create server');
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !selectedServer) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/servers/${selectedServer.id}/channels?name=${encodeURIComponent(newChannelName)}&channel_type=${newChannelType}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Channel created!');
      setNewChannelName('');
      fetchChannels(selectedServer.id);
    } catch (error) {
      toast.error('Failed to create channel');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    try {
      const token = localStorage.getItem('token');
      
      if (selectedChannel) {
        await axios.post(
          `${API}/channels/${selectedChannel.id}/messages?content=${encodeURIComponent(messageInput)}`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else if (selectedDM) {
        await axios.post(
          `${API}/dms/${selectedDM.id}/messages?content=${encodeURIComponent(messageInput)}`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setMessageInput('');
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const startDM = async (otherUserId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/dms?other_user_id=${otherUserId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      await fetchDirectMessages();
      const newDM = response.data;
      setSelectedDM(newDM);
      setSearchQuery('');
      setSearchResults([]);
      toast.success('Direct message started');
    } catch (error) {
      toast.error('Failed to start DM');
    }
  };

  const startVoiceCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setInCall(true);
      setIsVideoCall(false);
      initiateCall(stream, false);
    } catch (error) {
      toast.error('Failed to access microphone');
    }
  };

  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setInCall(true);
      setIsVideoCall(true);
      initiateCall(stream, true);
    } catch (error) {
      toast.error('Failed to access camera/microphone');
    }
  };

  const initiateCall = (stream, video) => {
    const peer = new Peer({ initiator: true, stream, trickle: false });
    
    peer.on('signal', (data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          data: data,
          target_user_id: selectedDM?.participants.find(p => p !== user.id),
          video: video
        }));
      }
    });

    peer.on('stream', (remoteStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    peerRef.current = peer;
  };

  const handleWebRTCSignal = (data) => {
    if (data.type === 'offer') {
      answerCall(data.data, data.video);
    } else if (data.type === 'answer' && peerRef.current) {
      peerRef.current.signal(data.data);
    } else if (data.type === 'ice-candidate' && peerRef.current) {
      peerRef.current.signal(data.data);
    }
  };

  const answerCall = async (offer, video) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      localStreamRef.current = stream;
      
      if (video && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const peer = new Peer({ initiator: false, stream, trickle: false });
      
      peer.on('signal', (data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'answer',
            data: data,
            target_user_id: selectedDM?.participants.find(p => p !== user.id)
          }));
        }
      });

      peer.on('stream', (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      peer.signal(offer);
      peerRef.current = peer;
      setInCall(true);
      setIsVideoCall(video);
    } catch (error) {
      toast.error('Failed to answer call');
    }
  };

  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setInCall(false);
    setIsVideoCall(false);
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  const goToAdmin = () => {
    window.location.href = '/admin';
  };

  return (
    <div className="h-screen flex bg-[#313338]" data-testid="main-app">
      {/* Server list */}
      <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2">
        <Button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-12 h-12 rounded-full bg-[#313338] hover:bg-[#5865f2] hover:rounded-2xl transition-all duration-200"
          data-testid="toggle-sidebar-btn"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="w-8 h-0.5 bg-[#3f4147] rounded-full"></div>

        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center space-y-2">
            {servers.map((server) => (
              <button
                key={server.id}
                onClick={() => setSelectedServer(server)}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold transition-all duration-200 ${
                  selectedServer?.id === server.id
                    ? 'bg-[#5865f2] rounded-2xl'
                    : 'bg-[#313338] hover:bg-[#5865f2] hover:rounded-2xl'
                }`}
                data-testid={`server-${server.id}`}
              >
                {server.icon || server.name.charAt(0).toUpperCase()}
              </button>
            ))}

            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="w-12 h-12 rounded-full bg-[#313338] hover:bg-[#23a559] hover:rounded-2xl transition-all duration-200 flex items-center justify-center text-[#23a559] hover:text-white"
                  data-testid="create-server-btn"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </DialogTrigger>
              <DialogContent className="bg-[#313338] border-[#1e1f22]">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Server</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-[#b5bac1]">Server Name</Label>
                    <Input
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      className="bg-[#1e1f22] border-[#1e1f22] text-white"
                      placeholder="My Awesome Server"
                      data-testid="new-server-name-input"
                    />
                  </div>
                  <Button
                    onClick={createServer}
                    className="w-full bg-[#5865f2] hover:bg-[#4752c4]"
                    data-testid="create-server-submit-btn"
                  >
                    Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </ScrollArea>

        <div className="w-8 h-0.5 bg-[#3f4147] rounded-full"></div>

        {user.is_admin && (
          <Button
            onClick={goToAdmin}
            className="w-12 h-12 rounded-full bg-[#313338] hover:bg-[#f23f42] hover:rounded-2xl transition-all duration-200"
            data-testid="admin-dashboard-btn"
          >
            <Crown className="w-5 h-5" />
          </Button>
        )}

        <Button
          onClick={handleLogout}
          className="w-12 h-12 rounded-full bg-[#313338] hover:bg-[#f23f42] hover:rounded-2xl transition-all duration-200"
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      {/* Channels list */}
      {sidebarOpen && (
        <div className="w-60 bg-[#2b2d31] flex flex-col">
          {selectedServer && (
            <>
              <div className="h-12 px-4 flex items-center shadow-md border-b border-[#1e1f22]">
                <h2 className="text-white font-semibold">{selectedServer.name}</h2>
              </div>

              <ScrollArea className="flex-1 px-2 py-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[#949ba4] text-xs font-semibold uppercase">Text Channels</span>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:bg-transparent"
                          onClick={() => setNewChannelType('text')}
                          data-testid="add-text-channel-btn"
                        >
                          <Plus className="w-4 h-4 text-[#949ba4] hover:text-white" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-[#313338] border-[#1e1f22]">
                        <DialogHeader>
                          <DialogTitle className="text-white">Create Channel</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-[#b5bac1]">Channel Name</Label>
                            <Input
                              value={newChannelName}
                              onChange={(e) => setNewChannelName(e.target.value)}
                              className="bg-[#1e1f22] border-[#1e1f22] text-white"
                              placeholder="new-channel"
                              data-testid="new-channel-name-input"
                            />
                          </div>
                          <Button
                            onClick={createChannel}
                            className="w-full bg-[#5865f2] hover:bg-[#4752c4]"
                            data-testid="create-channel-submit-btn"
                          >
                            Create
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {channels.filter(c => c.type === 'text').map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => setSelectedChannel(channel)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35373c] ${
                        selectedChannel?.id === channel.id ? 'bg-[#35373c] text-white' : 'text-[#949ba4]'
                      }`}
                      data-testid={`channel-${channel.id}`}
                    >
                      <Hash className="w-4 h-4" />
                      <span className="text-sm">{channel.name}</span>
                    </button>
                  ))}

                  <div className="flex items-center justify-between px-2 py-1 mt-4">
                    <span className="text-[#949ba4] text-xs font-semibold uppercase">Voice Channels</span>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:bg-transparent"
                          onClick={() => setNewChannelType('voice')}
                          data-testid="add-voice-channel-btn"
                        >
                          <Plus className="w-4 h-4 text-[#949ba4] hover:text-white" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-[#313338] border-[#1e1f22]">
                        <DialogHeader>
                          <DialogTitle className="text-white">Create Voice Channel</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-[#b5bac1]">Channel Name</Label>
                            <Input
                              value={newChannelName}
                              onChange={(e) => setNewChannelName(e.target.value)}
                              className="bg-[#1e1f22] border-[#1e1f22] text-white"
                              placeholder="General Voice"
                              data-testid="new-voice-channel-name-input"
                            />
                          </div>
                          <Button
                            onClick={createChannel}
                            className="w-full bg-[#5865f2] hover:bg-[#4752c4]"
                            data-testid="create-voice-channel-submit-btn"
                          >
                            Create
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {channels.filter(c => c.type === 'voice').map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => setSelectedChannel(channel)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35373c] ${
                        selectedChannel?.id === channel.id ? 'bg-[#35373c] text-white' : 'text-[#949ba4]'
                      }`}
                      data-testid={`voice-channel-${channel.id}`}
                    >
                      <Volume2 className="w-4 h-4" />
                      <span className="text-sm">{channel.name}</span>
                    </button>
                  ))}

                  <div className="flex items-center justify-between px-2 py-1 mt-4">
                    <span className="text-[#949ba4] text-xs font-semibold uppercase">Direct Messages</span>
                  </div>

                  <div className="px-2 py-2">
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        searchUsers(e.target.value);
                      }}
                      placeholder="Search users..."
                      className="bg-[#1e1f22] border-[#1e1f22] text-white text-sm"
                      data-testid="search-users-input"
                    />
                    {searchResults.length > 0 && (
                      <div className="mt-2 bg-[#1e1f22] rounded p-1">
                        {searchResults.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => startDM(u.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35373c] text-white text-sm"
                            data-testid={`user-search-result-${u.id}`}
                          >
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={u.avatar} />
                              <AvatarFallback>{u.username.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span>{u.username}</span>
                            <span className="text-xs text-[#949ba4]">#{u.user_number}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {directMessages.map((dm) => (
                    <button
                      key={dm.id}
                      onClick={() => setSelectedDM(dm)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#35373c] ${
                        selectedDM?.id === dm.id ? 'bg-[#35373c] text-white' : 'text-[#949ba4]'
                      }`}
                      data-testid={`dm-${dm.id}`}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={dm.other_user?.avatar} />
                        <AvatarFallback>{dm.other_user?.username?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{dm.other_user?.username}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] bg-[#313338]">
          <div className="flex items-center gap-2">
            {selectedChannel && (
              <>
                {selectedChannel.type === 'text' ? (
                  <Hash className="w-5 h-5 text-[#949ba4]" />
                ) : (
                  <Volume2 className="w-5 h-5 text-[#949ba4]" />
                )}
                <span className="text-white font-semibold">{selectedChannel.name}</span>
              </>
            )}
            {selectedDM && (
              <>
                <MessageSquare className="w-5 h-5 text-[#949ba4]" />
                <span className="text-white font-semibold">{selectedDM.other_user?.username}</span>
              </>
            )}
          </div>

          {selectedDM && (
            <div className="flex items-center gap-2">
              <Button
                onClick={startVoiceCall}
                variant="ghost"
                size="sm"
                className="text-[#949ba4] hover:text-white"
                data-testid="start-voice-call-btn"
              >
                <Phone className="w-5 h-5" />
              </Button>
              <Button
                onClick={startVideoCall}
                variant="ghost"
                size="sm"
                className="text-[#949ba4] hover:text-white"
                data-testid="start-video-call-btn"
              >
                <Video className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Messages area */}
        <ScrollArea className="flex-1 px-4 py-4" data-testid="messages-area">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3" data-testid={`message-${msg.id}`}>
                <Avatar className="w-10 h-10">
                  <AvatarImage src={msg.user?.avatar} />
                  <AvatarFallback className="bg-[#5865f2] text-white">
                    {msg.user?.username?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white font-semibold text-sm">{msg.user?.username || 'Unknown'}</span>
                    {msg.user?.user_number && (
                      <span className="text-[#949ba4] text-xs">#{msg.user.user_number}</span>
                    )}
                    <span className="text-[#949ba4] text-xs">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[#dbdee1] text-sm mt-0.5">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Message input */}
        {(selectedChannel?.type === 'text' || selectedDM) && (
          <div className="px-4 pb-6">
            <form onSubmit={sendMessage} data-testid="message-form">
              <Input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder={selectedChannel ? `Message #${selectedChannel.name}` : `Message ${selectedDM?.other_user?.username}`}
                className="bg-[#383a40] border-0 text-white placeholder:text-[#6d6f78]"
                data-testid="message-input"
              />
            </form>
          </div>
        )}
      </div>

      {/* Video call modal */}
      {inCall && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" data-testid="video-call-modal">
          <div className="relative w-full max-w-4xl p-4">
            <div className="space-y-4">
              {isVideoCall && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1e1f22] rounded-lg overflow-hidden aspect-video">
                    <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover" />
                    <p className="text-white text-center mt-2">You</p>
                  </div>
                  <div className="bg-[#1e1f22] rounded-lg overflow-hidden aspect-video">
                    <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover" />
                    <p className="text-white text-center mt-2">Remote</p>
                  </div>
                </div>
              )}
              {!isVideoCall && (
                <div className="text-center py-12">
                  <Phone className="w-20 h-20 text-[#23a559] mx-auto mb-4 animate-pulse" />
                  <p className="text-white text-xl">Voice Call Active</p>
                </div>
              )}
              <div className="flex justify-center">
                <Button
                  onClick={endCall}
                  className="bg-[#f23f42] hover:bg-[#da373c] text-white px-8 py-6 rounded-full"
                  data-testid="end-call-btn"
                >
                  End Call
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}