import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import AWSPricingDisplay from './AWSPricingDisplay';
import AWSArchitectureDisplay from './AWSArchitectureDisplay';

/**
 * AIメッセージを解析して特殊フォーマットを認識するコンポーネント
 * 現在サポートしている特殊フォーマット:
 * - ```aws-pricing``` - AWS料金計算結果
 * - ```aws-architecture``` - AWS構成図
 */
const AiMessageParser = ({ content }) => {
  // 特殊なコードブロックをパースする関数
  const parseSpecialCodeBlocks = (markdown) => {
    if (!markdown) return { parsedContent: '', specialBlocks: [] };

    // 正規表現で```aws-xxx```形式のブロックを検出
    const regex = /```(aws-[a-z-]+)\n([\s\S]*?)```/g;
    const specialBlocks = [];
    let match;
    let lastIndex = 0;
    let result = '';

    // コードブロックを検出して配列に格納
    while ((match = regex.exec(markdown)) !== null) {
      // マッチする前のテキストを追加
      result += markdown.substring(lastIndex, match.index);
      
      // 特殊ブロックの情報を格納
      specialBlocks.push({
        type: match[1],
        content: match[2],
        placeholder: `__SPECIAL_BLOCK_${specialBlocks.length}__`
      });
      
      // プレースホルダーを追加
      result += `__SPECIAL_BLOCK_${specialBlocks.length - 1}__`;
      
      lastIndex = match.index + match[0].length;
    }
    
    // 残りのテキストを追加
    result += markdown.substring(lastIndex);
    
    return { parsedContent: result, specialBlocks };
  };

  // 特殊ブロックをレンダリングする関数
  const renderSpecialBlock = (block) => {
    switch (block.type) {
      case 'aws-pricing':
        try {
          const pricingData = JSON.parse(block.content);
          return <AWSPricingDisplay pricingData={pricingData} />;
        } catch (error) {
          console.error('Error parsing AWS pricing data:', error);
          return <div className="error-block">料金データの解析に失敗しました</div>;
        }
      
      case 'aws-architecture':
        try {
          const architectureData = JSON.parse(block.content);
          return <AWSArchitectureDisplay architectureData={architectureData} />;
        } catch (error) {
          console.error('Error parsing AWS architecture data:', error);
          return <div className="error-block">アーキテクチャデータの解析に失敗しました</div>;
        }
      
      default:
        return <div>未サポートの特殊ブロック: {block.type}</div>;
    }
  };

  // メインのレンダリングロジック
  const { parsedContent, specialBlocks } = parseSpecialCodeBlocks(content);
  
  // 特殊ブロックを含まないテキストの場合は通常のMarkdownコンポーネントを使用
  if (specialBlocks.length === 0) {
    return (
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }

  // 特殊ブロックを含むテキストはパーツごとに処理
  const parts = parsedContent.split(/__SPECIAL_BLOCK_(\d+)__/);
  const renderedParts = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // 通常のテキスト部分
      if (parts[i]) {
        renderedParts.push(
          <ReactMarkdown
            key={`text-${i}`}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {parts[i]}
          </ReactMarkdown>
        );
      }
    } else {
      // 特殊ブロック
      const blockIndex = parseInt(parts[i], 10);
      if (!isNaN(blockIndex) && blockIndex < specialBlocks.length) {
        renderedParts.push(
          <div key={`special-${blockIndex}`} className="special-block-container">
            {renderSpecialBlock(specialBlocks[blockIndex])}
          </div>
        );
      }
    }
  }

  return <div className="ai-message-content">{renderedParts}</div>;
};

export default AiMessageParser;
