# Itera OS VFS v2 Design Specification

Status: Draft  
Scope: New VFS subsystem for Itera OS Host Runtime  
Date: 2026-06-18  
Related document: `workspace/itera/docs/architecture/host_runtime_architecture.md`

---

## 0. 目的

VFS v2 は、現行 `src/core/state/vfs.js` の単純な `path -> content` Map構造を、よりOSらしいファイル管理基盤へ発展させるための新規設計である。

これは現行VFSの単なる改修ではない。  
ただし、現行実装でうまく機能している以下の性質は活かす。

- ブラウザ内で完結する
- AIツールとGuestアプリが同じファイルシステムを共有する
- `readFile(path)` / `writeFile(path, content)` の単純なAPIが強力である
- VFS変更イベントがShell、AI、Guestアプリの同期点になる
- Local-firstで即時応答する
- Snapshot / Time Machineと相性がよい
- GuestアプリはHostへ直接アクセスせず、MetaOS Bridge経由で操作する

VFS v2 の中心的な目標は、以下である。

1. メタデータと実体データを分離する
2. ファイルをpathではなく安定IDで管理する
3. ディレクトリを実体化する
4. ローカルおよびクラウドの複数Content backendを扱えるようにする
5. 複数端末同期を前提にしたメタデータ設計を行う
6. アプリ、AI、サービスごとの権限管理を可能にする
7. アプリレジストリとファイル関連付けをOS機能として導入する
8. 既存Host Runtimeと段階的に接続できる互換Adapterを用意する

---

## 1. 非目的

VFS v2 の初期設計では、以下は直接の目的にしない。

- ネイティブOSの完全なファイルシステム互換
- POSIX permissionの完全再現
- 分散ファイルシステムレベルの強い整合性
- Gitのような完全な履歴管理
- 大規模チーム向けの複雑なACL
- 初期段階からのリアルタイム共同編集
- 既存 `vfs.js` の即時置換

VFS v2 は、まずItera OSのHost Runtimeに自然に接続できる、Local-firstなブラウザ内ファイル管理基盤を目指す。

---

## 2. 現行VFSから引き継ぐべき設計

現行VFSには、単純だが強い性質がある。

### 2.1 APIの単純さ

```js
vfs.readFile(path)
vfs.writeFile(path, content)
vfs.deleteFile(path)
vfs.rename(oldPath, newPath)
vfs.listFiles({ path, recursive })
```

AIツールやGuest APIが扱いやすいのは、この単純さのおかげである。  
VFS v2でも、外部互換APIとしてこの形を維持する。

### 2.2 VFS change event

現行VFSでは、write/delete/rename等の操作後に `change` eventが発火する。

これにより以下が連動する。

- Explorer再描画
- storage autosave
- Guest appへの `file_changed` broadcast
- ConfigManager reload
- ThemeManager reload
- Sync dirty detection

VFS v2では、このイベントをより構造化し、Event Journalへ拡張する。

### 2.3 すべて文字列として扱う制約

現行VFSはcontentを文字列として保存する。  
バイナリはBase64 Data URIへ変換する。

この制約は単純さのためには有効だったが、大容量データには弱い。  
VFS v2では、外部API互換として文字列read/writeを残しつつ、内部ではBlob実体をContentStoreへ分離する。

---

## 3. VFS v2の全体構造

VFS v2 は単一クラスではなく、複数の責務を持つサービス群として構成する。

```text
VfsService
  ├── NodeStore
  ├── ContentStore
  ├── PermissionManager
  ├── AppRegistry
  ├── FileAssociationResolver
  ├── SyncCoordinator
  ├── EventJournal
  └── CompatibilityAdapter
```

### 3.1 VfsService

VFS v2 の公開APIを提供するFacade。

責務:

- path/nodeIdによるread/write/list/stat
- NodeStoreとContentStoreの統合
- Permission checkの呼び出し
- Event Journalへの記録
- SyncCoordinatorへのdirty通知
- 既存API互換の維持

### 3.2 NodeStore

ファイル・ディレクトリ・symlink等のメタデータを保存する。

候補実装:

- InMemoryNodeStore
- IndexedDbNodeStore
- FirestoreNodeStore

