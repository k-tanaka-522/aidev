// Cognito設定
export const cognitoConfig = {
  region: 'ap-northeast-1',
  userPoolId: 'ap-northeast-1_LzLiECPKf',
  userPoolWebClientId: '70mqmo9sh0orcovhvrlll0dsou',
  identityPoolId: 'ap-northeast-1:09caa6d8-7bc6-4551-bb13-f650413fdb6b'
};

// 本番環境では環境変数から取得することを推奨
// export const cognitoConfig = {
//   region: process.env.REACT_APP_COGNITO_REGION,
//   userPoolId: process.env.REACT_APP_USER_POOL_ID,
//   userPoolWebClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
//   identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID
// };