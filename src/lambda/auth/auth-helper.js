/**
 * aiDev 認証ヘルパーユーティリティ
 * Cognitoとの連携処理を簡略化する関数群
 */

const { 
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// 環境変数
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

// クライアントの初期化
const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION });
const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * ユーザー登録（サインアップ）
 */
const signUp = async (email, password, name, company = '') => {
  try {
    const params = {
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
        { Name: 'custom:company', Value: company }
      ]
    };

    const command = new SignUpCommand(params);
    const response = await cognitoClient.send(command);

    return {
      success: true,
      userSub: response.UserSub,
      userConfirmed: response.UserConfirmed,
      message: 'ユーザー登録が完了しました。メールアドレスの確認を行ってください。'
    };
  } catch (error) {
    console.error('サインアップエラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * メールアドレス確認コードによるユーザー確認
 */
const confirmSignUp = async (email, confirmationCode) => {
  try {
    const params = {
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode
    };

    const command = new ConfirmSignUpCommand(params);
    await cognitoClient.send(command);

    return {
      success: true,
      message: 'メールアドレスの確認が完了しました。ログインしてください。'
    };
  } catch (error) {
    console.error('サインアップ確認エラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * ユーザーログイン
 */
const login = async (email, password) => {
  try {
    const params = {
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };

    const command = new InitiateAuthCommand(params);
    const response = await cognitoClient.send(command);

    // 認証チャレンジがある場合の対応
    if (response.ChallengeName) {
      return {
        success: false,
        challengeName: response.ChallengeName,
        session: response.Session,
        message: '追加の認証ステップが必要です。'
      };
    }

    // DynamoDBにユーザーのログイン情報を更新
    await updateUserLoginTimestamp(response.AuthenticationResult.AccessToken);

    return {
      success: true,
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresIn: response.AuthenticationResult.ExpiresIn,
      message: 'ログインに成功しました。'
    };
  } catch (error) {
    console.error('ログインエラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * パスワードリセットリクエスト
 */
const forgotPassword = async (email) => {
  try {
    const params = {
      ClientId: CLIENT_ID,
      Username: email
    };

    const command = new ForgotPasswordCommand(params);
    await cognitoClient.send(command);

    return {
      success: true,
      message: 'パスワードリセット用のコードを送信しました。メールをご確認ください。'
    };
  } catch (error) {
    console.error('パスワードリセットリクエストエラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * パスワードリセットの確認と新パスワード設定
 */
const confirmForgotPassword = async (email, confirmationCode, newPassword) => {
  try {
    const params = {
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    };

    const command = new ConfirmForgotPasswordCommand(params);
    await cognitoClient.send(command);

    return {
      success: true,
      message: 'パスワードがリセットされました。新しいパスワードでログインしてください。'
    };
  } catch (error) {
    console.error('パスワードリセット確認エラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * アクセストークンからユーザー情報を取得
 */
const getUserInfo = async (accessToken) => {
  try {
    const params = {
      AccessToken: accessToken
    };

    const command = new GetUserCommand(params);
    const response = await cognitoClient.send(command);

    // ユーザー属性を整形して返す
    const userAttrs = {};
    response.UserAttributes.forEach(attr => {
      userAttrs[attr.Name] = attr.Value;
    });

    return {
      success: true,
      username: response.Username,
      attributes: userAttrs
    };
  } catch (error) {
    console.error('ユーザー情報取得エラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * ユーザープロファイル情報をDynamoDBに保存
 */
const saveUserProfile = async (userId, profileData) => {
  try {
    const item = {
      userId,
      ...profileData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const params = {
      TableName: USER_PROFILES_TABLE,
      Item: item
    };

    await docClient.send(new PutCommand(params));

    return {
      success: true,
      message: 'ユーザープロファイルを保存しました。'
    };
  } catch (error) {
    console.error('ユーザープロファイル保存エラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * ユーザープロファイル情報をDynamoDBから取得
 */
const getUserProfile = async (userId) => {
  try {
    const params = {
      TableName: USER_PROFILES_TABLE,
      Key: {
        userId
      }
    };

    const response = await docClient.send(new GetCommand(params));

    if (!response.Item) {
      return {
        success: false,
        message: 'ユーザープロファイルが見つかりませんでした。'
      };
    }

    return {
      success: true,
      profile: response.Item
    };
  } catch (error) {
    console.error('ユーザープロファイル取得エラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * ユーザーのログイン日時を更新
 */
const updateUserLoginTimestamp = async (accessToken) => {
  try {
    // アクセストークンからユーザー情報を取得
    const userInfo = await getUserInfo(accessToken);
    if (!userInfo.success) {
      return userInfo;
    }

    const userId = userInfo.attributes.sub;

    // 既存のプロファイルを取得
    const profileResult = await getUserProfile(userId);
    
    let profile = {};
    if (profileResult.success) {
      profile = profileResult.profile;
    }

    // プロファイル更新
    const updatedProfile = {
      ...profile,
      lastLoginAt: Date.now(),
      updatedAt: Date.now()
    };

    // 保存
    return await saveUserProfile(userId, updatedProfile);
  } catch (error) {
    console.error('ログイン日時更新エラー:', error);
    return {
      success: false,
      error: error.name,
      message: error.message
    };
  }
};

/**
 * JWTトークンを検証（シンプル実装）
 * 本番環境ではaws-jwt-verifyなどのライブラリを使用することを推奨
 */
const verifyToken = async (token) => {
  try {
    // トークンの検証ロジック実装
    // 本実装では、単にユーザー情報を取得できるかどうかで判断
    const userInfo = await getUserInfo(token);
    return userInfo.success;
  } catch (error) {
    console.error('トークン検証エラー:', error);
    return false;
  }
};

module.exports = {
  signUp,
  confirmSignUp,
  login,
  forgotPassword,
  confirmForgotPassword,
  getUserInfo,
  saveUserProfile,
  getUserProfile,
  updateUserLoginTimestamp,
  verifyToken
};
