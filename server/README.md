# Kaizen Server

Express server that sends messages to Gemini via Comet's Opik for observability.

Uses the official [`opik-gemini`](https://www.comet.com/docs/opik/integrations/gemini-typescript) package with `trackGemini` for automatic tracing.

## Environment Variables

Create a `.env` file with:

```
PORT=3000
DATABASE_URL="postgresql://kaizen:kaizen_password@localhost:5432/kaizen?schema=public"
GEMINI_API_KEY=your_gemini_api_key_here
OPIK_API_KEY=your_opik_api_key_here
OPIK_WORKSPACE=your_workspace_name
```

## Development

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Install dependencies and setup database

```bash
pnpm install
pnpm db:push    # Push schema to database (development)
# OR
pnpm db:migrate # Create and apply migrations (production)
```

### 3. Run the server

```bash
pnpm dev
```

### Database Commands

```bash
pnpm db:generate  # Generate Prisma client
pnpm db:migrate   # Create and apply migrations
pnpm db:push      # Push schema directly (dev only)
pnpm db:studio    # Open Prisma Studio GUI
```

## Docker

```bash
# Build
docker build -t kaizen-server .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=your_database_url \
  -e GEMINI_API_KEY=your_key \
  -e OPIK_API_KEY=your_key \
  -e OPIK_WORKSPACE=your_workspace \
  kaizen-server
```

## API

### POST /message

Send a message to Gemini.

```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Gemini!"}'
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:3000/health
```

---

## Activities API

Activities are split into specific attention types, each with their own endpoints and fields.

### Text Attention Activities

Text-based attention activities (reading articles, documents, etc.)

**Endpoints:**
- `GET /api/activities/text` - List all text activities
- `GET /api/activities/text/:id` - Get a single text activity
- `POST /api/activities/text` - Create a new text activity
- `DELETE /api/activities/text/:id` - Delete a text activity

**Fields:**
- `url` (string, optional) - URL if reading from a webpage
- `title` (string, required) - Title of the text
- `content` (string, required) - The actual text content
- `wordCount` (number, optional) - Number of words
- `readingTime` (number, optional) - Estimated reading time in minutes

**Example:**
```bash
curl -X POST http://localhost:3000/api/activities/text \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/article",
    "title": "Introduction to Neural Networks",
    "content": "Neural networks are...",
    "wordCount": 1500,
    "readingTime": 7
  }'
```

### Image Attention Activities

Image-based attention activities (viewing images, photos, infographics)

**Endpoints:**
- `GET /api/activities/image` - List all image activities
- `GET /api/activities/image/:id` - Get a single image activity
- `POST /api/activities/image` - Create a new image activity
- `DELETE /api/activities/image/:id` - Delete an image activity

**Fields:**
- `url` (string, required) - URL to the image
- `title` (string, required) - Title/description of the image
- `description` (string, optional) - Additional description
- `width` (number, optional) - Image width in pixels
- `height` (number, optional) - Image height in pixels
- `fileSize` (number, optional) - File size in bytes
- `mimeType` (string, optional) - MIME type (e.g., "image/jpeg")

**Example:**
```bash
curl -X POST http://localhost:3000/api/activities/image \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/infographic.jpg",
    "title": "Machine Learning Workflow",
    "description": "Detailed infographic showing ML pipeline",
    "width": 1920,
    "height": 1080,
    "mimeType": "image/jpeg"
  }'
```

### YouTube Attention Activities

YouTube video watching activities

**Endpoints:**
- `GET /api/activities/youtube` - List all YouTube activities
- `GET /api/activities/youtube/:id` - Get a single YouTube activity
- `POST /api/activities/youtube` - Create a new YouTube activity
- `DELETE /api/activities/youtube/:id` - Delete a YouTube activity

**Fields:**
- `id` (string, required) - YouTube video ID
- `title` (string, required) - Video title
- `channelName` (string, optional) - Channel name
- `duration` (number, optional) - Video duration in seconds
- `thumbnailUrl` (string, optional) - Thumbnail URL

**Example:**
```bash
curl -X POST http://localhost:3000/api/activities/youtube \
  -H "Content-Type: application/json" \
  -d '{
    "id": "dQw4w9WgXcQ",
    "title": "Deep Learning Fundamentals",
    "channelName": "AI Explained",
    "duration": 3600,
    "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
  }'
```

### Audio Attention Activities

Audio listening activities (podcasts, music, audiobooks)

**Endpoints:**
- `GET /api/activities/audio` - List all audio activities
- `GET /api/activities/audio/:id` - Get a single audio activity
- `POST /api/activities/audio` - Create a new audio activity
- `DELETE /api/activities/audio/:id` - Delete an audio activity

**Fields:**
- `url` (string, optional) - URL to the audio source
- `title` (string, required) - Title of the audio
- `artist` (string, optional) - Artist/creator name
- `duration` (number, optional) - Duration in seconds
- `fileSize` (number, optional) - File size in bytes
- `mimeType` (string, optional) - MIME type (e.g., "audio/mpeg")

**Example:**
```bash
curl -X POST http://localhost:3000/api/activities/audio \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/podcast.mp3",
    "title": "The AI Podcast Episode 42",
    "artist": "Tech Talk Radio",
    "duration": 3600,
    "mimeType": "audio/mpeg"
  }'
```
