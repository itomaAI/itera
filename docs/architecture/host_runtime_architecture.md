# Itera OS Host Runtime Architecture

Status: Draft  
Scope: `workspace/itera` Host / Kernel / Runtime layer  
Excluded for now: detailed analysis of default Guest applications under `vfs_root/apps/`

---

## 0. このドキュメントの目的

このドキュメントは、初めて `workspace/itera` のコードベースを読む開発者が、Itera OS の Host Runtime 構造を把握するための入口である。

Itera OS は、一般的な「チャットUI付きWebアプリ」ではない。  
ブラウザ内に、以下をすべて同居させた実験的なAIオペレーティングシステムである。

- 仮想ファイルシステム
- 会話・イベント履歴
- LLM駆動の自律ループ
- iframe上で動くGuestアプリ/Daemon
- HostとGuestをつなぐ非同期IPC
- ユーザーが操作するDesktop Shell
- IndexedDB永続化
- Snapshot / Time Machine
- Google Drive同期

このため、コードを読むときは「画面の部品」から入るよりも、次の順で理解する方がよい。

1. どこでシステムが起動し、依存関係が組み立てられるか
2. 何がSingle Source of Truthなのか
3. AIループは何をトリガーに動くのか
4. AIツールとGuest APIはどこでHost機能に合流するのか
5. UI Shellはどこまで状態管理やI/Oを持っているのか

---

## 1. 基本パラダイム

### 1.1 Host-Driven Intelligence

Itera OS のREADMEでは、このアーキテクチャを **Host-Driven Intelligence (HDI)** と呼んでいる。

これは、AIを単なるチャット応答者として扱うのではなく、Host環境にある特権的なツール群を通じて、ユーザーの作業環境そのものを直接操作できるエージェントとして扱う設計である。

AIは以下を行える。

- VFS上のファイルを読む
- VFS上のファイルを作成・編集・削除する
- HTMLアプリをプロセスとして起動する
- 稼働中GuestアプリにJSを注入する
- スクリーンショットを取得する
- タイマー等の非同期イベントをセットする

ただし、これらはAIがブラウザ外部のOS権限を持つという意味ではない。  
Itera OS はあくまでブラウザサンドボックス内に閉じており、ネイティブシェルやローカル物理ファイルシステムには直接アクセスしない。

### 1.2 REAL Architecture

Itera OS の中核は **REAL (Recursive Environment-Agent Loop)** である。

README上のレイヤー定義は以下である。

- L1: Cognitive Layer
  - LLMが現在状態を認識し、LPMLタグとして操作意図を出力する
- L2: Control Layer
  - LPMLをパースし、ファイルI/Oやプロセス管理などの物理操作を実行する
- L3: State Layer
  - VFSとHistoryからなるSingle Source of Truth

実装上は、主に以下の対応になる。

```text
L1 Cognitive
  src/core/cognitive/projector.js
  src/core/cognitive/llm_adapter.js
  src/core/cognitive/translator.js

L2 Control
  src/core/control/engine.js
  src/core/control/tool_registry.js
  src/core/control/tools/*
  src/core/control/guest_compiler.js

L3 State
  src/core/state/vfs.js
  src/core/state/history.js
  src/core/state/store.js
  src/core/state/config_manager.js
```

---

## 2. ロード順とComposition Root

### 2.1 `index.html` はロード順マニフェストである

`workspace/itera/index.html` は、単なるUIテンプレートではない。  
Host Runtimeのロード順を決定するマニフェストでもある。

このコードベースはES Modulesの `import/export` ではなく、各ファイルが即時実行関数で `global.Itera.*` 名前空間へクラスや関数を登録する方式を採用している。

したがって、依存関係は静的importではなく、`index.html` の `<script>` 読み込み順に強く依存する。

概略は以下である。

```text
1. core/state
   vfs.js
   store.js
   config_manager.js
   history.js
   logger.js

2. core/sync
   providers
   sync_engine.js
   sync_manager.js

3. core/cognitive
   llm_adapter.js
   translator.js
   projector.js

4. core/control
   tool_registry.js
   tools/*
   engine.js
   guest_compiler.js

5. ipc
   message.js
   rpc_manager.js
   host_transport.js
   guest_transport.js

6. api
   guest/metaos_core.js
   guest/legacy_wrapper.js
   guest/guest_builder.js
   host/api_router.js

7. shell
   renderer, panels, modals, process_manager, shell_controller

8. config
   constants.js
   system_prompts.js
   default_files.js

9. main.js
```

