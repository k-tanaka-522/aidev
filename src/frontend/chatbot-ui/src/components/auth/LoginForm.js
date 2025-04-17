import React, { useState } from 'react';
import styled from 'styled-components';
import { FiMail, FiLock, FiLogIn } from 'react-icons/fi';
import axios from 'axios';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'http://localhost:3001/api';

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
      // ログインAPIの呼び出し
      const response = await axios.post(`${API_ENDPOINT}/auth/login`, {
        email,
        password
      });
      
      // ログイン成功
      if (response.data && response.data.success) {
        // ローカルストレージにトークンを保存
        localStorage.setItem('aidev_tokens', JSON.stringify(response.data.tokens));
        localStorage.setItem('aidev_user', JSON.stringify(response.data.user));
        localStorage.setItem('aidev_session_id', response.data.sessionId);
        
        // 親コンポーネントに通知
        onLogin(response.data);
      } else {
        setError('ログインに失敗しました');
      }
    } catch (error) {
      console.error('Login error:', error);
      
      // エラーメッセージの設定
      if (error.response && error.response.data && error.response.data.message) {
        setError(error.response.data.message);
      } else {
        setError('ログイン処理中にエラーが発生しました。');
      }
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
