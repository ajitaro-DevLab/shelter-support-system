# 避難所業務支援Webアプリ V1実証版 詳細仕様書

文書版：1.1  
作成日：2026年8月14日  
状態：V1実証版 実装基準（改訂版）  
上位文書：
- `CURRENT_SPECIFICATION.md` — 現行V1.0実装仕様
- `V1_DEMONSTRATION_SPECIFICATION.md` — V1実証版の範囲・完成条件

---

# 0. この文書の役割

本書は、V1実証版を生成AI主体で実装するための詳細仕様・制約・テスト条件・開発運用ルールを定義する。

目的は、生成AIへ「良い感じに実装して」と任せることではない。

以下を固定し、生成AIを**実装担当**として使用する。

1. 実装範囲
2. 変更してよい範囲
3. 変更してはいけない範囲
4. API契約
5. DB構造
6. エラー時の挙動
7. テスト条件
8. Git運用
9. AIによる勝手な仕様変更を防ぐルール
10. V1実証版の終了条件

V1実証版完成までは、生成AIによる「将来を考えた改善」「便利機能追加」「設計の一般化」を原則として禁止する。

---

# 1. 仕様の優先順位

仕様が競合した場合は、次の優先順位を適用する。

```text
1. 本詳細仕様書
2. V1_DEMONSTRATION_SPECIFICATION.md
3. CURRENT_SPECIFICATION.md
4. README.md
5. その他の設計・履歴文書
6. AIの判断
```

AIの判断は最下位とする。

仕様に不明点・矛盾・不足がある場合、AIは独自判断で仕様を補完して実装してはならない。

その場合は、

```text
SPEC_QUESTION:
- 該当仕様
- 問題
- 実装への影響
- 最小の選択肢
```

として報告し、当該部分の実装を停止する。

他の独立した作業は継続してよい。

---

# 2. V1実証版の最終目的

V1実証版では、5〜10避難所程度の模擬環境において、

```text
避難所端末
    ↓
中央API
    ↓
PostgreSQL
    ↓
HQ Dashboard / Information Board
```

という情報共有が成立することを実証する。

特に確認する価値は次の4点とする。

1. 現場から少ない操作で入力できる
2. 入力内容が中央DBへ保存される
3. HQで複数避難所を横断確認できる
4. 公開情報だけがInformation Boardへ反映される

本番行政システムとしての安全性・可用性・完全なセキュリティを保証する版ではない。

---

# 3. V1実証版のスコープ凍結

## 3.1 必須実装

V1実証版で実装するものは以下に限定する。

- PostgreSQL
- REST API
- OpenAPI定義
- Docker Compose
- 5避難所の初期データ投入
- 避難所選択
- 簡易利用者識別
- Homeからの主要イベント入力
- 避難者来所
- 避難者数定時確認
- 物資受領
- 避難所不具合
- お知らせ更新
- HQ DashboardのAPI化
- Information BoardのAPI化
- 通信エラー表示
- DBバックアップまたはエクスポート
- 複数ブラウザ試験
- 同一LAN内の複数実機試験
- 基準通し試験

## 3.2 実装禁止・延期

以下はV1実証版では実装しない。

- 本格ログイン
- OAuth
- MFA
- 本格RBAC
- インターネット公開運用
- オフライン入力
- PWA
- Service Worker
- IndexedDB未送信キュー
- 自動再送
- オフライン同期
- 競合解決
- 高度な冪等性制御
- 本格監査ログ
- 150避難所負荷試験
- 高可用化
- Kubernetes
- クラウド固有機能
- SMS
- メール通知
- 電話通知
- 個人名簿
- 医療個人情報
- 詳細物流
- 在庫最適化
- 配送追跡
- OCR
- AI
- 音声入力
- 画像認識
- GPS
- QR
- NFC
- 写真添付
- チャット
- ドローン連携
- 外部行政システム連携
- オフライン地図

AIがこれらの必要性を認識した場合も、実装せず `IDEAS.md` またはIssue候補として報告するだけとする。

---

# 4. AI実装の絶対ルール

## 4.1 AIの役割

AIは**実装担当・テスト担当・ログ解析担当**である。

AIはプロダクトオーナーではない。

AIには以下の権限を与えない。

- スコープ変更
- 仕様変更
- 完成条件変更
- 既存仕様の「改善」を理由にした置換
- 未指示の大規模リファクタリング
- 新技術への置換
- 依存パッケージの無断追加
- テスト条件の緩和

## 4.2 変更禁止指示

各タスクで指定された変更対象以外のファイルに変更が必要だとAIが判断した場合、

**勝手に変更してはならない。**

次の形式で報告する。

```text
OUT_OF_SCOPE_CHANGE_REQUIRED

必要と考える変更:
対象ファイル:
理由:
変更しない場合の影響:
```

承認されるまで変更しない。

## 4.3 テスト改変禁止

実装がテストに失敗した場合、

AIは原則としてテストを変更してはならない。

特に以下は禁止する。

- assertion削除
- 期待値の実装側への追従
- timeoutを大幅に伸ばして隠す
- failing testのskip
- テストケース削除
- 仕様を変えてテストを通す

テスト自体に誤りがあると判断した場合、

```text
TEST_SPEC_CONFLICT
```

として報告する。

## 4.4 「ついで修正」禁止

次は禁止する。

```text
ついでに整理しました
将来を考えて一般化しました
よりモダンな方式に変更しました
保守性向上のため全面的に書き換えました
```

