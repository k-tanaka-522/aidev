# aiDev Draw.io互換形式変換 詳細設計

## 1. 概要

aiDevシステムでは、AIエージェントが生成するクラウド構成やシステムアーキテクチャなどの図表情報を、視覚的に編集・共有可能な形式に変換する機能を提供します。本ドキュメントでは、AIアウトプットをDraw.io（diagrams.net）互換形式に変換するための詳細設計を定義します。

## 2. 目的と要件

### 2.1 目的

- AIが生成したテキストベースのアーキテクチャ記述を視覚的なダイアグラムに変換
- ユーザーによる編集・カスタマイズを可能にする
- 生成された図表の保存・共有・再利用を実現する

### 2.2 主要要件

1. **変換精度**
   - AWS構成要素の正確な視覚化
   - コンポーネント間の関係性の適切な表現
   - レイアウトの自動最適化

2. **互換性**
   - Draw.io（diagrams.net）フォーマットとの完全互換性
   - ブラウザ内での直接編集サポート
   - 標準的なダイアグラム形式（SVG、PNG等）へのエクスポート対応

3. **ユーザビリティ**
   - 生成→表示→編集の一貫したワークフロー
   - リアルタイムプレビュー
   - バージョン管理と履歴追跡

## 3. アーキテクチャ設計

### 3.1 変換パイプライン概要

```
AIレスポンス（JSON構造） → パーサー → 中間表現 → ダイアグラム生成器 → Draw.io XML
```

### 3.2 コンポーネント構成

1. **パーサーコンポーネント**
   - AIレスポンスのJSON構造を解析
   - コンポーネント・接続情報の抽出
   - メタデータ（タイトル、説明など）の抽出

2. **中間表現モジュール**
   - グラフベースの中間表現の生成
   - ノード（AWS構成要素）とエッジ（接続）の定義
   - 階層関係とグループ化情報の管理

3. **レイアウトエンジン**
   - ノード配置の最適化
   - 交差を最小化した接続線の生成
   - 階層的レイアウトの自動調整

4. **Draw.io XML生成器**
   - 中間表現からDraw.io互換XMLへの変換
   - スタイル・フォーマット情報の付与
   - メタデータの埋め込み

5. **UI統合モジュール**
   - フロントエンドへのプレビュー提供
   - Draw.io埋め込みエディタの統合
   - 編集結果の保存・管理

### 3.3 システム連携図

```
                    +-------------------+
                    | AIエージェント     |
                    | (構成生成)        |
                    +--------+----------+
                             |
                             | JSON構造
                             v
+------------+      +--------+----------+      +----------------+
| ナレッジ    +----->  変換サービス      +----->  S3ストレージ    |
| ベース     |      | (Lambda)         |      | (図表保存)      |
+------------+      +--------+----------+      +----------------+
                             |
                             | Draw.io XML
                             v
                    +--------+----------+
                    | フロントエンド     |
                    | (表示・編集UI)    |
                    +-------------------+
```

## 4. 入出力形式

### 4.1 入力JSON形式（AIレスポンスフォーマット）

AIエージェントから受け取る構成情報のJSON形式を以下に定義します：

```json
{
  "title": "3層アーキテクチャ構成",
  "description": "耐障害性と拡張性を考慮したウェブアプリケーション構成",
  "version": "1.0",
  "components": [
    {
      "id": "vpc-001",
      "type": "vpc",
      "name": "Main VPC",
      "details": {
        "cidr": "10.0.0.0/16",
        "region": "ap-northeast-1"
      },
      "position": {
        "x": 0,
        "y": 0,
        "width": 600,
        "height": 400
      }
    },
    {
      "id": "subnet-001",
      "type": "subnet",
      "name": "Public Subnet 1",
      "parent": "vpc-001",
      "details": {
        "cidr": "10.0.1.0/24",
        "az": "ap-northeast-1a"
      },
      "position": {
        "x": 50,
        "y": 50,
        "width": 200,
        "height": 150
      }
    },
    {
      "id": "ec2-001",
      "type": "ec2",
      "name": "Web Server",
      "parent": "subnet-001",
      "details": {
        "instance_type": "t3.medium",
        "ami": "ami-12345678"
      },
      "position": {
        "x": 100,
        "y": 100,
        "width": 60,
        "height": 60
      }
    }
  ],
  "connections": [
    {
      "id": "conn-001",
      "source": "ec2-001",
      "target": "rds-001",
      "type": "network",
      "label": "MySQL/Aurora",
      "details": {
        "protocol": "TCP",
        "port": 3306
      }
    }
  ],
  "groups": [
    {
      "id": "group-001",
      "name": "Web Tier",
      "members": ["ec2-001", "ec2-002"],
      "style": {
        "fill": "#f5f5f5",
        "stroke": "#666666"
      }
    }
  ]
}
```