### 3.3 ContentStore

ファイル実体を保存する。

候補実装:

- MemoryContentStore
- IndexedDbContentStore
- OpfsContentStore
- FirebaseStorageContentStore
- GDriveContentStore

### 3.4 PermissionManager

操作主体ごとのCapabilityを判定する。

対象:

- user
- agent
- app
- service
- system

### 3.5 AppRegistry

インストール済みアプリのManifestを管理する。

### 3.6 FileAssociationResolver

ファイルを開くアプリを解決する。

### 3.7 SyncCoordinator

Local metadata/contentとRemote metadata/contentの同期を管理する。

### 3.8 EventJournal

VFS操作を構造化イベントとして記録する。

### 3.9 CompatibilityAdapter

既存のHost Runtime、AI tools、Guest MetaOS APIが期待する旧APIを提供する。

---

## 4. Core Data Model

### 4.1 VfsNode

VFS v2では、ファイルやディレクトリを `VfsNode` として管理する。

```ts
type VfsNode = {
  id: string;
  path: string;
  name: string;
  parentId: string | null;

  kind: "file" | "directory" | "symlink" | "mount";

  mimeType?: string;
  extension?: string;

  size: number;

  createdAt: number;
  updatedAt: number;
  accessedAt?: number;

  contentRef?: ContentRef;

  version: number;
  hash?: string;

  flags?: VfsNodeFlags;

  permissions?: PermissionSpec;

  appHints?: AppHints;

  sync?: SyncState;

  custom?: Record<string, unknown>;
};
```

### 4.2 VfsNodeFlags

```ts
type VfsNodeFlags = {
  system?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  trashed?: boolean;
  pinned?: boolean;
};
```

### 4.3 AppHints

```ts
type AppHints = {
  preferredAppId?: string;
  lastOpenedBy?: string;
  lastOpenMode?: "view" | "edit" | "import";
};
```

### 4.4 ContentRef

```ts
type ContentRef = {
  backend: "memory" | "indexeddb" | "opfs" | "firebase_storage" | "gdrive";
  key: string;

  encoding?: "utf8" | "data_uri" | "blob";
  mimeType?: string;

  hash?: string;
  size?: number;

  createdAt?: number;
  updatedAt?: number;
};
```

### 4.5 SyncState

```ts
type SyncState = {
  status: "local" | "synced" | "dirty" | "syncing" | "conflict" | "remote_only";

  localVersion: number;
  remoteVersion?: number;

  remoteId?: string;
  remoteUpdatedAt?: number;
  lastSyncedAt?: number;

  conflictId?: string;
};
```

---

## 5. PathとNode ID

### 5.1 基本方針

VFS v2では、pathは表示・解決用の属性であり、ファイルの同一性は `id` が担う。

理由:

- rename/moveしても同じファイルとして扱える
- 最近使ったファイル、権限、同期状態、履歴がpath変更で壊れにくい
- ファイル関連付けやショートカットが安定する
- conflict管理がしやすい

### 5.2 Path Index

NodeStoreは以下のindexを持つ。

```text
nodeId -> VfsNode
path   -> nodeId
parentId -> child node ids
```

### 5.3 Rename / Move

renameやmoveは、contentのコピーではなく、Node metadataの更新である。

```text
rename(nodeId, newPath)
  ↓
update node.path
update node.name
update node.parentId
increment version
emit node.moved
mark dirty
```

---

## 6. ディレクトリの実体化

現行VFSではディレクトリはprefixとして仮想的に存在する。  
VFS v2ではディレクトリを `kind: "directory"` のVfsNodeとして実体化する。

### 6.1 メリット

- 空ディレクトリを自然に扱える
- ディレクトリ単位の権限を持てる
- ディレクトリ単位の同期状態を持てる
- 共有やmountの境界にできる
- folder iconや並び順などのUI情報を持てる

### 6.2 `.keep` の扱い

VFS v2内部では `.keep` は不要にする。  
ただし、互換Adapterやexport処理では、必要に応じて `.keep` を生成してもよい。

---

## 7. MetadataStore / NodeStore

### 7.1 Interface