明示されたタスク達成に不要な変更は行わない。

---

# 4A. AIへの仕様書読込運用

V1実証版の詳細仕様書は長文であるため、毎タスクで全文をプロンプトへ貼り付ける運用は行わない。

仕様書はリポジトリ内に配置し、AIが必要な範囲を参照する方式とする。

## 4A.1 役割分担

```text
CLAUDE.md / AGENTS.md
        ↓
常時参照する短い開発ルール
        ↓
V1_DETAILED_SPECIFICATION.md
        ↓
タスクごとに必要章を参照
```

### CLAUDE.md / AGENTS.md に常駐させる内容

最低限、次を含める。

- `V1_DETAILED_SPECIFICATION.md` が最上位の実装仕様であること
- 仕様外機能追加禁止
- 範囲外ファイル変更禁止
- テスト改変禁止
- `SPEC_QUESTION` / `OUT_OF_SCOPE_CHANGE_REQUIRED` / `TEST_SPEC_CONFLICT` の報告規則
- タスク終了時の `git status` / `git diff --stat` / テスト報告
- 受け入れ完了後にタスク単位でコミットすること
- 現在のPhase
- 作業開始前に指定された仕様章を読むこと
- 根本原因不明時に推測で広範囲変更しないこと

`CLAUDE.md` と `AGENTS.md` を両方使用する場合、内容が矛盾してはならない。

## 4A.2 詳細仕様書の配置

詳細仕様書はリポジトリ内へ保存する。

推奨：

```text
docs/V1_DETAILED_SPECIFICATION.md
```

既存構成上、ルート直下に置く方が明確な場合はルート直下でもよい。

重要なのは、AIがローカルファイルとして参照可能であること。

## 4A.3 タスク開始時の指示

各タスクでは、AIへ参照すべき章を明示する。

例：

```text
Task 2-3を実施する。

着手前に以下を確認すること。
- 第4章 AI実装の絶対ルール
- 第4A章 AIへの仕様書読込運用
- 第5章 Git安全運用
- 第14.6節 supplies API
- 第23〜25章 ログ・テスト
- 第34章 Phase構成

指定章を確認後、Task 2-3の範囲だけを実装すること。
```

## 4A.4 全文再読込が必要な場合

次の場合は、タスク開始前に詳細仕様書全体または関連大章を再確認する。

- Phase開始時
- DBスキーマに関係する変更
- API契約に関係する変更
- 複数画面へ影響する変更
- 仕様矛盾が疑われる場合
- AIが過去の前提を失った可能性がある場合

## 4A.5 AIによる仕様要約の扱い

AIが独自に仕様を要約しても、その要約を正本として扱わない。

正本は常に `V1_DETAILED_SPECIFICATION.md` とする。

CLAUDE.md / AGENTS.md は、詳細仕様書への案内・禁止事項・作業手順を常駐させるための補助文書である。

# 5. Git安全運用

AIが誤った変更を行う可能性を前提とする。

## 5.1 Phase開始条件

Phase開始前に以下を満たすこと。

```text
git status
```

で作業ツリーがcleanである。

Phase開始時点を復旧可能なコミットとして保存する。

例：

```text
checkpoint: before phase 2
```

## 5.2 1タスク1変更単位

原則として、1タスクの変更範囲を小さくする。

例：

```text
良い:
「GET /api/shelters を実装する」

悪い:
「API全部作ってHQも直してDockerも整理する」
```

## 5.3 タスク受け入れごとのコミット

各タスクが受け入れ条件を満たした時点で、必ずコミットする。

このコミットを次タスク開始時の復旧点とする。

例：

```text
Phase 2開始
↓
checkpoint commit
↓
Task 2-1 実装
↓
git diff + test
↓
受け入れ
↓
task-complete commit
↓
Task 2-2
↓
git diff + test
↓
受け入れ
↓
task-complete commit
```

タスク途中で問題が発生した場合、原則として直前の受け入れ済みタスクのコミットまで戻す。

Phase開始時コミットはPhase全体の最終復旧点として残す。

## 5.4 AI作業後の必須確認

各タスク終了時にAIは必ず以下を実行・報告する。

```text
git status --short
git diff --stat
git diff
```

人間向け報告では全文diffを貼り付ける必要はない。

次を要約する。

```text
変更ファイル:
追加ファイル:
削除ファイル:
仕様外変更:
テスト結果:
残課題:
```

## 5.5 受け入れ条件

次のすべてを満たす場合のみ、そのタスクを受け入れ可能とする。

- 指定範囲だけが変更されている
- 仕様外機能が追加されていない
- 自動テスト成功
- 既存機能の回帰テスト成功
- エラーを握りつぶしていない
- 必要なログが残っている

## 5.6 ロールバック

AIが指示範囲外を大きく変更した場合、修復を重ねず、

**Phase開始前コミットへ戻すことを優先する。**

AIの変更を救済するために長時間を使わない。

---

# 6. 実証環境のセキュリティ境界

V1実証版には本格認証がない。

したがって、V1実証環境をインターネットへ直接公開してはならない。

## 6.1 許可する環境

```text
開発PC
 ├─ frontend
 ├─ API
 └─ PostgreSQL
       ↑
同一LAN / 同一Wi-Fi
       ↑
PC / Tablet / Smartphone
```

## 6.2 禁止事項

V1実証版のまま以下を行ってはならない。

