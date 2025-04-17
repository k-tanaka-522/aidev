const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { v4: uuidv4 } = require('uuid');

// DynamoDBクライアントの初期化
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Bedrockクライアントの初期化
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

// SQSクライアントの初期化
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

// 環境変数
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const MODEL_HAIKU_ID = process.env.BEDROCK_MODEL_HAIKU_ID || "anthropic.claude-3-haiku-20240307-v1:0";
const TABLE_NAME = `aiDev-${process.env.ENVIRONMENT || 'dev'}-chats`;
const SESSION_TABLE = `aiDev-${process.env.ENVIRONMENT || 'dev'}-sessions`;
const AGENT_QUEUE_URL = process.env.AGENT_QUEUE_URL || "";
const MAX_HISTORY_ITEMS = 20; // 会話履歴の最大アイテム数

/**
 * aiDevチャット処理のLambdaハンドラー
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));
  
  try {
    // SQSからのメッセージかAPI Gatewayからのリクエストかを判断
    if (event.Records && event.Records.length > 0 && event.Records[0].eventSource === 'aws:sqs') {
      // SQSからのメッセージ処理（エージェント間連携）
      return await handleAgentMessage(event.Records[0]);
    } else {
      // API Gatewayからのリクエスト処理（ユーザーとの対話）
      return await handleUserMessage(event);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return formatResponse(500, { 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
};

/**
 * ユーザーからのメッセージを処理する
 */
async function handleUserMessage(event) {
  // リクエストボディのパース
  const body = JSON.parse(event.body || '{}');
  const { userId, chatId, message, agentType, sessionId } = body;
  
  if (!userId || !message) {
    return formatResponse(400, { 
      error: 'Bad Request', 
      message: 'userIdとmessageは必須パラメータです' 
    });
  }

  // チャットIDとセッションIDの取得または生成
  const chatIdToUse = chatId || generateChatId();
  const sessionIdToUse = sessionId || await createOrGetSessionId(userId, chatIdToUse);
  
  // セッション情報の取得
  const sessionInfo = await getSessionInfo(sessionIdToUse);
  
  // 現在のエージェントタイプを決定
  const currentAgentType = agentType || sessionInfo?.currentAgent || 'default';
  
  // セッション情報の更新
  await updateSessionInfo(userId, chatIdToUse, sessionIdToUse, currentAgentType);
  
  // チャット履歴の取得
  const history = await getChatHistory(userId, chatIdToUse);
  
  // ユーザーメッセージから意図や重要なエンティティを抽出
  const { entities, intent, topics } = await extractMessageContext(message, history);
  
  // セッション状態を更新
  const sessionUpdateResult = await updateSessionState(sessionIdToUse, {
    lastUserMessage: message,
    lastMessageTimestamp: Date.now()
  });
  
  // 抽出したエンティティがあれば保存
  if (entities && Object.keys(entities).length > 0) {
    await updateSessionState(sessionIdToUse, { entities });
  }
  
  // 検出したトピックがあれば保存
  if (topics && topics.length > 0) {
    for (const topic of topics) {
      await updateSessionState(sessionIdToUse, { newTopic: topic });
    }
  }
  
  // システムプロンプトの取得（会話コンテキストを含める）
  let systemPrompt = getSystemPromptForAgent(currentAgentType);
  
  // セッション情報から会話の要約やコンテキストを取得して拡張
  if (sessionInfo?.state?.conversationSummary) {
    systemPrompt += `\n\n以下は現在までの会話の要約です：\n${sessionInfo.state.conversationSummary}`;
  }
  
  // 重要なエンティティ情報があれば追加
  if (sessionInfo?.state?.detectedEntities && Object.keys(sessionInfo.state.detectedEntities).length > 0) {
    systemPrompt += `\n\n以下は会話から検出された重要な情報です：\n${Object.entries(sessionInfo.state.detectedEntities)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n')}`;
  }
  
  // 会話履歴の構築
  const conversationHistory = buildConversationHistory(history, systemPrompt);
  
  // ユーザーメッセージを履歴に追加
  conversationHistory.messages.push({
    role: "user",
    content: message
  });
  
  // ユーザーメッセージをDynamoDBに保存
  const userMessageId = await saveUserMessage(userId, chatIdToUse, message);
  
  // 最新の会話をベースに会話要約を更新（定期的に実行）
  const shouldUpdateSummary = !sessionInfo?.state?.lastSummaryUpdate || 
                              (Date.now() - sessionInfo.state.lastSummaryUpdate > 600000); // 10分ごと
  
  if (shouldUpdateSummary && history.length > 5) {
    // 非同期で会話要約を更新（レスポンス時間への影響を最小化）
    updateConversationSummary(userId, chatIdToUse, sessionIdToUse, history)
      .catch(err => console.error('会話要約更新エラー:', err));
  }
  
  // エージェント連携判断：質問内容に応じた最適なエージェントタイプの判定
  const suggestedAgentType = await determineBestAgent(message, currentAgentType, conversationHistory);
  
  let response;
  let nextAgent = currentAgentType;
  
  // エージェントの切り替えが必要か判断
  if (suggestedAgentType !== currentAgentType) {
    // エージェント切り替えの提案メッセージを生成
    response = await generateAgentSwitchProposal(suggestedAgentType, currentAgentType, message);
    nextAgent = suggestedAgentType;
    
    // セッション情報を更新（提案されたエージェントタイプを保存）
    await updateSessionInfo(userId, chatIdToUse, sessionIdToUse, nextAgent);
    
    // エージェント切り替えをセッション状態に記録
    await updateSessionState(sessionIdToUse, {
      lastInteraction: {
        type: 'agentSwitch',
        from: currentAgentType,
        to: nextAgent,
        timestamp: Date.now(),
        reason: 'user_query_analysis'
      }
    });
  } else {
    // 通常の応答生成
    response = await callBedrockModel(conversationHistory);
    
    // テクニカルな質問の場合、料金計算などの特殊処理を実行
    if (currentAgentType === 'preSales' && containsPricingQuestion(message)) {
      const pricingInfo = await calculateAwsPricing(message);
      if (pricingInfo) {
        response += "\n\n" + pricingInfo;
      }
    }
    
    // エージェント間連携が必要かどうかを判断
    const needsCollaboration = await checkNeedsCollaboration(message, response, currentAgentType);
    
    if (needsCollaboration.needed && needsCollaboration.targetAgent) {
      // 別のエージェントに質問内容を転送（バックグラウンド処理）
      const context = `現在のエージェント(${currentAgentType})が処理しているユーザークエリについて、専門的な知見が必要です。
      
ユーザーの質問: ${message}

${currentAgentType}エージェントの回答: ${response.substring(0, 300)}...`;
      
      await forwardToAgent(
        userId, 
        chatIdToUse, 
        sessionIdToUse, 
        currentAgentType, 
        needsCollaboration.targetAgent, 
        needsCollaboration.question || message, 
        context,
        true // 応答が必要
      );
      
      // バックグラウンドで他のエージェントに照会中である旨を追記
      response += `\n\n(※ バックグラウンドで${needsCollaboration.targetAgent}エージェントにも確認しています。追加情報があれば次回の会話で共有します)`;
      
      // コラボレーション依頼をセッション状態に記録
      await updateSessionState(sessionIdToUse, {
        pendingCollaboration: {
          from: currentAgentType,
          to: needsCollaboration.targetAgent,
          timestamp: Date.now(),
          question: needsCollaboration.question || message
        }
      });
    }
  }
  
  // AI応答をDynamoDBに保存
  const responseMessageId = await saveAIResponse(userId, chatIdToUse, response, nextAgent);
  
  // セッション状態を更新（ユーザーとの対話を記録）
  await updateSessionState(sessionIdToUse, {
    lastInteraction: {
      type: 'userDialog',
      agentType: nextAgent,
      userMessageId,
      responseMessageId,
      timestamp: Date.now()
    }
  });
  
  // 応答を返す
  return formatResponse(200, {
    userId,
    chatId: chatIdToUse,
    sessionId: sessionIdToUse,
    message: response,
    currentAgent: currentAgentType,
    suggestedAgent: nextAgent
  });
}

