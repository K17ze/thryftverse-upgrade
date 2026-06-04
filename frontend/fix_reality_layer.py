import os

frontend_dir = 'C:/Users/ASUS/Desktop/thryftverse/frontend/src'

# ==========================================
# 1. Fix ChatScreen - reconciliation + delete truth
# ==========================================
with open(f'{frontend_dir}/screens/ChatScreen.tsx', 'r', encoding='utf-8') as f:
    chat = f.read()

# Add AppState import
if "AppState" not in chat:
    chat = chat.replace(
        "import NetInfo from '@react-native-community/netinfo';",
        "import NetInfo from '@react-native-community/netinfo';\nimport { AppState } from 'react-native';"
    )
    print('Added AppState import to ChatScreen')

# Add refs for tracking after the existing refs
old_refs = '''  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState(route.params.focusQuery ?? '');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(!!route.params.focusQuery);
  const [isOffline, setIsOffline] = useState(false);
  const listRef = React.useRef<FlatList>(null);'''

new_refs = '''  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteApiStatusRef = useRef<'pending' | 'success' | 'error'>('pending');
  const wasOfflineRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState(route.params.focusQuery ?? '');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(!!route.params.focusQuery);
  const [isOffline, setIsOffline] = useState(false);
  const listRef = React.useRef<FlatList>(null);'''

if old_refs in chat:
    chat = chat.replace(old_refs, new_refs)
    print('Added deleteApiStatusRef and wasOfflineRef to ChatScreen')
else:
    print('Refs block not found in ChatScreen')

# Fix handleUndoDelete - disable if API delete succeeded
old_undo = '''  const handleUndoDelete = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setMessages((prev) => {
      const restored = [...recentlyDeleted];
      // Re-insert at approximate original positions by timestamp order
      const all = [...prev, ...restored];
      all.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      return all;
    });
    setRecentlyDeleted([]);
    show('Messages restored', 'success');
  };'''

new_undo = '''  const handleUndoDelete = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (deleteApiStatusRef.current === 'success') {
      show('Messages were deleted on the server and cannot be restored.', 'info');
      setRecentlyDeleted([]);
      return;
    }
    setMessages((prev) => {
      const restored = [...recentlyDeleted];
      const all = [...prev, ...restored];
      all.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      return all;
    });
    setRecentlyDeleted([]);
    show('Messages restored', 'success');
  };'''

if old_undo in chat:
    chat = chat.replace(old_undo, new_undo)
    print('Fixed handleUndoDelete in ChatScreen')
else:
    print('handleUndoDelete not found in ChatScreen')

# Fix handleBulkDelete - track API status
old_bulk = '''          onPress: async () => {
            haptic.medium();
            setRecentlyDeleted(toDelete);
            setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
            exitSelectionMode();
            scheduleUndoClear();
            await Promise.allSettled(
              toDelete.map((m) => deleteConversationMessageOnApi(conversationId, m.id))
            );
          },'''

new_bulk = '''          onPress: async () => {
            haptic.medium();
            deleteApiStatusRef.current = 'pending';
            setRecentlyDeleted(toDelete);
            setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
            exitSelectionMode();
            scheduleUndoClear();
            try {
              await Promise.all(
                toDelete.map((m) => deleteConversationMessageOnApi(conversationId, m.id))
              );
              deleteApiStatusRef.current = 'success';
            } catch {
              deleteApiStatusRef.current = 'error';
              show('Some messages may not have been deleted on the server.', 'error');
            }
          },'''

if old_bulk in chat:
    chat = chat.replace(old_bulk, new_bulk)
    print('Fixed handleBulkDelete in ChatScreen')
else:
    print('handleBulkDelete not found in ChatScreen')

# Fix handleDeleteMessage - track API status
old_single = '''          onPress: async () => {
            haptic.medium();
            setRecentlyDeleted([msg]);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            scheduleUndoClear();
            try {
              await deleteConversationMessageOnApi(conversationId, msg.id);
            } catch {
              show('Message deleted locally. It may still be visible to others.', 'info');
            }
          },'''

new_single = '''          onPress: async () => {
            haptic.medium();
            deleteApiStatusRef.current = 'pending';
            setRecentlyDeleted([msg]);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            scheduleUndoClear();
            try {
              await deleteConversationMessageOnApi(conversationId, msg.id);
              deleteApiStatusRef.current = 'success';
            } catch {
              deleteApiStatusRef.current = 'error';
              show('Message deleted locally. It may still be visible to others.', 'info');
            }
          },'''

