import React, { useState } from 'react';
import styled from 'styled-components';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { VscRobot } from 'react-icons/vsc';

const AuthContainer = ({ onLogin }) => {
  const [showLogin, setShowLogin] = useState(true);
  
  const handleSwitchToSignup = () => {
    setShowLogin(false);
  };
  
  const handleSwitchToLogin = () => {
    setShowLogin(true);
  };
  
  const handleSignupSuccess = () => {
    // サインアップ成功後、数秒後にログイン画面へ切り替え
    setTimeout(() => {
      setShowLogin(true);
    }, 3000);
  };
  
  return (
    <Container>
      <LogoContainer>
        <VscRobot size={40} />
        <LogoText>aiDev</LogoText>
      </LogoContainer>
      
      <Description>
        AIとの対話で開発支援を実現する次世代プラットフォーム
      </Description>
      
      {showLogin ? (
        <LoginForm 
          onLogin={onLogin} 
          onSwitchToSignup={handleSwitchToSignup} 
        />
      ) : (
        <SignupForm 
          onSignupSuccess={handleSignupSuccess}
          onSwitchToLogin={handleSwitchToLogin} 
        />
      )}
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 20px;
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  color: #0078d4;
`;

const LogoText = styled.h1`
  margin: 0 0 0 10px;
  font-size: 2.5rem;
  font-weight: 700;
`;

const Description = styled.p`
  color: #666;
  margin-bottom: 30px;
  text-align: center;
  font-size: 1.1rem;
`;

export default AuthContainer;