/**
 * メッセージからコンテキスト情報（エンティティ、意図、トピック）を抽出する
 */
async function extractMessageContext(message, history) {
  try {
    // 会話履歴を含む抽出用プロンプトを構築
    let contextPrompt = '';
    if (history && history.length > 0) {
      // 直近3つのメッセージを取得
      const recentMessages = [...history].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
      if (recentMessages.length > 0) {
        contextPrompt = '\n\n以下は直近の会話履歴です：\n' + recentMessages.map(msg => 
          `${msg.role === 'user' ? 'ユーザー' : 'システム'}: ${msg.content.substring(0, 100)}...`
        ).join('\n');
      }
    }
    
    // エンティティ抽出用のプロンプト
    const promptForExtraction = {
      messages: [
        {
          role: "system",
          content: `あなたはaiDevシステムのコンテキスト分析エージェントです。ユーザーのメッセージを分析し、以下の情報を抽出してください：

1. エンティティ: ユーザーが言及している重要な固有名詞や値（企業名、プロジェクト名、金額、日付など）
2. 意図: ユーザーの主な意図（質問、要求、確認など）
3. トピック: 会話のメイントピック（AWS、アーキテクチャ、コスト、セキュリティなど）

JSON形式で回答してください。例：
{
  "entities": {
    "company": "Example Corp",
    "project": "クラウド移行",
    "budget": "500万円",
    "deadline": "3ヶ月以内"
  },
  "intent": "cost_estimation",
  "topics": ["aws", "migration", "cost"]
}

該当するものがない場合は空のオブジェクトや配列を返してください。${contextPrompt}`
        },
        {
          role: "user",
          content: message
        }
      ]
    };
    
    // 軽量モデル（Haiku）を使用してエンティティ抽出
    const extractionResponse = await callBedrockModelWithModelId(promptForExtraction, MODEL_HAIKU_ID);
    
    // JSON文字列をパース
    try {
      const parsedResponse = JSON.parse(extractionResponse);
      return {
        entities: parsedResponse.entities || {},
        intent: parsedResponse.intent || 'general_query',
        topics: parsedResponse.topics || []
      };
    } catch (parseError) {
      console.error('Context extraction parse error:', parseError);
      return { entities: {}, intent: 'general_query', topics: [] };
    }
  } catch (error) {
    console.error('Context extraction error:', error);
    return { entities: {}, intent: 'general_query', topics: [] };
  }
}

