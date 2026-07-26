"""Ambiente de teste partilhado.

As variáveis são postas antes de qualquer import de `app.config` para que o
`Settings` valide sem exigir credenciais reais. Nenhum teste toca na rede.
"""

import os

os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GITHUB_TOKEN", "test-github-token")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("RAG_SERVICE_TOKEN", "test-internal-token")
