# Itera OS Experience Improvement Notes

Status: Draft  
Scope: Product / UX / OS-like behavior improvements  
Related:
- `workspace/itera/docs/architecture/host_runtime_architecture.md`
- `workspace/itera/docs/architecture/vfs_v2_design.md`

---

## 0. このメモの目的

このメモは、Itera OSを「ブラウザ内で動くAIワークスペース」から、より **OSらしい体験** を持つ環境へ進化させるための改善ポイントをざっくばらんに整理するものである。

ここでいう「OSらしさ」とは、単に見た目をデスクトップ風にすることではない。  
むしろ重要なのは、以下のような性質である。

- どこに何があるか分かる
- 何が起きているか分かる
- どのアプリが何をできるか分かる
- ファイルとアプリの関係が自然である
- 失敗しても戻れる
- 裏で動いている処理を管理できる
- AIが勝手にやっているのではなく、OSのルールに従って動いているように感じられる
- ユーザーが「自分の環境を持っている」と感じられる

---

## 1. 現状の強み

現行Iteraには、すでにOSらしさの核がある。

### 1.1 VFS

ユーザーとAIが同じファイル空間を共有している。  
これは、普通のチャットAIにはない強い特徴である。

### 1.2 ProcessManager

HTMLアプリをiframeプロセスとして起動し、foreground/backgroundを切り替えられる。  
これは簡易的だが、OSのプロセスモデルに近い。

### 1.3 Host-Guest Isolation

GuestアプリはHostを直接触れず、`MetaOS` APIを通じて操作する。  
これはOSのsystem callに近い。

### 1.4 History as Transaction Log

会話履歴が単なるチャットではなく、イベント・ツール結果・システムログを含む状態遷移ログになっている。

### 1.5 AI Tool Loop

AIがLPMLで意図を出し、Hostがツールとして実行する。  
AIが「OS上の作業者」として振る舞うための基礎がある。

---

## 2. 体験面での現在の弱点

### 2.1 何が起きているか分かりにくい

AIがツールを実行し、VFSが変わり、Guestアプリが更新されるが、ユーザーから見ると「裏で何かが起きた」になりやすい。

必要なのは、OSとしてのActivity visibilityである。

### 2.2 アプリとファイルの関係が弱い

現状はHost側のEditor/MediaViewerが強く、Guestアプリが「このファイルを開く」体験が弱い。

OSらしくするには、ファイルタイプごとの既定アプリ、Open With、最近使ったアプリが必要。

### 2.3 設定が散らばりやすい

LLM設定、Sync設定、Theme設定、App設定、Permission設定が、将来的に増えると分散しやすい。

System Settingsの統一体験が必要。

### 2.4 Daemon / Background Taskが見えにくい

バックグラウンドプロセスが動いていても、ユーザーにとっては把握しづらい。

OSらしくするには、Activity Monitor / Process Manager UIが必要。

### 2.5 権限が見えない

GuestアプリやAIが何を読めるか、何を書けるかが明示されていない。

SaaS化やアプリ拡張を考えるなら、Permission UXは必須。

### 2.6 AIの作業が「会話欄」に寄りすぎている

AIはOS内の作業者なのに、体験としてはまだチャットパネルに閉じて見える。  
将来的には、AIがファイル、アプリ、通知、タスク、設定と自然に統合されるべき。

---

## 3. 優先度高めの改善ポイント

## 3.1 Command Palette

### 概要

`Cmd/Ctrl + K` で開くCommand Paletteを導入する。

できること:

- アプリ起動
- ファイル検索
- 最近開いたファイル
- 設定項目検索
- AIへの指示
- コマンド実行
- プロセス切替

### なぜOSらしくなるか

OSでは、ユーザーが「どこに行けばいいか」を覚えなくても、検索/コマンドで到達できることが重要。

Command Paletteは、GUIとAIの中間インターフェースになる。

### 例

