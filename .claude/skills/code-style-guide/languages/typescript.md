> 移行元: `.claude/docs/40_standards/41_app/languages/typescript.md`（02文書4.4節、内容変更なしで移管）

# TypeScript コーディング規約

## 基本方針

- **strict: true**必須
- **async/await推奨**
- **interface優先**（type aliasは必要な時のみ）

---

## プロジェクト構成

```
myapp/
├── src/
│   ├── controllers/  # Express handlers
│   ├── services/     # Business logic
│   ├── models/       # TypeORM entities
│   └── utils/
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
└── tsconfig.json
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

---

## コーディング規約

### コメント規約

**全言語共通のコメント規約**: 本Skillが属する横断規約群の共通方針として、すべての関数/メソッド/クラスに「目的・理由」「影響範囲」「前提条件・制約」を日本語で記載する（AI協業を前提としたコンテキスト明記）

**必須事項**:
- すべての関数/メソッドに日本語コメント
- 「目的・理由」「影響範囲」「前提条件」を記載
- AI協業を前提としたコンテキスト明記

---

### 型定義

```typescript
// ✅ Good
interface User {
  id: number;
  name: string;
  email: string;
}

async function getUser(userId: number): Promise<User | null> {
  return await db.findOne(User, { where: { id: userId } });
}

// ❌ Bad
function getUser(userId: any): any {  // any禁止
  return db.findOne(User, { where: { id: userId } });
}
```

### 非同期処理

```typescript
// ✅ Good: Promise.all
const [users, products] = await Promise.all([
  getUsers(),
  getProducts()
]);

// ❌ Bad: 直列実行
const users = await getUsers();
const products = await getProducts();
```

### エラーハンドリング

```typescript
// ✅ Good
class UserNotFoundError extends Error {
  constructor(userId: number) {
    super(`User ${userId} not found`);
    this.name = 'UserNotFoundError';
  }
}

async function getUser(userId: number): Promise<User> {
  const user = await db.findOne(User, { where: { id: userId } });
  if (!user) {
    throw new UserNotFoundError(userId);
  }
  return user;
}
```

---

## テスト

- **フレームワーク**: Jest
- **カバレッジ目標**: 80%以上

```typescript
describe('UserService', () => {
  it('should get user successfully', async () => {
    const user = await userService.getUser(1);
    expect(user.id).toBe(1);
  });
});
```

---

