/**
 * aiDev 認証ハンドラー
 * API Gatewayからリクエストを受け取って認証関連の操作を実行する
 */

const authHelper = require('./auth-helper');

/**
 * API Gateway Lambdaプロキシ統合のレスポンス形式を生成
 */
const formatResponse = (statusCode, body) => {
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
};

/**
 * サインアップハンドラー
 */
exports.signUp = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { email, password, name, company } = body;

    if (!email || !password || !name) {
      return formatResponse(400, { 
        success: false, 
        message: 'メールアドレス、パスワード、名前は必須です' 
      });
    }

    const result = await authHelper.signUp(email, password, name, company || '');
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      return formatResponse(400, result);
    }
  } catch (error) {
    console.error('サインアップリクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * サインアップ確認ハンドラー
 */
exports.confirmSignUp = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { email, confirmationCode } = body;

    if (!email || !confirmationCode) {
      return formatResponse(400, { 
        success: false, 
        message: 'メールアドレスと確認コードは必須です' 
      });
    }

    const result = await authHelper.confirmSignUp(email, confirmationCode);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      return formatResponse(400, result);
    }
  } catch (error) {
    console.error('サインアップ確認リクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * ログインハンドラー
 */
exports.login = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { email, password } = body;

    if (!email || !password) {
      return formatResponse(400, { 
        success: false, 
        message: 'メールアドレスとパスワードは必須です' 
      });
    }

    const result = await authHelper.login(email, password);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      // チャレンジが必要な場合は401
      if (result.challengeName) {
        return formatResponse(401, result);
      }
      // その他の失敗は400
      return formatResponse(400, result);
    }
  } catch (error) {
    console.error('ログインリクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * パスワードリセットリクエストハンドラー
 */
exports.forgotPassword = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { email } = body;

    if (!email) {
      return formatResponse(400, { 
        success: false, 
        message: 'メールアドレスは必須です' 
      });
    }

    const result = await authHelper.forgotPassword(email);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      return formatResponse(400, result);
    }
  } catch (error) {
    console.error('パスワードリセットリクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * パスワードリセット確認ハンドラー
 */
exports.confirmForgotPassword = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { email, confirmationCode, newPassword } = body;

    if (!email || !confirmationCode || !newPassword) {
      return formatResponse(400, { 
        success: false, 
        message: 'メールアドレス、確認コード、新しいパスワードは必須です' 
      });
    }

    const result = await authHelper.confirmForgotPassword(email, confirmationCode, newPassword);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      return formatResponse(400, result);
    }
  } catch (error) {
    console.error('パスワードリセット確認リクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * ユーザー情報取得ハンドラー
 */
exports.getUserInfo = async (event) => {
  try {
    // Authorization ヘッダーからアクセストークンを取得
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return formatResponse(401, { 
        success: false, 
        message: '認証が必要です' 
      });
    }

    // Bearer トークン形式の処理
    const token = authHeader.replace('Bearer ', '');
    
    const result = await authHelper.getUserInfo(token);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      return formatResponse(401, result);
    }
  } catch (error) {
    console.error('ユーザー情報取得リクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * ユーザープロファイル保存ハンドラー
 */
exports.saveUserProfile = async (event) => {
  try {
    // Authorization ヘッダーからアクセストークンを取得
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return formatResponse(401, { 
        success: false, 
        message: '認証が必要です' 
      });
    }

    // Bearer トークン形式の処理
    const token = authHeader.replace('Bearer ', '');
    
    // トークンからユーザー情報を取得
    const userInfo = await authHelper.getUserInfo(token);
    if (!userInfo.success) {
      return formatResponse(401, { 
        success: false, 
        message: '無効なトークンです' 
      });
    }

    const userId = userInfo.attributes.sub;
    const body = JSON.parse(event.body);
    
    // プロファイルデータの安全性を確保
    const sanitizedProfileData = {
      name: body.name || userInfo.attributes.name,
      email: userInfo.attributes.email, // メールアドレスは変更不可
      company: body.company || userInfo.attributes['custom:company'] || '',
      // 他のカスタムフィールドを追加
    };

    const result = await authHelper.saveUserProfile(userId, sanitizedProfileData);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      return formatResponse(400, result);
    }
  } catch (error) {
    console.error('ユーザープロファイル保存リクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * ユーザープロファイル取得ハンドラー
 */
exports.getUserProfile = async (event) => {
  try {
    // Authorization ヘッダーからアクセストークンを取得
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return formatResponse(401, { 
        success: false, 
        message: '認証が必要です' 
      });
    }

    // Bearer トークン形式の処理
    const token = authHeader.replace('Bearer ', '');
    
    // トークンからユーザー情報を取得
    const userInfo = await authHelper.getUserInfo(token);
    if (!userInfo.success) {
      return formatResponse(401, { 
        success: false, 
        message: '無効なトークンです' 
      });
    }

    const userId = userInfo.attributes.sub;
    
    const result = await authHelper.getUserProfile(userId);
    
    if (result.success) {
      return formatResponse(200, result);
    } else {
      // プロファイルが見つからない場合でもエラーではなく空のプロファイルを返す
      return formatResponse(200, { 
        success: true, 
        profile: {
          userId,
          name: userInfo.attributes.name,
          email: userInfo.attributes.email,
          company: userInfo.attributes['custom:company'] || '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        } 
      });
    }
  } catch (error) {
    console.error('ユーザープロファイル取得リクエストエラー:', error);
    return formatResponse(500, { 
      success: false, 
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
};

/**
 * トークン検証ハンドラー（API Gatewayオーソライザー用）
 */
exports.verifyToken = async (event) => {
  // API Gateway Lambdaオーソライザー形式
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html
  try {
    const token = event.authorizationToken?.replace('Bearer ', '');
    
    if (!token) {
      return generatePolicy('user', 'Deny', event.methodArn);
    }
    
    const isValid = await authHelper.verifyToken(token);
    
    if (isValid) {
      // トークンが有効な場合はリソースへのアクセスを許可
      return generatePolicy('user', 'Allow', event.methodArn);
    } else {
      // トークンが無効な場合はアクセスを拒否
      return generatePolicy('user', 'Deny', event.methodArn);
    }
  } catch (error) {
    console.error('トークン検証エラー:', error);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

/**
 * API Gateway Lambdaオーソライザーのポリシー生成
 */
const generatePolicy = (principalId, effect, resource) => {
  const authResponse = {
    principalId: principalId
  };
  
  if (effect && resource) {
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource
        }
      ]
    };
    
    authResponse.policyDocument = policyDocument;
  }
  
  return authResponse;
};