この方式の利点は、ビルドシステムなしでブラウザだけで動くこと。  
欠点は、依存関係がファイル上で明示されず、ロード順の破壊に弱いことである。

### 2.2 `main.js` は薄い入口

`src/main.js` は非常に薄い。

役割は以下に限定される。

1. `DOMContentLoaded` を待つ
2. `globalThis.Itera.Shell.ShellController` が存在するか確認する
3. `new ShellController()` を作る
4. `controller.init()` を呼ぶ
5. Boot Loaderを消す
6. 失敗時はBoot Errorを表示する

つまり、実際のシステム初期化はほぼすべて `ShellController` に集約されている。

### 2.3 `ShellController` はComposition Rootである

`src/shell/core/shell_controller.js` は、単なるUIコントローラではない。  
実質的には **Composition Root** かつ **Runtime Supervisor** である。

`ShellController.init()` は、概ね以下の順でシステムを組み立てる。

```text
StorageManager
  ↓ loadSystemState()
initialFiles / initialHistory
  ↓
VirtualFileSystem
HistoryManager
ConfigManager
SystemLogger
  ↓
ThemeManager
Translator
LPMLRenderer
ChatPanel
Explorer
EditorModal
ProcessManager
TimeMachineModal
MediaViewer
ApiSettingsModal
SyncManager / SyncModal
  ↓
ToolRegistry
  ↓ register built-in tools
Engine
  ↓ _refreshEngineConfig()
LLM Adapter + Projector
  ↓
HostTransport
ApiRouter
  ↓
_bindEvents()
_bindMobileUI()
  ↓
render initial UI
  ↓
spawn background services
daily maintenance
refreshPreview()
```

このファイルを読めば、Host Runtime全体の依存関係がほぼ分かる。

---

## 3. State Layer: Single Source of Truth

Itera OS の主要状態は、概ね以下の4種類に分かれる。

```text
VFS          : ファイルシステム状態
History      : 会話・イベント・ツール実行ログ
Config       : VFS上のJSONをキャッシュしたライブ設定
Process list : 稼働中iframeプロセス状態
```

このうち、永続化対象として特に重要なのは `VFS` と `History` である。

### 3.1 `vfs.js`: 仮想ファイルシステム

`src/core/state/vfs.js` の `VirtualFileSystem` は、オンメモリのオブジェクトMapでファイルを管理する。

内部構造は概ね以下である。

```js
{
  "path/to/file.txt": {
    content: "file content",
    meta: {
      created_at: 1710000000000,
      updated_at: 1710000000000
    }
  }
}
```

ディレクトリは独立したエンティティではない。  
`path/to/` というprefixを持つファイルがあれば、ディレクトリが存在するとみなされる。

空ディレクトリを表現するために `.keep` ファイルを作る仕組みがある。

主な責務は以下。

- path normalization
- read / write / delete / rename / copy
- list / tree生成
- storage capacity計算
- change event発火
- trash移動
- line edit / regex replace補助
- sync用の `touch()`

重要な特徴として、`deleteFile()` は通常のファイルを即物理削除せず、`.trash/` に移動する。  
一方で `.trash/`, `system/cache/`, `system/logs/` など一部パスは完全削除される。

これは安全性のためには有効だが、VFSコアが特定ディレクトリ名を知っているという意味で、後述する設計上の密結合でもある。

### 3.2 `history.js`: 会話ではなくトランザクションログ

`src/core/state/history.js` の `HistoryManager` は、単なるチャット履歴ではない。  
AI、ユーザー、システムイベント、ツール実行結果をすべて同じturn配列に積むトランザクションログである。

turnの基本形は以下。

```js
{
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  role: "user" | "model" | "system",
  content: string | array,
  meta: {
    type: "message" | "tool_execution" | "event_log" | ...,
    visible: true,
    trigger_llm: true
  }
}
```

`trigger_llm` が非常に重要である。  
EngineはHistoryの変更を監視し、直近turnに `trigger_llm: true` が含まれる場合に起床する。

つまり、Historyは「表示用ログ」であると同時に、「AIループの割り込みキュー」でもある。

