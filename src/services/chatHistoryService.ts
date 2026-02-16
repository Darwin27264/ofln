import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MessageAttachment {
  type: 'image';
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  showThought?: boolean;
  attachments?: MessageAttachment[];
}

export interface ChatConversation {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  customTitle?: string; // User-defined custom title
}

const CHAT_HISTORY_KEY = '@chat_history';
const MAX_CHAT_HISTORY = 100; // Maximum number of chats to store

class ChatHistoryService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const history = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!history) {
        await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([]));
      }
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing chat history:', error);
      this.initialized = true; // Set to true even on error to prevent infinite loops
    }
  }

  /**
   * Save or update a chat conversation
   * 
   * Handles both creating new chats and updating existing ones.
   * Automatically generates title from first user message.
   * Preserves custom titles and pinned status on updates.
   * 
   * @param messages - Array of conversation messages
   * @param chatId - Optional existing chat ID for updates
   * @returns Promise<string> - The chat ID (new or existing)
   * 
   * Edge cases handled:
   * - Empty message arrays
   * - Missing user messages (uses default title)
   * - Large message arrays (limited to MAX_CHAT_HISTORY)
   * - Storage failures (throws error for caller to handle)
   */
  async saveChat(messages: Message[], chatId?: string | null): Promise<string> {
    await this.initialize();
    
    try {
      // Validate messages array
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Invalid messages array provided to saveChat');
      }

      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      const history: ChatConversation[] = historyJson ? JSON.parse(historyJson) : [];
      
      // Filter out system messages for title and preview
      const userMessages = messages.filter(m => m.role === 'user');
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      
      // Generate title from first user message (max 50 chars)
      const defaultTitle = userMessages[0]?.content.slice(0, 50) || 'New Chat';
      // Generate preview from first assistant message (max 100 chars)
      const preview = assistantMessages[0]?.content.slice(0, 100) || '';
      
      const now = Date.now();
      
      if (chatId) {
        // Update existing chat
        const index = history.findIndex(chat => chat.id === chatId);
        if (index !== -1) {
          // Preserve custom title and pinned status if they exist
          const existingChat = history[index];
          
          // Check if messages have actually changed (compare message count and content)
          const messagesChanged = 
            existingChat.messages.length !== messages.length ||
            JSON.stringify(existingChat.messages) !== JSON.stringify(messages);
          
          // Only update updatedAt if messages have actually changed
          const newUpdatedAt = messagesChanged ? now : existingChat.updatedAt;
          
          history[index] = {
            ...existingChat,
            title: existingChat.customTitle || defaultTitle,
            preview,
            messages,
            updatedAt: newUpdatedAt,
            // Preserve pinned status and customTitle
            pinned: existingChat.pinned,
            customTitle: existingChat.customTitle,
          };
        } else {
          // If chat ID doesn't exist, create new
          const newChat: ChatConversation = {
            id: chatId,
            title: defaultTitle,
            preview,
            messages,
            createdAt: now,
            updatedAt: now,
            pinned: false,
          };
          history.unshift(newChat);
        }
      } else {
        // Create new chat
        const newChat: ChatConversation = {
          id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`,
          title: defaultTitle,
          preview,
          messages,
          createdAt: now,
          updatedAt: now,
          pinned: false,
        };
        history.unshift(newChat);
        chatId = newChat.id;
      }
      
      // Limit history size
      if (history.length > MAX_CHAT_HISTORY) {
        history.splice(MAX_CHAT_HISTORY);
      }
      
      // Sort by createdAt descending (preserve original order, newest first)
      // This ensures chats maintain their position even when selected
      history.sort((a, b) => b.createdAt - a.createdAt);
      
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
      return chatId;
    } catch (error) {
      console.error('Error saving chat:', error);
      throw error;
    }
  }

  async getChat(chatId: string): Promise<ChatConversation | null> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return null;
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      return history.find(chat => chat.id === chatId) || null;
    } catch (error) {
      console.error('Error getting chat:', error);
      return null;
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return false;
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      const filtered = history.filter(chat => chat.id !== chatId);
      
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      return false;
    }
  }

  async deleteMultipleChats(chatIds: string[]): Promise<boolean> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return false;
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      const chatIdsSet = new Set(chatIds);
      const filtered = history.filter(chat => !chatIdsSet.has(chat.id));
      
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('Error deleting multiple chats:', error);
      return false;
    }
  }

  async clearAllChats(): Promise<boolean> {
    await this.initialize();
    
    try {
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([]));
      return true;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
  }

  async renameChat(chatId: string, newTitle: string): Promise<boolean> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return false;
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      const chatIndex = history.findIndex(chat => chat.id === chatId);
      
      if (chatIndex === -1) return false;
      
      history[chatIndex] = {
        ...history[chatIndex],
        customTitle: newTitle.trim() || undefined,
        title: newTitle.trim() || history[chatIndex].title,
      };
      
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (error) {
      console.error('Error renaming chat:', error);
      return false;
    }
  }

  async togglePinChat(chatId: string): Promise<boolean> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return false;
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      const chatIndex = history.findIndex(chat => chat.id === chatId);
      
      if (chatIndex === -1) return false;
      
      history[chatIndex] = {
        ...history[chatIndex],
        pinned: !history[chatIndex].pinned,
      };
      
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (error) {
      console.error('Error toggling pin chat:', error);
      return false;
    }
  }

  async getAllChats(): Promise<ChatConversation[]> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return [];
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      // Return sorted by createdAt descending, but preserve pinned status
      return history.sort((a, b) => {
        // First sort by pinned status (pinned first)
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then by createdAt descending (newest first, preserves original order)
        return b.createdAt - a.createdAt;
      });
    } catch (error) {
      console.error('Error loading chat history:', error);
      return [];
    }
  }
}

export const chatHistoryService = new ChatHistoryService();