- ルーターのポート開放
- APIポートのインターネット公開
- PostgreSQLポートのインターネット公開
- パブリックIPへの直接配置
- 認証なしクラウドVM公開
- 誰でもアクセス可能なトンネルサービス利用
- DB管理画面の外部公開

## 6.3 PostgreSQL接続

PostgreSQLはアプリケーションネットワーク内部だけから接続する。

Docker利用時、DBポートをLANへ公開する必要がなければ公開しない。

フロントエンドはPostgreSQLへ直接接続しない。

必ず、

```text
Frontend → API → PostgreSQL
```

とする。

## 6.4 外部実証

インターネット経由の外部実証はV1実証版の完成条件に含めない。

必要になった場合は、認証・HTTPS・ネットワーク制御を含む別Phaseとして仕様を追加してから実施する。

---

# 7. ネットワーク仕様

## 7.1 開発PC

開発PC上で以下を起動する。

- Frontend
- Backend API
- PostgreSQL

## 7.2 LANアクセス

スマートフォン・タブレットから実証する場合、開発PCのLAN内IPアドレスを利用する。

例：

```text
開発PC: 192.168.x.x
Frontend: http://192.168.x.x:<frontend-port>
API:      http://192.168.x.x:<api-port>
```

具体的ポート番号は実装時に一箇所の設定へ集約する。

## 7.3 API bind

実機試験時のみ、API/FrontendはLAN内端末から到達可能なbind設定とする。

開発中に不要な外部インターフェースへ公開しない。

## 7.4 Windows Firewall等

複数端末試験時には以下を確認する。

- 同一Wi-Fiに接続している
- ゲストWi-Fi分離が有効でない
- Windows Firewallが必要なローカル通信を許可している
- Dockerポートが正しく公開されている
- `localhost` 固定URLがフロントコードに残っていない

---

# 8. 推奨ディレクトリ構成

既存構成を大きく壊さず、次の分離を目標とする。

```text
shelter-map-app/
├─ frontend/
│  ├─ launcher.html
│  ├─ index.html
│  ├─ information.html
│  ├─ hq-dashboard.html
│  ├─ event-center.html
│  ├─ css/
│  └─ js/
│
├─ backend/
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ repositories/
│  │  ├─ db/
│  │  └─ app.*
│  ├─ tests/
│  └─ package.json
│
├─ database/
│  ├─ migrations/
│  ├─ seed/
│  └─ scripts/
│
├─ docs/
│  ├─ openapi.yaml
│  └─ ...
│
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

既存リポジトリ構造との不整合が大きい場合、AIは全面移動せず、差分案を報告する。

---

# 9. 設定管理

環境依存値をコードへ直書きしない。

最低限、以下を設定として分離する。

```text
DATABASE_URL
API_PORT
FRONTEND_PORT
API_BASE_URL
APP_ENV
```

秘密情報をGitへコミットしない。

リポジトリへ置くのは、

```text
.env.example
```

のみとする。

V1実証版では機密性の高い本番秘密情報は使用しない。

---

# 10. DB開発方針

## 10.1 開発DBは捨てられること

V1実証版開発中のDBは、永続データではなく**再生成可能なテスト環境**として扱う。

スキーマ変更時は、

```text
DB reset
↓
migration
↓
seed
↓
test
```

を基本とする。

既存テストデータを無理に維持するための複雑な移行処理はV1実証版では作らない。

## 10.2 再現可能な初期状態

以下の処理を1コマンドまたは明確な手順で実施できるようにする。

```text
reset-db
seed-db
run-tests
```

名称は実装技術に合わせてよい。

## 10.3 DB永続性テストとの区別

Phase開発中：

```text
DBデータは消してよい
```

V1実証版最終試験：

```text
DBデータを保持してブラウザ・サーバー再起動後も残ることを確認
```

この2つを混同しない。

---

# 11. DBスキーマ詳細

## 11.1 shelters

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | `shelter-001`形式等の一意ID |
| name | Yes | 施設名 |
| latitude | No | 緯度 |
| longitude | No | 経度 |
| initial_status | Yes | green/yellow/red/gray |
| is_active | Yes | 使用中フラグ |
| created_at | Yes | 作成日時 |
| updated_at | Yes | 更新日時 |

### 制約

- `id` は一意
- `name` は空文字禁止
- 無効施設は通常一覧から除外可能とする

---

## 11.2 users

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | 一意ID |
| display_name | Yes | 表示名 |
| role | Yes | demo_operator / demo_hq 等 |
| is_active | Yes | 有効フラグ |
| created_at | Yes | 作成日時 |

### 注意

これは認証ユーザーではない。

V1実証用の「更新主体識別」である。

---

## 11.3 shelter_status

| 列 | 必須 | 内容 |
|---|---|---|
| shelter_id | Yes | 避難所ID |
| current_count | Yes | 現在人数 |
| confirmed_count | No | 最終正式確認人数 |
| confirmed_at | No | 最終正式確認日時 |
| confirmation_slot | No | 09:00 / 13:00 / 18:00 |
| status | Yes | green/yellow/red/gray |
| confidence | Yes | confirmed/estimated/unconfirmed等 |
| updated_at | Yes | 最新更新日時 |
| updated_by | Yes | users.id |

### 制約

- `current_count >= 0`
- `confirmed_count >= 0`
- shelterごとに最新状態1行を基本とする

### confidence遷移規則

`confidence` は「その現在人数がどのように確定された値か」を表す。

情報の古さは `freshness` で表し、`confidence` と混同しない。

| 状況 | confidence |
|---|---|
| 定時確認を保存した直後 | `confirmed` |
| 定時確認後に避難者来所・退出による人数増減が発生 | `estimated` |
| 現在の確認枠で正式確認が一度も実施されていない | 表示上 `unconfirmed` |
| 時間が経過しただけ | DB上のconfidenceは変更しない |

例：

```text
18:00 定時確認 96名
→ confirmed