```ts
interface NodeStore {
  getNodeById(id: string): Promise<VfsNode | null>;
  getNodeByPath(path: string): Promise<VfsNode | null>;
  listChildren(parentId: string | null): Promise<VfsNode[]>;
  query(query: VfsQuery): Promise<VfsNode[]>;

  createNode(node: VfsNode): Promise<void>;
  updateNode(node: VfsNode): Promise<void>;
  deleteNode(id: string): Promise<void>;

  getPathIndex(path: string): Promise<string | null>;
}
```

### 7.2 VfsQuery

```ts
type VfsQuery = {
  pathPrefix?: string;
  kind?: VfsNode["kind"];
  mimeType?: string;
  extension?: string;
  tags?: string[];
  trashed?: boolean;
  dirty?: boolean;
};
```

### 7.3 初期実装

初期実装は `IndexedDbNodeStore` を推奨する。

理由:

- ブラウザLocal-firstと相性がよい
- メタデータ検索に向く
- OPFSより構造化データ管理が容易
- Firestore同期への変換もしやすい

---

## 8. ContentStore

### 8.1 Interface

```ts
interface ContentStore {
  read(ref: ContentRef): Promise<string | Blob>;
  write(content: string | Blob, opts?: WriteContentOptions): Promise<ContentRef>;
  delete(ref: ContentRef): Promise<void>;
  exists(ref: ContentRef): Promise<boolean>;
}
```

### 8.2 WriteContentOptions

```ts
type WriteContentOptions = {
  mimeType?: string;
  encoding?: "utf8" | "data_uri" | "blob";
  preferredKey?: string;
};
```

### 8.3 Backend候補

#### MemoryContentStore

用途:

- テスト
- Private mode fallback
- 一時ファイル

#### IndexedDbContentStore

用途:

- 小〜中規模ファイル
- OPFS非対応環境のfallback

#### OpfsContentStore

用途:

- ローカル実体保存の本命
- 大容量Blob
- Local-first SaaS版

#### FirebaseStorageContentStore

用途:

- クラウド実体保存
- 複数端末同期
- 共有ワークスペース

#### GDriveContentStore

用途:

- 既存Google Drive同期の発展
- ユーザー個人のクラウドバックアップ

---

## 9. VfsService API

### 9.1 互換API

現行Host RuntimeとAI toolsを壊さないため、以下は維持する。

```ts
readFile(path: string, opts?: ReadOptions): Promise<string>;
writeFile(path: string, content: string, opts?: WriteOptions): Promise<string>;
deleteFile(path: string, opts?: DeleteOptions): Promise<string>;
rename(oldPath: string, newPath: string): Promise<string>;
copyFile(srcPath: string, destPath: string): Promise<string>;
listFiles(opts?: ListOptions): Promise<string[] | VfsStat[]>;
stat(path: string): Promise<VfsStat>;
exists(path: string): Promise<boolean>;
getTree(): Promise<TreeNode[]>;
```

ただし、内部的にはpathをnodeIdへ解決して処理する。

### 9.2 新API

```ts
getNode(id: string): Promise<VfsNode | null>;
getNodeByPath(path: string): Promise<VfsNode | null>;

readNode(id: string): Promise<string | Blob>;
writeNode(id: string, content: string | Blob, opts?: WriteOptions): Promise<void>;

createDirectory(path: string, opts?: CreateNodeOptions): Promise<VfsNode>;
createFile(path: string, content?: string | Blob, opts?: CreateNodeOptions): Promise<VfsNode>;

moveNode(id: string, newParentId: string, newName?: string): Promise<void>;
trashNode(id: string): Promise<void>;
restoreNode(id: string): Promise<void>;

watch(query: VfsQuery, callback: (event: VfsEvent) => void): Unsubscribe;
```

---

## 10. Permission / Capability

### 10.1 Principal

```ts
type Principal =
  | { type: "user"; id: string }
  | { type: "agent"; id: "itera" }
  | { type: "app"; appId: string; pid?: string }
  | { type: "service"; serviceId: string }
  | { type: "system" };
```

### 10.2 Capability

