'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
// Added RealtimePostgresChangesPayload
import { RealtimePostgresInsertPayload, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { MdRefresh, MdHelpOutline, MdSettings, MdLogout, MdSearch, MdMoreVert, MdInsertEmoticon, MdMic, MdSend, MdGroup, MdChat, MdFilterList, MdSave, MdHome, MdChatBubble, MdLabel, MdShowChart, MdList, MdCampaign, MdShare, MdViewList, MdImage, MdCheckBox, MdStar, MdInfo, MdPhoneIphone, MdNotifications, MdMenu } from 'react-icons/md';

type Message = {
  id: number | string; // Allow string for temp IDs
  content: string;
  created_at: string;
  sender_id: string;
  recipient_id: string | null;
  group_id: number | null;
};

type Profile = {
  id: string;
  username: string;
};

type Group = {
  id: number;
  name: string;
  created_at: string;
  created_by: string;
};

type ChatListItem =
  | { type: 'dm'; data: Profile; id: string }
  | { type: 'group'; data: Group; id: string };

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [chatList, setChatList] = useState<ChatListItem[]>([]);

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedUserIdsForGroup, setSelectedUserIdsForGroup] = useState<string[]>([]);

  const [search, setSearch] = useState('');

  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        console.error('Error fetching auth user:', authError?.message);
        router.push('/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        console.error('Error fetching current user profile:', profileError?.message);
        return;
      }
      setCurrentUser(profileData);

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, username');
      if (usersError) {
        console.error('Error fetching all users:', usersError.message);
      } else {
        setAllUsers(usersData || []);
      }

      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('id, name, created_at, created_by');

      if (groupsError) {
        console.error('Error fetching groups:', groupsError.message);
      } else {
        const dmChatItems: ChatListItem[] = (usersData || [])
          .filter(user => user.id !== profileData.id)
          .map(user => ({ type: 'dm', data: user, id: `dm-${user.id}` }));

        const groupChatItems: ChatListItem[] = (groupsData || [])
          .map(group => ({ type: 'group', data: group, id: `group-${group.id}` }));

        setChatList([...dmChatItems, ...groupChatItems]);
      }
    };
    fetchData();
  }, [router, supabase]);

  const handleRealtimeMessageCallback = useCallback((payload: RealtimePostgresInsertPayload<Message>) => {
    const incomingMessage = payload.new;

    if (!currentUser || !selectedChat) {
        return;
    }

    let isForActiveChat = false;
    if (selectedChat.type === 'dm') {
        const dmPartner = selectedChat.data as Profile;
        isForActiveChat = (
            (incomingMessage.sender_id === currentUser.id && incomingMessage.recipient_id === dmPartner.id) ||
            (incomingMessage.sender_id === dmPartner.id && incomingMessage.recipient_id === currentUser.id)
        ) && incomingMessage.group_id === null;
    } else if (selectedChat.type === 'group') {
        const group = selectedChat.data as Group;
        isForActiveChat = incomingMessage.group_id === group.id && incomingMessage.recipient_id === null;
    }

    if (!isForActiveChat) {
        return;
    }

    const messageExists = (messagesArr: Message[], newMessageItem: Message) =>
        messagesArr.some(msg => msg.id === newMessageItem.id || (msg.id.toString().startsWith('temp-') && msg.content === newMessageItem.content && msg.sender_id === newMessageItem.sender_id));


    setMessages(prevMessages => {
        if (incomingMessage.sender_id !== currentUser.id) {
            if (messageExists(prevMessages, incomingMessage)) {
                return prevMessages;
            }
            return [...prevMessages, incomingMessage].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        } else {
            let replaced = false;
            const updatedMessages = prevMessages.map(msg => {
                if (msg.id.toString().startsWith('temp-') &&
                    msg.sender_id === incomingMessage.sender_id &&
                    msg.content === incomingMessage.content
                ) {
                    replaced = true;
                    return incomingMessage;
                }
                if (msg.id === incomingMessage.id) {
                    replaced = true;
                    return incomingMessage;
                }
                return msg;
            });

            if (!replaced && !messageExists(updatedMessages, incomingMessage) ) {
                return [...updatedMessages, incomingMessage].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
            return updatedMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
    });

  }, [currentUser, selectedChat]);

  useEffect(() => {
    if (!selectedChat || !currentUser) {
      setMessages([]);
      return () => { };
    }

    const fetchMessages = async () => {
      let query = supabase.from('messages').select('*');
      if (selectedChat.type === 'dm') {
        const dmPartner = selectedChat.data as Profile;
        query = query.or(
          `and(sender_id.eq.${currentUser.id},recipient_id.eq.${dmPartner.id},group_id.is.null),and(sender_id.eq.${dmPartner.id},recipient_id.eq.${currentUser.id},group_id.is.null)`
        );
      } else {
        const group = selectedChat.data as Group;
        query = query.eq('group_id', group.id).is('recipient_id', null);
      }
      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) console.error('Error fetching messages:', error.message);
      else setMessages(data || []);
    };
    fetchMessages();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let channelName = '';

    const baseFilterOptions = {
        event: 'INSERT' as const,
        schema: 'public' as const,
        table: 'messages' as const,
    };

    if (selectedChat.type === 'dm') {
      const dmPartner = selectedChat.data as Profile;
      channelName = `messages-dm-${[currentUser.id, dmPartner.id].sort().join('-')}`;
      channel = supabase.channel(channelName);
      channel.on<Message>(
        'postgres_changes',
        { ...baseFilterOptions },
        // Explicitly type payload and use type guard
        (payload: RealtimePostgresChangesPayload<Message>) => {
            if (payload.eventType === 'INSERT') {
                const msg = payload.new; // Now msg is correctly typed as Message
                if (
                    selectedChat && selectedChat.type === 'dm' &&
                    currentUser && (selectedChat.data as Profile).id &&
                    (
                        (msg.sender_id === currentUser.id && msg.recipient_id === (selectedChat.data as Profile).id) ||
                        (msg.sender_id === (selectedChat.data as Profile).id && msg.recipient_id === currentUser.id)
                    ) && msg.group_id === null
                ) {
                    handleRealtimeMessageCallback(payload); // Pass the InsertPayload
                }
            }
        }
      );
    } else {
      const group = selectedChat.data as Group;
      channelName = `messages-group-${group.id}`;
      channel = supabase.channel(channelName);
      channel.on<Message>(
        'postgres_changes',
        { ...baseFilterOptions, filter: `group_id=eq.${group.id}` },
         // Explicitly type payload and use type guard
        (payload: RealtimePostgresChangesPayload<Message>) => {
            if (payload.eventType === 'INSERT') {
                handleRealtimeMessageCallback(payload); // Pass the InsertPayload
            }
        }
      );
    }

    if (channel) {
        channel.subscribe((status, err) => {
          if (err) console.error(`Subscription error on ${channelName}:`, err.message);
        });
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [selectedChat, currentUser, handleRealtimeMessageCallback, supabase]);


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat || !currentUser) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const messageCore = { content: newMessage, sender_id: currentUser.id };
    let dbPayload: Pick<Message, 'content' | 'sender_id' | 'recipient_id' | 'group_id'>;

    if (selectedChat.type === 'dm') {
      dbPayload = { ...messageCore, recipient_id: (selectedChat.data as Profile).id, group_id: null };
    } else {
      dbPayload = { ...messageCore, group_id: (selectedChat.data as Group).id, recipient_id: null };
    }

    const tempMessage: Message = { ...dbPayload, id: tempId, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempMessage].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    setNewMessage('');

    const { data, error } = await supabase.from('messages').insert([dbPayload]).select().single();

    if (error) {
      console.error('Error sending message:', error.message);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      alert(`Error: ${error.message}`);
    } else if (data) {
       setMessages((prev) => {
            const existing = prev.find(m => m.id === data.id);
            if (existing) return prev.map(m => m.id === data.id ? data : m).sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            return prev.map((msg) => (msg.id === tempMessage.id ? data : msg)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
       });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !currentUser) return;

    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser || currentUser.id !== authUser.id) {
        console.error("CRITICAL: currentUser.id in state does not match auth.uid()!");
        alert("Authentication mismatch. Please try logging out and in again, or refresh.");
        return;
    }

    try {
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({ name: newGroupName, created_by: currentUser.id })
        .select()
        .single();

      if (groupError) throw groupError;
      if (!groupData) throw new Error('Group creation returned no data.');

      const membersToInsert = [
        { group_id: groupData.id, user_id: currentUser.id },
        ...selectedUserIdsForGroup.map(userId => ({ group_id: groupData.id, user_id: userId })),
      ];
      const { error: membersError } = await supabase.from('group_members').insert(membersToInsert);
      if (membersError) {
        console.error("Error inserting group members, attempting to rollback group creation:", membersError);
        await supabase.from('groups').delete().eq('id', groupData.id);
        throw new Error(`Failed to add members: ${membersError.message}. Group creation rolled back.`);
      }

      const newGroupChatItem: ChatListItem = { type: 'group', data: groupData, id: `group-${groupData.id}` };
      setChatList(prev => [...prev, newGroupChatItem]);
      setSelectedChat(newGroupChatItem);
      setMessages([]);

      setShowCreateGroupModal(false);
      setNewGroupName('');
      setSelectedUserIdsForGroup([]);

    } catch (error: unknown) {
      console.error('Error creating group:', error instanceof Error ? error.message : 'Unknown error');
      alert(`Failed to create group: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error signing out:', error.message);
    router.push('/login');
  };

  if (!currentUser) {
    return <div className="min-h-screen flex items-center justify-center"><p>Loading user data...</p></div>;
  }

  return (
    <div className="flex h-screen">
      {/* Vertical Sidebar Strip */}
      <div className="flex flex-col items-center bg-white border-r w-14 py-2 min-h-0">
        <div className="mb-4 mt-2">
          <div className="w-10 h-6 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
            {currentUser?.username ? currentUser.username[0].toUpperCase() : '?'}
          </div>
        </div>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdHome size={24} /></button>
        <button className="mb-2 text-green-600 bg-green-100 rounded"><MdChatBubble size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdLabel size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdShowChart size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdList size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdCampaign size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdShare size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdViewList size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdImage size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdCheckBox size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdSettings size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdStar size={24} /></button>
        <button className="mb-2 text-gray-400 hover:text-green-600"><MdInfo size={24} /></button>
      </div>
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between bg-white px-4 py-2 shadow-sm border-b">
          <div className="flex items-center gap-2">
            <MdChatBubble size={22} className="text-gray-400" />
            <span className="font-semibold text-lg text-gray-400">chats</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-gray-100 rounded"><MdRefresh size={22} className="text-gray-700" /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><MdHelpOutline size={22} className="text-gray-700" /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><MdPhoneIphone size={22} className="text-gray-700" /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><MdNotifications size={22} className="text-gray-700" /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><MdMenu size={22} className="text-gray-700" /></button>
            <button className="p-2 hover:bg-gray-100 rounded" onClick={handleSignOut}><MdLogout size={22} className="text-gray-700" /></button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-[380px] bg-white border-r flex flex-col min-h-0">
            <div className="flex flex-col flex-shrink-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <button className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded text-xs font-semibold">
                  <MdFilterList size={18} className="text-gray-700" /> Custom filter
                </button>
                <button className="flex items-center gap-1 px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded ml-2">
                  <MdSave size={18} className="text-gray-700" /> Save
                </button>
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative w-full max-w-[180px]">
                    <input
                      type="text"
                      placeholder="Search"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1 border border-gray-200 rounded bg-gray-50 text-sm"
                    />
                    <MdSearch size={18} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <button className="flex items-center gap-1 px-3 py-1 text-xs text-green-700 border border-green-400 rounded ml-2 relative">
                  <MdFilterList size={18} className="text-gray-700" /> Filtered
                  <span className="absolute -top-1 -right-2 bg-green-500 text-white text-[10px] rounded-full px-1.5">2</span>
                </button>
              </div>
            </div>
            {/* Chat List */}
            <div className="flex-1 min-h-0 max-h-full overflow-y-auto">
              {chatList.length === 0 && !search.trim() && (
                <p className="text-xs text-gray-500 p-4">No chats yet.</p>
              )}
              {chatList
                .filter(chat => {
                  if (!search.trim()) {
                    return true;
                  }
                  const searchTerm = search.toLowerCase();
                  if (chat.type === 'dm') {
                    const profile = chat.data as Profile;
                    return profile.username.toLowerCase().includes(searchTerm);
                  } else if (chat.type === 'group') {
                    const group = chat.data as Group;
                    return group.name.toLowerCase().includes(searchTerm);
                  }
                  return false;
                })
                .map((chat) => {
                  const isSelected = selectedChat?.id === chat.id;
                  const isGroup = chat.type === 'group';
                  const name = isGroup ? (chat.data as Group).name : (chat.data as Profile).username;
                  const avatar = name ? name[0].toUpperCase() : '?';

                  return (
                    <div
                      key={chat.id}
                      onClick={() => setSelectedChat(chat)}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b hover:bg-gray-50 ${isSelected ? 'bg-green-50' : ''}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${isGroup ? 'bg-blue-400' : 'bg-green-400'}`}>{avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate text-black">{name}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {search.trim() && chatList.filter(chat => {
                    const searchTerm = search.toLowerCase();
                    if (chat.type === 'dm') return (chat.data as Profile).username.toLowerCase().includes(searchTerm);
                    if (chat.type === 'group') return (chat.data as Group).name.toLowerCase().includes(searchTerm);
                    return false;
                }).length === 0 && (
                    // Escaped quotes to " as per error message context
                    <p className="text-xs text-gray-500 p-4">No results found for "{search}"</p>
                )}
            </div>
            {/* Sidebar bottom icons */}
            <div className="flex items-center justify-around px-4 py-2 border-t bg-gray-50 flex-shrink-0 mt-auto">
              <button className="p-2 hover:bg-gray-200 rounded" onClick={() => router.push('/')}><MdChat size={22} className="text-gray-700" /></button>
              <button className="p-2 hover:bg-gray-200 rounded" onClick={() => setShowCreateGroupModal(true)}><MdGroup size={22} className="text-gray-700" /></button>
              <button className="p-2 hover:bg-gray-200 rounded"><MdSettings size={22} className="text-gray-700" /></button>
            </div>
          </div>
          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Chat Top Bar */}
            <div className="flex items-center gap-3 bg-white px-6 py-3 border-b shadow-sm flex-shrink-0">
              {selectedChat ? (
                <>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${selectedChat.type === 'group' ? 'bg-blue-400' : 'bg-green-400'}`}>{selectedChat.type === 'group' ? (selectedChat.data as Group).name[0].toUpperCase() : (selectedChat.data as Profile).username[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-black">{selectedChat.type === 'group' ? (selectedChat.data as Group).name : (selectedChat.data as Profile).username}</div>
                    <div className="text-xs text-gray-500 truncate">{selectedChat.type === 'group' ? 'Group members...' : 'Online'}</div>
                  </div>
                  <button className="p-2 hover:bg-gray-100 rounded"><MdSearch size={22} className="text-gray-700" /></button>
                  <button className="p-2 hover:bg-gray-100 rounded"><MdMoreVert size={22} className="text-gray-700" /></button>
                </>
              ) : (
                <span className="text-gray-400">Select a chat to start messaging</span>
              )}
            </div>
            {/* Messages Area */}
            <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 bg-[#ece5dd] relative">
              {selectedChat ? (
                messages.length > 0 ? (
                  <>
                    {messages.map((message, idx) => {
                      const prevMsg = messages[idx - 1];
                      const showDate = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(message.created_at).toDateString();
                      return (
                        <div key={message.id.toString()}>
                          {showDate && (
                            <div className="flex justify-center my-4">
                              <span className="bg-white text-gray-500 text-xs px-3 py-1 rounded-full shadow">{new Date(message.created_at).toLocaleDateString()}</span>
                            </div>
                          )}
                          <div className={`mb-2 flex ${message.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[60%] p-3 rounded-xl shadow ${message.sender_id === currentUser?.id ? 'bg-[#dcf8c6] text-gray-900' : 'bg-white text-gray-900'}`}>
                              {selectedChat.type === 'group' && message.sender_id !== currentUser?.id && (
                                <p className="text-xs font-semibold mb-1 opacity-80">{allUsers.find(u => u.id === message.sender_id)?.username || 'User'}</p>
                              )}
                              <p>{message.content}</p>
                              <p className="text-xs opacity-70 mt-1 text-right">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  // Escaped quotes to " as per error message context
                  <p className="text-gray-500 text-sm">"No messages yet. Start the conversation!"</p>
                )
              ) : (
                <div className="flex flex-1 items-center justify-center h-full w-full">
                  <span className="text-gray-500 text-center text-2xl">Select a user or group to start chatting.</span>
                </div>
              )}
            </div>
            {/* Message Input Bar */}
            {selectedChat && (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 px-6 py-4 bg-[#f7f7f7] border-t flex-shrink-0">
                <button type="button" className="p-2 text-black-500 hover:text-green-600"><MdInsertEmoticon size={22} /></button>
                <button type="button" className="p-2 text-black-500 hover:text-green-600"><MdMoreVert size={22} /></button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 p-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                />
                <button type="button" className="p-2 text-gray-500 hover:text-green-600"><MdMic size={22} /></button>
                <button
                  type="submit"
                  className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition"
                >
                  <MdSend size={22} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="mb-4">
                <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  id="groupName"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Add Members (optional)</label>
                <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1">
                  {allUsers
                    .filter(user => user.id !== currentUser?.id)
                    .map(user => (
                      <div key={user.id} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`user-checkbox-${user.id}`}
                          checked={selectedUserIdsForGroup.includes(user.id)}
                          onChange={(e) => {
                            setSelectedUserIdsForGroup(prev =>
                              e.target.checked ? [...prev, user.id] : prev.filter(id => id !== user.id)
                            );
                          }}
                          className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor={`user-checkbox-${user.id}`} className="text-sm text-gray-700">
                          {user.username}
                        </label>
                      </div>
                    ))}
                    {allUsers.filter(user => user.id !== currentUser?.id).length === 0 && (
                        <p className="text-xs text-gray-500">No other users to add.</p>
                    )}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setNewGroupName('');
                    setSelectedUserIdsForGroup([]);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