18:10 5名来所
→ estimated

22:00 時間経過
→ estimatedのまま
```

### confidenceとfreshnessの責務

```text
confidence
= その値がどう作られたか

freshness
= その値がどの程度古いか
```

時間経過のみを理由として、`confirmed → estimated → unconfirmed` のようなDB更新は行わない。

新しい確認枠に入り、まだ正式確認が実施されていない場合は、HQ等の表示時に `unconfirmed` と判定してよい。

この判定のためだけに定時バッチでDBのconfidenceを書き換える処理はV1実証版では追加しない。

---

## 11.4 events

イベントは共通履歴として保持する。

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | 一意イベントID |
| event_type | Yes | イベント種別 |
| shelter_id | Yes | 対象避難所 |
| occurred_at | Yes | 発生日時 |
| created_at | Yes | DB登録日時 |
| updated_by | Yes | 更新主体 |
| payload | Yes | JSON |
| status | Yes | accepted等 |

### event_type

V1実証版では以下に限定する。

```text
visitor_change
confirmation
supply_received
issue_update
notice_update
```

緊急連絡は追加しない。

---

## 11.5 confirmations

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | 一意ID |
| shelter_id | Yes | 避難所 |
| confirmation_slot | Yes | 確認枠 |
| confirmed_count | Yes | 正式確認人数 |
| confirmed_at | Yes | 確認日時 |
| updated_by | Yes | 更新主体 |
| created_at | Yes | DB登録日時 |

---

## 11.6 supplies

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | 一意ID |
| shelter_id | Yes | 避難所 |
| supply_type | Yes | 種別 |
| quantity | Yes | 数量 |
| unit | Yes | 単位 |
| occurred_at | Yes | 受領日時 |
| updated_by | Yes | 更新主体 |
| created_at | Yes | DB登録日時 |

数量は1以上の整数。

---

## 11.7 issues

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | 一意ID |
| shelter_id | Yes | 避難所 |
| category | Yes | カテゴリ |
| severity | Yes | normal/caution/urgent |
| occurred_at | Yes | 発生・更新日時 |
| updated_by | Yes | 更新主体 |
| created_at | Yes | DB登録日時 |

カテゴリ：

```text
toilet
hygiene
power
water
air_conditioning
building
other
```

---

## 11.8 notices

| 列 | 必須 | 内容 |
|---|---|---|
| id | Yes | 一意ID |
| shelter_id | Yes | 避難所 |
| title | Yes | 30文字以内 |
| start_time | Yes | 時刻 |
| location | Yes | 40文字以内 |
| body | Yes | 100文字以内 |
| is_public | Yes | 公開フラグ |
| occurred_at | Yes | イベント日時 |
| updated_by | Yes | 更新主体 |
| created_at | Yes | DB登録日時 |

---

# 12. 初期データ

現行仕様の5避難所をseedデータとして維持する。

- `shelter-001`
- `shelter-002`
- `shelter-003`
- `shelter-004`
- `shelter-005`

現行JSONに存在するデータを基準とし、AIが架空の追加データへ置換しない。

10避難所試験を実施する場合、追加5施設は明示的なテストデータとして区別する。

---

# 13. REST API共通仕様

## 13.1 Base Path

```text
/api
```

## 13.2 データ形式

```text
application/json
```

## 13.3 正常レスポンス

APIごとに必要なデータをJSONで返す。

不要な内部情報、SQLエラー、スタックトレースはクライアントへ返さない。

## 13.4 エラーレスポンス

共通形を使用する。

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容を確認してください。"
  }
}
```

クライアント向けメッセージとサーバーログ向け詳細を分離する。

## 13.5 主なHTTP Status

```text
200 OK
201 Created
400 Bad Request
404 Not Found
409 Conflict（必要な場合のみ）
500 Internal Server Error
503 Service Unavailable
```

V1実証版で不要に細かい独自ステータス体系を作らない。

---

# 14. APIエンドポイント

## 14.1 GET /api/health

目的：

- API起動確認
- Docker Composeのhealth確認
- 実証時の疎通確認

成功例：

```json
{
  "status": "ok"
}
```

DB疎通も確認する場合は、内部状態を過度に公開しない。

---

## 14.2 GET /api/shelters

有効な避難所一覧を返す。

最低限：

```json
[
  {
    "id": "shelter-002",
    "name": "I市立Alpha中学校",
    "status": "yellow",
    "currentCount": 86,
    "updatedAt": "..."
  }
]
```

---

## 14.3 GET /api/shelters/{id}

対象避難所のHome/HQ詳細に必要な情報を返す。

以下を含む。

- 基本情報
- 現在人員
- 正式確認値
- 状態
- 信頼度
- 最終更新者
- 最新物資受領
- 最新不具合
- 直近3履歴

---

## 14.4 POST /api/shelters/{id}/events/visitor-change

入力：

```json
{
  "delta": 10,
  "occurredAt": "...",
  "updatedBy": "demo-user-01"
}
```

