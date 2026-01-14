# Kaizen Server

Express server that sends messages to Gemini via Comet's Opik for observability.

Uses the official [`opik-gemini`](https://www.comet.com/docs/opik/integrations/gemini-typescript) package with `trackGemini` for automatic tracing.

## Environment Variables

Create a `.env` file with:

```
GEMINI_API_KEY=your_gemini_api_key_here
OPIK_API_KEY=your_opik_api_key_here
OPIK_WORKSPACE=your_workspace_name
PORT=3000
```

## Development

```bash
npm install
npm run dev
```

## Docker

```bash
# Build
docker build -t kaizen-server .

# Run
docker run -p 3000:3000 \
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