/**
 * エージェント間の連携が必要かどうかをチェックする
 */
async function checkNeedsCollaboration(message, response, currentAgentType) {
  try {
    // 連携判断用のプロンプトを構築
    const promptForCollaboration = {
      messages: [
        {
          role: "system",
          content: `あなたはaiDevシステムの連携判断エージェントです。現在のエージェント(${currentAgentType})の回答を確認し、他のエージェントへの連携が必要かどうかを判断してください。

以下の場合に連携が必要です：
- 現在のエージェントの専門領域を超える詳細な質問がある
- 他のエージェントがより詳しく回答できる内容がある
- 複数の専門分野にまたがる質問である

連携先の選択肢：
- preSales: AWS環境構築や開発の初期相談、コスト見積り、要件定義などを担当
- itConsultant: IT戦略、技術選定、アーキテクチャなどの専門的なアドバイスを担当
- systemArchitect: AWS環境の詳細設計や構築支援、IaCコードの生成などを担当

現在のエージェントは "${currentAgentType}" です。

JSON形式で回答してください：
{
  "needed": true/false,
  "targetAgent": "連携先エージェント名(不要な場合はnull)",
  "reason": "連携が必要な理由",
  "question": "連携先エージェントへの質問内容"
}`
        },
        {
          role: "user",
          content: `ユーザーの質問:\n${message}\n\n現在のエージェント(${currentAgentType})の回答:\n${response}`
        }
      ]
    };
    
    // 軽量モデル（Haiku）を使用して連携判断
    const collaborationResponse = await callBedrockModelWithModelId(promptForCollaboration, MODEL_HAIKU_ID);
    
    // JSON文字列をパース
    try {
      const parsedResponse = JSON.parse(collaborationResponse);
      return {
        needed: parsedResponse.needed || false,
        targetAgent: parsedResponse.targetAgent || null,
        reason: parsedResponse.reason || '',
        question: parsedResponse.question || ''
      };
    } catch (parseError) {
      console.error('Collaboration check parse error:', parseError);
      return { needed: false, targetAgent: null };
    }
  } catch (error) {
    console.error('Collaboration check error:', error);
    return { needed: false, targetAgent: null };
  }
}

/**
 * 会話履歴から要約を生成し、セッション状態を更新する
 */
async function updateConversationSummary(userId, chatId, sessionId, history) {
  try {
    // 会話履歴が少ない場合は要約しない
    if (!history || history.length < 5) {
      return false;
    }
    
    // 要約対象の履歴を構築（直近の会話を優先）
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const summarizableHistory = sortedHistory.filter(item => item.role !== 'system');
    
    // 要約用のプロンプトを構築
    const promptForSummary = {
      messages: [
        {
          role: "system",
          content: `あなたはaiDevシステムの会話要約エージェントです。ユーザーとAIの間の会話履歴を要約し、次のポイントを含む簡潔な要約を150-200文字程度で作成してください：
          
1. ユーザーの主な関心事/質問
2. 明らかになった重要な要件や制約
3. すでに提案された解決策
4. 次に議論すべき重要なポイント

要約は第三者がこの会話の文脈を理解できるように簡潔明瞭に作成してください。`
        },
        {
          role: "user",
          content: `以下の会話履歴を要約してください：\n\n${summarizableHistory.map(msg => 
            `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`
          ).join('\n\n')}`
        }
      ]
    };
    
    // 軽量モデル（Haiku）を使用して要約生成
    const summaryResponse = await callBedrockModelWithModelId(promptForSummary, MODEL_HAIKU_ID);
    
    // セッション状態を更新
    await updateSessionState(sessionId, {
      conversationSummary: summaryResponse,
      lastSummaryUpdate: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('会話要約生成エラー:', error);
    return false;
  }
}

/**
 * エージェント間のメッセージを処理する
 */
async function handleAgentMessage(record) {
  try {
    // SQSメッセージをパース
    const messageBody = JSON.parse(record.body);
    const { userId, chatId, sessionId, sourceAgent, targetAgent, message, context, conversationSummary, requiresResponse, metadata } = messageBody;
    
    console.log(`Processing agent message: ${sourceAgent} -> ${targetAgent}`);
    
    // セッション情報の更新
    await updateSessionInfo(userId, chatId, sessionId, targetAgent);
    
    // チャット履歴の取得
    const history = await getChatHistory(userId, chatId);
    
    // ターゲットエージェントのシステムプロンプトを取得
    const systemPrompt = getSystemPromptForAgent(targetAgent);
    
    // 追加のコンテキスト情報を含むシステムプロンプトを構築
    let enhancedPrompt = `${systemPrompt}\n\n以下は${sourceAgent}エージェントからの情報です：\n${context}`;
    
    // 会話サマリーがある場合は追加
    if (conversationSummary) {
      enhancedPrompt += `\n\n以下は現在までの会話の要約です：\n${conversationSummary}`;
    }
    
    // メタデータがある場合は追加（技術要件、予算制約、優先度など）
    if (metadata && Object.keys(metadata).length > 0) {
      enhancedPrompt += `\n\n以下は重要な参照情報です：\n${Object.entries(metadata).map(([key, value]) => `- ${key}: ${value}`).join('\n')}`;
    }
    
    // 会話履歴の構築
    const conversationHistory = buildConversationHistory(history, enhancedPrompt);
    
    // メッセージを履歴に追加
    conversationHistory.messages.push({
      role: "user",
      content: message
    });
    
    // エージェント間転送メッセージをシステムメッセージとしてDynamoDBに保存
    const transferMessage = `[${sourceAgent} → ${targetAgent}への連携]: ${message.substring(0, 100)}...`;
    await saveSystemMessage(userId, chatId, transferMessage);
    
    // AIモデルの呼び出し
    const response = await callBedrockModel(conversationHistory);
    
    // AI応答をDynamoDBに保存
    const responseMessageId = await saveAIResponse(userId, chatId, response, targetAgent);
    
    // 処理完了ログ
    console.log('Agent message processing completed');
    
    // 応答が必要な場合は元のエージェントに返信
    if (requiresResponse === true && sourceAgent !== targetAgent) {
      // 元のエージェントに応答を返す
      await forwardResponseToOriginalAgent(
        userId, 
        chatId, 
        sessionId, 
        targetAgent, 
        sourceAgent, 
        response, 
        `${targetAgent}からの回答: ${response.substring(0, 100)}...`,
        { originalMessageContext: context }
      );
      
      console.log(`Response forwarded back to original agent: ${targetAgent} -> ${sourceAgent}`);
    }
    
    // セッション状態を更新（エージェント連携履歴を記録）
    await updateSessionState(sessionId, {
      lastInteraction: {
        type: 'agentTransfer',
        from: sourceAgent,
        to: targetAgent,
        timestamp: Date.now(),
        messageId: responseMessageId
      }
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Agent message processed successfully',
        responseId: responseMessageId
      })
    };
  } catch (error) {
    console.error('Error processing agent message:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to process agent message'
      })
    };
  }
}

