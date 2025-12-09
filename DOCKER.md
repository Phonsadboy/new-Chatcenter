# ChatCenter-AI Docker Image

[![Docker Image](https://img.shields.io/docker/v/xianta456/chatcenter-ai?sort=semver)](https://hub.docker.com/r/xianta456/chatcenter-ai)
[![Docker Pulls](https://img.shields.io/docker/pulls/xianta456/chatcenter-ai)](https://hub.docker.com/r/xianta456/chatcenter-ai)

AI-powered chat center supporting LINE, Facebook Messenger, and multiple AI models (OpenAI, Google Gemini, Anthropic Claude).

## 🚀 Quick Start

### Using Docker Run

```bash
docker run -d \
  --name chatcenter-ai \
  -p 3000:3000 \
  -e MONGODB_URI=your_mongodb_uri \
  -e OPENAI_API_KEY=your_openai_key \
  xianta456/chatcenter-ai:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  chatcenter-ai:
    image: xianta456/chatcenter-ai:latest
    container_name: chatcenter-ai
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MONGODB_URI=${MONGODB_URI}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET}
      - LINE_CHANNEL_ACCESS_TOKEN=${LINE_CHANNEL_ACCESS_TOKEN}
      - SESSION_SECRET=${SESSION_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

Then run:

```bash
docker-compose up -d
```

## 📋 Environment Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Secret for session encryption |

### Optional AI API Keys

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (GPT-4, GPT-5) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude) |

### Optional Platform Integration

| Variable | Description |
|----------|-------------|
| `LINE_CHANNEL_SECRET` | LINE Bot channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot access token |

## 🔧 Configuration

### Using .env File

Create a `.env` file with your configuration:

```bash
MONGODB_URI=mongodb://localhost:27017/chatcenter
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=your-secret-key
```

Then use it with Docker:

```bash
docker run -d \
  --name chatcenter-ai \
  -p 3000:3000 \
  --env-file .env \
  xianta456/chatcenter-ai:latest
```

## 📊 Health Check

The container includes a built-in health check available at:

```
http://localhost:3000/health
```

## 🔄 Updating

Pull the latest image:

```bash
docker pull xianta456/chatcenter-ai:latest
docker stop chatcenter-ai
docker rm chatcenter-ai
docker run -d --name chatcenter-ai -p 3000:3000 --env-file .env xianta456/chatcenter-ai:latest
```

Or with Docker Compose:

```bash
docker-compose pull
docker-compose up -d
```

## 📦 Available Tags

- `latest` - Latest stable release
- `1.0.1` - Specific version
- `1.0.0` - Previous version

## 🛠️ Building from Source

```bash
git clone https://github.com/Phonsadboy/ChatCenterAI.git
cd ChatCenterAI
docker build -t chatcenter-ai .
```

## 🐛 Troubleshooting

### Container won't start

Check logs:
```bash
docker logs chatcenter-ai
```

### Database connection issues

Ensure MongoDB URI is correct and accessible from the container.

### Port already in use

Change the port mapping:
```bash
docker run -d -p 8080:3000 xianta456/chatcenter-ai:latest
```

## 📚 Documentation

For more information, visit:
- [GitHub Repository](https://github.com/Phonsadboy/ChatCenterAI)
- [Docker Hub](https://hub.docker.com/r/xianta456/chatcenter-ai)

## 📝 License

See the [LICENSE](https://github.com/Phonsadboy/ChatCenterAI/blob/main/LICENSE) file for details.

## 💬 Support

For issues and questions:
- GitHub Issues: https://github.com/Phonsadboy/ChatCenterAI/issues
- LINE: https://lin.ee/D8JnhKa
