# Simple Realtime Console - now with WebRTC

> **Note:** This is a fork of [swyx's simple realtime console](https://github.com/swyxio/simple-realtime-console)

> This project was originally created by [swyx](https://github.com/swyxio) as a WebSocket-based demo for OpenAI's Realtime API - a simplified version of the [official demo](https://github.com/openai/openai-realtime-console) but on ozempic 💉. It has since been migrated to use WebRTC for improved audio streaming capabilities.

The original project stripped out SCSS, added Tailwind, and achieved -1200 LOC while keeping all core functionality. You can [see the original diffs here](https://github.com/openai/openai-realtime-console/compare/main...swyxio:simple-realtime-console:main?expand=1).

![Clean Console UI](https://github.com/user-attachments/assets/695e0dae-0a14-4128-98b3-faf1b121e23c)

Key improvements from swyx's version:
- Suppressed less useful event spam into the console
- Made transcripts log nicely
- Added memory injection that starts with initial context
- Added mute button for better control

![Nice Logging](https://github.com/user-attachments/assets/5d259f29-dee7-4e10-98b8-850248450e21)

## New Features

- Migrated to WebRTC for improved audio streaming
- Secure backend for API key management
- Ephemeral token generation for enhanced security

## Setup

1. Clone this repository
2. Copy `.env.example` to `.env` and add your OpenAI API key

### Backend Setup

```bash
cd server
npm install
npm run dev
```

The server will start on http://localhost:3001

### Frontend Setup

```bash
npm install
npm run dev
```

The frontend will be available at http://localhost:3000

## Using the Console

The console now uses a secure backend to handle API keys. You no longer need to enter your API key in the frontend - just add it to your `.env` file.

To start a session:
1. Click **Connect** (this will request microphone access)
2. Start speaking! The console uses Voice Activity Detection (VAD)
3. You can interrupt the model at any time
4. Use the Mute button to control your microphone

### Memory System

There's one function enabled:
- `set_memory`: Ask the model to remember information, stored in a JSON blob on the left
- We've added some basic initial memory to get you started

## Architecture

- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Communication: WebRTC for real-time audio streaming
- Security: Backend-generated ephemeral tokens for API access

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT
