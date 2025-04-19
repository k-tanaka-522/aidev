// Sample Lambda function for aiDev backend
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));
   
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Hello from aiDev backend\!',
      timestamp: new Date().toISOString()
    })
  };
};