```text
> open tasks
> edit system/config/config.json
> ask Itera: summarize today's work
> sync now
> install app
> switch to notes
```

### 関連モジュール

- `ShellController`
- `ProcessManager`
- `VFS`
- `AppRegistry`
- `FileAssociationResolver`
- `Engine`

---

## 3.2 Activity Center / Notification Center

### 概要

システムで起きたことを時系列で見られるActivity Centerを作る。

表示するもの:

- ファイル変更
- AIツール実行
- Sync結果
- アプリ起動/終了
- 権限要求
- エラー
- タイマー
- バックグラウンドタスク完了

### なぜOSらしくなるか

OSは「裏で何が起きているか」をユーザーに説明できる必要がある。

現状のHistoryはAIコンテキストとしては優秀だが、ユーザー向けActivity Logとしてはややチャット寄り。  
Activity Centerを分けると、OS感が上がる。

### 設計メモ

Historyとは別に、EventJournalをUI化するのがよい。

```text
EventJournal
  -> Activity Center
  -> Notification Center
  -> AI context injection
```

---

## 3.3 Settings Center

### 概要

設定をアプリごとに散らさず、OS標準のSettings Centerにまとめる。

分類案:

- General
  - language
  - username
  - agentName
- Appearance
  - theme
  - font
  - density
- AI Engine
  - provider
  - model
  - temperature
  - API keys
- Storage
  - VFS usage
  - Trash
  - Cache
  - Snapshots
- Sync
  - provider
  - account
  - status
  - conflict handling
- Apps
  - installed apps
  - default apps
  - permissions
- Security
  - permission prompts
  - audit logs
- Developer
  - dynamic tools
  - service registry
  - IPC debug
  - logs

### なぜOSらしくなるか

OSは設定が発見可能であることが重要。  
「どこを触ればいいか分からない」状態を減らせる。

---

## 3.4 Open With / Default Apps

### 概要

ファイルを開くときに、Host固定Editorではなく、App Registryに基づいて開くアプリを選べるようにする。

### 体験

ファイル右クリック:

```text
Open
Open With >
  - Markdown Editor
  - Plain Text Editor
  - Preview
Set Default App...
Reveal in Folder
Properties
```

### なぜOSらしくなるか

ファイルはOS上の一級オブジェクトであり、アプリはファイルを開くための道具である。  
この関係が自然になると、Iteraは「アプリの集合」ではなく「OS」に近づく。

### 関連

- VFS v2
- App Registry
- File Association
- Launch Context

---

## 3.5 Properties Panel / Inspector

### 概要

ファイル、フォルダ、アプリ、プロセスの詳細情報を右側またはモーダルで表示する。

ファイルの場合:

- path
- nodeId
- kind
- mimeType
- size
- createdAt
- updatedAt
- sync status
- permissions
- default app
- versions
- tags

アプリの場合:

- appId
- version
- entry
- permissions
- file handlers
- running processes
- data scopes

プロセスの場合:

- pid
- appId
- path
- state
- mode
- uptime
- memory estimate
- registered dynamic tools

### なぜOSらしくなるか

「対象を選ぶと詳細が見える」はOS体験の基本。  
透明性が上がり、AIが触っているものも理解しやすくなる。

---

## 3.6 Process / Daemon Manager

### 概要

現在動いているApp/Daemonを一覧し、停止・再起動・ログ閲覧できるUI。

表示項目:

- PID
- App name
- Type: app / daemon
- State: foreground / background / running
- Path
- Registered tools
- Last activity
- Errors
- CPU/Memory estimate if possible

### なぜOSらしくなるか

バックグラウンドで動くものが増えるほど、見える化が必要。  
特にIteraではGuest daemonが動的ツールを登録できるため、Daemon管理は安全性にも関わる。

---

## 3.7 Permission Prompt

### 概要

GuestアプリやAIが危険操作をしようとしたときに、OSとして確認する。

例:

```text
"Markdown Editor" wants to read:
  data/notes/**

Allow?
[Allow Once] [Always Allow] [Deny]
```