```ts
type Capability =
  | "fs.read"
  | "fs.write"
  | "fs.delete"
  | "fs.rename"
  | "fs.share"
  | "fs.execute"
  | "app.spawn"
  | "net.fetch"
  | "device.camera"
  | "device.microphone"
  | "ai.ask"
  | "ai.task";
```

### 10.3 PermissionSpec

```ts
type PermissionSpec = {
  owner: Principal;
  grants: Array<{
    principal: Principal | "public" | "authenticated";
    capabilities: Capability[];
    scope?: PermissionScope;
  }>;
};
```

```ts
type PermissionScope = {
  nodeId?: string;
  pathPrefix?: string;
  recursive?: boolean;
};
```

### 10.4 PermissionManager

```ts
interface PermissionManager {
  check(input: {
    principal: Principal;
    capability: Capability;
    node?: VfsNode;
    path?: string;
  }): Promise<PermissionDecision>;
}
```

```ts
type PermissionDecision = {
  allowed: boolean;
  reason?: string;
  requiresPrompt?: boolean;
};
```

### 10.5 段階導入

最初から強制すると既存Runtimeが壊れる可能性が高い。  
したがって、初期段階では監査ログから始める。

```text
Phase A: allow all + audit log
Phase B: system領域の危険操作のみprompt
Phase C: Guest app scopeを強制
Phase D: AI agentにもpolicyを適用
```

---

## 11. App Registry

### 11.1 目的

アプリを単なるHTMLファイルではなく、OSに登録されたパッケージとして扱う。

これにより以下が可能になる。

- Launcher表示
- File Association
- Permission request
- URL scheme handling
- Dynamic tools declaration
- App-specific data scope
- Install / uninstall / update
- System appとUser appの区別

### 11.2 AppManifest

```ts
type AppManifest = {
  appId: string;
  name: string;
  version: string;

  description?: string;
  icon?: string;

  entry: {
    path: string;
    type: "html";
  };

  process: {
    defaultMode: "foreground" | "background";
    singleton?: boolean;
    allowMultipleWindows?: boolean;
  };

  capabilities?: CapabilityRequest[];

  fileHandlers?: FileHandler[];

  urlHandlers?: UrlHandler[];

  tools?: ToolDeclaration[];

  dataScopes?: DataScope[];

  author?: string;
  homepage?: string;

  system?: boolean;
};
```

### 11.3 CapabilityRequest

```ts
type CapabilityRequest = {
  capability: Capability;
  scope?: PermissionScope;
  reason?: string;
};
```

### 11.4 FileHandler

```ts
type FileHandler = {
  id: string;
  label: string;

  mimeTypes?: string[];
  extensions?: string[];

  openMode: "view" | "edit" | "import";

  priority?: number;

  command: {
    type: "spawn";
    path: string;
    params?: Record<string, string>;
  };
};
```

### 11.5 UrlHandler

```ts
type UrlHandler = {
  scheme: string;
  patterns?: string[];
};
```

### 11.6 ToolDeclaration

```ts
type ToolDeclaration = {
  name: string;
  description: string;
  definition: string;
};
```

### 11.7 DataScope

```ts
type DataScope = {
  path: string;
  purpose: string;
};
```

---

## 12. File Association

### 12.1 現状の問題

現状のExplorerは、おおむね以下で開く対象を決めている。

```text
binary extension -> Host MediaViewer
otherwise        -> Host EditorModal
```

これは単純だが、OSとしては拡張性がない。

### 12.2 目標

ファイルを開くときは、FileAssociationResolverを通す。

```text
Explorer open file
  ↓
VfsService.stat / getNode
  ↓
FileAssociationResolver.resolve(node)
  ↓
default handler決定
  ↓
ProcessManager.spawn(app, launchContext)
```

### 12.3 Resolver Interface

```ts
interface FileAssociationResolver {
  getHandlersForNode(node: VfsNode): Promise<ResolvedFileHandler[]>;
  getDefaultHandler(node: VfsNode): Promise<ResolvedFileHandler | null>;
  setDefaultHandler(pattern: FilePattern, appId: string, handlerId: string): Promise<void>;
}
```