### 検証

- deltaは0以外の整数
- 更新後人数0未満禁止
- shelter存在確認
- user存在確認

### 成功

- events追加
- shelter_status.current_count更新
- updated_at更新
- updated_by更新
- 直前に正式確認済みであっても、人数増減後は `confidence = estimated` とする

この2処理は同一DBトランザクション内で行う。

---

## 14.5 POST /api/shelters/{id}/confirmations

入力例：

```json
{
  "mode": "unchanged",
  "confirmedCount": 96,
  "confirmationSlot": "18:00",
  "occurredAt": "...",
  "updatedBy": "demo-user-01"
}
```

### 成功時

- confirmations追加
- events追加
- shelter_status.current_count更新
- confirmed_count更新
- confirmed_at更新
- confirmation_slot更新
- updated_by更新
- `confidence = confirmed` とする

同一トランザクションで行う。

---

## 14.6 POST /api/shelters/{id}/supplies

入力：

```json
{
  "supplyType": "blanket",
  "quantity": 20,
  "unit": "枚",
  "occurredAt": "...",
  "updatedBy": "demo-user-01"
}
```

在庫残量計算は行わない。

---

## 14.7 POST /api/shelters/{id}/issues

入力：

```json
{
  "category": "power",
  "severity": "urgent",
  "occurredAt": "...",
  "updatedBy": "demo-user-01"
}
```

### 状態反映

同一避難所に存在する最新カテゴリ状態を評価する。

```text
urgentあり → red
urgentなし、cautionあり → yellow
全カテゴリnormal → 不具合由来の上書き解除
```

既存V1.0の判定思想を維持する。

---

## 14.8 GET /api/shelters/{id}/notices

対象避難所のお知らせを取得する。

Information Board用途では、

```text
is_public = true
```

だけを返すモードまたは専用クエリを持たせる。

---

## 14.9 POST /api/shelters/{id}/notices

現行入力規則を維持する。

- title 必須 30文字以内
- startTime 必須
- location 必須 40文字以内
- body 必須 100文字以内
- isPublic 必須

---

## 14.10 GET /api/hq/shelters

HQ一覧に必要な全避難所の現在値を一括取得する。

最低限：

- shelterId
- name
- status
- currentCount
- confirmedCount
- confirmedAt
- freshness
- confidence
- updatedAt
- updatedBy

---

# 15. トランザクション方針

以下は1操作として成功または失敗させる。

例：

```text
visitor-change
  ├─ eventsへ履歴追加
  └─ shelter_status更新
```

片方だけ成功してはいけない。

DB処理途中で失敗した場合はロールバックする。

同様に、

- confirmation
- issue update

も関連更新を同一トランザクションで扱う。

---

# 16. Home詳細仕様

## 16.1 起動時

以下の順で処理する。

```text
1. 避難所設定確認
2. 利用者設定確認
3. API疎通
4. 避難所情報取得
5. 画面表示
```

避難所未選択なら避難所選択へ誘導する。

## 16.2 常時表示

画面上部に必ず現在の避難所名を表示する。

別避難所誤入力を避けるため、入力モーダル内にも避難所名を表示する。

## 16.3 「人が来た」

現行UIの入力規則を維持する。

保存成功後のみ現在人数表示を更新する。

API失敗時にローカル表示だけ増減してはならない。

## 16.4 「物が来た」

現行物資受領モーダルを接続する。

## 16.5 「困りごとが出た」

現行不具合モーダルを接続する。

## 16.6 「状態が変わった」

V1実証版では新しい自由入力状態機能を作らない。

既存操作へ誘導する。

## 16.7 定時確認

Event Centerだけでなく、Homeから到達可能にする。

UI新設が大きくなる場合は、既存モーダルを再利用する。

---

# 17. 避難所選択仕様

## 17.1 初回

APIから避難所一覧を取得し選択する。

## 17.2 保存

選択した `shelterId` をlocalStorage等へ保存してよい。

これは業務データではない。

## 17.3 変更

誤変更を避けるため、通常画面の目立つ位置に頻繁な切替ボタンを置かない。

設定画面またはLauncher経由とする。

## 17.4 表示

Home / Event Center / Information Boardで、選択避難所を明示する。

HQ Dashboardは全避難所を扱うため固定しない。

---

# 18. 簡易利用者識別仕様

## 18.1 目的

認証ではなく、

```text
誰が更新操作を行ったか
```

を実証するための識別である。

## 18.2 初期選択

実証用ユーザー一覧から選択するか、規定形式で入力する。

## 18.3 保存

端末に選択ユーザーIDを保存してよい。

## 18.4 禁止

利用者IDを「セキュリティ認証」と表現しない。

他人へのなりすまし防止を保証しない。

---

# 19. HQ Dashboard詳細仕様

現行UI・ソート・フィルター・色分けを最大限維持する。

全面的なUI再設計は禁止する。

## 19.1 データ源

JSON + localStorage統合をやめ、`GET /api/hq/shelters` を使用する。

## 19.2 更新

V1実証版はポーリング方式とする。

推奨範囲：

```text
5〜30秒
```

具体値は設定に集約する。

WebSocketは追加しない。

## 19.3 失敗

API取得失敗時：

- 現在の表示を可能なら維持
- 「更新できませんでした」を表示
- 画面を空にしない
- 前回取得時刻を残す

## 19.4 地図障害

