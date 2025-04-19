#\!/bin/bash

# バックアップディレクトリ
BACKUP_DIR="/mnt/c/dev2/aiDev/docs/20_設計/22_詳細設計/backup"
BASE_DIR="/mnt/c/dev2/aiDev/docs/20_設計/22_詳細設計"

# 現在の日時
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# バックアップの作成
echo "既存ファイルのバックアップを作成しています..."
find "$BASE_DIR" -type f -not -path "$BASE_DIR/backup*" -exec cp --parents {} "$BACKUP_DIR/${TIMESTAMP}" \;

# エージェント詳細定義関連のファイル移動
echo "エージェント詳細定義関連のファイルを移動しています..."
[ -f "$BASE_DIR/01_エージェント詳細定義/00_エージェントID定義.md" ] && cp "$BASE_DIR/01_エージェント詳細定義/00_エージェントID定義.md" "$BASE_DIR/02-00_エージェントID定義.md"
[ -f "$BASE_DIR/01_エージェント詳細定義/01_プリセールスエージェント.md" ] && cp "$BASE_DIR/01_エージェント詳細定義/01_プリセールスエージェント.md" "$BASE_DIR/02-01_プリセールスエージェント.md"
[ -f "$BASE_DIR/01_エージェント詳細定義/02_ITコンサルタントエージェント.md" ] && cp "$BASE_DIR/01_エージェント詳細定義/02_ITコンサルタントエージェント.md" "$BASE_DIR/02-02_ITコンサルタントエージェント.md"
[ -f "$BASE_DIR/01_エージェント詳細定義/03_システムアーキテクトエージェント.md" ] && cp "$BASE_DIR/01_エージェント詳細定義/03_システムアーキテクトエージェント.md" "$BASE_DIR/02-03_システムアーキテクトエージェント.md"
[ -f "$BASE_DIR/01_エージェント詳細定義/03_エージェント連携プロトコル.md" ] && cp "$BASE_DIR/01_エージェント詳細定義/03_エージェント連携プロトコル.md" "$BASE_DIR/02-04_エージェント連携プロトコル.md"

# フロントエンド関連のファイル移動
echo "フロントエンド関連のファイルを移動しています..."
[ -f "$BASE_DIR/01_フロントエンド/01_画面設計.md" ] && cp "$BASE_DIR/01_フロントエンド/01_画面設計.md" "$BASE_DIR/03-01_画面設計.md"
[ -f "$BASE_DIR/01_フロントエンド/02_コンポーネント構成.md" ] && cp "$BASE_DIR/01_フロントエンド/02_コンポーネント構成.md" "$BASE_DIR/03-02_コンポーネント構成.md"
[ -f "$BASE_DIR/01_フロントエンド/03_状態管理.md" ] && cp "$BASE_DIR/01_フロントエンド/03_状態管理.md" "$BASE_DIR/03-03_状態管理.md"

# バックエンド関連のファイル移動
echo "バックエンド関連のファイルを移動しています..."
[ -f "$BASE_DIR/02_バックエンド/01_サービス構成.md" ] && cp "$BASE_DIR/02_バックエンド/01_サービス構成.md" "$BASE_DIR/03-04_サービス構成.md"
[ -f "$BASE_DIR/02_バックエンド/02_データアクセス.md" ] && cp "$BASE_DIR/02_バックエンド/02_データアクセス.md" "$BASE_DIR/03-05_データアクセス.md"
[ -f "$BASE_DIR/02_バックエンド/03_認証認可.md" ] && cp "$BASE_DIR/02_バックエンド/03_認証認可.md" "$BASE_DIR/03-06_認証認可.md"
[ -f "$BASE_DIR/02_バックエンド/04_通信プロトコル実装設計.md" ] && cp "$BASE_DIR/02_バックエンド/04_通信プロトコル実装設計.md" "$BASE_DIR/03-07_通信プロトコル実装設計.md"

# インフラ関連のファイル移動
echo "インフラ関連のファイルを移動しています..."
[ -f "$BASE_DIR/03_インフラ/01_環境構成.md" ] && cp "$BASE_DIR/03_インフラ/01_環境構成.md" "$BASE_DIR/06-01_環境構成.md"
[ -f "$BASE_DIR/03_インフラ/02_IAMポリシー.md" ] && cp "$BASE_DIR/03_インフラ/02_IAMポリシー.md" "$BASE_DIR/06-02_IAMポリシー.md"
[ -f "$BASE_DIR/03_インフラ/03_CloudFormation.md" ] && cp "$BASE_DIR/03_インフラ/03_CloudFormation.md" "$BASE_DIR/06-03_CloudFormation.md"

