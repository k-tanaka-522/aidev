import React from 'react';
import styled from 'styled-components';
import { FiDollarSign } from 'react-icons/fi';

/**
 * AWS料金計算結果を表形式で表示するコンポーネント
 */
const AWSPricingDisplay = ({ pricingData }) => {
  if (!pricingData) {
    return <div className="error-message">料金データが提供されていません</div>;
  }

  try {
    const { totalCost, currency, services, options } = pricingData;
    const formattedCurrency = currency || 'USD';

    // 数値のフォーマット
    const formatCost = (cost) => {
      return typeof cost === 'number'
        ? cost.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : cost;
    };

    return (
      <PricingContainer>
        <PricingHeader>
          <FiDollarSign size={24} />
          <h3>AWS 料金見積り</h3>
        </PricingHeader>

        <TotalCost>
          合計: <strong>{formatCost(totalCost)} {formattedCurrency}</strong>
        </TotalCost>

        <ServiceTable>
          <thead>
            <tr>
              <th>サービス</th>
              <th>コスト ({formattedCurrency})</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {services && services.map((service, index) => (
              <tr key={index}>
                <td>{service.name}</td>
                <td className="cost-cell">{formatCost(service.cost)}</td>
                <td className="details-cell">{service.details}</td>
              </tr>
            ))}
          </tbody>
        </ServiceTable>

        {options && options.length > 0 && (
          <SavingsSection>
            <h4>コスト最適化オプション</h4>
            <SavingsList>
              {options.map((option, index) => (
                <SavingsItem key={index}>
                  <span className="option-name">{option.name}</span>
                  <span className="option-savings">
                    {formatCost(option.savings)} {formattedCurrency} 削減可能
                  </span>
                </SavingsItem>
              ))}
            </SavingsList>
          </SavingsSection>
        )}

        <Disclaimer>
          * これは概算の見積りです。実際の料金はAWS料金表および利用状況によって異なる場合があります。
        </Disclaimer>
      </PricingContainer>
    );
  } catch (error) {
    console.error('Error rendering AWS pricing data:', error);
    return (
      <ErrorContainer>
        <p>料金データの表示中にエラーが発生しました。</p>
        <p>詳細: {error.message}</p>
      </ErrorContainer>
    );
  }
};

// スタイル定義
const PricingContainer = styled.div`
  background-color: #f8f9fa;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  padding: 20px;
  margin: 15px 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const PricingHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  color: #232f3e;
  
  svg {
    margin-right: 10px;
    color: #ff9900;
  }
  
  h3 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
  }
`;

const TotalCost = styled.div`
  font-size: 1.1rem;
  padding: 10px 15px;
  background-color: #ecf5ff;
  border-radius: 6px;
  margin-bottom: 15px;
  border-left: 4px solid #0078d4;
  
  strong {
    font-size: 1.2rem;
    color: #0078d4;
  }
`;

const ServiceTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
  
  th {
    background-color: #eaecef;
    text-align: left;
    padding: 10px;
    font-weight: 600;
    border-bottom: 2px solid #ddd;
  }
  
  td {
    padding: 10px;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
  }
  
  .cost-cell {
    text-align: right;
    font-family: monospace;
    font-size: 0.95rem;
    white-space: nowrap;
  }
  
  .details-cell {
    color: #666;
    font-size: 0.9rem;
  }
  
  tr:last-child td {
    border-bottom: none;
  }
  
  tr:hover {
    background-color: #f5f5f5;
  }
`;

const SavingsSection = styled.div`
  background-color: #f0f7e9;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 15px;
  
  h4 {
    margin: 0 0 10px 0;
    font-size: 1rem;
    color: #2e7d32;
  }
`;

const SavingsList = styled.ul`
  margin: 0;
  padding: 0;
  list-style-type: none;
`;

const SavingsItem = styled.li`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed #cde3b4;
  
  &:last-child {
    border-bottom: none;
  }
  
  .option-name {
    font-weight: 500;
  }
  
  .option-savings {
    color: #2e7d32;
    font-weight: 600;
  }
`;

const Disclaimer = styled.div`
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
`;

const ErrorContainer = styled.div`
  background-color: #fff0f0;
  border: 1px solid #ffcccc;
  border-radius: 8px;
  padding: 15px;
  margin: 15px 0;
  color: #d32f2f;
`;

export default AWSPricingDisplay;