/**
 * 元のエージェントに応答を転送する
 */
async function forwardResponseToOriginalAgent(userId, chatId, sessionId, sourceAgent, targetAgent, response, context, metadata = {}) {
  try {
    // 応答転送用のSQSメッセージを構築
    const messageBody = {
      userId,
      chatId,
      sessionId,
      sourceAgent,
      targetAgent,
      message: response,
      context,
      requiresResponse: false, // 応答の連鎖を防ぐ
      isResponse: true,
      metadata,
      timestamp: Date.now()
    };
    
    const params = {
      QueueUrl: AGENT_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageGroupId: chatId, // FIFOキューの場合
      MessageDeduplicationId: `${chatId}_${Date.now()}_response` // FIFOキューの場合
    };
    
    const command = new SendMessageCommand(params);
    await sqsClient.send(command);
    
    return true;
  } catch (error) {
    console.error('応答転送エラー:', error);
    throw error;
  }
}

/**
 * メッセージの内容からAWS料金に関する質問かどうかを判断する
 */
function containsPricingQuestion(message) {
  const pricingKeywords = [
    '料金', 'コスト', '価格', '費用', '月額', '年額',
    'いくら', '予算', '見積もり', '見積り', 'プラン',
    'pricing', 'cost', 'price', 'budget', 'estimate'
  ];
  
  const awsServiceKeywords = [
    'EC2', 'S3', 'RDS', 'Lambda', 'DynamoDB', 'CloudFront',
    'ECS', 'EKS', 'Fargate', 'API Gateway', 'SQS', 'SNS',
    'Aurora', 'EBS', 'EFS', 'Elasticache', 'Redshift'
  ];
  
  // 料金関連のキーワードとAWSサービス名の両方が含まれているか確認
  const hasPricingKeyword = pricingKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const hasAwsServiceKeyword = awsServiceKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  return hasPricingKeyword && hasAwsServiceKeyword;
}

/**
 * AWS料金の概算を計算する
 */