### 3.3 `store.js`: IndexedDB永続化

`src/core/state/store.js` の `StorageManager` はIndexedDBを使う。

DB名は `itera_core_db`。  
Object Storeは以下。

- `system_state`
  - 現在のVFSとHistoryを保存
- `snapshots`
  - Time Machine用のスナップショットを保存

保存されるsystem stateは以下の形。

```js
{
  files,
  history,
  memory,
  timestamp
}
```

`ShellController._triggerAutoSave()` は、VFSやHistory変更後に1秒debounceして `storage.saveSystemState(vfs.files, history.get())` を呼ぶ。

### 3.4 `config_manager.js`: VFS-backed live config

`ConfigManager` は `system/config/config.json` をVFSから読み、内部キャッシュとして保持する。

VFSのchange eventを購読し、対象パスが変更されると再読み込みする。  
これにより、設定ファイル編集が即Runtimeへ反映される。

代表的な設定は以下。

- theme
- language
- username
- agentName
- llm.model
- network.proxyUrl
- credentials

### 3.5 `logger.js`: VFS-backed observability

`SystemLogger` は `system/logs/{category}/{YYYY-MM-DD}.jsonl` へJSONL形式でログを書く。  
これは主状態ではなく、観測・利用実績・エラー追跡用のサイドカーである。

---

## 4. Cognitive / Control Loop

### 4.1 Engineの起床条件

`src/core/control/engine.js` の `Engine` は、`history.on('change')` を購読する。

履歴がappend/updateされると、以下の流れでAI起床を検討する。

```text
History change
  ↓
Engine._onHistoryChange()
  ↓
debounce 1500ms
  ↓
Engine._ping()
  ↓
_evaluateWakeUp()
  ↓
LLM実行 or 待機
```

`_evaluateWakeUp()` は、最後のmodel thought以降のturnを見て、以下の場合に起床する。

- ユーザー入力がある
- `meta.trigger_llm === true` のturnがある

一方、model自身のturn更新では自己起床しない。

### 4.2 LLM実行の流れ

Engineが起床すると、以下の順で処理する。

```text
projector.createContext(state)
  ↓
history.append(MODEL, "", MODEL_THOUGHT)
  ↓
llm.generateStream(messages, onChunk)
  ↓
stream chunkをUIへemit
  ↓
history.update(modelTurn.id, rawResponse)
  ↓
translator.parse(rawResponse, registeredTools)
  ↓
actionsをToolRegistryへdispatch
```

LLMのstream中は `turn_start`, `stream_chunk`, `turn_end` がShellController経由でChatPanelに伝わる。

### 4.3 Projector: HistoryをProvider形式へ投影する

`src/core/cognitive/projector.js` は、Historyを各LLM APIの形式に変換する。

実装されているProjectorは以下。

- `GeminiProjector`
- `OpenAIProjector`
- `AnthropicProjector`

同じHistoryでも、ProviderごとにAPI形式が違う。

例:

- Gemini
  - `role: "user" | "model"`
  - `parts: [{ text }, { fileData }]`
- OpenAI
  - `role: "system" | "user" | "assistant"`
  - `content: [{ type: "text" }, { type: "image_url" }]`
- Anthropic
  - `system` と `messages` を分離
  - user/assistant交互制約を満たすように連続roleをmerge

今回のように `llm.model = "openai/gpt-5.5"` の場合、`ShellController._refreshEngineConfig()` により以下が選択される。

```text
OpenAIProjector
OpenAIAdapter
modelName = "gpt-5.5"
baseUrl = "https://api.openai.com/v1"
```

現実装ではOpenAI互換モデルは `/chat/completions` へ送られる。  
もし対象モデルがResponses API等を要求する場合、修正箇所は `llm_adapter.js` になる。

### 4.4 Translator: LPMLを実行可能actionへ変換する

`src/core/cognitive/translator.js` はLPML parserである。  
表示用ではなく、実行用である。

主な処理は以下。

- CDATAのフェールセーフ展開
- code block / inline code / comment等の保護
- タグ構造を簡易AST化
- root外の生テキスト漏洩検知
- すべてのタグノードをactionとして抽出
- terminal tag検出
- `edit_file` の順序調整

