#!/bin/sh
set -e

echo "==> Firasa Backend Entrypoint"
echo "    Auth mode: ${FIRASA_AUTH_MODE:-local}"
echo "    LLM provider: ${FIRASA_LLM_PROVIDER:-ollama}"
if [ -n "${FIRASA_GROQ_API_KEY:-}" ]; then
    echo "    Groq API key: set"
fi
if [ -n "${FIRASA_COHERE_API_KEY:-}" ]; then
    echo "    Cohere embeddings: set"
fi

# Run database initialisation (creates tables, runs migrations)
echo "==> Running database initialisation..."
python -c "from app.store import _init_db; _init_db(); print('    Database ready.')"

# Start the ASGI server
echo "==> Starting Uvicorn on 0.0.0.0:8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
