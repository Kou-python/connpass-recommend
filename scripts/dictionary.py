"""トレンド抽出用の辞書とストップワード。

editable: BASE_TERMS に追加するか、config.json の trends.dictionary_extra に
ユーザー側で追記する。後者は再ビルド不要で済む。
"""
from __future__ import annotations

BASE_TERMS: list[str] = [
    # AI / LLM
    "AI", "LLM", "RAG", "MCP",
    "Claude", "Codex", "Cursor", "Copilot",
    "ChatGPT", "Gemini",
    "エージェント", "生成AI", "プロンプト",
    # フロント
    "React", "Next.js", "TypeScript", "Vue", "Svelte",
    "フロントエンド", "Web",
    # クラウド・インフラ
    "AWS", "GCP", "Azure",
    "Kubernetes", "Docker", "Terraform",
    # 言語
    "Rust", "Go", "Python", "Ruby", "Java", "Kotlin",
    # データ
    "データ基盤", "Snowflake", "BigQuery", "dbt", "Iceberg", "Databricks",
    # PdM・UX
    "PdM", "プロダクトマネジメント", "UX", "デザイン",
    # セキュリティ
    "セキュリティ", "脆弱性",
    # その他開発
    "DevOps", "SRE", "QA", "テスト",
]

STOPWORDS: set[str] = {"イベント", "勉強会", "LT会", "オンライン", "ハイブリッド"}
