# PitchCraft agent — needs Node (MongoDB MCP server via npx) + Python (ADK/FastAPI)
FROM node:20-bookworm-slim

# Python runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pre-install the MongoDB MCP server so the agent starts instantly (no runtime fetch)
RUN npm install -g mongodb-mcp-server@1.12.0

WORKDIR /app

# Python deps in a venv (Debian PEP-668 safe)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run injects PORT (8080). Long timeout: agent runs ~7 Gemini calls.
ENV PORT=8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 120"]
