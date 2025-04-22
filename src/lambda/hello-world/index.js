// Hello World Lambda関数
exports.handler = async (event) => {
  console.log('Hello World Lambda関数が呼び出されました');
  console.log('イベント:', JSON.stringify(event, null, 2));
  
  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'こんにちは！aiDevプロジェクトへようこそ。',
      environment: process.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString()
    })
  };
  
  return response;
};
// テスト用コメント追加
