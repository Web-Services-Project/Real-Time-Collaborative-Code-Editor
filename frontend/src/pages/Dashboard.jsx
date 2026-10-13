import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import * as api from '../lib/api.js';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(6);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshRooms();
  }, []);

  async function refreshRooms() {
    setLoadingRooms(true);
    try {
      const data = await api.listRooms();
      setRooms(data.rooms);
    } catch {
      // room list is a nice-to-have on this screen; a failed fetch shouldn't block the page
    } finally {
      setLoadingRooms(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const room = await api.createRoom(user.token, { name, maxMembers: Number(maxMembers) });
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.joinRoom(user.token, joinCode.trim());
      navigate(`/room/${joinCode.trim()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">CollabCode</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">{user.name}</span>
          <button onClick={logout} className="text-slate-400 hover:text-slate-200">
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 grid gap-8 md:grid-cols-2">
        <section className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-semibold mb-3">Create a room</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                required
                minLength={3}
                placeholder="Room name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Max members</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                  className="w-20 rounded-md bg-slate-900 border border-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-md bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
              >
                Create &amp; open
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-sm font-semibold mb-3">Join by room ID</h2>
            <form onSubmit={handleJoin} className="flex gap-2">
              <input
                required
                placeholder="paste a room id"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="flex-1 rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                disabled={busy}
                type="submit"
                className="rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sm font-medium px-4 transition-colors"
              >
                Join
              </button>
            </form>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3">Public rooms</h2>
          {loadingRooms ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-slate-500">No public rooms yet — create one.</p>
          ) : (
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li
                  key={room.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{room.name}</p>
                    <p className="text-xs text-slate-500">
                      {room.members.length}/{room.maxMembers} members
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await api.joinRoom(user.token, room.id);
                        navigate(`/room/${room.id}`);
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                    className="rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium px-3 py-1.5 transition-colors"
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
