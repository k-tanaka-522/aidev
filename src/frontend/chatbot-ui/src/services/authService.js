import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { cognitoConfig } from '../config/cognito';

// Cognito User Pool の初期化
const userPool = new CognitoUserPool({
  UserPoolId: cognitoConfig.userPoolId,
  ClientId: cognitoConfig.userPoolWebClientId,
});

export class AuthService {
  // ユーザー登録
  static signUp(email, password, name) {
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: email
        }),
        new CognitoUserAttribute({
          Name: 'name',
          Value: name
        })
      ];

      userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          user: result.user,
          userSub: result.userSub,
          codeDeliveryDetails: result.codeDeliveryDetails
        });
      });
    });
  }

  // メール確認
  static confirmSignUp(email, confirmationCode) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.confirmRegistration(confirmationCode, true, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  // ログイン
  static signIn(email, password) {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          const accessToken = result.getAccessToken().getJwtToken();
          const idToken = result.getIdToken().getJwtToken();
          const refreshToken = result.getRefreshToken().getToken();

          // ユーザー情報を取得
          const payload = result.getIdToken().payload;
          
          const authData = {
            accessToken,
            idToken,
            refreshToken,
            user: {
              userId: payload.sub,
              email: payload.email,
              name: payload.name || payload.email
            }
          };

          // ローカルストレージに保存
          localStorage.setItem('aidev_tokens', JSON.stringify({
            accessToken,
            idToken,
            refreshToken
          }));
          localStorage.setItem('aidev_user', JSON.stringify(authData.user));

          resolve(authData);
        },
        onFailure: (err) => {
          reject(err);
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          // パスワード変更が必要な場合（初回ログイン等）
          reject(new Error('新しいパスワードが必要です'));
        }
      });
    });
  }

  // ログアウト
  static signOut() {
    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();
      if (currentUser) {
        currentUser.signOut();
      }
      
      // ローカルストレージをクリア
      localStorage.removeItem('aidev_tokens');
      localStorage.removeItem('aidev_user');
      localStorage.removeItem('aidev_session_id');
      
      resolve();
    });
  }

  // 現在のユーザーを取得
  static getCurrentUser() {
    return userPool.getCurrentUser();
  }

  // セッション確認
  static getCurrentSession() {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('ユーザーが見つかりません'));
        return;
      }

      currentUser.getSession((err, session) => {
        if (err) {
          reject(err);
          return;
        }

        if (!session.isValid()) {
          reject(new Error('セッションが無効です'));
          return;
        }

        resolve(session);
      });
    });
  }

  // ユーザー属性を取得
  static getUserAttributes() {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('ユーザーが見つかりません'));
        return;
      }

      currentUser.getSession((err, session) => {
        if (err) {
          reject(err);
          return;
        }

        currentUser.getUserAttributes((err, attributes) => {
          if (err) {
            reject(err);
            return;
          }

          const userAttributes = {};
          attributes.forEach(attribute => {
            userAttributes[attribute.getName()] = attribute.getValue();
          });

          resolve(userAttributes);
        });
      });
    });
  }

  // パスワードリセット
  static forgotPassword(email) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.forgotPassword({
        onSuccess: (data) => {
          resolve(data);
        },
        onFailure: (err) => {
          reject(err);
        }
      });
    });
  }

  // パスワードリセット確認
  static confirmPassword(email, confirmationCode, newPassword) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.confirmPassword(confirmationCode, newPassword, {
        onSuccess: () => {
          resolve('パスワードが正常に変更されました');
        },
        onFailure: (err) => {
          reject(err);
        }
      });
    });
  }
}

export default AuthService;