```ts
type FilePattern = {
  extension?: string;
  mimeType?: string;
  pathPattern?: string;
};
```

```ts
type ResolvedFileHandler = {
  app: AppManifest;
  handler: FileHandler;
  score: number;
  source: "user_default" | "node_hint" | "manifest" | "system_fallback";
};
```

### 12.4 優先順位

1. ユーザーが設定したdefault app
2. node.appHints.preferredAppId
3. App manifest priority
4. system fallback
5. Host Editor / Host MediaViewer

### 12.5 Launch Context

query stringでpathを渡す方式は簡単だが、複雑な起動情報には弱い。  
VFS v2では、ProcessManagerにLaunch Contextを持たせる。

```ts
type LaunchContext = {
  action: "openFile" | "newFile" | "importFile" | "view";
  nodeId?: string;
  path?: string;
  mode?: "view" | "edit" | "import";
  mimeType?: string;
};
```

Guest側には以下のようなAPIを追加する。

```js
const ctx = await MetaOS.system.launchContext();
```

---

## 13. Event Journal

### 13.1 目的

VFS v2では、単なる `change` eventではなく、構造化されたイベントを記録する。

用途:

- Shell再描画
- Guest file watcher
- Sync dirty marking
- Audit log
- AIへのevent injection
- Undo/Redo
- Snapshot差分
- Permission監査

### 13.2 VfsEvent

```ts
type VfsEvent = {
  id: string;

  type:
    | "node.created"
    | "node.updated"
    | "node.deleted"
    | "node.trashed"
    | "node.restored"
    | "node.moved"
    | "content.updated"
    | "permission.changed"
    | "sync.status_changed";

  nodeId: string;
  path: string;
  oldPath?: string;

  actor: Principal;

  timestamp: number;
  transactionId?: string;

  payload?: Record<string, unknown>;
};
```

### 13.3 Watch API

```ts
watch(query: VfsQuery, callback: (event: VfsEvent) => void): Unsubscribe;
```

Guestアプリ側では、既存の `file_changed` broadcastを発展させる。

```js
MetaOS.fs.watch("data/tasks/**", (event) => {
  // update UI
});
```

---

## 14. Sync v2

### 14.1 基本方針

VFS v2のSyncはMetadata-firstにする。

```text
Local NodeStore
Local ContentStore
  ↓
SyncCoordinator
  ↓
Remote NodeStore
Remote ContentStore
```

Firebase構成では以下が自然である。

```text
IndexedDB NodeStore  <-> Firestore NodeStore
OPFS ContentStore    <-> Firebase Storage ContentStore
```

### 14.2 SyncCoordinator

```ts
interface SyncCoordinator {
  markDirty(nodeId: string): Promise<void>;
  syncNow(): Promise<SyncReport>;
  startDaemon(intervalMs: number): void;
  stopDaemon(): void;
}
```

### 14.3 SyncReport

```ts
type SyncReport = {
  uploadedMetadata: number;
  downloadedMetadata: number;
  uploadedContent: number;
  downloadedContent: number;
  conflicts: number;
  errors: Array<{ nodeId?: string; path?: string; message: string }>;
};
```

### 14.4 Tombstone

削除同期は物理削除ではなくtombstoneで扱う。

```ts
type Tombstone = {
  nodeId: string;
  path: string;
  deletedAt: number;
  deletedBy: Principal;
  previousContentRef?: ContentRef;
};
```

### 14.5 Conflict

初期実装では、衝突時に片方を自動破棄しない。  
conflict nodeとして隔離する。

例:

```text
data/report.md
data/report (conflict from iPad 2026-06-18).md
```

またはmetadata上で以下を持つ。

```ts
type ConflictRecord = {
  conflictId: string;
  nodeId: string;
  baseVersion: number;
  localContentRef: ContentRef;
  remoteContentRef: ContentRef;
  detectedAt: number;
};
```

---

## 15. Trash / Restore

TrashはVFSコアの特殊if文ではなく、VfsService上位のポリシーとして扱う。

```text
trashNode(id)
  ↓
node.flags.trashed = true
node.path = ".trash/{timestamp}_{oldName}" または仮想Trash viewへ表示
emit node.trashed
mark dirty
```

