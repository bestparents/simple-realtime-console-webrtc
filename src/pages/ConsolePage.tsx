import { useRef, useState } from 'react';
import { useRealtimeWebRTC, RealtimeEvent } from '../utils/useRealtimeWebRTC';
import { useUIScroller } from '../utils/useUIScroller';
import { useWebRTCWaveRenderer } from '../utils/useWebRTCWaveRenderer';

const instructions = `System settings:
Tool use: enabled.

Instructions:
- You are an AI agent responsible for helping test realtime voice capabilities
- Please make sure to respond with a helpful voice via audio
- Speak fast, 2x speed.
- Be kind, helpful, and curteous
- It is okay to ask the user short followup or clarification questions
- Use tools and functions you have available liberally, it is part of the training apparatus
- You have access to the set_memory tool with some defined schemas you can add or delete to. Try not to add unnecessary keys.
- Be open to exploration and conversation

Personality:
- Be snarky and sarcastic
- Try speaking quickly as if excited
`;

export function ConsolePage() {
  const startTimeRef = useRef<string>(new Date().toISOString());
  const audioRef = useRef<HTMLAudioElement>(null);

  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({
    userName: 'swyx',
    todaysDate: new Date().toISOString().split('T')[0],
  });

  const { eventsScrollRef } = useUIScroller(realtimeEvents);
  const { localCanvasRef, remoteCanvasRef, connectLocalStream, connectRemoteStream } = useWebRTCWaveRenderer();

  const { isConnected, isMuted, setIsMuted, connect: connectConversation, disconnect: disconnectConversation, sendEvent } =
    useRealtimeWebRTC(
      startTimeRef,
      setRealtimeEvents,
      audioRef,
      instructions + ' Memory: ' + JSON.stringify(memoryKv, null, 2),
      [
        {
          schema: {
            name: 'set_memory',
            description:
              'Saves important data about the user into memory. If keys are close, prefer overwriting keys rather than creating new keys.',
            parameters: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description:
                    'The key of the memory value. Always use lowercase and underscores, no other characters.',
                },
                value: {
                  type: 'string',
                  description: 'Value can be anything represented as a string',
                },
              },
              required: ['key', 'value'],
            },
          },
          async fn({ key, value }: { key: string; value: string }) {
            setMemoryKv((prev) => ({ ...prev, [key]: value }));
          },
        },
      ],
      connectLocalStream,
      connectRemoteStream
    );

  const formatTime = (timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-none justify-between items-center p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <button
            onClick={isConnected ? disconnectConversation : connectConversation}
            className={`flex items-center gap-2 font-['Roboto_Mono'] text-xs font-normal border-none rounded-[1000px] px-6 min-h-[42px] transition-all duration-100 outline-none disabled:text-[#999] enabled:cursor-pointer px-4 py-2 rounded-md ${
              isConnected
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
          {isConnected && (
            <span className="flex space-x-2">
              <button
                className="flex items-center gap-2 font-['Roboto_Mono'] text-xs font-normal border-none rounded-[1000px] px-6 min-h-[42px] transition-all duration-100 outline-none disabled:text-[#999] enabled:cursor-pointer bg-[#101010] text-[#ececf1] hover:enabled:bg-[#404040]"
                onClick={() => sendEvent({
                  type: "response.create",
                  response: {
                    modalities: ["text", "audio"]
                  }
                })}
              >
                Force Reply
              </button>
              <button
                className={`flex items-center gap-2 font-['Roboto_Mono'] text-xs font-normal border-none rounded-[1000px] px-6 min-h-[42px] transition-all duration-100 outline-none disabled:text-[#999] enabled:cursor-pointer ${
                  isMuted
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : 'bg-[#101010] text-[#ececf1] hover:enabled:bg-[#404040]'
                }`}
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? '🔇 Unmute' : '🔊 Mute'}
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="overflow-auto flex-1">
        <div className="flex flex-col h-full md:flex-row">
          <div className="overflow-auto flex-1 border-r border-gray-200">
            <div className="p-4">
              <audio ref={audioRef} autoPlay className="hidden" />
              <div className="mb-4">
                <canvas
                  ref={localCanvasRef}
                  className="w-full h-12 bg-gray-50 rounded"
                />
              </div>
              <div className="mb-4">
                <canvas
                  ref={remoteCanvasRef}
                  className="w-full h-12 bg-gray-50 rounded"
                />
              </div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700">Memory</h3>
                <pre className="mt-2 text-xs text-wrap">
                  {JSON.stringify(memoryKv, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  Filtered Events ({realtimeEvents.length})
                </h3>
                <div
                  ref={eventsScrollRef}
                  className="overflow-auto mt-2 space-y-2 h-full"
                >
                  {realtimeEvents.map((event, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded ${
                        event.source === 'server' ? 'bg-green-50' : 'bg-blue-50'
                      }`}
                    >
                      <details className="flex justify-between items-center">
                        <summary className="font-mono">
                          {formatTime(event.time) + ' '}
                          <span className="text-xs text-gray-600">
                            {event.event.type}
                            {event.event.response?.output?.[0]?.content?.[0]?.text && (
                              <p>"{event.event.response.output[0].content[0].text}"</p>
                            )}
                            {event.event.type === 'response.function_call_arguments.done' && (
                              <span>
                                {event.event.name}({JSON.stringify(event.event.arguments)})
                              </span>
                            )}
                          </span>
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap">
                          {JSON.stringify(event.event, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