重要なのは、`yield`, `ask`, `finish` の終端タグである。  
Translatorは終端タグを検出すると、そのタグ以降のテキストを切り捨てる。

ただし、終端タグの意味論そのものはTranslatorだけで完結しない。  
実際の停止は、後述する `sys_tools.js` が返す `halt_loop` と、Engineのtrigger計算によって成立する。

### 4.5 ToolRegistry: action実行ルータ

`src/core/control/tool_registry.js` は、LLMが出力したactionを実行するルータである。

ツールは2種類ある。

1. System Tools
   - Host側で直接実行される固定ツール
2. Dynamic Guest Tools
   - Guestアプリが `MetaOS.tools.register()` で登録する動的ツール

System Toolは `registry.register(name, impl)` で登録され、直接 `impl(params, context)` が実行される。

Dynamic Guest Toolは、Host側には実体関数を渡さない。  
Guest側にhandlerを保持したまま、HostからGuest iframeへ逆方向RPCで呼び出す。

```text
LLM action
  ↓
ToolRegistry.execute()
  ↓
guestTools.get(action.type)
  ↓
context.shell.transport.invokeGuest(pid, "execute_tool", ...)
  ↓
GuestTransport
  ↓
localToolHandlers.get(name)(params)
```

この設計により、Guestアプリは独自ツールをAIに公開できるが、実装関数はGuestメモリ内に留まる。

---

## 5. Built-in Tools

Built-in toolsは `src/core/control/tools/` に分割されている。

### 5.1 `fs_tools.js`

VFS操作。

- `read_file`
- `create_file`
- `edit_file`
- `list_files`
- `delete_file`
- `move_file`
- `copy_file`

`read_file` はバイナリ拡張子を検出すると、生Base64を返さず、media objectを返す。  
これによりProjector側でProviderごとの画像/ファイル処理に回せる。

`edit_file` は2モードある。

- line-based edit
- SEARCH block replacement

SEARCH blockでは、複数blockを一度メモリ上で適用し、最後に1回だけVFSへwriteする。  
途中でpattern not foundがあれば、変更を行わずエラーにする。

### 5.2 `sys_tools.js`

ループ制御・システム系。

- `finish`
- `ask`
- `report`
- `set_timer`
- `reset_session`
- `yield`
- `thinking`
- `plan`

特に重要なのは以下。

```js
finish -> { halt_loop: true }
ask    -> { halt_loop: true }
yield  -> { trigger_llm: false }
report -> { trigger_llm: false }
```

Engineは複数ツール実行結果を集約し、turn全体の `trigger_llm` を計算する。

### 5.3 `ui_tools.js`

ProcessManagerやShellへの操作。

- `spawn`
- `kill`
- `ps`
- `take_screenshot`
- `inject_js`

`inject_js` はHostからGuestへ `eval_js` を逆方向RPCで送り、Guest内で `AsyncFunction` として実行する。

### 5.4 `search_tools.js`

VFS全文検索。  
UIブロックを避けるため、検索中に約15msごとに `setTimeout(0)` でmain threadを明け渡す。

### 5.5 `basic_tools.js`

現在は `get_time` のみ。

---

## 6. Host-Guest Boundary

### 6.1 GuestはVFS上のHTMLから生成される

Guestアプリは、VFS上のHTML/CSS/JSを直接ブラウザで読むのではない。  
`GuestCompiler` がそれらをBlob URLへ変換してiframeで読み込ませる。

主な処理は以下。

```text
VFS files
  ↓
GuestCompiler.compile(vfs, entryPath, pid)
  ↓
asset Blob URL作成
  ↓
CSS url(...) 置換
  ↓
HTML src/href/img/link/iframe 置換
  ↓
window.__ITERA_PID__ 注入
  ↓
Guest API bridge script 注入
  ↓
theme CSS variables 注入
  ↓
screenshot helper 注入
  ↓
HTML Blob URL生成
```

### 6.2 GuestBuilderは注入用API bundleを作る

`src/api/guest/guest_builder.js` は、以下の文字列コードをまとめてBlob JSにする。

- `GuestMessageCode`
- `GuestRpcCode`
- `GuestTransportCode`
- `MetaOSCoreCode`
- `LegacyWrapperCode`

GuestCompilerはこのBlob JSをGuest HTMLの`<head>`へscriptとして注入する。

### 6.3 `window.MetaOS`

