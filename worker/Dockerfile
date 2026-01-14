FROM node:20-slim

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

# Install Python for SudachiPy tokenizer subprocess.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/worker

# Install Python dependencies (SudachiPy + sudachidict_core).
COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY src ./src

# Start the worker
CMD ["npm", "start"]
