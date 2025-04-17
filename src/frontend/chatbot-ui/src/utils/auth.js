/**
 * aiDev フロントエンド認証ユーティリティ
 * 認証関連の処理を簡略化するヘルパー関数群
 */

// API エンドポイント設定
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.example.com';
const COGNITO_DOMAIN = process.env.REACT_APP_COGNITO_DOMAIN || 'https://auth.example.com';
const CLIENT_ID = process.env.REACT_APP_CLIENT_ID || 'your-client-id';

// ストレージキー
const TOKEN_STORAGE_KEY = 'aidev_auth_tokens';
const USER_STORAGE_KEY = 'aidev_user_profile';

/**
 * 認証トークンの取得
 */
export const getAuthTokens = () => {
  const tokensJson = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!tokensJson) {
    return null;
  }
  
  try {
    return JSON.parse(tokensJson);
  } catch (error) {
    console.error('Token parse error:', error);
    return null;
  }
};

/**
 * 認証トークンの保存
 */
export const saveAuthTokens = (tokens) => {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
};

/**
 * 認証トークンの削除（ログアウト）
 */
export const clearAuthTokens = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
};

/**
 * アクセストークンの取得
 */
export const getAccessToken = () => {
  const tokens = getAuthTokens();
  return tokens ? tokens.accessToken : null;
};

/**
 * ユーザープロファイルの取得
 */
export const getUserProfile = () => {
  const profileJson = localStorage.getItem(USER_STORAGE_KEY);
  if (!profileJson) {
    return null;
  }
  
  try {
    return JSON.parse(profileJson);
  } catch (error) {
    console.error('Profile parse error:', error);
    return null;
  }
};

/**
 * ユーザープロファイルの保存
 */
export const saveUserProfile = (profile) => {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
};

/**
 * 認証状態のチェック
 */
export const isAuthenticated = () => {
  const tokens = getAuthTokens();
  if (!tokens) {
    return false;
  }
  
  // トークンの有効期限チェック
  const expirationTime = tokens.issuedAt + (tokens.expiresIn * 1000);
  return Date.now() < expirationTime;
};

/**
 * ユーザー登録（サインアップ）
 */
export const signUp = async (email, password, name, company = '') => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        name,
        company
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Signup error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * メールアドレス確認コードによるユーザー確認
 */
export const confirmSignUp = async (email, confirmationCode) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/confirm-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        confirmationCode
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Confirm signup error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * ユーザーログイン
 */
export const login = async (email, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 認証トークンを保存
      saveAuthTokens({
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        issuedAt: Date.now()
      });
      
      // ユーザープロファイルを取得
      await fetchUserProfile();
    }
    
    return result;
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * パスワードリセットリクエスト
 */
export const forgotPassword = async (email) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Forgot password error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * パスワードリセットの確認と新パスワード設定
 */
export const confirmForgotPassword = async (email, confirmationCode, newPassword) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/confirm-forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        confirmationCode,
        newPassword
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Confirm forgot password error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * ユーザー情報の取得
 */
export const fetchUserInfo = async () => {
  try {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return {
        success: false,
        message: '認証されていません'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    return await response.json();
  } catch (error) {
    console.error('Fetch user info error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * ユーザープロファイルの取得
 */
export const fetchUserProfile = async () => {
  try {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return {
        success: false,
        message: '認証されていません'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const result = await response.json();
    
    if (result.success && result.profile) {
      // プロファイル情報をローカルに保存
      saveUserProfile(result.profile);
    }
    
    return result;
  } catch (error) {
    console.error('Fetch user profile error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * ユーザープロファイルの更新
 */
export const updateUserProfile = async (profileData) => {
  try {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return {
        success: false,
        message: '認証されていません'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(profileData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 更新されたプロファイルを取得
      await fetchUserProfile();
    }
    
    return result;
  } catch (error) {
    console.error('Update profile error:', error);
    return {
      success: false,
      message: 'ネットワークエラー: ' + error.message
    };
  }
};

/**
 * ログアウト
 */
export const logout = () => {
  clearAuthTokens();
  
  // Cognitoログアウト画面へリダイレクト
  const redirectUri = encodeURIComponent(window.location.origin);
  window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${redirectUri}`;
};

/**
 * 認証ヘッダーの取得（APIリクエスト用）
 */
export const getAuthHeaders = () => {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return {};
  }
  
  return {
    'Authorization': `Bearer ${accessToken}`
  };
};

/**
 * 認証付きのフェッチリクエスト
 */
export const authenticatedFetch = async (url, options = {}) => {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('認証されていません');
  }
  
  const authOptions = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`
    }
  };
  
  return fetch(url, authOptions);
};
