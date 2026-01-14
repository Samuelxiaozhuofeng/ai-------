FROM node:20-slim

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

# Install Python for SudachiPy tokenizer subprocess.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/worker

# Create an isolated venv to avoid Debian's externally-managed Python (PEP 668).
RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies (SudachiPy + sudachidict_core).
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -U pip setuptools wheel \
  && pip install --no-cache-dir -r requirements.txt

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY src ./src

# Start the worker
CMD ["npm", "start"]