AIの場合:

```text
Itera wants to modify 6 files under system/
This may affect OS behavior.

[Review Diff] [Allow] [Deny]
```

### なぜOSらしくなるか

OSでは、能力のある主体が何をしようとしているかが明示される。  
AIの自律性が強いほど、Permission UXは信頼の基盤になる。

---

## 3.8 Dry Run / Operation Review

### 概要

AIが複数ファイル変更や削除を行う前に、計画と差分を確認できるモード。

例:

```text
Planned operation:
- create apps/foo.html
- edit system/config/apps.json
- edit system/config/services.json
- create docs/apps/foo.md

Risk:
- modifies system registry
- starts background daemon

[Apply] [Edit Plan] [Cancel]
```

### なぜOSらしくなるか

AIが「勝手にやった」感を減らせる。  
Time Machineと組み合わせると、信頼性が大きく上がる。

---

## 4. 中期的に効く改善ポイント

## 4.1 Global Search / Spotlight

### 概要

ファイル名、本文、アプリ、設定、コマンド、履歴を横断検索する。

検索対象:

- VFS file names
- file contents
- app manifests
- commands
- settings
- recent activities
- AI history
- docs/manuals

### 体験

```text
Cmd+Space:
  "sync"
    - Sync Now
    - Open Sync Settings
    - docs/manual/cloud_sync.md
    - recent event: Sync failed...
```

### なぜOSらしくなるか

OSは情報空間への入口を持つ。  
IteraではAIがその入口にもなれるが、明示的な検索UIも必要。

---

## 4.2 Recents / Favorites / Workspaces

### 概要

よく使うファイル、最近開いたファイル、作業単位のWorkspaceを持つ。

```text
Recent Files
Favorite Apps
Pinned Folders
Workspace: FastLabel
Workspace: Itera SaaS
```

### なぜOSらしくなるか

ユーザーは常にディレクトリツリーから探したいわけではない。  
作業文脈単位で戻れることが重要。

---

## 4.3 App Store / Package Manager

### 概要

Blueprintやアプリを、manifest付きパッケージとして扱う。

アプリパッケージ:

```text
apps/com.itera.notes/
  manifest.json
  index.html
  icon.svg
  manual.md
```

操作:

- install
- uninstall
- update
- enable/disable
- permissions review
- repair
- export package

### なぜOSらしくなるか

アプリがただのHTMLファイルではなく、OSに登録されたソフトウェアになる。

---

## 4.4 Task / Job Queue

### 概要

AIやアプリが発行した長時間処理をJobとして管理する。

例:

- 100ファイルの検索
- 大量OCR
- Sync
- Index rebuild
- Blueprint install
- AI background task

Job UI:

```text
Jobs
- Rebuilding search index... 43%
- Syncing files... 12/90
- Installing Pomodoro app... waiting for permission
```

### なぜOSらしくなるか

長時間処理がチャットに埋もれず、OSの仕事として管理される。

---

## 4.5 Unified Error Center

### 概要

エラーをチャットログやconsoleに散らさず、Error Centerに集約する。

表示:

- error message
- source: app / daemon / AI / sync / VFS / IPC
- stack if available
- related file/process
- suggested action
- report to AI button

### なぜOSらしくなるか

「何か壊れた」が分かりやすくなる。  
AIが修復する場合も、Error Centerが入力になる。

---

## 4.6 File Tags / Smart Folders

### 概要

path階層だけでなく、タグや条件でファイルを整理する。

例:

```text
Tags:
- project:Itera
- status:draft
- type:meeting
- client:FastLabel

Smart Folder:
- Recently modified docs
- Unsynced files
- Files edited by AI today
- Large files
```

### なぜOSらしくなるか

現代OSのファイル体験は階層だけでは足りない。  
AIがタグ付けや整理を支援できると、Iteraらしさも出る。

---

## 5. AI体験の改善

## 5.1 AIをChat Panelから解放する