if old_single in chat:
    chat = chat.replace(old_single, new_single)
    print('Fixed handleDeleteMessage in ChatScreen')
else:
    print('handleDeleteMessage not found in ChatScreen')

# Add reconciliation useEffect after the NetInfo effect
old_netinfo = '''  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);'''

new_netinfo = '''  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
      const isNowOffline = !state.isConnected;
      setIsOffline(isNowOffline);
      // Reconcile on reconnect
      if (wasOfflineRef.current && !isNowOffline) {
        void syncMessagesFromApi();
      }
      wasOfflineRef.current = isNowOffline;
    });
    return () => unsubscribe();
  }, []);

  const syncMessagesFromApi = async () => {
    setIsSyncing(true);
    try {
      const syncedMessages = await fetchConversationMessagesFromApi(conversationId);
      if (!syncedMessages.length) return;
      replaceConversationMessages(conversationId, syncedMessages);
    } catch {
      // Keep local state when sync unavailable
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        void syncMessagesFromApi();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [conversationId]);'''

if old_netinfo in chat:
    chat = chat.replace(old_netinfo, new_netinfo)
    print('Added reconciliation effects to ChatScreen')
else:
    print('NetInfo effect not found in ChatScreen')

# Remove duplicate sync effect if it exists after the above replacement
# The old sync effect was at lines 250-266
old_sync = '''  useEffect(() => {
    let cancelled = false;
    const syncMessagesFromApi = async () => {
      setIsSyncing(true);
      try {
        const syncedMessages = await fetchConversationMessagesFromApi(conversationId);
        if (cancelled || !syncedMessages.length) return;
        replaceConversationMessages(conversationId, syncedMessages);
      } catch {
        // Keep local state when sync unavailable
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    };
    void syncMessagesFromApi();
    return () => { cancelled = true; };
  }, [conversationId, replaceConversationMessages]);'''

if old_sync in chat:
    chat = chat.replace(old_sync, '')
    print('Removed duplicate sync effect from ChatScreen')
else:
    print('Duplicate sync effect not found')

with open(f'{frontend_dir}/screens/ChatScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(chat)

# ==========================================
# 2. Fix PaymentsScreen - remove rollback
# ==========================================
with open(f'{frontend_dir}/screens/PaymentsScreen.tsx', 'r', encoding='utf-8') as f:
    payments = f.read()

old_remove = '''          onPress: async () => {
            setBackendPaymentMethods((prev) => prev.filter((m) => m.id !== method.id));
            show('Payment method removed', 'info');
            try {
              const userId = currentUser?.id ?? 'u1';
              await deleteUserPaymentMethod(userId, method.id);
            } catch {
              // Already removed locally; silent backend failure is acceptable.
            }
          },'''

new_remove = '''          onPress: async () => {
            const previous = backendPaymentMethods;
            setBackendPaymentMethods((prev) => prev.filter((m) => m.id !== method.id));
            show('Payment method removed', 'info');
            try {
              const userId = currentUser?.id ?? 'u1';
              await deleteUserPaymentMethod(userId, method.id);
            } catch {
              show('Failed to remove on server. Restoring...', 'error');
              setBackendPaymentMethods(previous);
            }
          },'''

if old_remove in payments:
    payments = payments.replace(old_remove, new_remove)
    print('Fixed payment remove rollback in PaymentsScreen')
else:
    print('Payment remove not found in PaymentsScreen')

with open(f'{frontend_dir}/screens/PaymentsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(payments)

# ==========================================
# 3. Fix AddCardSheet - remove phantom save
# ==========================================
with open(f'{frontend_dir}/components/checkout/AddCardSheet.tsx', 'r', encoding='utf-8') as f:
    card = f.read()

old_card = '''    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save card right now.');
      if (parsed.isNetworkError) {
        savePaymentMethod(localPaymentMethod);
        show('Card saved locally. Backend sync unavailable.', 'info');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        shouldDismiss = false;
        show(parsed.message, 'error');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }'''

new_card = '''    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save card right now.');
      shouldDismiss = false;
      show(parsed.message, 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);'''

if old_card in card:
    card = card.replace(old_card, new_card)
    print('Fixed AddCardSheet phantom save')
else:
    print('AddCardSheet phantom save block not found')

with open(f'{frontend_dir}/components/checkout/AddCardSheet.tsx', 'w', encoding='utf-8') as f:
    f.write(card)

print('\nAll reality layer fixes applied!')
