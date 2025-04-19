import React from 'react';
import styled from 'styled-components';
import { VscRobot, VscPerson, VscTools, VscServer } from 'react-icons/vsc';

const agentTypes = [
  {
    id: 'default',
    name: 'デフォルトアシスタント',
    description: 'AWS環境構築や開発に関する一般的な質問に回答します',
    icon: <VscRobot size={24} />
  },
  {
    id: 'preSales',
    name: 'プリセールスエージェント',
    description: 'AWS環境構築や開発の初期相談、コスト見積り、要件定義などをサポートします',
    icon: <VscPerson size={24} />
  },
  {
    id: 'itConsultant',
    name: 'ITコンサルタントエージェント',
    description: 'IT戦略、技術選定、アーキテクチャなどの専門的なアドバイスを提供します',
    icon: <VscTools size={24} />
  },
  {
    id: 'systemArchitect',
    name: 'システムアーキテクトエージェント',
    description: 'AWS環境の詳細設計や構築支援、IaCコードの生成などを行います',
    icon: <VscServer size={24} />
  }
];

const AgentSelector = ({ currentAgent, onAgentChange }) => {
  return (
    <Container>
      <Title>エージェントタイプを選択</Title>
      <Description>
        質問内容に応じて最適なエージェントを選択してください。
        エージェントの種類によって、回答の専門性や詳細さが変わります。
        それぞれの特徴を理解して、最適なエージェントをお選びください。
      </Description>
      
      <AgentList>
        {agentTypes.map(agent => (
          <AgentOption
            key={agent.id}
            selected={currentAgent === agent.id}
            onClick={() => onAgentChange(agent.id)}
          >
            <IconContainer selected={currentAgent === agent.id}>
              {agent.icon}
            </IconContainer>
            
            <AgentInfo>
              <AgentName>{agent.name}</AgentName>
              <AgentDescription>{agent.description}</AgentDescription>
            </AgentInfo>
          </AgentOption>
        ))}
      </AgentList>
    </Container>
  );
};

// スタイル定義
const Container = styled.div`
  padding: 10px;
`;

const Title = styled.h3`
  margin: 0 0 10px 0;
  color: #333;
`;

const Description = styled.p`
  margin: 0 0 15px 0;
  color: #666;
  font-size: 0.9rem;
`;

const AgentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const AgentOption = styled.div`
  display: flex;
  align-items: center;
  padding: 15px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: ${props => props.selected ? '#e3f2fd' : 'white'};
  border: 1px solid ${props => props.selected ? '#0078d4' : '#ddd'};
  
  &:hover {
    background-color: ${props => props.selected ? '#e3f2fd' : '#f5f5f5'};
  }
`;

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${props => props.selected ? '#0078d4' : '#eee'};
  color: ${props => props.selected ? 'white' : '#666'};
  margin-right: 15px;
  transition: all 0.2s;
`;

const AgentInfo = styled.div`
  flex: 1;
`;

const AgentName = styled.h4`
  margin: 0 0 5px 0;
  color: #333;
`;

const AgentDescription = styled.p`
  margin: 0;
  color: #666;
  font-size: 0.85rem;
`;

export default AgentSelector;
