import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FiServer, FiCloud, FiDatabase, FiGrid, FiShield, FiLayers } from 'react-icons/fi';

/**
 * AWS構成図を視覚的に表示するコンポーネント
 * 現在はシンプルな表示のみ、将来的にはDraw.io互換形式での表示を実装予定
 */
const AWSArchitectureDisplay = ({ architectureData }) => {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 });

  // コンポーネントアイコンを取得する関数
  const getComponentIcon = (type) => {
    const iconSize = 18;
    const iconProps = { size: iconSize };

    switch (type.toLowerCase()) {
      case 'vpc':
        return <FiCloud {...iconProps} />;
      case 'ec2':
      case 'instance':
        return <FiServer {...iconProps} />;
      case 'rds':
      case 'database':
      case 'dynamodb':
        return <FiDatabase {...iconProps} />;
      case 'subnet':
      case 'security-group':
        return <FiGrid {...iconProps} />;
      case 'waf':
      case 'firewall':
        return <FiShield {...iconProps} />;
      default:
        return <FiLayers {...iconProps} />;
    }
  };

  // リソースのための色を取得する関数
  const getResourceColor = (type) => {
    switch (type.toLowerCase()) {
      case 'vpc':
        return '#e8f4fa';
      case 'ec2':
      case 'instance':
        return '#fef3de';
      case 'rds':
      case 'database':
      case 'dynamodb':
        return '#e7f5e9';
      case 'subnet':
        return '#f2f2f2';
      case 'security-group':
        return '#fff8e1';
      case 'waf':
      case 'firewall':
        return '#ffebee';
      default:
        return '#f5f5f5';
    }
  };

  // Draw.io形式のエクスポート準備（プレースホルダー関数）
  const prepareDrawioExport = () => {
    alert('Draw.io形式へのエクスポート機能は開発中です。今後のアップデートをお待ちください。');
  };

  if (!architectureData) {
    return <div className="error-message">アーキテクチャデータが提供されていません</div>;
  }

  try {
    const { title, description, components } = architectureData;

    return (
      <ArchitectureContainer>
        <ArchitectureHeader>
          <Title>{title || 'AWSアーキテクチャ図'}</Title>
          {description && <Description>{description}</Description>}
          <ExportButton onClick={prepareDrawioExport}>
            Draw.io形式でエクスポート（準備中）
          </ExportButton>
        </ArchitectureHeader>

        <SimplifiedDiagram>
          {components && components.map((component, index) => (
            <ResourceCard
              key={index}
              backgroundColor={getResourceColor(component.type)}
            >
              <ResourceIcon>
                {getComponentIcon(component.type)}
              </ResourceIcon>
              <ResourceInfo>
                <ResourceName>{component.name}</ResourceName>
                <ResourceType>{component.type}</ResourceType>
                {component.details && (
                  <ResourceDetails>{component.details}</ResourceDetails>
                )}
              </ResourceInfo>
            </ResourceCard>
          ))}
        </SimplifiedDiagram>

        <CanvasContainer>
          <p>インタラクティブな構成図表示は開発中です</p>
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{ border: '1px dashed #ccc', display: 'none' }}
          />
        </CanvasContainer>
        
        <Disclaimer>
          * これは簡易的な表示です。より詳細な構成図は今後のアップデートで提供予定です。
        </Disclaimer>
      </ArchitectureContainer>
    );
  } catch (error) {
    console.error('Error rendering AWS architecture data:', error);
    return (
      <ErrorContainer>
        <p>アーキテクチャデータの表示中にエラーが発生しました。</p>
        <p>詳細: {error.message}</p>
      </ErrorContainer>
    );
  }
};

// スタイル定義
const ArchitectureContainer = styled.div`
  background-color: #f8f9fa;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  padding: 20px;
  margin: 15px 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const ArchitectureHeader = styled.div`
  margin-bottom: 20px;
`;

const Title = styled.h3`
  margin: 0 0 8px 0;
  color: #232f3e;
  font-size: 1.3rem;
  font-weight: 600;
`;

const Description = styled.p`
  margin: 0 0 15px 0;
  color: #666;
  font-size: 0.95rem;
`;

const ExportButton = styled.button`
  background-color: #eaeaea;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  color: #555;
  
  &:hover {
    background-color: #d5d5d5;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SimplifiedDiagram = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
`;

const ResourceCard = styled.div`
  background-color: ${props => props.backgroundColor || '#f5f5f5'};
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 15px;
  display: flex;
  align-items: flex-start;
  transition: transform 0.2s, box-shadow 0.2s;
  
  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
`;

const ResourceIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background-color: white;
  border-radius: 50%;
  margin-right: 12px;
  color: #232f3e;
  border: 1px solid #ddd;
`;

const ResourceInfo = styled.div`
  flex: 1;
`;

const ResourceName = styled.div`
  font-weight: 600;
  margin-bottom: 3px;
  color: #232f3e;
`;

const ResourceType = styled.div`
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 8px;
`;

const ResourceDetails = styled.div`
  font-size: 0.85rem;
  white-space: pre-wrap;
  color: #444;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 5px;
  border-radius: 4px;
`;

const CanvasContainer = styled.div`
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  
  p {
    font-style: italic;
    color: #666;
    margin-bottom: 10px;
  }
`;

const Disclaimer = styled.div`
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
`;

const ErrorContainer = styled.div`
  background-color: #fff0f0;
  border: 1px solid #ffcccc;
  border-radius: 8px;
  padding: 15px;
  margin: 15px 0;
  color: #d32f2f;
`;

export default AWSArchitectureDisplay;