地図タイル取得失敗でも一覧・詳細を利用可能とする。

---

# 20. Information Board詳細仕様

## 20.1 表示専用

入力機能を追加しない。

## 20.2 取得対象

選択避難所の公開お知らせのみ。

非公開データをHTMLへ埋め込んで隠す方式は禁止する。

API側で公開対象だけを返す。

## 20.3 更新

30〜60秒程度のポーリングでよい。

## 20.4 通信失敗

前回正常取得した表示を維持する。

最後の正常更新時刻を表示する。

---

# 21. Event Center詳細仕様

Event Centerは、

- 管理
- デバッグ
- 詳細入力
- 通し試験

向け画面とする。

Homeと同じAPIを利用する。

Event Center専用の別保存ロジックを作らない。

同じ業務イベントは同じservice/API経路を通す。

---

# 22. エラー処理

## 22.1 原則

エラー時に、

```text
保存できていないのに保存成功に見える
```

ことを最優先で防ぐ。

## 22.2 API送信失敗

表示例：

```text
サーバーに接続できません。
入力内容は保存されていません。
通信状態を確認して、もう一度実行してください。
```

## 22.3 DB失敗

APIは成功レスポンスを返さない。

## 22.4 Validation

入力フォーム側とAPI側の両方で最低限検証する。

フロントエンド検証だけに依存しない。

## 22.5 エラー詳細

ユーザー画面：

```text
短く、行動可能なメッセージ
```

ログ：

```text
原因調査に必要な技術詳細
```

と分ける。

---

# 23. ログ設計

フルAI実装では、ログ量そのものより**AIが原因追跡できる構造**を優先する。

## 23.1 ログ分類

最低限：

```text
application
api
database/error
test
```

物理ファイルを必ず4分割する必要はないが、ログ上でカテゴリ判別可能にする。

## 23.2 必須項目

可能な範囲で以下を含める。

```text
timestamp
level
requestId
shelterId
eventType
userId
result
errorCode
```

個人情報は記録しない。

## 23.3 requestId

各API要求にrequestIdを付与し、1要求の流れを追えるようにする。

## 23.4 通常時

大量のdebugログを常時出さない。

標準は、

```text
INFO
WARN
ERROR
```

程度とする。

## 23.5 テスト失敗時

AIはログ全体を人間へ貼り付けない。

以下に要約する。

```text
失敗テスト:
直接原因:
該当API/ファイル:
修正内容:
再テスト:
残る不確実性:
```

---

# 24. AIによるログ解析ルール

AIはテスト失敗時、次の順序で調査する。

```text
1. failing testを特定
2. requestId / shelterId / eventTypeで対象ログを絞る
3. API入力確認
4. validation確認
5. service処理確認
6. DB処理確認
7. response確認
8. UI反映確認
```

推測でコードを広範囲に修正しない。

原因を特定できない場合は、

```text
ROOT_CAUSE_NOT_CONFIRMED
```

と報告する。

---

# 25. 自動テスト構成

ログを読む量を減らすため、受け入れテストを重視する。

## 25.1 Unit Test

最低限：

- 人数増減validation
- 0未満拒否
- 物資数量validation
- notice文字数validation
- issue severity評価
- 定時確認枠判定

## 25.2 API Test

最低限：

- shelter一覧取得
- shelter詳細取得
- visitor-change成功
- visitor-change負数失敗
- confirmation成功
- supply成功
- issue成功
- notice公開/非公開
- HQ一覧取得
- 存在しないshelterへの400/404

## 25.3 Integration Test

例：

```text
避難所Aをseed
↓
+10登録
↓
DB current_count増加
↓
events履歴追加
↓
HQ APIで同じ人数
```

## 25.4 Cross-shelter Test

重要：

```text
shelter-Aを更新
↓
shelter-Aのみ変化
↓
shelter-Bは変化なし
```

これは必須とする。

## 25.5 Notice Test

```text
公開notice
→ Information Board APIに出る

非公開notice
→ Information Board APIに出ない
```

---

# 26. 基準シナリオテスト

現行 `V1_TEST_SCENARIO.md` の9イベントをAPI/DB版へ移植する。

最終期待値は現行仕様を基準とする。

- 現在人数：96
- 正式確認人数：96
- 最終正式確認：18:00
- 最新受領：毛布20枚
- 避難所状態：要支援
- Information Board：公開した14:00給水情報のみ
- 画面履歴：最新3件
- 内部イベント：9件

この期待値をAIが勝手に変更してはならない。

---

# 27. 複数ブラウザ試験

開発PC1台で次を同時に開く。

```text
Chrome  → shelter-002 Home
Edge    → 別避難所またはInformation Board
Firefox → HQ Dashboard
```

確認：

1. Homeで入力
2. DB保存
3. HQ更新
4. Information Board更新
5. 他避難所に影響なし

---

# 28. 複数実機試験

V1実証版最終段階で実施する。

例：

```text
PC → HQ Dashboard
スマートフォン → shelter-002 Home
別ブラウザ/端末 → Information Board
```

必須確認：

- LAN内接続
- スマホ表示
- タッチ操作
- API到達
- 更新共有
- ブラウザ再読込
- サーバー再起動後DB保持

テスト用PCを複数購入することは完成条件ではない。

---

# 29. 通信断試験

V1実証版はオフライン保存を行わない。

そのため確認する内容は、

```text
通信断
↓
送信
↓
失敗表示
↓
「保存されていない」と明示
↓
通信復旧
↓
再送
↓
正常保存
```

