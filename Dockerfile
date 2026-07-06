FROM oven/bun:1.3 AS base

# Install ffmpeg + Python (Basic Pitch + music21 for MIDI→MusicXML)
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    && pip3 install --break-system-packages \
        basic-pitch \
        music21 \
        setuptools \
        wheel \
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