async function calculateAwsPricing(message) {
  try {
    // メッセージから数量や使用パターンなどの情報を抽出
    const resourceInfo = await extractResourceInfo(message);
    
    // 各サービスの標準単価情報（簡易版）
    const pricingBaseline = {
      'ec2': {
        't3.micro': { hourly: 0.0104, monthlyOn: 7.488, description: '2 vCPU、1GiB RAM' },
        't3.small': { hourly: 0.0208, monthlyOn: 14.976, description: '2 vCPU、2GiB RAM' },
        't3.medium': { hourly: 0.0416, monthlyOn: 29.952, description: '2 vCPU、4GiB RAM' },
        'm5.large': { hourly: 0.096, monthlyOn: 69.12, description: '2 vCPU、8GiB RAM' },
        'm5.xlarge': { hourly: 0.192, monthlyOn: 138.24, description: '4 vCPU、16GiB RAM' },
        'm5.2xlarge': { hourly: 0.384, monthlyOn: 276.48, description: '8 vCPU、32GiB RAM' },
      },
      's3': {
        'standard': { gbPerMonth: 0.023, requests: { get: 0.0004, put: 0.005 } },
        'infrequent_access': { gbPerMonth: 0.0125, retrieval: 0.01 },
        'glacier': { gbPerMonth: 0.004, retrieval: 0.03 }
      },
      'rds': {
        'mysql_small': { monthlyOn: 29, description: 'db.t3.small、1vCPU、2GiB RAM' },
        'mysql_medium': { monthlyOn: 58, description: 'db.t3.medium、2vCPU、4GiB RAM' },
        'mysql_large': { monthlyOn: 138, description: 'db.m5.large、2vCPU、8GiB RAM' }
      },
      'lambda': {
        'base': { requestsPer1M: 0.20, gbSecond: 0.0000166667 }
      },
      'dynamodb': {
        'ondemand': { rwUnitsPerMillion: 1.25, storage: 0.25 }
      }
    };
    
    // リソース情報をプロンプトとして利用
    let resourceContext = '';
    if (resourceInfo && Object.keys(resourceInfo).length > 0) {
      resourceContext = `\n\n検出されたリソース情報:\n${Object.entries(resourceInfo)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}`;
    }
    
    // シンプルなプロンプトを構築してBedrockの軽量モデルを呼び出す
    const promptForPricing = {
      messages: [
        {
          role: "system",
          content: `あなたはAWS料金計算の専門家です。ユーザーのメッセージから、言及されているAWSサービスを特定し、一般的な使用パターンでの月額料金の概算を計算してください。
          
以下の点に注意してください：
1. 小規模、中規模、大規模の3つのユースケース別に料金を示してください
2. 各サービスの料金内訳と合計コストを表示してください
3. コスト最適化のためのヒントを1-2つ追加してください
4. 回答は料金計算部分のみ、箇条書きで簡潔に

以下はAWSの主要サービスの単価情報です：
EC2:
- t3.micro: $0.0104/時間（約$7.5/月）、2 vCPU、1GiB RAM
- t3.small: $0.0208/時間（約$15/月）、2 vCPU、2GiB RAM
- t3.medium: $0.0416/時間（約$30/月）、2 vCPU、4GiB RAM
- m5.large: $0.096/時間（約$69/月）、2 vCPU、8GiB RAM
- m5.xlarge: $0.192/時間（約$138/月）、4 vCPU、16GiB RAM

S3:
- スタンダード: $0.023/GB/月
- S3 IA: $0.0125/GB/月（+ 取得コスト）
- Glacier: $0.004/GB/月（+ 取得コスト）

RDS (MySQL):
- db.t3.small: 約$29/月、1vCPU、2GiB RAM
- db.t3.medium: 約$58/月、2vCPU、4GiB RAM
- db.m5.large: 約$138/月、2vCPU、8GiB RAM

Lambda:
- リクエスト: $0.20/100万リクエスト
- 実行時間: $0.0000166667/GB秒

DynamoDB:
- オンデマンド: $1.25/百万読み取り・書き込みユニット
- ストレージ: $0.25/GB/月${resourceContext}`
        },
        {
          role: "user",
          content: message
        }
      ]
    };
    
    // 軽量モデル（Haiku）を使用して料金計算
    const pricingResponse = await callBedrockModelWithModelId(promptForPricing, MODEL_HAIKU_ID);
    
    // レスポンスをフォーマット
    return `### AWS料金概算\n${pricingResponse}\n\n※これはあくまで概算です。実際の料金は使用状況や割引によって異なります。詳細な見積りはAWS料金計算ツールをご利用ください。`;
  } catch (error) {
    console.error('料金計算エラー:', error);
    return null;
  }
}

/**
 * メッセージからAWSリソースの情報を抽出する
 */
async function extractResourceInfo(message) {
  try {
    // リソース情報抽出用のプロンプト
    const promptForExtraction = {
      messages: [
        {
          role: "system",
          content: `あなたはAWSリソース分析のエキスパートです。ユーザーのメッセージから、AWS料金計算に必要なリソース情報を抽出してください。

以下の情報を抽出してください：
- EC2インスタンスのタイプと数
- ストレージ容量（GB/TB）
- データベースのタイプとサイズ
- 予想トラフィック量、アクセス数、リクエスト数
- 利用期間やリージョン情報
- 冗長化要件（マルチAZなど）
- その他コスト計算に影響する要素

JSON形式で回答してください。例：
{
  "ec2_instances": "t3.medium × 3",
  "storage": "100GB S3, 500GB EBS",
  "database": "MySQL RDS db.t3.medium",
  "traffic": "月間10万リクエスト",
  "region": "東京リージョン",
  "redundancy": "マルチAZ構成",
  "duration": "12ヶ月"
}

情報が不明確な場合は空のオブジェクトや最も妥当な値を返してください。`
        },
        {
          role: "user",
          content: message
        }
      ]
    };
    
    // 軽量モデル（Haiku）を使用してリソース情報抽出
    const extractionResponse = await callBedrockModelWithModelId(promptForExtraction, MODEL_HAIKU_ID);
    
    // JSON文字列をパース
    try {
      return JSON.parse(extractionResponse);
    } catch (parseError) {
      console.error('リソース情報抽出パースエラー:', parseError);
      return {};
    }
  } catch (error) {
    console.error('リソース情報抽出エラー:', error);
    return {};
  }
}

/**
 * 最適なエージェントタイプを判断する
 */
