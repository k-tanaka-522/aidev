import React, { useState } from 'react';
import styled from 'styled-components';
import { FiMail, FiLock, FiUser, FiUserPlus } from 'react-icons/fi';
import { AuthService } from '../../services/authService';

const SignupForm = ({ onSignupSuccess, onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password || !name) {
      setError('すべての項目を入力してください');
      return;
    }
    
    // 簡易パスワード検証
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    
    try {
      // Cognitoでサインアップ
      await AuthService.signUp(email, password, name);
      
      setSuccessMessage('サインアップが完了しました。メールに確認コードが送信されました。確認後、ログインしてください。');
      // 親コンポーネントに通知
      onSignupSuccess();
      
      // フォームをクリア
      setEmail('');
      setPassword('');
      setName('');
    } catch (error) {
      console.error('Signup error:', error);
      
      // Cognitoエラーメッセージの処理
      let errorMessage = 'サインアップ処理中にエラーが発生しました。';
      
      if (error.code) {
        switch (error.code) {
          case 'UsernameExistsException':
            errorMessage = 'このメールアドレスは既に登録されています。';
            break;
          case 'InvalidPasswordException':
            errorMessage = 'パスワードが条件を満たしていません。数字を含む8文字以上で入力してください。';
            break;
          case 'InvalidParameterException':
            errorMessage = '入力内容に問題があります。メールアドレスの形式を確認してください。';
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
        <FiUserPlus size={24} style={{ marginRight: '10px' }} />
        アカウント登録
      </FormTitle>
      
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      
      <Form onSubmit={handleSubmit}>
        <FormGroup>
          <Label htmlFor="name">
            <FiUser size={18} style={{ marginRight: '8px' }} />
            お名前
          </Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="お名前を入力"
            disabled={isLoading}
            required
          />
        </FormGroup>
        
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
            placeholder="パスワードを入力 (8文字以上)"
            disabled={isLoading}
            required
            minLength={8}
          />
          <PasswordHint>※ 大文字・小文字・数字を含む8文字以上</PasswordHint>
        </FormGroup>
        
        <SubmitButton type="submit" disabled={isLoading}>
          {isLoading ? '処理中...' : 'アカウント登録'}
        </SubmitButton>
      </Form>
      
      <LoginLink>
        アカウントをお持ちの場合は
        <LinkButton type="button" onClick={onSwitchToLogin}>
          ログイン
        </LinkButton>
      </LoginLink>
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

const PasswordHint = styled.p`
  margin: 5px 0 0 0;
  font-size: 0.8rem;
  color: #888;
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

const LoginLink = styled.div`
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

const SuccessMessage = styled.div`
  background-color: #e8f5e9;
  color: #2e7d32;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
  font-size: 0.9rem;
`;

export default SignupForm;