Restoreは元pathまたは新pathへ戻す。

```text
restoreNode(id, targetPath?)
  ↓
node.flags.trashed = false
node.path = targetPath || previousPath
emit node.restored
mark dirty
```

---

## 16. Versioning

初期段階ではフルversioningを必須にしない。  
ただし、ContentRef分離により将来のversioningは容易になる。

```ts
type VersionRecord = {
  nodeId: string;
  version: number;
  contentRef: ContentRef;
  actor: Principal;
  createdAt: number;
  message?: string;
};
```

最初は以下だけでよい。

- version number
- updatedAt
- last writer
- Snapshotとの接続

---

## 17. Search / Index

現状の `search_tools.js` はVFS全走査である。  
VFS v2では以下のindexを検討する。

- path/name index
- mimeType index
- extension index
- tag index
- full-text index
- embedding index

初期実装では、NodeStore queryによるmetadata検索だけでも効果がある。  
全文検索indexは後続でよい。

---

## 18. Mount

将来的には複数backendをmountできるようにする。

```text
/
├── data/              local workspace
├── system/            readonly system files
├── cloud/drive/       Google Drive mount
├── shared/team-a/     Firebase shared workspace
└── tmp/               memory-backed temp
```

Mount nodeは以下のように表現する。

```ts
type MountNode = VfsNode & {
  kind: "mount";
  mount: {
    backend: "firebase" | "gdrive" | "memory" | "opfs";
    rootRef: string;
    readonly?: boolean;
  };
};
```

---

## 19. Transactions

AIは複数ファイルを一度に編集することが多い。  
そのため、将来的にはtransactionが必要になる。

```ts
await vfs.transaction(async tx => {
  await tx.writeFile("apps/a.html", contentA);
  await tx.writeFile("apps/b.js", contentB);
});
```

初期段階では完全なatomicityまでは不要。  
ただし、EventJournalに `transactionId` を持たせ、複数操作をひとまとまりとして扱えるようにする。

---

## 20. 既存Runtimeとの接続

VFS v2は新規開発として作るが、既存Host Runtimeに段階的に接続する。

### 20.1 CompatibilityAdapter

既存コードが期待する同期APIを提供する。

```ts
class VfsCompatibilityAdapter {
  readFile(path) {}
  writeFile(path, content) {}
  deleteFile(path) {}
  rename(oldPath, newPath) {}
  copyFile(srcPath, destPath) {}
  listFiles(options) {}
  stat(path) {}
  exists(path) {}
  getTree() {}
  on(event, callback) {}
}
```

これにより、既存の以下を一気に壊さずに接続できる。

- fs_tools.js
- api_router.js
- explorer.js
- config_manager.js
- theme_manager.js
- process_manager.js
- guest_compiler.js
- sync_manager.js

### 20.2 既存コードの活かし方

活かせるもの:

- path normalization logic
- VFS event modelの考え方
- `readFile` / `writeFile` の外部API
- `editLines` / SEARCH block editorとの接続
- ExplorerのツリーUI
- ProcessManagerの `resolveUrl`
- Projectorのmedia object処理
- SyncEngineの差分計算思想

置き換えるべきもの:

- `files[path].content` に全実体を持つ構造
- ディレクトリprefix illusion
- VFS内の`.trash` / `system/cache` 特殊if文
- pathをファイルIDとして扱う設計
- Syncで削除を伝播しない暫定仕様
- Host固定のfile opener選択

---

## 21. 新規開発フェーズ案

### Phase 1: VFS v2 Core Prototype

作るもの:

- VfsNode model
- InMemoryNodeStore
- MemoryContentStore
- VfsService
- CompatibilityAdapter

目的:

- `readFile/writeFile/listFiles/getTree` が現行互換で動くこと
- nodeId/path分離を内部で成立させること

### Phase 2: IndexedDB Metadata + OPFS Content

作るもの:

- IndexedDbNodeStore
- OpfsContentStore
- fallback Memory/IndexedDB ContentStore
- migration/import utility

目的:

- Local-first大容量対応
- reload後もmetadata/contentが復元されること

### Phase 3: EventJournal