### 4.2 中間表現形式

パーサーが生成する内部的なグラフベース中間表現：

```typescript
interface DiagramGraph {
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  groups: Map<string, Group>;
  metadata: DiagramMetadata;
}

interface Node {
  id: string;
  type: string;
  name: string;
  parent: string | null;
  details: Record<string, any>;
  position: Position;
  style: StyleProperties;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  points: Point[];
  style: StyleProperties;
}

interface Group {
  id: string;
  name: string;
  members: string[];
  style: StyleProperties;
}

interface DiagramMetadata {
  title: string;
  description: string;
  version: string;
  created: Date;
  modified: Date;
}
```

### 4.3 出力形式（Draw.io XML）

生成されるDraw.io互換XMLの基本構造：

```xml
<mxfile host="app.diagrams.net" modified="2025-04-19T12:00:00.000Z" agent="aiDev Draw.io Generator" version="15.0.0" type="device">
  <diagram id="diagram-001" name="3層アーキテクチャ構成">
    <mxGraphModel dx="1422" dy="798" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- VPC -->
        <mxCell id="vpc-001" value="Main VPC&#xa;10.0.0.0/16" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;" vertex="1" parent="1">
          <mxGeometry x="0" y="0" width="600" height="400" as="geometry" />
        </mxCell>
        
        <!-- Subnet -->
        <mxCell id="subnet-001" value="Public Subnet 1&#xa;10.0.1.0/24" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="50" y="50" width="200" height="150" as="geometry" />
        </mxCell>
        
        <!-- EC2 Instance -->
        <mxCell id="ec2-001" value="Web Server&#xa;t3.medium" style="outlineConnect=0;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;shape=mxgraph.aws3.ec2;fillColor=#F58534;gradientColor=none;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="60" height="60" as="geometry" />
        </mxCell>
        
        <!-- Connection -->
        <mxCell id="conn-001" value="MySQL/Aurora" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="ec2-001" target="rds-001">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <!-- Group -->
        <object id="group-001" label="Web Tier" group="1">
          <mxCell style="group" vertex="1" connectable="0" parent="1">
            <mxGeometry width="300" height="200" as="geometry" />
          </mxCell>
        </object>
        
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## 5. 変換アルゴリズム詳細

### 5.1 JSONパース処理

1. **入力検証**
   - スキーマ検証によるJSONフォーマット確認
   - 必須フィールドと型チェック
   - 相互参照の整合性確認（親子関係、接続など）

2. **コンポーネント解析**
   - コンポーネントタイプごとの処理分岐
   - AWS固有タイプと汎用タイプの識別
   - メタデータと属性の抽出

3. **グラフ構造構築**
   - コンポーネント間の階層関係構築
   - 接続情報のエッジへの変換
   - グループ情報の処理

### 5.2 レイアウト最適化

1. **階層配置アルゴリズム**
   - 上位→下位の階層構造配置
   - 同一階層内での横並び最適化
   - 親子関係に基づく包含配置

2. **エッジルーティング**
   - 交差最小化アルゴリズム
   - 直交接続パターンの優先
   - ベンドポイント（曲がり角）の最適化

3. **オーバーラップ解消**
   - コンポーネント間の重なり検出
   - 自動間隔調整
   - 全体バランスの最適化

### 5.3 Draw.io要素マッピング

AWSコンポーネントタイプからDraw.ioシェイプへのマッピング例：

| AWSコンポーネント | Draw.ioシェイプ | スタイル定義 |
|-----------------|----------------|------------|
| VPC | rounded=1;whiteSpace=wrap;html=1; | fillColor=#f5f5f5;strokeColor=#666666; |
| Subnet | rounded=1;whiteSpace=wrap;html=1; | fillColor=#dae8fc;strokeColor=#6c8ebf; |
| EC2 | shape=mxgraph.aws3.ec2; | fillColor=#F58534;gradientColor=none; |
| RDS | shape=mxgraph.aws3.rds; | fillColor=#2E73B8;gradientColor=none; |
| S3 | shape=mxgraph.aws3.s3; | fillColor=#E05243;gradientColor=none; |
| Lambda | shape=mxgraph.aws3.lambda; | fillColor=#F58534;gradientColor=none; |
| API Gateway | shape=mxgraph.aws3.api_gateway; | fillColor=#AD688B;gradientColor=none; |
| CloudFront | shape=mxgraph.aws3.cloudfront; | fillColor=#8C4FFF;gradientColor=none; |

### 5.4 XML生成処理

1. **ベースドキュメント生成**
   - mxfile要素の生成とメタデータ設定
   - diagram要素とmxGraphModel要素の生成
   - grid/guide設定の追加

2. **コンポーネント変換**
   - 各ノードをmxCell要素に変換
   - タイプ別のスタイル・ジオメトリ適用
   - 属性情報をラベルとツールチップに統合

3. **接続線変換**
   - エッジをmxCell接続要素に変換
   - 接続点と経路ポイントの設定
   - 接続ラベルとスタイルの適用

4. **グループ化処理**
   - グループ境界の生成
   - メンバーコンポーネントの関連付け
   - 階層関係の維持

## 6. インタラクティブエディタ統合

### 6.1 エディタ埋め込み

aiDevのフロントエンドUIに、Draw.ioエディタを統合する手法：

1. **IFrameベース統合**
   - Draw.io公式エディタのIFrame埋め込み
   - postMessageによる双方向通信
   - 状態同期メカニズム

2. **Web版エディタAPI**
   - Draw.io Embedライブラリの活用
   - カスタムツールバーと機能制限
   - aiDev UIテーマとの統一

3. **編集権限制御**
   - ユーザーロールに基づく編集/閲覧モード切替
   - 共同編集時の競合解決
   - 変更履歴の追跡

### 6.2 保存と同期メカニズム

1. **自動保存**
   - 変更検知による差分保存
   - 定期的なバックアップ
   - 復元ポイントの生成

2. **バージョン管理**
   - 変更履歴の保存
   - バージョン間の差分表示
   - 特定バージョンへのロールバック機能

3. **エクスポート機能**
   - PNG/SVG/PDF形式へのエクスポート
   - 構成情報のJSONエクスポート
   - CloudFormationテンプレート生成との連携

## 7. AWS固有機能実装

### 7.1 AWS固有シンボルマッピング

AWS Architecture Iconsの包括的マッピング実装：

1. **カテゴリ別シンボルセット**
   - コンピューティング（EC2, Lambda等）
   - ストレージ（S3, EBS等）
   - データベース（RDS, DynamoDB等）
   - ネットワーキング（VPC, Route53等）
   - セキュリティ（IAM, WAF等）

2. **シンボルバージョン管理**
   - AWS公式アイコンセットの定期更新
   - 新サービス追加時の自動取り込み
   - 旧バージョンとの互換性維持

3. **カスタムプロパティ**
   - AWS固有の設定パラメータ表示
   - リソース識別子の管理
   - CloudFormation参照情報の保持

### 7.2 AWS構成検証

生成された図表の構成を検証する機能：

1. **接続性検証**
   - セキュリティグループ/ネットワークACLとの整合性
   - サブネット間ルーティング検証
   - インターネット接続の妥当性

2. **ベストプラクティス検証**
   - マルチAZ配置の確認
   - 冗長性と可用性チェック
   - セキュリティ推奨事項対応

3. **コスト見積もり連携**
   - 図表上のリソースからコスト計算
   - スケーリング要素の考慮
   - 最適化提案表示

## 8. フェーズ別実装計画

### 8.1 フェーズ1：プリセールス特化（3ヶ月）

- 基本的なJSON→Draw.io変換機能
  - 主要AWS構成要素のサポート
  - シンプルなレイアウトエンジン
  - 基本的なスタイリング
- 静的ダイアグラム表示機能
  - 編集不可の表示モード
  - PNG/SVG形式エクスポート
  - Zoomとパンのみの基本操作

### 8.2 フェーズ2：実装支援機能追加（+3ヶ月）

- インタラクティブエディタの統合
  - 基本的な編集機能
  - 図形の追加/削除/移動
  - 接続線の調整
- レイアウト最適化の強化
  - 複雑な構成の自動レイアウト
  - 階層表示の改善
  - 拡張スタイリングオプション
- バージョン管理の基本実装
  - 変更履歴の記録
  - 復元機能

### 8.3 フェーズ3：持続的関係構築（+6ヶ月）

- 高度な検証・分析機能
  - アーキテクチャ検証
  - コスト推定連携
  - セキュリティ分析
- 双方向マッピング
  - 図表からJSONへの逆変換
  - 図表編集を構成変更に反映
  - CloudFormationとの双方向連携
- コラボレーション機能
  - 共同編集機能
  - コメント・注釈機能
  - 承認ワークフロー

## 9. 技術的課題と解決策

### 9.1 複雑構成のレイアウト課題

**課題**: 大規模・複雑なAWS構成を視覚的に整理された形で表現する難しさ

**解決策**:
1. **階層的レイアウトアルゴリズム**
   - 大規模グラフ向けのカスタムレイアウト
   - 階層型配置と力学モデルの併用
   - 手動調整との併用オプション

2. **自動グループ化**
   - 機能的関連性に基づく自動グループ化
   - 階層深度に応じた表示簡略化
   - 展開/折りたたみ機能

### 9.2 精度と柔軟性のバランス

**課題**: AIが生成した構成情報の不完全さや曖昧さへの対応

**解決策**:
1. **デフォルト補完**
   - 欠損情報の自動補完
   - デフォルト値とプレースホルダー
   - 確信度スコアの視覚的表現

2. **対話型修正**
   - 変換プロセスでの確認ポイント
   - ユーザーによる選択式改善
   - 修正フィードバックの学習

### 9.3 パフォーマンスとスケーラビリティ

**課題**: 大規模ダイアグラムの変換・表示・操作の効率性確保

**解決策**:
1. **段階的レンダリング**
   - 表示領域優先の遅延ロード
   - 詳細度レベルの動的調整
   - キャッシュ戦略の最適化

2. **処理の分散化**
   - 複雑なレイアウト計算をバックエンドへオフロード
   - XMLの部分更新メカニズム
   - WebWorkerの活用

## 10. セキュリティと権限管理

### 10.1 アクセス制御

- **ロールベースアクセス制御**
  - 閲覧者/編集者/所有者権限
  - 組織/チーム単位の共有設定
  - ダイアグラム要素レベルの権限

- **編集履歴の保護**
  - 変更ログの改ざん防止
  - ユーザーアクション監査証跡
  - 権限変更の履歴管理

### 10.2 機密情報管理

- **センシティブデータのマスキング**
  - IPアドレス/認証情報などの自動検出
  - エクスポート時の機密情報フィルタリング
  - 表示制御オプション

- **メタデータ管理**
  - 機密度ラベル付け
  - 共有制限の自動適用
  - 有効期限設定

## 11. テスト戦略

### 11.1 単体テスト

- パーサーコンポーネントの入力バリエーションテスト
- レイアウトエンジンの配置テスト
- XML生成の出力検証

### 11.2 統合テスト

- エンドツーエンド変換パイプラインのテスト
- フロントエンドとの統合テスト
- エディタ機能との相互作用テスト

### 11.3 互換性テスト

- 様々なDraw.ioバージョンとの互換性検証
- ブラウザ互換性テスト
- モバイル/デスクトップ表示テスト

## 12. まとめと次のステップ

aiDevシステムにおけるDraw.io互換形式変換機能の詳細設計を定義しました。この機能により、AIが生成したクラウド構成情報を直観的に理解でき、かつ編集可能な形式で提供することが可能になります。

次のステップとして、以下の詳細化が必要です：

1. **AWS構成要素のスタイル・シンボルカタログの作成**
2. **レイアウトアルゴリズムの詳細実装仕様**
3. **フロントエンドUIとの統合インターフェース設計**
4. **テストケースとデータセットの準備**

これらを順次進めながら、フェーズ別実装計画に従って機能を段階的に実装していきます。