# API設計関連のファイル移動
echo "API設計関連のファイルを移動しています..."
[ -f "$BASE_DIR/04_API設計/API/01_API仕様.md" ] && cp "$BASE_DIR/04_API設計/API/01_API仕様.md" "$BASE_DIR/05-01_API仕様.md"

# データベース設計関連のファイル移動
echo "データベース設計関連のファイルを移動しています..."
[ -f "$BASE_DIR/05_データベース設計/01_DynamoDBデータモデル設計.md" ] && cp "$BASE_DIR/05_データベース設計/01_DynamoDBデータモデル設計.md" "$BASE_DIR/04-01_DynamoDBデータモデル設計.md"
[ -f "$BASE_DIR/05_データベース設計/データ/01_データモデル.md" ] && cp "$BASE_DIR/05_データベース設計/データ/01_データモデル.md" "$BASE_DIR/04-02_データモデル.md"

# 機能設計関連のファイル移動
echo "機能設計関連のファイルを移動しています..."
[ -f "$BASE_DIR/06_機能設計/01_対話エンジン.md" ] && cp "$BASE_DIR/06_機能設計/01_対話エンジン.md" "$BASE_DIR/02-05_対話エンジン.md"
[ -f "$BASE_DIR/06_機能設計/02_ナレッジベース.md" ] && cp "$BASE_DIR/06_機能設計/02_ナレッジベース.md" "$BASE_DIR/02-06_ナレッジベース.md"
[ -f "$BASE_DIR/06_機能設計/02_MCPハイブリッドアクセス.md" ] && cp "$BASE_DIR/06_機能設計/02_MCPハイブリッドアクセス.md" "$BASE_DIR/02-07_MCPハイブリッドアクセス.md"
[ -f "$BASE_DIR/06_機能設計/05_プロンプト設計.md" ] && cp "$BASE_DIR/06_機能設計/05_プロンプト設計.md" "$BASE_DIR/02-08_プロンプト設計.md"
[ -f "$BASE_DIR/06_機能設計/03_環境構築自動化.md" ] && cp "$BASE_DIR/06_機能設計/03_環境構築自動化.md" "$BASE_DIR/06-04_環境構築自動化.md"
[ -f "$BASE_DIR/06_機能設計/04_環境発行.md" ] && cp "$BASE_DIR/06_機能設計/04_環境発行.md" "$BASE_DIR/06-05_環境発行.md"
[ -f "$BASE_DIR/06_機能設計/06_DrawIO互換形式変換.md" ] && cp "$BASE_DIR/06_機能設計/06_DrawIO互換形式変換.md" "$BASE_DIR/03-08_DrawIO互換形式変換.md"

# その他のファイル移動
echo "その他のファイルを移動しています..."
[ -f "$BASE_DIR/02_技術仕様.md" ] && cp "$BASE_DIR/02_技術仕様.md" "$BASE_DIR/01-01_技術仕様.md"
[ -f "$BASE_DIR/02_認証・マルチテナント詳細設計.md" ] && cp "$BASE_DIR/02_認証・マルチテナント詳細設計.md" "$BASE_DIR/05-02_認証・マルチテナント詳細設計.md"
[ -f "$BASE_DIR/07_セキュリティとマルチテナント.md" ] && cp "$BASE_DIR/07_セキュリティとマルチテナント.md" "$BASE_DIR/06-06_セキュリティとマルチテナント.md"

echo "ファイル移動が完了しました。"
echo "新しいファイル構造を確認してください。問題なければ、古いディレクトリを削除できます。"
echo "削除手順:"
echo "1. cd /mnt/c/dev2/aiDev/docs/20_設計/22_詳細設計"
echo "2. rm -rf 01_エージェント詳細定義 01_フロントエンド 02_バックエンド 03_インフラ 04_API設計 05_データベース設計 06_機能設計"
echo "3. rm 02_技術仕様.md 02_認証・マルチテナント詳細設計.md 07_セキュリティとマルチテナント.md"

echo "※実行前に必ず新しいファイルの確認を行ってください。"