作るもの:

- VfsEvent model
- watcher
- audit log
- existing `change` event互換

目的:

- Shell/Sync/Guest watchersを構造化eventに接続する

### Phase 4: AppRegistry + FileAssociation

作るもの:

- AppManifest schema
- ManifestStore
- FileAssociationResolver
- Open With flow
- LaunchContext

目的:

- Host固定viewerからGuest app openerへ移行する

### Phase 5: Permission Audit

作るもの:

- PrincipalResolver
- PermissionManager
- allow-all audit mode
- system path warning policy

目的:

- まず壊さずに権限判断ログを蓄積する

### Phase 6: Sync v2 Prototype

作るもの:

- SyncCoordinator
- local metadata diff
- Firebase/Firestore adapter prototype
- tombstone
- conflict quarantine

目的:

- 複数端末同期の基礎を作る

### Phase 7: Runtime Integration

既存Host Runtimeで `VirtualFileSystem` の代わりにCompatibilityAdapterを注入する。

対象:

- ShellController
- ConfigManager
- Explorer
- fs_tools
- ApiRouter
- ProcessManager
- GuestCompiler

---

## 22. 最小実装のMVP定義

VFS v2 MVPは、以下を満たすものとする。

1. pathではなくnodeIdを内部IDとして持つ
2. directoryが実体Nodeとして存在する
3. metadataとcontentが分離されている
4. 既存互換APIが動く
5. list/statがcontentを読まずに動く
6. writeFileがContentStoreへ実体を書き、Node metadataを更新する
7. rename/moveがcontentをコピーしない
8. EventJournalに操作が記録される
9. InMemory実装でテスト可能
10. IndexedDB + OPFS実装へ差し替え可能なinterfaceを持つ

---

## 23. Open Questions

1. `system/` 領域はどこまでreadonlyにするか。
2. AI Agentの権限はUserと同等か、独立Principalにするか。
3. Guest appのpermission promptをいつ表示するか。
4. AppRegistryの保存場所は `system/config/apps.json` の発展形か、NodeStore内の専用collectionか。
5. Firebaseを最初から想定したschemaにするか、まずlocalのみで固めるか。
6. LaunchContextをURL queryで渡すか、ProcessManagerのメモリに保持してMetaOS APIで取得するか。
7. Content hashを必須にするか。
8. Conflict resolutionをどこまで自動化するか。
9. SnapshotはNodeStore/ContentStore全体をどう保存するか。
10. 既存 `default_files.js` 生成とVFS v2初期化をどう接続するか。

---

## 24. 推奨判断

現時点の推奨は以下である。

1. **VFS v2は新規サブシステムとして作る**
   - 現行 `vfs.js` を直接巨大化させない。

2. **最初はInMemory実装でモデルを固める**
   - いきなりOPFS/Firebaseに入らない。

3. **CompatibilityAdapterを最初から作る**
   - 既存Host Runtimeに後で差し込めるようにする。

4. **Node ID / Metadata / ContentRefを最初から導入する**
   - 後からpath IDを剥がすのは難しい。

5. **Permissionは最初はaudit mode**
   - 強制は後でよいが、Principal情報は最初から通す。

6. **AppRegistryとFileAssociationはVFS v2の中核として扱う**
   - OSらしさに直結するため、後付けにしない。

7. **SyncはMetadata-first**
   - Content同期は必要なものだけ行う。

---

## 25. まとめ

VFS v2は、単なるファイル保存機構ではなく、Itera OSのアプリ、AI、同期、権限、ユーザー操作を束ねる中核サービスである。

現行VFSは、AIが環境を直接操作できる最小核として非常に有効だった。  
しかし、クラウド同期、複数端末、アプリレジストリ、権限、ファイル関連付けを実現するには、以下の進化が必要である。

```text
Current VFS:
  path -> { content, meta }

VFS v2:
  nodeId -> metadata
  contentRef -> content backend
  app manifest -> file handlers
  principal -> capability
  event journal -> sync/audit/watch
```

この設計により、Itera OSは「ブラウザ内で動くAI付きファイルマネージャ」から、より本格的な **Local-first AI Operating System** へ進化できる。