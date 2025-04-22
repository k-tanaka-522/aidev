// 最小限のLambda関数 - CI/CDパイプラインを通すためだけの実装
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from aiDev sample Lambda function',
      timestamp: new Date().toISOString()
    })
  };
  
  return response;
};
