# Itera OS

**An Autonomous AI Operating System Running Entirely in Your Browser**

Itera OSは、ブラウザ内で完結して動作する自律型AIオペレーティングシステムの実験的実装です。

従来の「テキストを返すだけのチャットボット」から脱却し、AIエージェントがユーザーのコンピューティング環境（ファイルシステム、UIプロセス、バックグラウンドデーモンなど）を直接構築・操作・維持する **Host-Driven Intelligence (HDI)** のアプローチを採用しています。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)]()

---

## 💡 1. Introduction

Itera OSにはバックエンドサーバー（PythonやNode.js等）が存在しません。すべてのコード実行、ファイル操作、UIレンダリングはユーザーのブラウザのローカルメモリ上で完結します。

ユーザーが「タスク管理アプリが必要」「データを集計するスクリプトを書いて」と要求すると、AIはその場でHTML/JS/CSSをコーディングし、仮想ファイルシステムに保存したうえで即座にプロセスとして起動します。システム自体が、AIとユーザーの対話を通じて再帰的に自己改善・適応していくデジタルワークスペースとして機能します。

## ⚙️ 2. The REAL Architecture

LLM（大規模言語モデル）の推論能力をOSの自律的な動作に変換するため、**REAL (Recursive Environment-Agent Loop)** と呼ばれるアーキテクチャを実装しています。

システムは以下の3つのレイヤーに明確に分離され、AIは「観測・思考・実行・更新」のループを自律的に回します。

1. **Cognitive Layer (L1: 認知)**
   LLM（現在はGoogle Gemini）による純粋な思考と計画のレイヤー。現在の環境状態を観測し、「何を行うべきか」という意図（LPMLタグ）を出力します。
2. **Control Layer (L2: 制御)**
   L1の意図を解釈し、実際の環境への物理的干渉（ファイルの作成・編集、プロセスの起動・停止など）を行うエンジン。無限ループの防止やエラーハンドリングも担います。
3. **State Layer (L3: 状態)**
   仮想ファイルシステム（VFS）と対話履歴（History）からなるレイヤー。エージェントの記憶と世界の「唯一の情報源（Single Source of Truth）」として機能します。

## 🏗️ 3. System Design: Host & Guest Isolation

セキュリティの確保とシステムの安定稼働のため、OS空間は特権レベルによって分離されています。

* **Host (Brain / Kernel)**
  ブラウザのメインスレッド。LLMとの通信、VFSの管理、ツールの実行権限、およびプロセスのライフサイクル管理を行う特権領域です。
* **Guest (Body / Userland)**
  サンドボックス化された `iframe` 内で動作するユーザー空間です。フォアグラウンドのダッシュボードUIや、バックグラウンドで動作するデーモンプロセス（APIポーリングなど）はすべてここで実行されます。
* **Itera Bridge (MetaOS API)**
  GuestからHostの機能へアクセスするためのIPC（プロセス間通信）プロトコルです。Guestアプリは `window.MetaOS` クライアントライブラリを通じて、ファイル操作や他のプロセスへのイベントブロードキャスト、あるいはAIに対する自律タスクの要求（`agent` / `ask`）を行います。

## 📦 4. Itera Blueprints: AI-Native Software Packaging

Itera OSにおけるサードパーティ製アプリや拡張機能の導入には、**Itera Blueprint** という独自のAIネイティブなパッケージ管理手法を用います。

Blueprintの実態は、単なるMarkdownファイル（`.md`）です。ここには、アプリケーションのソースコードだけでなく、「自然言語によるAI向けのインストール手順」が記述されています。

ユーザーがBlueprintファイルをチャットにドロップし「これをインストールして」と指示すると、AIは現在のユーザー環境（テーマ設定や既存のファイル構成）のコンテキストを読み取り、安全にコードを解釈・マージしてシステムファイル（`apps.json`など）を書き換えます。これにより、固定的なインストーラでは実現できない、柔軟で環境に適応した機能拡張が可能になります。

## 🚀 5. User Guide & Best Practices

1. **Boot**: [デモページ](https://itomaai.github.io/itera/) にアクセスし、右上の設定領域からご自身の Gemini API Key を入力して保存します。（キーは `localStorage` にのみ保存されます）
2. **Interaction**: 右側のチャットパネルから自然言語で指示を出します。アプリの作成、UIテーマの変更、システム設定の調整など、あらゆる操作が可能です。
3. **Resilience (Time Machine)**: AIによるシステム操作は時に予期せぬ破壊的変更をもたらす可能性があります。そのため、システムにはスナップショット機能（Time Machine）が備わっています。大胆な変更を依頼する前にはスナップショットを作成し、失敗した場合は即座に正常な状態へロールバックしてください。
4. **Data Persistence**: VFSのデータは IndexedDB に保存され、リロードしても維持されます。ただし、ブラウザのキャッシュをクリアするとデータは消失するため、サイドバーからシステム全体を `.zip` 形式で定期的にエクスポート（バックアップ）することを強く推奨します。

## ⚠️ 6. Constraints & Troubleshooting

* **Sandbox Constraints**: ブラウザ内で動作するという性質上、シェルコマンド（`npm`, `python` 等）の実行や、CORSポリシーに違反する外部APIへの直接のHTTPリクエスト、ローカルマシンの実ファイルシステムへのアクセスはできません。
* **Loop Divergence**: AIの認識している「コードの状態」と実際のVFSの状態が乖離し、AIがエラーの修正ループに陥ることがあります。その場合はチャットパネルの「Stop」ボタンで思考を強制停止させてください。
* **Factory Reset**: システムが深刻な破損状態に陥り、Time Machineでも復旧できない場合は、サイドバーの「赤いゴミ箱アイコン」からFactory Resetを実行することで、システムを初期状態に再構築できます。

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 itomaAI inc.