Guest側に公開されるAPIは `src/api/guest/metaos_core.js` に文字列として定義されている。

主要namespaceは以下。

```text
MetaOS.fs
MetaOS.ai
MetaOS.system
MetaOS.host
MetaOS.net
MetaOS.device
MetaOS.tools
```

すべてのHost操作は `transport.requestHost(action, payload)` を通る。

例:

```js
MetaOS.fs.read(path)
  -> requestHost("fs:read", { path, opts })
```

### 6.4 IPC Protocol

IPC envelopeは `src/ipc/message.js` に定義される。

```js
{
  protocol: "itera:ipc:v1",
  type: "req" | "res" | "event",
  id,
  source,
  target,
  action,
  payload,
  error
}
```

通信は `window.postMessage` を使う。

- Guest → Host
  - `GuestTransport.requestHost()`
  - `window.parent.postMessage(req, "*")`
  - `HostTransport` が受信
  - `ApiRouter` handler実行
  - responseをGuestへ返す

- Host → Guest
  - `HostTransport.invokeGuest()`
  - `iframe.contentWindow.postMessage(req, "*")`
  - `GuestTransport` が受信
  - local handler実行
  - responseをHostへ返す

現状、postMessageの送信先originは `*` である。  
同一ブラウザ内Blob iframe運用上は動くが、セキュリティ境界の観点では注意点である。

### 6.5 ApiRouter

`src/api/host/api_router.js` は、Guestから来た要求をHost機能へ接続する巨大Routerである。

代表例:

```text
fs:read       -> vfs.readFile
fs:write      -> vfs.writeFile
ai:ask        -> engine.injectUserTurn
ai:task       -> history.append(system_task)
sys:spawn     -> processManager.spawn
sys:kill      -> processManager.kill
host:open_url -> window.open
net:fetch     -> fetch + credential/proxy handling
dev:photo     -> Host DOM上にカメラUIを構築
tools:register -> toolRegistry.registerDynamicTool
```

ApiRouterはHost/Guest境界の中心だが、同時に非常に多くの責務を持つ。

---

## 7. Process Management

### 7.1 ProcessManager

`src/shell/windowing/process_manager.js` はGuest iframeプロセスを管理する。

主な責務は以下。

- path + pid からプロセスを起動
- GuestCompilerでentry HTMLをBlob URL化
- iframeをDOMへ追加
- App / Daemonを分類
- foreground / background切替
- LRUで古いAppをkill
- kill時にBlob URLをrevoke
- process_killed eventでdynamic tool cleanupを可能にする
- screenshot capture
- `resolveUrl()` によるGuest動的asset解決

### 7.2 AppとDaemon

ProcessManagerは以下のルールでtypeを決める。

```js
const type = (mode === 'foreground' || pid.startsWith('app_')) ? 'app' : 'daemon';
```

Appは `apps-container` に表示され、foreground/background状態を持つ。  
Daemonは `background-processes` に入る。

### 7.3 Foreground切替

Foreground切替はiframeの作り直しではなく、CSSで制御する。

- opacity
- pointerEvents
- zIndex

これにより、バックグラウンドAppのDOM状態を保持できる。

### 7.4 LRU

App数が `MAX_APPS = 5` を超えると、最古のbackground appをkillする。  
これはBlob URL/iframeのメモリ消費を抑えるための実用的な制約である。

---

## 8. Shell / Desktop Environment

Shell層は単なるViewではない。  
ユーザー入力、ブラウザI/O、状態反映、Runtime制御をつなぐDesktop Environmentである。

### 8.1 ChatPanel

`src/shell/panels/chat_panel.js`

責務:

- chat入力
- ファイル添付
- VFS参照添付
- stream表示
- History描画
- media objectをVFSから読み表示
- stop / clear / delete turn / preview request event発火

重要な特徴として、処理中でも送信を許可している。  
つまり、ユーザーはAI思考中・ツール実行中にも割り込み入力できる。

### 8.2 Explorer / TreeView

`Explorer` はVFS Explorerである。

責務:

- VFS changeを購読してTreeView再描画
- ファイルopen/run/create/delete/rename/move
- upload
- drag/drop import
- zip restore
- zip export
- download
- history event発火

`TreeView` はDOM上のツリーUI・context menu・drag/dropを担当し、意味的な操作イベントをExplorerへ返す。