async function determineBestAgent(message, currentAgentType, conversationHistory) {
  try {
    // メッセージが短すぎる場合は現在のエージェントを維持
    if (message.length < 20) {
      return currentAgentType;
    }
    
    // エージェント判断用のプロンプトを構築
    const promptForAgentSelection = {
      messages: [
        {
          role: "system",
          content: `あなたはaiDevシステムの振り分けエージェントです。ユーザーの質問内容に基づいて、最適なエージェントタイプを選択してください。選択肢は以下の通りです：

1. preSales - AWS環境構築や開発の初期相談、コスト見積り、要件定義などを担当
2. itConsultant - IT戦略、技術選定、アーキテクチャなどの専門的なアドバイスを担当
3. systemArchitect - AWS環境の詳細設計や構築支援、IaCコードの生成などを担当
4. default - 一般的な質問や他のエージェントに明確に当てはまらない質問を担当

回答は選択したエージェントタイプの名前（preSales、itConsultant、systemArchitect、default）のみを返してください。`
        },
        {
          role: "user",
          content: `現在のエージェントタイプ: ${currentAgentType}\n\nユーザーの質問: ${message}\n\n最適なエージェントタイプを回答してください。`
        }
      ]
    };
    
    // 軽量モデル（Haiku）を使用してエージェント判断
    const agentSelectionResponse = await callBedrockModelWithModelId(promptForAgentSelection, MODEL_HAIKU_ID);
    const suggestedAgent = agentSelectionResponse.trim().toLowerCase();
    
    // 有効なエージェントタイプかチェック
    const validAgentTypes = ['presales', 'itconsultant', 'systemarchitect', 'default'];
    if (validAgentTypes.includes(suggestedAgent)) {
      // 正規化（presales -> preSales など）
      const normalizedAgent = {
        'presales': 'preSales',
        'itconsultant': 'itConsultant',
        'systemarchitect': 'systemArchitect',
        'default': 'default'
      }[suggestedAgent];
      
      // 現在と同じエージェントが提案された場合や、defaultが提案された場合は切り替えない
      if (normalizedAgent === currentAgentType || normalizedAgent === 'default') {
        return currentAgentType;
      }
      
      return normalizedAgent;
    }
    
    // 有効なエージェントタイプでない場合は現在のエージェントを維持
    return currentAgentType;
  } catch (error) {
    console.error('エージェントタイプ判断エラー:', error);
    return currentAgentType;
  }
}

/**
 * エージェント切り替えの提案メッセージを生成する
 */
async function generateAgentSwitchProposal(suggestedAgentType, currentAgentType, message) {
  try {
    // エージェント切り替え提案用のプロンプトを構築
    const promptForSwitchProposal = {
      messages: [
        {
          role: "system",
          content: `あなたはaiDevシステムの${currentAgentType}エージェントです。ユーザーの質問内容に基づいて、より専門的な対応ができる${suggestedAgentType}エージェントへの切り替えを提案してください。丁寧かつ簡潔に、切り替え理由と${suggestedAgentType}エージェントができることを説明してください。`
        },
        {
          role: "user",
          content: message
        }
      ]
    };
    
    // エージェント切り替え提案メッセージを生成
    return await callBedrockModel(promptForSwitchProposal);
  } catch (error) {
    console.error('エージェント切り替え提案生成エラー:', error);
    return `ご質問の内容から、${suggestedAgentType}エージェントがより適切な回答を提供できると判断しました。引き続き${suggestedAgentType}エージェントが対応いたします。`;
  }
}

/**
 * 他のエージェントにメッセージを転送する
 */
async function forwardToAgent(userId, chatId, sessionId, currentAgent, targetAgent, message, context) {
  try {
    // SQSにメッセージを送信
    const messageBody = {
      userId,
      chatId,
      sessionId,
      sourceAgent: currentAgent,
      targetAgent,
      message,
      context,
      timestamp: Date.now()
    };
    
    const params = {
      QueueUrl: AGENT_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageGroupId: chatId, // FIFOキューの場合
      MessageDeduplicationId: `${chatId}_${Date.now()}` // FIFOキューの場合
    };
    
    const command = new SendMessageCommand(params);
    await sqsClient.send(command);
    
    return true;
  } catch (error) {
    console.error('エージェント転送エラー:', error);
    throw error;
  }
}

/**
 * セッション情報を作成または取得する
 */
async function createOrGetSessionId(userId, chatId) {
  try {
    // チャットIDに関連するセッション情報を検索
    const params = {
      TableName: SESSION_TABLE,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'chatId = :chatId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':chatId': chatId
      }
    };
    
    const response = await docClient.send(new QueryCommand(params));
    
    // 既存のセッションがある場合はそのIDを返す
    if (response.Items && response.Items.length > 0) {
      return response.Items[0].sessionId;
    }
    
    // 新しいセッションIDを生成
    const sessionId = `session_${uuidv4()}`;
    
    // 新しいセッション情報を保存
    const sessionItem = {
      userId,
      sessionId,
      chatId,
      currentAgent: 'default',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      state: {
        intentDetected: false,
        topics: [],
        requirementsGathered: false
      }
    };
    
    await docClient.send(new PutCommand({
      TableName: SESSION_TABLE,
      Item: sessionItem
    }));
    
    return sessionId;
  } catch (error) {
    console.error('セッション作成エラー:', error);
    // エラー時は一時的なセッションIDを返す
    return `temp_session_${Date.now()}`;
  }
}

/**
 * セッション情報を取得する
 */
async function getSessionInfo(sessionId) {
  try {
    const params = {
      TableName: SESSION_TABLE,
      Key: {
        sessionId
      }
    };
    
    const response = await docClient.send(new GetCommand(params));
    return response.Item;
  } catch (error) {
    console.error('セッション情報取得エラー:', error);
    return null;
  }
}

