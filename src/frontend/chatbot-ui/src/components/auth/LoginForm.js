import React, { useState } from 'react';
import styled from 'styled-components';
import { FiMail, FiLock, FiLogIn } from 'react-icons/fi';
import { AuthService } from '../../services/authService';

const LoginForm = ({ onLogin, onSwitchToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // Cognitoでログイン
      const authData = await AuthService.signIn(email, password);
      
      // 親コンポーネントに通知
      onLogin(authData);
    } catch (error) {
      console.error('Login error:', error);
      
      // Cognitoエラーメッセージの処理
      let errorMessage = 'ログイン処理中にエラーが発生しました。';
      
      if (error.code) {
        switch (error.code) {
          case 'NotAuthorizedException':
            errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
            break;
          case 'UserNotConfirmedException':
            errorMessage = 'メールアドレスが確認されていません。確認メールをご確認ください。';
            break;
          case 'UserNotFoundException':
            errorMessage = 'ユーザーが見つかりません。';
            break;
          case 'TooManyRequestsException':
            errorMessage = 'リクエストが多すぎます。しばらく時間をおいてから再試行してください。';
            break;
          default:
            errorMessage = error.message || errorMessage;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <FormContainer>
      <FormTitle>
        <FiLogIn size={24} style={{ marginRight: '10px' }} />
        ログイン
      </FormTitle>
      
      {error && <ErrorMessage>{error}</ErrorMessage>}
      
      <Form onSubmit={handleSubmit}>
        <FormGroup>
          <Label htmlFor="email">
            <FiMail size={18} style={{ marginRight: '8px' }} />
            メールアドレス
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレスを入力"
            disabled={isLoading}
            required
          />
        </FormGroup>
        
        <FormGroup>
          <Label htmlFor="password">
            <FiLock size={18} style={{ marginRight: '8px' }} />
            パスワード
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            disabled={isLoading}
            required
          />
        </FormGroup>
        
        <SubmitButton type="submit" disabled={isLoading}>
          {isLoading ? 'ログイン中...' : 'ログイン'}
        </SubmitButton>
      </Form>
      
      <SignupLink>
        アカウントをお持ちでない場合は
        <LinkButton type="button" onClick={onSwitchToSignup}>
          サインアップ
        </LinkButton>
      </SignupLink>
    </FormContainer>
  );
};

// スタイルコンポーネント
const FormContainer = styled.div`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 30px;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
`;

const FormTitle = styled.h2`
  margin: 0 0 20px 0;
  color: #333;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 500;
  color: #555;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.2s;
  
  &:focus {
    outline: none;
    border-color: #0078d4;
  }
  
  &:disabled {
    background-color: #f7f7f7;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  background-color: #0078d4;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 12px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 10px;
  
  &:hover:not(:disabled) {
    background-color: #006abc;
  }
  
  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;

const SignupLink = styled.div`
  margin-top: 20px;
  text-align: center;
  color: #666;
  font-size: 0.9rem;
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  color: #0078d4;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0 4px;
  
  &:hover {
    text-decoration: underline;
  }
`;

const ErrorMessage = styled.div`
  background-color: #ffebee;
  color: #c62828;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
  font-size: 0.9rem;
`;

export default LoginForm;
