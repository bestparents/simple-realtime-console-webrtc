import { useEffect, useRef, useState, useCallback } from 'react';
import { ToolHandler } from 'openai-realtime-api';

export interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: {
    event_id?: string;
    type?: string;
    [key: string]: any;
  };
}

export function useRealtimeWebRTC(
  startTimeRef: React.RefObject<string>,
  setRealtimeEvents: React.Dispatch<React.SetStateAction<RealtimeEvent[]>>,
  audioRef: React.RefObject<HTMLAudioElement>,
  initialInstructions: string,
  tools?: Array<{ 
    schema: any; 
    fn: ToolHandler;
  }>
) {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const connect = useCallback(async () => {
    if (peerConnectionRef.current) return;

    try {
      // Get ephemeral token from backend
      const response = await fetch('http://localhost:3001/api/session', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to get session token');
      }

      const data = await response.json();
      const ephemeralKey = data.client_secret.value;

      // Create peer connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Set up audio element for remote stream
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
        }
      };

      // Create data channel for events
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      // Handle incoming messages
      dc.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        setRealtimeEvents(prev => [...prev, {
          time: new Date().toISOString(),
          source: 'server',
          event
        }]);
      });

      // Add local audio track
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
      } catch (err) {
        console.error("Error accessing microphone:", err);
      }

      // Create and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI and get answer
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp"
        },
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to establish WebRTC connection');
      }

      const answer = {
        type: "answer" as RTCSdpType,
        sdp: await sdpResponse.text(),
      };

      await pc.setRemoteDescription(answer);
      setIsConnected(true);

      // Send initial configuration
      if (dc.readyState === "open") {
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: initialInstructions,
            tools: tools?.map(t => ({
              type: "function",
              ...t.schema
            }))
          }
        }));
      }
    } catch (error) {
      console.error("Connection error:", error);
      disconnect();
    }
  }, [initialInstructions, tools]);

  const disconnect = useCallback(async () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    peerConnectionRef.current = null;
    dataChannelRef.current = null;
    setIsConnected(false);
  }, []);

  const sendEvent = useCallback((event: any) => {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify(event));
      setRealtimeEvents(prev => [...prev, {
        time: new Date().toISOString(),
        source: 'client',
        event
      }]);
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isMuted,
    setIsMuted,
    connect,
    disconnect,
    sendEvent
  };
}
