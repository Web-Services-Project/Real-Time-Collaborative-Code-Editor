import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import * as api from '../lib/api.js';
import { COLLAB_URL } from '../lib/api.js';
import PresenceBar from '../components/PresenceBar.jsx';

export default function Room() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [content, setContent] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('connecting'); // connecting | synced | offline
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  const skipNextEmit = useRef(false); // true while we're applying an incoming remote edit

  // Join (idempotent — safe even if we're already a member), then load the
  // room + its current document, then open the realtime socket.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const joined = await api.joinRoom(user.token, id);
        const doc = await api.fetchDocument(id);
        if (cancelled) return;
        setRoom(joined);
        setContent(doc.content || '');
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    const socket = io(COLLAB_URL, {
      query: { roomId: id, userId: user.id, userName: user.name },
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('synced'));
    socket.on('disconnect', () => setStatus('offline'));

    socket.on('presence', (data) => setMembers(data.members));

    socket.on('edit', (data) => {
      skipNextEmit.current = true;
      setContent(data.content);
    });

    return () => {
      cancelled = true;
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = useCallback((e) => {
    const next = e.target.value;
    setContent(next);
    if (skipNextEmit.current) {
      // this change came from a remote 'edit' event we just applied — don't echo it back
      skipNextEmit.current = false;
      return;
    }
    socketRef.current?.emit('edit', { content: next });
  }, []);

  async function handleLeave() {
    try {
      await api.leaveRoom(user.token, id);
    } catch {
      // leaving best-effort; navigate away regardless
    }
    navigate('/dashboard');
  }

  function copyInviteLink() {
    navigator.clipboard?.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-3">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="text-indigo-400 hover:underline text-sm">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{room?.name || 'Loading…'}</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === 'synced' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-400'
              }`}
            />
            {status === 'synced' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <PresenceBar members={members} />
          <button
            onClick={copyInviteLink}
            className="text-xs rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-1.5 font-medium transition-colors"
          >
            {copied ? 'Copied!' : 'Copy invite'}
          </button>
          <button
            onClick={handleLeave}
            className="text-xs rounded-md bg-slate-800 hover:bg-red-500/20 hover:text-red-300 px-3 py-1.5 font-medium transition-colors"
          >
            Leave
          </button>
        </div>
      </header>

      <main className="flex-1 p-4">
        <textarea
          spellCheck={false}
          value={content}
          onChange={handleChange}
          placeholder="// start typing — everyone in the room sees this live"
          className="w-full h-full min-h-[70vh] resize-none rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </main>
    </div>
  );
}
