# limit-bars

Claude Code のプロンプト入力欄のすぐ上に、レートリミットの使用率を色付きの横バーで常に表示する MOD です。

```
Weekly ███░░░░░░░░░  24%   5時間 ███████░░░░░  61%   Fable ███████████░  92%
```

- 表示順: **Weekly → 5時間 → Fable**
- 色: 0〜49% は緑、50〜79% は黄、80% 以上は赤（太字）。色はお使いのテーマ（`success` / `warning` / `error`）に合わせて変わります
- ターミナルの幅が足りないときは、自動で縦 3 段に並べ替えます
- まだ数値が届いていない枠は `--%` と灰色で表示します

## インストール

Claude Code のプロンプトで次の 1 行を入力します。

```
/plugin install limit-bars --marketplace solaris-gun/claudecode_limitusage_mods
```

1. `Add marketplace?` と聞かれたら `y`
2. インストール先のスコープを選ぶ（Enter で user スコープ）
3. 設定画面で必要なら値を変更（そのまま進めてかまいません）

`Installed limit-bars. Plugin is now active.` と出れば、そのセッションからすぐに表示されます。

### 開発中のフォルダから直接読み込む場合

```
git clone https://github.com/solaris-gun/claudecode_limitusage_mods.git
claude --plugin-dir ./claudecode_limitusage_mods
```

## 設定（`/config` から変更できます）

| 項目 | 既定値 | 内容 |
| --- | --- | --- |
| `barWidth` | `12` | 1 本のバーの文字数（4〜40） |
| `layout` | `auto` | `auto`: 幅が足りれば横一列、足りなければ縦 / `inline`: 常に横一列 / `stacked`: 常に縦 |
| `fableWindow` | `fable` | Fable の使用率として扱う枠の名前（`kind`）に含まれる文字列 |

## 数値の取得元

Claude Code のステータスラインと同じ数値を使います。API の応答ごと、または枠の使用率が 1 ポイント動くたびに Claude Code から通知（`session.measure`）が届き、そのたびにバーが更新されます。

| バー | 対応する枠（`kind`） |
| --- | --- |
| Weekly | `seven_day` |
| 5時間 | `five_hour` |
| Fable | `kind` に `fableWindow` の文字列（既定は `fable`）を含む枠 |

## 注意点

- **Fable の枠名は推測です。** Claude Code が公開している型定義に載っている枠は `five_hour` と `seven_day`（およびゲートウェイの `spend_limit`）だけで、Fable 専用の枠の名前は書かれていません。`seven_day_fable` のように `fable` を含む名前で届くと想定しています。Fable のバーが `--%` のままの場合は、実際の枠名に合わせて `fableWindow` を変更してください。
- 数値が届くのは Claude のサブスクリプション（Pro / Max など）でログインしている場合だけです。API キーで使っている場合は、すべて `--%` のままになります。
- 起動直後は最初の API 応答が返るまで `--%` と表示されます。
- バー右端の `[-]` で折りたたむことができます。

## 開発

```
claude plugin validate .   # マニフェストとフックの検証
claude plugin test .       # tests/*.test.ts の実行
```

ファイル構成:

- `.claude-plugin/plugin.json` — MOD の名前と設定項目
- `.claude-plugin/marketplace.json` — このリポジトリをマーケットプレイスとして公開するためのファイル
- `hooks/register.tsx` — 数値の受け取りと、プロンプト上の帯の描画
- `hooks/bars.ts` — バーの長さ・色・並べ方の計算
- `types/index.d.ts` — MOD が保持する値の型
- `tests/limit-bars.test.ts` — テスト
