# limit-bars

Claude Code のプロンプト入力欄のすぐ上に、レートリミットの使用率を色付きの横バーで、その横に今使っているモデルと Effort を常に表示する MOD です。

```
5h ▄▄▄▄▄▁▁▁  61%  W ▄▄▁▁▁▁▁▁  24%  F ▄▄▄▁▁▁▁▁  34%  Opus 5.5 · high
```

- 表示順: **5時間（5h）→ Weekly（W）→ Fable（F）**
- バーはマスの下半分だけを塗るので、1 行の中でも背が低く控えめに見えます（形は設定で変えられます）
- 色: 0〜49% は緑、50〜79% は黄、80% 以上は赤（太字）。色はお使いのテーマ（`success` / `warning` / `error`）に合わせて変わります
- ターミナルの幅が足りないときは、自動で縦 3 段に並べ替えます
- まだ数値が届いていない枠は `--%` と灰色で表示します
- バーの右に、今使っているモデルと Effort を灰色で表示します（最初の応答までは Effort が `--`）

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
| `barStyle` | `half` | `half`: マスの下半分だけ塗る（▄▁） / `line`: 細い線（━─） / `block`: マス全体を塗る（█░） |
| `labelStyle` | `short` | `short`: 5h / W / F / `long`: 5時間 / Weekly / Fable |
| `barWidth` | `8` | 1 本のバーの文字数（4〜40） |
| `layout` | `auto` | `auto`: 幅が足りれば横一列、足りなければ縦 / `inline`: 常に横一列 / `stacked`: 常に縦 |
| `fableWindow` | `fable` | Fable を見分ける文字列（枠の名前やモデル名に含まれるもの） |
| `showFable` | `auto` | `auto`: 使用量 API の応答に Fable の枠がなければ（Pro プランなど）Fable のバーを出さない / `always`: 常に出す / `never`: 出さない |
| `fetchUsage` | `true` | Fable の使用率を使用量 API から取得する（下記） |
| `showModel` | `true` | バーの横に、今使っているモデルと Effort を表示する |

文字の大きさはターミナル側の設定で決まるため、MOD からは変えられません。

## 数値の取得元

| バー | 取得元 |
| --- | --- |
| 5時間 | Claude Code が MOD に渡す枠 `five_hour`（ステータスラインと同じ値） |
| Weekly | Claude Code が MOD に渡す枠 `seven_day` |
| Fable | 使用量 API `https://api.anthropic.com/api/oauth/usage` の応答のうち、`fable` を含む枠 |
| モデル | 起動時は `/model` と同じ値（`$.session.model()`）。その後はモデルへのリクエストごと（`turn.step`）と `/model` での切り替え時に更新 |
| Effort | モデルへのリクエストごと（`turn.step`）に、そのリクエストで使う Effort を読む。サブエージェントのリクエストは対象外 |

5時間と Weekly は、API の応答ごと、または使用率が 1 ポイント動くたびに Claude Code から届き、そのたびにバーが更新されます。

Claude Code が MOD に渡す枠は `five_hour` と `seven_day` だけで、Fable の枠は含まれていません。そこで Fable だけは、Claude Code の `/usage` と同じ取得先（使用量 API）に問い合わせます。

- 問い合わせには、Claude Code がログインに使っている認証情報を Claude Code 自身が付けます（`$.session.authorize()`）。認証情報そのものは MOD には渡りません
- 問い合わせは起動時、`/limit-bars` 実行時、使用率が動いたとき（ただし前回から 2 分以上あいたとき）だけです
- `fetchUsage` を `false` にすると問い合わせをやめます

## 届いている値を確かめる（`/limit-bars`）

| 入力 | 表示される内容 |
| --- | --- |
| `/limit-bars` | Claude Code から届いている枠の一覧と、Fable の取得結果 |
| `/limit-bars raw` | 使用量 API の応答をそのまま（先頭 4000 文字） |

Fable のバーが `--%` のままのときは、`/limit-bars raw` の結果を確認してください。

## 注意点

- **使用量 API は公式ドキュメントのない窓口です。** 応答の形は第三者ツール [ccusage](https://pypi.org/project/ccusage/) の説明を参考にしており、予告なく変わったり使えなくなったりする可能性があります。その場合も 5時間と Weekly のバーは影響を受けません。
- Fable の上限は Max プラン（および Team / Enterprise の premium seat）で「週の上限の 50% まで」です（[Claude Fable models on your plan](https://support.claude.com/en/articles/15424964)）。Pro プランでは Fable はプランの上限に含まれないため、既定（`showFable: auto`）では使用量 API の応答に Fable の枠がないことを確かめた時点で Fable のバーを隠し、5時間と Weekly の 2 本だけを表示します。MOD からはプランの種類を直接読めないため、応答の中身で判断しています。
- 使用量 API の取得に失敗したときや、起動直後でまだ取得していないときは、プランにかかわらず Fable のバーを `--%` で表示します。
- 数値が届くのは Claude のサブスクリプション（Pro / Max など）でログインしている場合だけです。API キーで使っている場合は、すべて `--%` のままになります。
- 起動直後は最初の API 応答が返るまで `--%` と表示されることがあります。
- バー右端の `[-]` で折りたたむことができます。

## 更新

```bash
claude plugin marketplace update claudecode-limitusage-mods
claude plugin update limit-bars@claudecode-limitusage-mods
```

更新後は Claude Code を再起動してください。

## 開発

```
claude plugin validate .   # マニフェストとフックの検証
claude plugin test .       # tests/*.test.ts の実行
```

ファイル構成:

- `.claude-plugin/plugin.json` — MOD の名前と設定項目
- `.claude-plugin/marketplace.json` — このリポジトリをマーケットプレイスとして公開するためのファイル
- `hooks/register.tsx` — 数値の受け取りと、プロンプト上の帯の描画
- `hooks/bars.ts` — バーの長さ・形・色・並べ方の計算
- `hooks/usage-api.ts` — 使用量 API の応答から Fable の使用率を探す
- `types/index.d.ts` — MOD が保持する値の型
- `tests/limit-bars.test.ts` — テスト