である。

未送信キューは実装しない。

---

# 30. バックアップ・エクスポート

最低1つ実装する。

推奨：

```text
PostgreSQL dump
```

または実証データのJSON/CSVエクスポート。

確認事項：

- バックアップ生成
- ファイルが空でない
- 主要イベントが含まれる
- 実証結果を後日確認可能

本番級の自動世代管理は不要。

---

# 31. Docker Compose

最低構成：

```text
frontend
backend
postgres
```

目標：

```text
docker compose up
```

で必要サービスが起動する。

DB初期化・seed手順をREADMEに記載する。

## 31.1 停止・再起動

以下を試験する。

```text
docker compose down
docker compose up
```

通常停止・再起動でDB永続データが保持される構成とする。

ただし開発DB resetコマンドでは明示的に消せること。

---

# 32. 依存パッケージ管理

AIは依存を必要最小限にする。

新しいパッケージ追加時は報告する。

報告形式：

```text
DEPENDENCY_ADDED
name:
purpose:
why existing stack cannot handle it:
```

同じ機能のライブラリを複数導入しない。

巨大なフレームワークへの無断移行は禁止する。

---

# 33. OpenAPI

実装されたAPIを `docs/openapi.yaml` 等で定義する。

OpenAPIと実装が食い違ってはならない。

各Phase終了時に、

```text
実装API
OpenAPI
API tests
```

の一致を確認する。

---

# 34. Phase構成

---

## Phase 0：安全基盤

### 目的

AIによる無制限変更を防ぎ、再現可能な開発環境を作る。

### 実装

- Git clean確認
- checkpoint commit
- 本詳細仕様書配置
- AI共通ルール配置（`CLAUDE.md` / `AGENTS.md` 等）
- 詳細仕様書をリポジトリ内へ配置し、タスクごとの参照章指定ルールを設定
- `.env.example`
- 基本README更新
- DB reset/seed方針決定

### 完了条件

- 仕様優先順位が明記されている
- AI変更禁止ルールがリポジトリ内に存在
- Phase開始前へ戻せる

---

## Phase 1：サーバー・DB基盤

### 実装

- PostgreSQL
- backend skeleton
- DB接続
- migrations
- seed
- `GET /api/health`
- `GET /api/shelters`
- Docker Compose

### テスト

- compose起動
- DB接続
- seed 5避難所
- shelter一覧取得
- DB reset → seed再現

### Phase完了条件

上記テスト全成功。

---

## Phase 2：業務イベントAPI

### 実装順

1. visitor-change
2. confirmation
3. supplies
4. issues
5. notices
6. shelter detail
7. HQ API

1機能ずつ実装・テスト・受け入れする。

### 完了条件

- Unit/API/Integration test成功
- Cross-shelter test成功
- OpenAPI更新

---

## Phase 3：フロントAPI化

### 実装

- API client共通化
- Home取得元変更
- Event Center取得元変更
- HQ取得元変更
- Information Board取得元変更
- localStorage業務データ依存撤去

### 制約

UI全面書き換え禁止。

現行動作・見た目を可能な限り維持する。

### 完了条件

現行主要画面がAPIデータで動作。

---

## Phase 4：実証UI

### 実装

- 避難所選択
- 簡易利用者選択
- Home主要イベント入力接続
- 通信エラー表示
- 更新者表示

### 完了条件

Event Centerを使わなくてもHomeから主要業務を実行可能。

---

## Phase 5：実証試験

### 実施

- DB reset
- seed
- 9イベント基準試験
- 複数ブラウザ
- PC＋スマホ
- 通信断
- サーバー再起動
- DB保持
- バックアップ
- Docker再起動

### 完了条件

本書「V1実証版受け入れ基準」をすべて満たす。

---

# 35. 各PhaseのAI報告フォーマット

AIは長い技術説明ではなく、各Phase終了時に次を報告する。

```text
## Phase X 完了報告

### 1. 結論
PASS / FAIL / BLOCKED

### 2. 実装したもの
- ...

### 3. 変更ファイル
- ...

### 4. 仕様外変更
なし / あり

### 5. テスト
総数:
成功:
失敗:

### 6. 失敗があった場合
原因:
修正:
再テスト:

### 7. git diff確認
意図した範囲のみ / 要確認

### 8. 未解決事項
- ...

### 9. 次Phaseへ進めるか
YES / NO
```

人間が理解しにくい内部実装詳細は、必要時のみ補足する。

---

# 36. AIが停止すべき条件

次の場合、AIは勝手に先へ進まない。

- 仕様が矛盾
- 仕様外ファイル変更が必要
- DB構造を大きく変更する必要
- 新規主要依存が必要
- セキュリティ境界を変更する必要
- インターネット公開が必要
- テストを変更しなければ通らない
- 現行UIを全面変更しなければ実装不能
- データ損失の可能性がある
- root causeを確認できない

報告後、独立した安全な作業だけ継続可能。

---

# 37. AIが自動修正してよい範囲

次は、指定タスク範囲内であれば自動修正してよい。

- syntax error
- lint error
- 明白な型/引数ミス
- 仕様通りでないvalidation
- API responseの単純な不一致
- テストで明確に原因が特定された実装バグ
- typo
- 指定範囲内の小規模リファクタリング

ただし修正後は必ず再テストする。

---

# 38. V1実証版受け入れ基準