/**
 * セッション情報を更新する
 */
async function updateSessionInfo(userId, chatId, sessionId, currentAgent) {
  try {
    const updateParams = {
      TableName: SESSION_TABLE,
      Key: {
        sessionId
      },
      UpdateExpression: 'SET userId = :userId, chatId = :chatId, currentAgent = :currentAgent, lastActivity = :lastActivity',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':chatId': chatId,
        ':currentAgent': currentAgent,
        ':lastActivity': Date.now()
      }
    };
    
    await docClient.send(new UpdateCommand(updateParams));
    return true;
  } catch (error) {
    console.error('セッション更新エラー:', error);
    return false;
  }
}

/**
 * セッション状態を更新する（詳細なセッション状態管理）
 */
async function updateSessionState(sessionId, updates = {}) {
  try {
    // 現在のセッション情報を取得
    const sessionInfo = await getSessionInfo(sessionId);
    if (!sessionInfo) {
      console.error('セッション状態更新エラー: セッションが見つかりません', sessionId);
      return false;
    }
    
    // 現在の状態を取得
    const currentState = sessionInfo.state || {
      intentDetected: false,
      topics: [],
      requirementsGathered: false,
      interactions: [],
      detectedEntities: {},
      agentHistory: [],
      conversationSummary: ''
    };
    
    // 更新内容を統合
    const updatedState = {
      ...currentState,
      ...updates
    };
    
    // 最後のインタラクションを記録
    if (updates.lastInteraction) {
      updatedState.interactions = [
        ...(currentState.interactions || []).slice(-9), // 直近10件を保持
        updates.lastInteraction
      ];
      
      // エージェント履歴も更新
      if (updates.lastInteraction.type === 'agentTransfer') {
        updatedState.agentHistory = [
          ...(currentState.agentHistory || []),
          {
            from: updates.lastInteraction.from,
            to: updates.lastInteraction.to,
            timestamp: updates.lastInteraction.timestamp
          }
        ];
      }
    }
    
    // トピックの追加があれば更新
    if (updates.newTopic) {
      const existingTopics = new Set(currentState.topics || []);
      existingTopics.add(updates.newTopic);
      updatedState.topics = Array.from(existingTopics);
      delete updatedState.newTopic; // 一時フィールドを削除
    }
    
    // エンティティの追加があれば更新
    if (updates.entities) {
      updatedState.detectedEntities = {
        ...(currentState.detectedEntities || {}),
        ...updates.entities
      };
      delete updatedState.entities; // 一時フィールドを削除
    }
    
    // セッション情報を更新
    const updateParams = {
      TableName: SESSION_TABLE,
      Key: {
        sessionId
      },
      UpdateExpression: 'SET #state = :state',
      ExpressionAttributeNames: {
        '#state': 'state'
      },
      ExpressionAttributeValues: {
        ':state': updatedState
      }
    };
    
    await docClient.send(new UpdateCommand(updateParams));
    return true;
  } catch (error) {
    console.error('セッション状態更新エラー:', error);
    return false;
  }
}

/**
 * ユーザーメッセージを保存する
 */
async function saveUserMessage(userId, chatId, message) {
  try {
    const messageId = `${Date.now()}_user`;
    
    const userItem = {
      userId,
      chatId,
      messageId,
      role: 'user',
      content: message,
      timestamp: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90日後に削除
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: userItem
    }));
    
    return messageId;
  } catch (error) {
    console.error('ユーザーメッセージ保存エラー:', error);
    throw error;
  }
}

/**
 * AI応答を保存する
 */
async function saveAIResponse(userId, chatId, response, agentType) {
  try {
    const messageId = `${Date.now()}_assistant`;
    
    const aiItem = {
      userId,
      chatId,
      messageId,
      role: 'assistant',
      content: response,
      agentType,
      timestamp: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90日後に削除
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: aiItem
    }));
    
    return messageId;
  } catch (error) {
    console.error('AI応答保存エラー:', error);
    throw error;
  }
}

/**
 * システムメッセージを保存する
 */
async function saveSystemMessage(userId, chatId, message) {
  try {
    const messageId = `${Date.now()}_system`;
    
    const systemItem = {
      userId,
      chatId,
      messageId,
      role: 'system',
      content: message,
      timestamp: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90日後に削除
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: systemItem
    }));
    
    return messageId;
  } catch (error) {
    console.error('システムメッセージ保存エラー:', error);
    throw error;
  }
}

/**
 * BedrockモデルAPIを呼び出し応答を取得する
 */
async function callBedrockModel(conversationHistory) {
  return callBedrockModelWithModelId(conversationHistory, MODEL_ID);
}

/**
 * 指定したモデルIDでBedrockモデルAPIを呼び出す
 */
async function callBedrockModelWithModelId(conversationHistory, modelId) {
  try {
    // Anthropic Claude用のリクエスト形式
    const input = {
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(conversationHistory)
    };
    
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    
    // レスポンスのパース
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Claude 3モデルのレスポンス形式に合わせて応答を抽出
    if (responseBody.content && responseBody.content.length > 0) {
      return responseBody.content[0].text;
    } else {
      throw new Error('Bedrock responseに応答テキストがありません');
    }
  } catch (error) {
    console.error('Bedrock呼び出しエラー:', error);
    throw error;
  }
}