### 8.3 EditorModal

Monaco Editorを使うコードエディタUI。  
実際のVFS writeは `ShellController` 側の `editor.on('save')` handlerが行う。

### 8.4 TimeMachineModal

Snapshot UI。  
`StorageManager` のsnapshot一覧・restore・deleteを扱う。  
Factory resetイベントもここから発火する。

### 8.5 SyncModal

Google Drive OAuth UIとSync状態表示を担当する。  
OAuth callbackは `index.html` 冒頭のUniversal OAuth Callback Interceptorが親windowへpostMessageする。

### 8.6 ApiSettingsModal

LLM provider secretsを `localStorage.itera_llm_secrets` に保存する。  
保存後、`secrets_updated` eventを出し、ShellControllerがEngineのLLM Adapter/Projectorを再構成する。

---

## 9. Sync Architecture

### 9.1 SyncEngine

`src/core/sync/sync_engine.js` はlocal VFSとremote indexを比較し、同期計画を作る。

入力:

```js
localFiles  // vfs.files
remoteIndex // cloud-side .itera_sync_index.json
```

出力:

```js
{
  downloadQueue,
  uploadQueue,
  deleteRemoteQueue,
  deleteLocalQueue,
  newIndexData
}
```

現状、削除伝播は実装されていない。  
`.trash/` と `system/cache/` は同期対象外であり、ローカルで削除されたファイルがremote indexに残っている場合、保守的に再ダウンロードされる。

これはデータ喪失を避ける設計だが、「削除が他端末へ同期されない」という明確なトレードオフを持つ。

### 9.2 SyncManager

`SyncManager` は同期実行のオーケストレータである。

流れ:

```text
auth()
  ↓
getIndexMetadata()
  ↓
getIndex()
  ↓
SyncEngine.computeDiff()
  ↓
downloadQueue処理
  ↓
uploadQueue処理
  ↓
checkpoint uploadIndex()
  ↓
final uploadIndex()
  ↓
status_change emit
```

ダウンロード時には `vfs.writeFile()` によってupdated_atが現在時刻になるため、直後に `vfs.touch(path, remote_updated_at)` でremote timestampへ戻す。

### 9.3 GDriveProvider

Google Drive上では、`IteraOS_Sync` フォルダを作り、その中にファイルを置く。

各VFS pathは、Google Drive上ではそのままファイル名として保存される。

index file:

```text
.itera_sync_index.json
```

---

## 10. 代表的な動的フロー

### 10.1 ユーザーがチャットを送信してAIが動く

```text
User
  ↓
ChatPanel.handleSend()
  ↓
ShellController chat.on("send")
  ↓
attachmentsを system/cache/media/ に保存
  ↓
engine.injectUserTurn(content)
  ↓
History.append(USER, content, trigger_llm=true)
  ↓
Engine._onHistoryChange()
  ↓
debounce
  ↓
Engine._ping()
  ↓
Projector.createContext()
  ↓
LLMAdapter.generateStream()
  ↓
Translator.parse(raw LPML)
  ↓
ToolRegistry.execute(actions)
  ↓
tools/* が VFS / Shell / ProcessManager を操作
  ↓
Historyにtool outputをappend/update
  ↓
trigger_llmに応じて再起床または停止
```

### 10.2 AIがファイルを編集する

```text
LLM output
  ↓
Translator.parse()
  ↓
action = { type: "edit_file", params: { path, content, ... } }
  ↓
ToolRegistry.execute()
  ↓
fs_tools.edit_file
  ↓
VFS.readFile()
  ↓
SEARCH block / line edit をメモリ上で適用
  ↓
VFS.writeFile()
  ↓
VFS change event
  ↓
Explorer再描画 / autosave / Guestへのfile_changed broadcast
  ↓
tool_outputがHistoryへ反映
```

重要なのは、AIによるファイル編集も、ユーザーによるエディタ保存も、最終的には `vfs.writeFile()` に合流することである。  
そのため、VFS change event がHost Runtime内の多くの更新の起点になる。

### 10.3 Guestアプリがファイルを書く

