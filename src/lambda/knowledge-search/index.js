// ナレッジベース検索Lambda関数
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
  console.log('ナレッジベース検索関数が呼び出されました');
  console.log('イベント:', JSON.stringify(event, null, 2));
  
  try {
    // リクエストボディの解析
    const requestBody = JSON.parse(event.body || '{}');
    const query = requestBody.query || '';
    
    if (!query) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: '検索クエリが指定されていません'
        })
      };
    }
    
    // 現段階ではモックレスポンスを返す
    // 後でBedrockやS3の実際のナレッジベースと連携する
    const mockResults = [
      {
        id: '1',
        title: 'AWS環境構築ガイド',
        excerpt: 'AWSでのセキュアな環境構築方法の基本的なガイドラインです。',
        relevance: 0.95
      },
      {
        id: '2',
        title: 'CI/CDパイプラインの設計',
        excerpt: 'AWS CodePipelineを使用した効率的なCI/CDパイプラインの構築方法。',
        relevance: 0.85
      },
      {
        id: '3',
        title: 'サーバーレスアーキテクチャの利点',
        excerpt: 'AWS Lambdaを中心としたサーバーレスアーキテクチャの利点とユースケース。',
        relevance: 0.75
      }
    ];
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        results: mockResults,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('エラーが発生しました:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      })
    };
  }
};
