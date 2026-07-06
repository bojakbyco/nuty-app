FROM oven/bun:1.3 AS base

# Install ffmpeg + Python (Basic Pitch + music21 for MIDI→MusicXML)
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-dev \
    python3-setuptools \
    python3-wheel \
    && pip3 install --break-system-packages --no-cache-dir \
        numpy==1.26.4 \
    && pip3 install --break-system-packages --no-cache-dir \
        basic-pitch \
        music21 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY . .

RUN mkdir -p /app/data

ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
