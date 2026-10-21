import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseClientMessage,
  type ControllerActionMessage,
  type ControllerSettingsMessage,
  type GameStateUpdate,
  type InputMessage,
} from '../shared/protocol';
export type MotionInput = InputMessage;
export function useHost(
  onInput: (input: MotionInput) => void,
  onAction?: (message: ControllerActionMessage) => void,
  onSettings?: (message: ControllerSettingsMessage) => void,
) {
  const [generation, setGeneration] = useState(0);
  const [code, setCode] = useState('');
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null);
  const receive = useRef(onInput);
  const receiveAction = useRef(onAction);
  const receiveSettings = useRef(onSettings);
  receive.current = onInput;
  receiveAction.current = onAction;
  receiveSettings.current = onSettings;
  useEffect(() => {
    let stopped = false,
      retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/relay`,
      );
      socket.current = ws;
      ws.onopen = () => {
        if (!stopped) {
          setOnline(true);
          setError('');
          ws.send(JSON.stringify({ type: 'host:create' }));
        }
      };
      ws.onmessage = ({ data }) => {
        if (stopped) return;
        try {
          const msg: unknown = JSON.parse(data);
          if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
          const serverMessage = msg as Record<string, unknown>;
          if (
            serverMessage.type === 'room:created' &&
            typeof serverMessage.code === 'string' &&
            /^[A-HJ-NP-Z2-9]{6}$/.test(serverMessage.code)
          )
            setCode(serverMessage.code);
          if (serverMessage.type === 'peer:status' && typeof serverMessage.connected === 'boolean')
            setConnected(serverMessage.connected);
          if (serverMessage.type === 'error' && typeof serverMessage.message === 'string')
            setError(serverMessage.message);
          const message = parseClientMessage(msg);
          if (message?.type === 'input') receive.current(message);
          if (message?.type === 'controller:action') receiveAction.current?.(message);
          if (message?.type === 'controller:settings') receiveSettings.current?.(message);
        } catch {
          setError('Réponse du serveur illisible.');
        }
      };
      ws.onclose = () => {
        if (!stopped) {
          setConnected(false);
          setOnline(false);
          setCode('');
          retry = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => {
        if (!stopped) setError('Connexion au serveur interrompue. Nouvelle tentative…');
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      if (socket.current) {
        const oldSocket = socket.current;
        oldSocket.onclose = null;
        oldSocket.onmessage = null;
        oldSocket.onerror = null;
        // StrictMode can clean up while the handshake is still pending.
        if (oldSocket.readyState === WebSocket.CONNECTING)
          oldSocket.onopen = () => oldSocket.close();
        else {
          oldSocket.onopen = null;
          oldSocket.close();
        }
      }
    };
  }, [generation]);
  const sendState = useCallback((state: GameStateUpdate) => {
    const message = parseClientMessage({ ...state, type: 'game:state' });
    if (message?.type !== 'game:state') {
      setError('État de partie invalide.');
      return;
    }
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  }, []);
  const reset = () => {
    setConnected(false);
    setCode('');
    setGeneration((value) => value + 1);
  };
  return { code, connected, online, error, sendState, reset };
}
