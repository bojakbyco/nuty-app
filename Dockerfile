FROM python:3.11-slim

# Install ffmpeg + system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    g++ \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install Python ML deps
RUN pip install --no-cache-dir numpy basic-pitch music21

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY . .

RUN mkdir -p /app/data

ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
