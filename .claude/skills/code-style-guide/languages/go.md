> 移行元: `.claude/docs/40_standards/41_app/languages/go.md`（02文書4.4節、内容変更なしで移管）

# Go コーディング規約

## 基本方針

- **gofmt必須**
- **エラー処理必須**（`if err != nil`）
- **goroutine活用**（並行処理）

---

## プロジェクト構成

```
myapp/
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── handlers/
│   ├── services/
│   └── models/
├── pkg/
└── go.mod
```

---

## コーディング規約

### コメント規約

**全言語共通のコメント規約**: 本Skillが属する横断規約群の共通方針として、すべての関数/メソッド/クラスに「目的・理由」「影響範囲」「前提条件・制約」を日本語で記載する（AI協業を前提としたコンテキスト明記）

**必須事項**:
- すべての公開関数/メソッドに日本語コメント
- 「目的・理由」「影響範囲」「前提条件」を記載
- AI協業を前提としたコンテキスト明記

---

### エラーハンドリング

```go
// ✅ Good
func getUser(id int) (*User, error) {
    user, err := db.FindByID(id)
    if err != nil {
        return nil, fmt.Errorf("failed to get user %d: %w", id, err)
    }
    return user, nil
}

// ❌ Bad: エラー無視
func getUser(id int) *User {
    user, _ := db.FindByID(id)  // エラー無視 ❌
    return user
}
```

### Goroutines（並行処理）

```go
// ✅ Good
func fetchMultiple() ([]*User, []*Product, error) {
    var users []*User
    var products []*Product
    var eg errgroup.Group

    eg.Go(func() error {
        var err error
        users, err = getUsers()
        return err
    })

    eg.Go(func() error {
        var err error
        products, err = getProducts()
        return err
    })

    if err := eg.Wait(); err != nil {
        return nil, nil, err
    }

    return users, products, nil
}
```

### インターフェース

```go
// ✅ Good: 小さいinterface
type UserRepository interface {
    FindByID(id int) (*User, error)
    Save(user *User) error
}

// ✅ Good: 実装
type userRepository struct {
    db *sql.DB
}

func (r *userRepository) FindByID(id int) (*User, error) {
    // ...
}
```

---

## テスト

- **フレームワーク**: testing + testify
- **カバレッジ**: `go test -cover`

```go
func TestGetUser_Success(t *testing.T) {
    // Arrange
    mockRepo := new(MockUserRepository)
    mockRepo.On("FindByID", 1).Return(&User{ID: 1}, nil)

    // Act
    user, err := getUser(1)

    // Assert
    assert.NoError(t, err)
    assert.Equal(t, 1, user.ID)
    mockRepo.AssertExpectations(t)
}
```

---

