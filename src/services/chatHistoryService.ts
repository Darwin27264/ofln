import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  showThought?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
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

  async saveChat(messages: Message[], chatId?: string | null): Promise<string> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      const history: ChatConversation[] = historyJson ? JSON.parse(historyJson) : [];
      
      // Filter out system messages for title and preview
      const userMessages = messages.filter(m => m.role === 'user');
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      
      const title = userMessages[0]?.content.slice(0, 50) || 'New Chat';
      const preview = assistantMessages[0]?.content.slice(0, 100) || '';
      
      const now = Date.now();
      
      if (chatId) {
        // Update existing chat
        const index = history.findIndex(chat => chat.id === chatId);
        if (index !== -1) {
          history[index] = {
            ...history[index],
            title,
            preview,
            messages,
            updatedAt: now,
          };
        } else {
          // If chat ID doesn't exist, create new
          const newChat: ChatConversation = {
            id: chatId,
            title,
            preview,
            messages,
            createdAt: now,
            updatedAt: now,
          };
          history.unshift(newChat);
        }
      } else {
        // Create new chat
        const newChat: ChatConversation = {
          id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`,
          title,
          preview,
          messages,
          createdAt: now,
          updatedAt: now,
        };
        history.unshift(newChat);
        chatId = newChat.id;
      }
      
      // Limit history size
      if (history.length > MAX_CHAT_HISTORY) {
        history.splice(MAX_CHAT_HISTORY);
      }
      
      // Sort by updatedAt descending
      history.sort((a, b) => b.updatedAt - a.updatedAt);
      
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
      return chatId;
    } catch (error) {
      console.error('Error saving chat:', error);
      throw error;
    }
  }

  async getAllChats(): Promise<ChatConversation[]> {
    await this.initialize();
    
    try {
      const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (!historyJson) return [];
      
      const history: ChatConversation[] = JSON.parse(historyJson);
      return history.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Error loading chat history:', error);
      return [];
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
}

export const chatHistoryService = new ChatHistoryService();

