const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-client');

// Cognito User Pool情報
const COGNITO_REGION = process.env.COGNITO_REGION || 'ap-northeast-1';
const USER_POOL_ID = process.env.USER_POOL_ID || 'ap-northeast-1_LzLiECPKf';
const JWKS_URI = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;

// JWKSクライアントの初期化
const client = jwksClient({
  jwksUri: JWKS_URI,
  requestHeaders: {},
  timeout: 30000,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10分
});

/**
 * 公開キーを取得する関数
 */
const getKey = (header, callback) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
};

/**
 * CognitoのJWTトークンを検証する
 * @param {string} token - JWTトークン
 * @returns {Promise<object>} - デコードされたトークンペイロード
 */
const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    // トークンのヘッダーをデコード（検証なし）
    const decodedHeader = jwt.decode(token, { complete: true });
    
    if (!decodedHeader) {
      reject(new Error('無効なトークン形式です'));
      return;
    }

    // 公開キーを取得してトークンを検証
    getKey(decodedHeader.header, (err, key) => {
      if (err) {
        reject(new Error('公開キーの取得に失敗しました: ' + err.message));
        return;
      }

      const verifyOptions = {
        algorithms: ['RS256'],
        issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}`,
        // audience: CLIENT_ID, // 必要に応じてクライアントIDをチェック
      };

      jwt.verify(token, key, verifyOptions, (err, decoded) => {
        if (err) {
          reject(new Error('トークンの検証に失敗しました: ' + err.message));
          return;
        }

        // トークンが有効期限内かチェック
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) {
          reject(new Error('トークンの有効期限が切れています'));
          return;
        }

        resolve(decoded);
      });
    });
  });
};

/**
 * Authorizationヘッダーからトークンを抽出する
 * @param {string} authHeader - Authorizationヘッダーの値
 * @returns {string|null} - 抽出されたトークン
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  // "Bearer "で始まるかチェック
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
};

/**
 * API Gatewayイベントから認証情報を取得・検証する
 * @param {object} event - API Gatewayイベント
 * @returns {Promise<object>} - ユーザー情報
 */
const authenticateRequest = async (event) => {
  try {
    // Authorizationヘッダーからトークンを取得
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw new Error('認証トークンが提供されていません');
    }

    // トークンを検証
    const decoded = await verifyToken(token);

    // ユーザー情報を返す
    return {
      userId: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.email,
      tokenUse: decoded.token_use,
      clientId: decoded.aud,
      isAuthenticated: true
    };
  } catch (error) {
    console.error('認証エラー:', error.message);
    throw new Error('認証に失敗しました: ' + error.message);
  }
};

/**
 * 認証が必要なエンドポイント用のミドルウェア
 * @param {object} event - API Gatewayイベント
 * @returns {Promise<object>} - 認証済みユーザー情報
 */
const requireAuth = async (event) => {
  const user = await authenticateRequest(event);
  
  if (!user.isAuthenticated) {
    const error = new Error('認証が必要です');
    error.statusCode = 401;
    throw error;
  }

  return user;
};

module.exports = {
  verifyToken,
  authenticateRequest,
  requireAuth,
  extractTokenFromHeader
};