```text
Guest App
  ↓
window.MetaOS.fs.write(path, content)
  ↓
GuestTransport.requestHost("fs:write")
  ↓
postMessage
  ↓
HostTransport
  ↓
ApiRouter handler fs:write
  ↓
vfs.writeFile()
  ↓
_checkAndEmitEvent()
  ↓
Historyへ file_edited event 追加（opts.silent === false の場合）
```

GuestアプリはHostのVFSオブジェクトに直接アクセスしない。  
必ず `MetaOS` Bridge 経由でHostへ依頼する。

### 10.4 Guestアプリが動的ツールを登録する

```text
Guest App
  ↓
MetaOS.tools.register({ name, definition, handler })
  ↓
localToolHandlers.set(name, handler)
  ↓
transport.requestHost("tools:register", { name, description, definition })
  ↓
ApiRouter
  ↓
ToolRegistry.registerDynamicTool(name, sourcePid, definition)
```

この時点で、AIは新しいLPMLタグを使えるようになる。  
ただし、実行時のhandler本体はGuest側の `localToolHandlers` に残る。

AIがそのタグを使うと、Hostは逆方向RPCでGuestへ処理を戻す。

```text
AI action
  ↓
ToolRegistry.execute()
  ↓
HostTransport.invokeGuest(pid, "execute_tool")
  ↓
GuestTransport
  ↓
localToolHandlers.get(name)(params)
  ↓
resultをHostへ返す
```

---

## 11. 設計上のトレードオフと注意点

ここでは、現時点の実装に含まれる重要な設計判断と、将来的なリファクタリング候補を整理する。

### 11.1 Global namespace + script order

このコードベースはES Modulesではなく、`global.Itera.*` へクラスを登録する方式で構成されている。  
そのため、`index.html` のscript順が依存関係そのものになっている。

利点:

- ビルドレスで動作する
- GitHub Pages等の静的ホスティングと相性がよい
- ブラウザだけで完結するという思想に合う

欠点:

- 依存関係がコード上で明示されない
- ロード順の破壊に弱い
- 静的解析・tree shaking・型検査が効きにくい

### 11.2 ShellControllerの肥大化

`ShellController` はComposition Rootとして重要だが、現状では以下も同時に持っている。

- 依存関係構築
- UIイベントbinding
- Engineイベントbinding
- autosave
- boot service起動
- daily maintenance
- session reset
- preview refresh
- model/provider切替

Runtime Supervisorとして自然な責務も多いが、今後拡張するなら、Boot Orchestrator、Engine Wiring、Shell Event Binding、Maintenance Service などへ分割する余地がある。

### 11.3 ApiRouterの巨大化

`ApiRouter` はHost/Guest境界の中心だが、ファイル、AI、プロセス、Host UI、ネットワーク、デバイス、動的ツールを単一クラスに集約している。

さらに `dev:photo` / `dev:audio` では、API Router内部で直接DOM UIを構築している。  
これはルーティング層とプレゼンテーション層が混ざっている状態である。

より整理するなら、以下のような分割が考えられる。

```text
ApiRouter
  ├── FsApiHandler
  ├── AiApiHandler
  ├── SystemApiHandler
  ├── HostUiApiHandler
  ├── NetApiHandler
  ├── DeviceApiHandler
  └── ToolsApiHandler
```

Device UIは `shell/modals/device_*` のようなShell側コンポーネントに委譲し、RouterはPromiseを待つだけにすると責務が明確になる。

### 11.4 VFSにドメインルールが混入している

`vfs.js` は低レベルのファイルシステムである一方、以下のようなパス固有ルールを知っている。

- `.trash/`
- `system/cache/`
- `system/logs/`

これは実用上は分かりやすいが、VFSコアがOS上位層のディレクトリ意味論を知っている状態である。

より抽象化するなら、VFS本体は純粋なCRUDに寄せ、削除ポリシーや同期除外ポリシーは別層に切り出せる。

例:

```text
VirtualFileSystem
  ↑
VfsPolicyLayer
  ├── TrashPolicy
  ├── CachePolicy
  ├── LogRetentionPolicy
  └── SyncIgnorePolicy
```

### 11.5 Guest APIの文字列注入

Guest側APIは、複数ファイルに定義された文字列コードを `GuestBuilder` が束ね、Blob JSとして注入している。

利点:

- Guest iframeへ簡単にBridgeを注入できる
- ビルドレス構成を保てる

欠点:

