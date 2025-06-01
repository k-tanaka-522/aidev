import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { FiSend, FiUser, FiSettings, FiLogOut } from 'react-icons/fi';
import { VscHubot } from 'react-icons/vsc';
import ChatMessage from './components/ChatMessage';
import AgentSelector from './components/AgentSelector';
import AuthContainer from './components/auth/AuthContainer';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'http://localhost:3001/api';
const DEFAULT_AGENT_TYPE = process.env.REACT_APP_DEFAULT_AGENT_TYPE || 'default';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState('');
  const [chatId, setChatId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [agentType, setAgentType] = useState(DEFAULT_AGENT_TYPE);
  
  const messagesEndRef = useRef(null);
  
  // アプリ起動時に認証状態を確認
  useEffect(() => {
    checkAuthState();
  }, []);
  
  // 認証状態の確認（Cognitoセッションの確認）
  const checkAuthState = async () => {
    try {
      const storedUser = localStorage.getItem('aidev_user');
      
      if (storedUser) {
        const user = JSON.parse(storedUser);
        
        // Cognitoセッションの確認（トークンの有効性チェック）
        const { AuthService } = await import('./services/authService');
        await AuthService.getCurrentSession();
        
        setIsAuthenticated(true);
        setUser(user);
        setUserId(user.userId);
        
        // チャット初期化メッセージ
        const welcomeMessage = {
          role: 'system',
          content: `ようこそ、${user.name}さん。aiDevアシスタントがお手伝いします。`,
          timestamp: Date.now()
        };
        
        setMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error('Auth state check error:', error);
      handleLogout();
    }
  };
  
  // ログイン処理
  const handleLogin = (authData) => {
    setIsAuthenticated(true);
    setUser(authData.user);
    setUserId(authData.user.userId);
    
    // チャット初期化メッセージ
    const welcomeMessage = {
      role: 'system',
      content: `ようこそ、${authData.user.name}さん。aiDevアシスタントがお手伝いします。`,
      timestamp: Date.now()
    };
    
    setMessages([welcomeMessage]);
  };
  
  // ログアウト処理
  const handleLogout = () => {
    // ローカルストレージからトークンを削除
    localStorage.removeItem('aidev_tokens');
    localStorage.removeItem('aidev_user');
    localStorage.removeItem('aidev_session_id');
    
    // 状態をリセット
    setIsAuthenticated(false);
    setUser(null);
    setUserId('');
    setChatId(null);
    setMessages([]);
    setInput('');
  };

  // チャット画面を最下部にスクロール
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    // ユーザーメッセージをUIに追加
    const userMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // APIリクエスト
      const response = await axios.post(`${API_ENDPOINT}/chat`, {
        userId,
        chatId,
        message: input,
        agentType
      });
      
      // 応答データの処理
      const { chatId: newChatId, message: aiResponse } = response.data;
      
      // 新しいチャットIDを保存
      if (!chatId && newChatId) {
        setChatId(newChatId);
      }
      
      // AIの応答をUIに追加
      const aiMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
    } catch (error) {
      console.error('エラー:', error);
      
      // エラーメッセージをUIに表示
      const errorMessage = {
        role: 'system',
        content: 'メッセージの送信中にエラーが発生しました。もう一度お試しください。',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgentChange = (newAgentType) => {
    setAgentType(newAgentType);
    setChatId(null); // 新しい会話を開始
    setMessages([]); // メッセージをクリア
    
    // エージェント変更メッセージを表示
    const systemMessage = {
      role: 'system',
      content: `エージェントタイプを「${newAgentType}」に変更しました。新しい会話を開始します。`,
      timestamp: Date.now()
    };
    
    setMessages([systemMessage]);
    setShowSettings(false);
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  return (
    <>
      {!isAuthenticated ? (
        // 未認証の場合は認証画面を表示
        <AuthContainer onLogin={handleLogin} />
      ) : (
        // 認証済みの場合はチャット画面を表示
        <AppContainer>
          <Header>
            <Title>
              <VscHubot size={24} style={{ marginRight: '10px' }} />
              aiDev チャット
            </Title>
            <HeaderButtons>
              {user && (
                <UserInfo>
                  <UserName>{user.name}</UserName>
                </UserInfo>
              )}
              <SettingsButton onClick={toggleSettings}>
                <FiSettings size={20} />
              </SettingsButton>
              <LogoutButton onClick={handleLogout}>
                <FiLogOut size={20} />
              </LogoutButton>
            </HeaderButtons>
          </Header>
          
          {showSettings && (
            <SettingsPanel>
              <AgentSelector 
                currentAgent={agentType} 
                onAgentChange={handleAgentChange} 
              />
            </SettingsPanel>
          )}
          
          <ChatContainer>
            <MessageList>
              {messages.length === 0 && (
                <WelcomeMessage>
                  <VscHubot size={50} style={{ marginBottom: '20px' }} />
                  <h2>aiDevアシスタントへようこそ！</h2>
                  <p>AWS環境構築や開発に関するご質問にお答えします。</p>
                  <p>質問を入力してください。</p>
                </WelcomeMessage>
              )}
              
              {messages.map((msg, index) => (
                <ChatMessage key={index} message={msg} />
              ))}
              
              {isLoading && (
                <LoadingIndicator>
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </LoadingIndicator>
              )}
              
              <div ref={messagesEndRef} />
            </MessageList>
            
            <InputForm onSubmit={handleSendMessage}>
              <UserIcon>
                <FiUser size={18} />
              </UserIcon>
              <InputField
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="メッセージを入力..."
                disabled={isLoading}
              />
              <SendButton type="submit" disabled={!input.trim() || isLoading}>
                <FiSend size={18} />
              </SendButton>
            </InputForm>
          </ChatContainer>
        </AppContainer>
      )}
    </>
  );
};

// スタイル定義
const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
  background-color: #0078d4;
  color: white;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
`;

const SettingsButton = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 5px;
  border-radius: 50%;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;

const SettingsPanel = styled.div`
  padding: 15px;
  background-color: #f0f0f0;
  border-bottom: 1px solid #ddd;
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: white;
  overflow: hidden;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
`;

const WelcomeMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  color: #666;
  padding: 20px;
  
  h2 {
    margin: 0 0 10px 0;
    color: #333;
  }
  
  p {
    margin: 5px 0;
  }
`;

const InputForm = styled.form`
  display: flex;
  align-items: center;
  padding: 15px;
  border-top: 1px solid #eee;
  background-color: white;
`;

const UserIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: #0078d4;
  color: white;
  margin-right: 10px;
`;

const InputField = styled.input`
  flex: 1;
  padding: 12px 15px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 1rem;
  outline: none;
  
  &:focus {
    border-color: #0078d4;
  }
  
  &:disabled {
    background-color: #f7f7f7;
  }
`;

const SendButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${props => props.disabled ? '#ccc' : '#0078d4'};
  color: white;
  border: none;
  margin-left: 10px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: background-color 0.2s;
  
  &:hover:not(:disabled) {
    background-color: #006abc;
  }
`;

const HeaderButtons = styled.div`
  display: flex;
  align-items: center;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  margin-right: 15px;
`;

const UserName = styled.span`
  font-size: 0.9rem;
  margin-right: 5px;
`;

const LogoutButton = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 5px;
  border-radius: 50%;
  margin-left: 5px;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 20px;
  
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #007ACC;
    margin: 0 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  
  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  
  @keyframes pulse {
    0%, 80%, 100% {
      opacity: 0.3;
      transform: scale(1);
    }
    40% {
      opacity: 1;
      transform: scale(1.2);
    }
  }
`;

export default App;