以下をすべて満たすこと。

## 基盤

- [ ] Docker Composeで起動可能
- [ ] PostgreSQLへ接続可能
- [ ] 5避難所seed可能
- [ ] DB reset可能
- [ ] API health正常

## 避難所操作

- [ ] 避難所を選択できる
- [ ] 利用者を識別できる
- [ ] 避難者増減を登録できる
- [ ] 定時確認できる
- [ ] 定時確認直後のconfidenceがconfirmedになる
- [ ] 定時確認後の人数増減でconfidenceがestimatedになる
- [ ] 現在確認枠未実施時に表示上unconfirmed判定できる
- [ ] 物資受領できる
- [ ] 不具合登録できる
- [ ] お知らせ登録できる

## 情報共有

- [ ] HQへ反映
- [ ] 公開noticeだけInformation Boardへ反映
- [ ] 非公開noticeは表示されない
- [ ] 他避難所へ誤反映されない

## エラー

- [ ] API停止時に保存失敗を明示
- [ ] DB失敗を成功扱いしない
- [ ] 入力エラーを拒否
- [ ] 地図失敗でも一覧操作可能

## データ

- [ ] ブラウザ再起動後もデータ保持
- [ ] サーバー通常再起動後もDB保持
- [ ] 9イベント基準試験一致
- [ ] バックアップ/エクスポート可能

## 複数端末

- [ ] 複数ブラウザで共有
- [ ] 同一LANのスマホまたは別端末からアクセス
- [ ] PC側HQへ反映

## AI開発品質

- [ ] 各Phaseにcheckpointあり
- [ ] 各受け入れ済みタスクにtask-complete commitあり
- [ ] git diffで仕様外変更なし
- [ ] テスト改変によるごまかしなし
- [ ] 未承認のスコープ追加なし
- [ ] OpenAPIと実装一致

---

# 39. V1実証版の非合格条件

以下のいずれかが残る場合は、V1実証版完成としない。

- 保存成功表示なのにDBへ保存されない
- shelter-Aの更新がshelter-Bへ入る
- 非公開noticeがInformation Boardへ出る
- DB再起動でデータが消える
- APIエラーをユーザーへ通知しない
- 9イベント基準シナリオが一致しない
- AIが仕様外機能を混入させたまま
- LAN実機からアクセスできない
- インターネット公開を前提としなければ動かない
- 実行手順が再現できない

---

# 40. 実証後にのみ検討するもの

V1実証版完成後、実証結果を確認して初めて次を検討する。

```text
認証
権限
オフライン
同期
競合解決
監査ログ
本格バックアップ
障害復旧
大規模負荷
本格セキュリティ
外部接続
OSS公開
```

「将来必要そう」という理由だけでは着手しない。

---

# 41. 開発終了ルール

V1実証版の受け入れ基準を満たしたら、追加改善を開始せず一旦終了する。

実施するのは以下のみ。

1. 最終通し試験結果を保存
2. `README.md` 更新
3. `DEVELOPMENT_HISTORY.md` 更新
4. `LESSONS_LEARNED.md` 更新
5. 既知問題を `KNOWN_LIMITATIONS.md` に記録
6. release/tagを作成
7. 次段階へ進むか別途判断

V1実証版完成後の改善案は `IDEAS.md` へ送る。

---

# 42. この仕様で最も優先する設計原則

優先順位は次の通りとする。

```text
1. データを正しい避難所へ保存する
2. 保存できなかった場合に成功扱いしない
3. 現行V1.0の業務モデルを壊さない
4. 複数端末間で同じ情報を共有する
5. 人間が少ない操作で使える
6. AIが仕様範囲から逸脱しない
7. 開発環境を簡単に再生成できる
8. 将来拡張性
```

将来拡張性はV1実証版では最下位とする。

---

# 43. AI向け最上位命令

実装AIへは、各Phaseの依頼とともに次を渡す。

```text
あなたは本プロジェクトの実装担当です。

V1_DETAILED_SPECIFICATION.md を最上位の実装仕様として扱ってください。
仕様にない機能を追加しないでください。
仕様を改善・一般化・拡張しないでください。
指定されたタスク範囲外のファイルを勝手に変更しないでください。

範囲外変更が必要なら実装せず報告してください。
テストを通すために仕様・期待値・テスト条件を変更しないでください。
失敗時はログから根本原因を特定し、仕様内の実装だけを修正してください。
根本原因を確認できない場合は推測で広範囲を変更せず、停止して報告してください。

各タスク開始前に、依頼で指定された `V1_DETAILED_SPECIFICATION.md` の章を参照してください。
Phase開始時または複数領域に影響する変更では、関連大章を再確認してください。

各タスク終了時に、
- git status
- git diff --stat
- 変更範囲
- テスト結果
- 仕様外変更の有無
を報告してください。

タスクが受け入れ条件を満たしたら、その時点でコミットし、そのコミットを次タスクの復旧点としてください。

将来機能の提案は実装せず、必要ならIssue候補として分離してください。
```

---

# 44. 最終完成定義

V1実証版の完成とは、

> 5〜10避難所程度の模擬環境において、同一LAN内の複数端末から避難所情報を入力し、中央PostgreSQLへ保存し、HQ DashboardとInformation Boardへ必要な情報を正しく共有でき、基準通し試験・通信失敗試験・再起動試験・バックアップ確認を通過した状態

とする。

それ以上の機能はV1実証版完成条件に含めない。