- IDE支援やlintが効きにくい
- Host版とGuest版で似たコードが重複する
- 大規模化すると保守が難しい

将来的には、Guest runtime bundleを独立したソースとして管理し、ビルド時または起動時にbundle化する方式が考えられる。

### 11.6 postMessage origin

Host/Guest IPCは `postMessage(..., "*")` を使う。  
Blob iframe中心のローカル実行では動作しやすいが、セキュリティレビュー上は注意が必要である。

少なくとも受信側で `protocol`, `target`, `source` を検証しているが、origin検証は限定的である。  
将来的には、許容originやiframe window参照との照合を強める余地がある。

### 11.7 Sync deletion semantics

SyncEngineはローカル削除をremoteへ伝播しない。  
remote indexにファイルが残っていれば、ローカルで消したファイルも再ダウンロードされる。

これは「データを失わない」方向の保守的設計であり、初期段階では合理的である。  
ただし、複数端末同期としては「削除が同期されない」というユーザー期待との差分を持つ。

---

## 12. 初見開発者向けの読み順

Host Runtimeを理解するには、以下の順で読むとよい。

```text
1. README_JA.md
   目的、HDI、REAL Architectureの概念を掴む

2. index.html
   scriptロード順とHost UIのDOM構造を確認する

3. src/main.js
   起動入口がShellControllerだけであることを確認する

4. src/shell/core/shell_controller.js
   依存関係の組み立て、イベントbinding、Runtime全体像を読む

5. src/core/state/vfs.js
   ファイル状態の物理構造を読む

6. src/core/state/history.js
   AIループの割り込みキューとしてのHistoryを読む

7. src/core/control/engine.js
   History changeからLLM実行・ツールdispatchまでを読む

8. src/core/cognitive/projector.js
   HistoryがProvider API形式に変換される仕組みを読む

9. src/core/cognitive/translator.js
   LPMLがactionに変換される仕組みを読む

10. src/core/control/tool_registry.js と tools/*
    actionがHost機能へ接続される仕組みを読む

11. src/shell/windowing/process_manager.js
    Guest iframeプロセスのライフサイクルを読む

12. src/api/guest/*, src/ipc/*, src/api/host/api_router.js
    Host/Guest IPCとMetaOS Bridgeを読む
```

---

## 13. このドキュメントの現在の限界

このドキュメントはHost / Kernel / Runtime構造を対象にしている。  
以下はまだ詳細対象外である。

- `vfs_root/apps/` 配下の標準Guestアプリ
- `vfs_root/system/lib/` のGuest向けUI/標準ライブラリ
- `vfs_root/system/kernel/` のDashboard runtime
- 各Blueprintのインストールプロトコル
- Guestアプリ設計ガイド

これらは、次のドキュメントとして分離するのがよい。

```text
docs/architecture/guest_app_architecture.md
docs/architecture/metaos_api_reference.md
docs/architecture/default_vfs_layout.md
```

---

## 14. 要約

Itera OS Host Runtimeは、以下の構造で理解できる。

```text
Browser Host
  ├── State Layer
  │   ├── VFS
  │   ├── History
  │   ├── Config
  │   └── Store / Logger
  │
  ├── Cognitive / Control Loop
  │   ├── Projector
  │   ├── LLM Adapter
  │   ├── Translator
  │   ├── Engine
  │   └── ToolRegistry
  │
  ├── Shell / Desktop Environment
  │   ├── ShellController
  │   ├── ChatPanel
  │   ├── Explorer
  │   ├── Modals
  │   └── ProcessManager
  │
  ├── Host-Guest Boundary
  │   ├── GuestCompiler
  │   ├── GuestBuilder
  │   ├── MetaOS API
  │   ├── IPC Transport
  │   └── ApiRouter
  │
  └── Sync / Persistence
      ├── IndexedDB Store
      ├── Time Machine
      ├── SyncEngine
      ├── SyncManager
      └── GDriveProvider
```

最も重要な理解は、AIとGuestアプリが別々の入口を持ちながら、最終的には同じHost状態へ合流することである。

```text
AI path:
  LPML -> Translator -> ToolRegistry -> Host state/services

Guest path:
  MetaOS -> IPC -> ApiRouter -> Host state/services
```

この二重経路が、Itera OSを「AIが直接環境を構築・操作できるブラウザ内OS」として成立させている。