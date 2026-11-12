# SVARAC（スバラシー） LP

公開ページ：GitHub Pages（このリポジトリの main ブランチ直下）

## 更新のしかた

中身はすべて `data.json` に入っています。ページの見た目や仕組みを触らずに、ここだけ書き換えれば更新できます。

- **次回の配信を出す**：`episodes` に1件足す。配信の終了時刻を過ぎると、自動で「これまでの配信」に移ります
- **スタッフを出す**：`staff` に1人ずつ足す。いないあいだは、スタッフの欄そのものが表示されません
- **見本つきで見る**：URLの最後に `?demo` をつけると、見本のデータで全部の欄を確認できます

### episodes（配信）

```json
{
  "no": 1,
  "start": "2026-11-21T21:00:00+09:00",
  "end": "2026-11-21T22:30:00+09:00",
  "guests": [
    { "name": "ゲストの名前", "photo": "assets/img/guests/name.jpg" }
  ],
  "guestNote": "後日発表",
  "quizGuests": [{ "name": "名前", "photo": "assets/img/cast/name.jpg" }, { "name": "CMの人", "photo": "assets/img/cast/cm.jpg", "tag": "CM" }, "名前だけでもOK"],
  "quizGuestsNote": "近日公開",
  "preview": "予告文（100字以内）",
  "spoon": "この回の配信ページのURL（任意）"
}
```

- `end` を省くと、`defaultDurationMinutes`（分）の長さで終わる扱いになります。終了時刻は表示されません
- `guests` は「ゲスト回答者」の一覧。「出題者・CMゲスト」と同じ丸アイコン＋名前のタイルで、その上に並びます（`photo` は顔が真ん中に来る正方形。省くと名前の1文字目）。X などのリンクは表示しません
- `quizGuests` は「出題者・CMゲスト」の一覧。小さな丸アイコンと名前のタイルで、次回の配信の下に全幅で並べます（アイコンがない人は名前の1文字目）。`tag` を付けるとアイコンの下に小さなラベル（例：CM）が付きます。並びは五十音順（読み）で入れます。配信後も「これまでの配信」に名前が残ります
- `quizGuestsNote` は、名前を出す前に「出題者・CMゲスト」欄へ出す一言（例：近日公開）
- `guestNote` は、ゲストの名前を出す前にゲスト欄へ出す一言（例：後日発表）。`guests` に名前が入ると、そちらが優先されます
- `preview` は100字以内（改行は数えません）。改行はそのまま表示されます。超えるとブラウザのコンソールに注意が出ます

### staff（スタッフ）

```json
{ "name": "名前", "role": "MC", "photo": "assets/img/staff/名前.jpg", "x": "https://x.com/…", "spoon": "https://…" }
```

- `photo` は正方形の画像を `assets/img/staff/` に入れてパスを書く。省くと名前の1文字目が入ります

### カレンダー

- `calendarTitle`：「カレンダーに追加」で登録される予定の名前（いまは `SVARAC@Kent枠`）。回ごとに変えたいときは、その回に `calendarTitle` を書く
- iPhone 用のボタンは `cal/svarac-<回>.ics` を開きます。**data.json を書き換えたら、リポジトリの一番上で次を実行してから公開する**

```
python3 tools/build_ics.py
```

### links / hashtag

- `links.x` `links.spoon`：番組の公式アカウント。入れるとフッターにボタンが出ます
- `hashtag`：感想ポストのハッシュタグ（# は不要）
