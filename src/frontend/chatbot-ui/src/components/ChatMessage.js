import React from 'react';
import styled from 'styled-components';
import { FiUser } from 'react-icons/fi';
import { VscRobot } from 'react-icons/vsc';
import { VscWand } from 'react-icons/vsc';
import AiMessageParser from './AiMessageParser';

const ChatMessage = ({ message }) => {
  const { role, content, timestamp } = message;
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // メッセージの種類に基づいてアイコンとスタイルを選択
  const getMessageStyle = () => {
    switch (role) {
      case 'user':
        return {
          icon: <FiUser size={20} />,
          bgColor: '#f0f7ff',
          align: 'flex-end',
          iconBgColor: '#0078d4'
        };
      case 'assistant':
        return {
          icon: <VscRobot size={20} />,
          bgColor: '#f7f7f7',
          align: 'flex-start',
          iconBgColor: '#5c5c5c'
        };
      case 'system':
        return {
          icon: <VscWand size={20} />,
          bgColor: '#fff0f0',
          align: 'center',
          iconBgColor: '#d40000'
        };
      default:
        return {
          icon: <FiUser size={20} />,
          bgColor: '#f0f7ff',
          align: 'flex-end',
          iconBgColor: '#0078d4'
        };
    }
  };
  
  const style = getMessageStyle();

  return (
    <MessageContainer align={style.align}>
      <MessageBubble bgColor={style.bgColor} role={role}>
        <IconContainer bgColor={style.iconBgColor}>
          {style.icon}
        </IconContainer>
        
        <ContentContainer>
          {/* すべてのメッセージでAiMessageParserを使用 */}
          <AiMessageParser content={content} />
        </ContentContainer>
        
        <Timestamp>{formatTime(timestamp)}</Timestamp>
      </MessageBubble>
    </MessageContainer>
  );
};

// スタイル定義
const MessageContainer = styled.div`
  display: flex;
  justify-content: ${props => props.align};
  margin-bottom: 20px;
`;

const MessageBubble = styled.div`
  display: flex;
  max-width: 80%;
  border-radius: 12px;
  padding: 12px;
  position: relative;
  background-color: ${props => props.bgColor};
  align-items: flex-start;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  width: ${props => props.role === 'system' ? '100%' : 'auto'};
`;

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: ${props => props.bgColor};
  color: white;
  margin-right: 12px;
  flex-shrink: 0;
`;

const ContentContainer = styled.div`
  flex: 1;
  word-break: break-word;
  
  p {
    margin: 0 0 10px 0;
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  pre {
    margin: 10px 0;
    border-radius: 6px;
    overflow: auto;
  }
  
  code {
    font-family: 'Consolas', 'Monaco', monospace;
    background-color: rgba(0, 0, 0, 0.05);
    padding: 2px 4px;
    border-radius: 3px;
  }
  
  ul, ol {
    margin: 10px 0;
    padding-left: 20px;
  }
`;

const Timestamp = styled.div`
  font-size: 0.7rem;
  color: #999;
  margin-left: 10px;
  align-self: flex-end;
`;

export default ChatMessage;