現状、AIとの接点は主に右側Chat Panelである。  
しかしOSらしくするには、AIは各所に自然に現れるべき。

例:

- ファイル右クリック: "Ask Itera about this file"
- エラー: "Ask Itera to fix"
- Diff画面: "Ask Itera to explain"
- App manifest: "Ask Itera to improve permissions"
- Search結果: "Summarize selected files"

### 方向性

Chatは中心ではあるが、AIはOS全体に埋め込まれたcopilotとして振る舞う。

---

## 5.2 Context Basket

### 概要

今AIに渡したいファイルや範囲を一時的に集めるUI。

現状ChatPanelにVFS参照添付はあるが、より明示的にする。

```text
Context Basket
- data/projects/foo/spec.md
- apps/tasks.html
- selected lines 20-80
- screenshot of current app
```

操作:

- Add to Context
- Remove
- Save Context Set
- Ask with Context
- Share Context to App

### なぜ良いか

ユーザーが「AIが何を見ているか」を制御しやすくなる。  
作業規範の「共有認知範囲」にも合う。

---

## 5.3 AI Operation Modes

### 概要

AIの行動モードをOS UIとして明示する。

例:

```text
Mode:
- Observe only
- Ask before write
- Auto-edit safe files
- Autonomous with snapshot
```

### なぜ良いか

AIの自律性をユーザーが制御できる。  
特にVFS v2の権限/Operation Reviewと相性がよい。

---

## 5.4 Diff-first Editing

### 概要

AIのファイル編集は、即writeではなくdiff proposalとして扱えるようにする。

```text
AI proposed changes:
- file A
- file B

[Apply All] [Apply Selected] [Reject] [Ask Revision]
```

### なぜ良いか

コードやsystem設定への信頼性が上がる。  
AIが大きく壊すリスクも減る。

---

## 6. Shell / Windowing体験の改善

## 6.1 Window Manager

現状はforeground iframe切替に近い。  
よりOSらしくするなら、複数windowを持てるとよい。

機能候補:

- split view
- tabbed apps
- floating windows
- side-by-side editor
- minimize / maximize
- app switcher
- window restore

ただし、複雑化しすぎるとブラウザ内OSとして重くなる。  
最初は **tabs + split view** くらいがよい。

---

## 6.2 App Switcher改善

現状Recent Apps modalがある。  
これをOS的に強化する。

表示:

- app icon
- name
- current file
- dirty state
- registered tools
- close button
- pin button

ショートカット:

```text
Alt+Tab / Ctrl+Tab
```

---

## 6.3 Status Bar

下部または上部にOS状態を出す。

表示候補:

- model
- sync status
- storage usage
- current app
- active jobs
- current mode
- permission warning
- last autosave

現状も一部あるが、より意味のあるstatus barにできる。

---

## 7. Developer Experience

## 7.1 App Developer Manualの強化

Guestアプリ開発者向けに、以下が必要。

- MetaOS API reference
- manifest schema
- file handler実装例
- permission request例
- dynamic tool登録例
- launch context取得例
- theme variable利用方法
- resolveUrlの使い方
- app packaging

---

## 7.2 IPC Debugger

Host/Guest間のIPCを見える化する。

表示:

```text
[guest app_notes] -> host fs:read data/notes/a.md
[host] -> guest app_notes event file_changed
[host] -> guest daemon_x execute_tool
```

なぜ良いか:

- アプリ開発が楽になる
- 権限設計の検証に使える
- セキュリティ監査に使える

---

## 7.3 Dynamic Tools Inspector

動的ツール一覧を見られるUI。

表示:

- tool name
- source app / pid
- definition
- active/inactive
- last called
- errors

AIにとっても、ユーザーにとっても、現在どんな能力が増えているか分かる。

---

## 8. 安全性・信頼性の改善

## 8.1 Snapshotの自動化

危険操作の前に自動snapshotを作る。

例:

- system配下編集
- app install/update
- bulk delete
- sync conflict resolution
- AI autonomous mode

```text
Auto Snapshot: Before installing Pomodoro App
```

---

## 8.2 Restore UX

Time Machineはあるが、より分かりやすくできる。

機能:

- snapshot diff
- restore selected files
- restore entire system
- label / pin snapshots
- auto snapshot policy

---

## 8.3 Safe Mode

OSが壊れたときに、最小構成で起動する。

Safe Modeでは:

- Guest servicesを起動しない
- background daemonsを無効化
- last sessionを読み込まない選択肢
- system/configを修復できる
- AIをObserve-onlyにする

---

## 8.4 System Integrity Check

起動時に重要ファイルを検査する。

対象:

- `system/config/config.json`
- `system/config/apps.json`
- `system/config/services.json`
- system libraries
- app manifests

問題があれば:

```text
System detected invalid services.json
[Repair] [Open File] [Reset to Default]
```

---

## 9. Sync / Multi-device体験

## 9.1 Sync Statusの可視化

現状のSync statusはボタン色中心。  
より詳しくするなら:

- last synced
- pending uploads
- pending downloads
- conflicts
- current provider
- remote account
- unsynced files list

---

## 9.2 Conflict Resolution UI

衝突時にユーザーが選べるUI。

```text
Conflict: data/report.md
- Local version edited on Mac 18:20
- Remote version edited on iPad 18:18

[Keep Local] [Keep Remote] [Keep Both] [Compare]
```

---

## 9.3 Device Registry

複数端末同期では、端末を識別できるとよい。

```text
Devices
- MacBook Pro
- iPad
- Chrome Mobile
```

各変更のactorにdeviceIdを含めると、Activity CenterやConflict UIが分かりやすい。

---

## 10. 体験改善の優先順位案

### Tier 1: すぐ体験価値が出る

1. Command Palette
2. Activity Center
3. Open With / Default Apps
4. Properties Panel
5. Process / Daemon Manager

### Tier 2: OSとしての信頼性が上がる

6. Permission Prompt
7. Dry Run / Operation Review
8. Auto Snapshot before risky operations
9. Error Center
10. Sync Status / Conflict UI

### Tier 3: 長期的に強い

11. App Store / Package Manager
12. Job Queue
13. Global Search / Spotlight
14. Context Basket
15. Safe Mode
16. Device Registry

---

## 11. 個人的な推奨

最も効く順番は以下だと思う。

### 1. Command Palette

理由:  
最小実装でも体験が大きく変わる。  
AI、アプリ、ファイル、設定への入口を統一できる。

### 2. Activity Center

理由:  
AI OSでは「何が起きているか分かる」ことが信頼の基盤になる。

### 3. App Registry + File Association

理由:  
VFS v2と直結する。  
ファイルをGuestアプリで自然に開けるようになると、一気にOSらしくなる。

### 4. Properties Panel

理由:  
VFS v2のメタデータをユーザーが理解できるUIになる。  
権限、sync、default appなどもここに載せられる。

### 5. Permission / Operation Review

理由:  
AIとGuestアプリの能力が増えるほど必須になる。  
最初はaudit mode + risky operation promptでよい。

---

## 12. まとめ

IteraをよりOSらしくするために必要なのは、デスクトップ風UIを増やすことではない。

重要なのは、以下の体験である。

```text
見えること
  何が起きているか
  何が動いているか
  誰が何をできるか

戻れること
  snapshot
  undo
  conflict handling
  safe mode

つながること
  file -> app
  app -> permission
  AI -> operation
  event -> activity
  sync -> device

選べること
  open with
  default app
  permission decision
  AI operation mode
```

Iteraの本質は、AIが人間の作業環境に直接触れることである。  
だからこそ、OSとしての可視性、権限、復元性、ファイル/アプリ関係の自然さが重要になる。

VFS v2はその土台であり、このメモにある体験改善は、その上に載る「OSらしさ」の層である。