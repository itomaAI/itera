# Itera OS

**An Autonomous AI Operating System Running Entirely in Your Browser**

Itera OSは、Webブラウザの制約内で完全に動作する、自律型AIオペレーティングシステムの実験的実装です。

従来の対話型チャットボットのパラダイムから脱却し、**Host-Driven Intelligence (HDI)** のアプローチを採用しています。このアーキテクチャでは、AIエージェントに特権アクセスが付与され、バックエンドサーバーのインフラに依存することなく、ユーザーのコンピューティング環境（仮想ファイルシステム(VFS)、UIプロセス、バックグラウンドデーモンなど）を直接構築・操作・維持します。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)]()

---

## 1. Abstract (概要)

Itera OSは、すべてのシステムロジック、ファイル操作、およびUIレンダリングをブラウザのローカルメモリとIndexedDB上で実行します。
ユーザーが自然言語で要求（例：「タスク管理アプリをデプロイして」）を発行すると、AIエージェントは自律的に必要なHTML/JS/CSSを生成し、VFSに永続化させ、即座にライブプロセスとして起動します。継続的な相互作用を通じて、システム自体が再帰的に自己改善する適応型のデジタルワークスペースとして機能します。

## 2. Key Architectural Features (主要なアーキテクチャ機能)

### 2.1. The REAL Architecture
大規模言語モデル（LLM）の推論能力を自律的なOSの操作に変換するため、本システムは **REAL (Recursive Environment-Agent Loop)** アーキテクチャを実装しています。
1. **Cognitive Layer (L1: 認知)**: 現在の状態（$\Omega_t$）を評価し、LPML（LLM-Prompting Markup Language）タグを介して操作の意図を出力します。
2. **Control Layer (L2: 制御)**: L1の意図を解析し、物理的な介入（ファイルI/O、プロセス管理など）を実行し、その結果をコンテキストにフィードバックします。
3. **State Layer (L3: 状態)**: VFSと認識的履歴（Epistemic History）から構成される、システムの「唯一の情報源（Single Source of Truth）」です。

### 2.2. Host-Guest Isolation & IPC
OS空間は特権レベルによって厳密に分離されています：
* **Host (Kernel)**: メインスレッドで動作し、LLMのルーティング、VFS操作、およびプロセスのライフサイクル管理を担います。
* **Guest (Userland)**: サンドボックス化された `iframe` 内でユーザーアプリケーションやバックグラウンドデーモンを実行します。
Guestプロセスは、セキュアなシステム操作を実行するために、非同期のBridge APIである `window.MetaOS` を介してHostと通信します。

### 2.3. Agnostic LLM Routing
Cognitive Layerは特定のLLMプロバイダから分離されています。APIキーを設定し、プロバイダのプレフィックスを付与してモデルを定義する（例：`openai/gpt-5.5`）ことで、内部ルーターが動的にターゲットエンドポイントとコンテキスト生成ロジックを切り替えます。

## 3. Quick Start Protocol (初期セットアップ手順)

環境を起動するには、まず **[Itera OS ライブ環境 (Demo)](https://itomaai.github.io/itera/)** にアクセスしてください。その後、以下の初期化手順を実行します：

### Step 1: APIシークレットの注入
1. OSの右上ヘッダーにある **「Keys」** ボタンをクリックします。
2. 任意のプロバイダ（Google, OpenAI, Anthropic等）のAPIキーを入力します。
*（注：シークレットはブラウザの `localStorage` にローカルに保存され、認可されていない外部サーバーに送信されることはありません。）*

### Step 2: Cognitive Engine (LLM) の設定
1. ダッシュボードから **Settings** アプリ（⚙️）を起動します。
2. **AI Engine (LLM)** セクションにて、`<provider>/<model>` の構文を使用してターゲットモデルを指定します。
   * *設定例:* `openai/gpt-5.5`, `anthropic/claude-opus-4-7`, `google/gemini-3-flash-preview`
   *（プロバイダプレフィックスが指定されない場合、システムはデフォルトでGoogleのAPIへルーティングします。）*
3. チャットパネル上部のバッジが更新され、設定したモデルが反映されていることを確認します。

### Step 3: インタラクションとBlueprintのデプロイ
* **自然言語制御**: 右側のチャットパネルを使用してコマンドを発行します（例：「システムのテーマをMidnightに変更して」「`apps/tasks.html` の構文エラーを修正して」）。
* **Itera Blueprints (自律インストール)**: 新しいソフトウェアを導入するには、`.md` 形式のBlueprintファイル（例：`docs/blueprints/pomodoro.md`）をチャットパネルにドラッグ＆ドロップし、AIにインストールを指示します。エージェントは設計図を解釈し、現在のシステムテーマに適応させた上で、安全にコードをVFSへマージします。

## 4. System Resilience & Management (システムの復元性と管理)

### 4.1. Time Machine (状態のスナップショット)
AIの自律駆動による破壊的な改変リスクを考慮し、システムにはスナップショット機構が備わっています。
左サイドバー左上の **時計アイコン** をクリックすることで、VFSと履歴の全体状態（$\Omega_t$）を保存できます。操作によって致命的な障害が発生した場合でも、即座に安定した状態へロールバック（復元）することが可能です。

### 4.2. Factory Reset & データの永続化
* **Factory Reset (初期化)**: システムが深刻な破損状態に陥った場合、サイドバーの **赤いゴミ箱アイコン** をクリックすることでVFSをパージし、初期システムファイルを再構築できます。
* **データのエクスポート**: VFSのデータはブラウザのキャッシュクリア時に消失する揮発性を持つため、サイドバーの **ダウンロードアイコン（下矢印）** をクリックし、ワークスペース全体の `.zip` バックアップを定期的にエクスポートすることを強く推奨します。

## 5. Constraints & Security Considerations (制約とセキュリティ上の考慮事項)

* **サンドボックスの制限**: ブラウザのセキュリティ制約により、Iteraはネイティブのシェルバイナリ（`npm`, `python`等）を実行することはできず、ホストマシンの物理ファイルシステムに直接アクセスすることもできません。
* **CORS制約**: 外部APIへの直接のHTTPリクエストは、しばしばCORSポリシーによってブロックされます。これを緩和するため、SettingsアプリでプロキシURLを定義することができ、`MetaOS.net.fetch` APIはトラフィックをそこへルーティングします。
* **ループの乖離 (Loop Divergence)**: AIの内部状態表現と実際のVFSの状態が乖離した場合、無限のエラー修正ループに陥る可能性があります。その際は、チャットパネルの **「Stop」** ボタンを押して手動で割り込み（強制停止）を実行してください。

---
**License**: MIT License  
**Copyright**: (c) 2026 itomaAI inc.