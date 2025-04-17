const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

// クライアントの初期化
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// 環境変数
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const SESSION_TABLE = `aiDev-${ENVIRONMENT}-sessions`;

/**
 * Lambda ハンドラー
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));
  
  try {
    // APIパスに基づいて処理を分岐
    const path = event.path;
    
    if (path.endsWith('/auth/signup')) {
      return await handleSignup(event);
    } else if (path.endsWith('/auth/login')) {
      return await handleLogin(event);
    } else {
      return formatResponse(404, { error: 'Not Found' });
    }
  } catch (error) {
    console.error('Error:', error);
    return formatResponse(500, { error: 'Internal Server Error', message: error.message });
  }
};

/**
 * サインアップ処理
 */
async function handleSignup(event) {
  const body = JSON.parse(event.body || '{}');
  const { email, password, name } = body;
  
  if (!email || !password || !name) {
    return formatResponse(400, { 
      error: 'Bad Request', 
      message: 'email, password, nameは必須パラメータです' 
    });
  }
  
  try {
    // Cognitoへのサインアップリクエスト
    const signUpParams = {
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email
        },
        {
          Name: 'name',
          Value: name
        }
      ]
    };
    
    const signUpCommand = new SignUpCommand(signUpParams);
    const signUpResponse = await cognitoClient.send(signUpCommand);
    
    // 成功レスポンス
    return formatResponse(200, {
      success: true,
      message: 'サインアップが完了しました。メールで送信された確認コードを入力してください。',
      userId: email,
      userSub: signUpResponse.UserSub
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // エラーメッセージのマッピング
    let statusCode = 500;
    let message = 'サインアップ処理中にエラーが発生しました';
    
    if (error.name === 'UsernameExistsException') {
      statusCode = 409;
      message = 'このメールアドレスは既に登録されています';
    } else if (error.name === 'InvalidPasswordException') {
      statusCode = 400;
      message = 'パスワードの形式が正しくありません';
    } else if (error.name === 'InvalidParameterException') {
      statusCode = 400;
      message = '入力パラメータが不正です';
    }
    
    return formatResponse(statusCode, { error: error.name, message });
  }
}

/**
 * ログイン処理
 */
async function handleLogin(event) {
  const body = JSON.parse(event.body || '{}');
  const { email, password } = body;
  
  if (!email || !password) {
    return formatResponse(400, { 
      error: 'Bad Request', 
      message: 'emailとpasswordは必須パラメータです' 
    });
  }
  
  try {
    // Cognitoへの認証リクエスト
    const authParams = {
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };
    
    const authCommand = new InitiateAuthCommand(authParams);
    const authResponse = await cognitoClient.send(authCommand);
    
    // 認証トークン
    const tokens = {
      accessToken: authResponse.AuthenticationResult.AccessToken,
      idToken: authResponse.AuthenticationResult.IdToken,
      refreshToken: authResponse.AuthenticationResult.RefreshToken,
      expiresIn: authResponse.AuthenticationResult.ExpiresIn
    };
    
    // ユーザー情報の取得
    const userData = await getUserData(tokens.accessToken);
    
    // セッション情報の保存
    const sessionId = await storeSessionInfo(userData.sub, userData.email, userData.name);
    
    // 成功レスポンス
    return formatResponse(200, {
      success: true,
      message: 'ログインに成功しました',
      tokens,
      user: {
        userId: userData.sub,
        email: userData.email,
        name: userData.name
      },
      sessionId
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // エラーメッセージのマッピング
    let statusCode = 500;
    let message = 'ログイン処理中にエラーが発生しました';
    
    if (error.name === 'NotAuthorizedException') {
      statusCode = 401;
      message = 'メールアドレスまたはパスワードが正しくありません';
    } else if (error.name === 'UserNotConfirmedException') {
      statusCode = 403;
      message = 'メールアドレスの確認が完了していません';
    } else if (error.name === 'UserNotFoundException') {
      statusCode = 404;
      message = 'ユーザーが見つかりません';
    }
    
    return formatResponse(statusCode, { error: error.name, message });
  }
}

/**
 * アクセストークンからユーザー情報を取得
 */
async function getUserData(accessToken) {
  try {
    const getUserCommand = new GetUserCommand({
      AccessToken: accessToken
    });
    
    const response = await cognitoClient.send(getUserCommand);
    
    // 属性からデータを取得
    const userData = {
      sub: '',
      email: '',
      name: ''
    };
    
    response.UserAttributes.forEach(attr => {
      if (attr.Name === 'sub') userData.sub = attr.Value;
      if (attr.Name === 'email') userData.email = attr.Value;
      if (attr.Name === 'name') userData.name = attr.Value;
    });
    
    return userData;
  } catch (error) {
    console.error('Get user data error:', error);
    throw error;
  }
}

/**
 * セッション情報をDynamoDBに保存
 */
async function storeSessionInfo(userId, email, name) {
  try {
    const sessionId = `session_${uuidv4()}`;
    const timestamp = Date.now();
    
    // セッション情報の作成
    const sessionItem = {
      sessionId,
      userId,
      email,
      name,
      createdAt: timestamp,
      lastActivity: timestamp,
      currentAgent: 'default',
      state: {
        topics: [],
        requirementsGathered: false
      }
    };
    
    // DynamoDBに保存
    await docClient.send(new PutCommand({
      TableName: SESSION_TABLE,
      Item: sessionItem
    }));
    
    return sessionId;
  } catch (error) {
    console.error('Session store error:', error);
    return null;
  }
}

/**
 * API Gateway向けのレスポンス形式を生成
 */
function formatResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
    },
    body: JSON.stringify(body)
  };
}