/**
 * DynamoDBからチャット履歴を取得する
 */
async function getChatHistory(userId, chatId) {
  try {
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'chatId = :chatId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':chatId': chatId
      },
      ScanIndexForward: true // 時系列順
    };
    
    const response = await docClient.send(new QueryCommand(params));
    return response.Items || [];
  } catch (error) {
    console.error('チャット履歴取得エラー:', error);
    return [];
  }
}

/**
 * チャット履歴からBedrockへのリクエスト形式を構築する
 */
function buildConversationHistory(history, systemPrompt) {
  const messages = [];
  
  // システムプロンプトの追加
  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt
    });
  }
  
  // 履歴メッセージの追加
  if (history && history.length > 0) {
    // タイムスタンプでソート
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    
    // 最新のMAX_HISTORY_ITEMS件だけを含める
    const recentHistory = sortedHistory.slice(-MAX_HISTORY_ITEMS);
    
    // システムメッセージは表示しない
    const filteredHistory = recentHistory.filter(item => item.role !== 'system');
    
    filteredHistory.forEach(item => {
      messages.push({
        role: item.role,
        content: item.content
      });
    });
  }
  
  return { messages };
}

/**
 * エージェントタイプに応じたシステムプロンプトを取得する
 */
function getSystemPromptForAgent(agentType) {
  const prompts = {
    'default': `あなたはaiDevという名前の対話型AI開発アシスタントです。ユーザーのAWS環境構築や開発に関する質問に丁寧に答えてください。
技術的に正確で、実用的なアドバイスを提供し、必要に応じて具体的なコード例や設定例を示してください。
現在はMVPフェーズで、簡潔かつ的確な応答を心がけてください。

もし他のエージェントタイプが質問に適している場合は、その旨を伝えてください。
・preSales: AWS環境構築や開発の初期相談、コスト見積もり、要件定義など
・itConsultant: IT戦略、技術選定、アーキテクチャなどの専門的なアドバイス
・systemArchitect: AWS環境の詳細設計や構築支援、IaCコードの生成など`,

    'preSales': `あなたはaiDevのプリセールスエージェントです。AWS環境構築や開発の初期相談に対応し、顧客の要望をヒアリングしながら最適な提案を行います。
コスト効率、セキュリティ、信頼性などの観点からベストプラクティスを提案してください。
AWSの料金やサービス内容についての知識を活用して、顧客の予算や要件に合った提案を心がけてください。

AIとの対話を通じて情報を収集し、顧客の課題や要望を明確にするためのヒアリングを行ってください。
顧客のビジネス目標、技術的要件、予算、タイムラインなどの情報を整理し、適切な提案に繋げてください。

必要に応じて、ユーザーの同意を得た上で、より詳細な技術的検討のためにITコンサルタントエージェントやシステムアーキテクトエージェントへの切り替えを提案することもできます。`,

    'itConsultant': `あなたはaiDevのITコンサルタントエージェントです。IT戦略、技術選定、アーキテクチャなどの観点からアドバイスを提供します。
業界のトレンドやベストプラクティスを踏まえた提案を行い、クライアントのビジネス目標達成を支援してください。
クラウド移行、システム刷新、新規サービス立ち上げなどの幅広いテーマに対応し、技術的な選択肢とそのメリット・デメリットを明確に説明してください。

以下の点に注意して回答してください：
・ビジネス目標と技術戦略の整合性を重視する
・短期的な解決策と長期的なロードマップの両方を提示する
・コスト、パフォーマンス、セキュリティ、拡張性などの観点からバランスの取れた提案を行う
・新技術の導入リスクと既存システムとの統合についても言及する
・必要に応じて、図表や参考資料を示す

特に詳細な技術的な実装や設計が必要な場合は、システムアーキテクトエージェントへの切り替えを提案してください。`,

    'systemArchitect': `あなたはaiDevのシステムアーキテクトエージェントです。AWS環境の詳細設計や構築支援を担当します。
AWSのベストプラクティスに沿った設計を提案し、必要に応じてCloudFormationやTerraformなどのIaCコードの例を示してください。
セキュリティ、可用性、パフォーマンス、コスト最適化などを考慮した設計を心がけ、Well-Architectedフレームワークの原則に基づいたアドバイスを提供してください。
複雑なアーキテクチャ設計にも対応し、具体的な実装方法まで踏み込んだ支援を行ってください。

回答には以下の要素を含めるよう心がけてください：
・AWSサービスの選定理由と代替オプションの比較
・スケーラビリティ、可用性、耐障害性への対応
・セキュリティとコンプライアンスへの配慮
・パフォーマンス最適化とコスト効率の両立
・運用管理とモニタリングの設計
・必要に応じてアーキテクチャ図や設定例を示す

特に長期的なIT戦略や技術選定の視点が必要な場合は、ITコンサルタントエージェントへの切り替えを提案してください。`
  };
  
  return prompts[agentType] || prompts['default'];
}

/**
 * 一意のチャットIDを生成する
 */
function generateChatId() {
  return `chat_${uuidv4()}`;
}

/**
 * API Gateway向けのレスポンス形式を生成する
 */
function formatResponse(statusCode, body) {
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
}
