# CollabCode — Project Brief

## What
CollabCode is a web-based platform that lets multiple users edit the same
source code file at the same time. Changes made by one collaborator appear
instantly for everyone else in the session, each person's cursor/presence is
visible to the others, and the file is saved automatically so no work is
lost.

## Who
- **Students/developers** who want to pair-program or mob-program remotely
- **Room owners** who create a coding session and control who can join
- **Guest collaborators** who join an existing session via an invite link (room id)

## Nouns (the things/services)
- **User** — an account with a login (owned by Auth service)
- **Room** — a coding session with members and a max-capacity (owned by Rooms service — the central/richest resource)
- **Document** — the code file content belonging to a room (owned by Documents service)
- **Edit** — a single change broadcast to everyone currently in a room (Collaboration/Presence service, WebSocket)
- **Participant** — a user's live presence in a room: online/offline, cursor position (Collaboration/Presence service)
- **Execution Result** *(future/stretch)* — the output of running submitted code via an external sandbox partner

## Verbs (the actions/contracts)
- `signUp` / `login` / `verifyToken`
- `createRoom` / `getRoom` / `listRooms` / `updateRoom` / `deleteRoom`
- `joinRoom` / `leaveRoom` — the central cross-service operation (validates the caller via Auth, provisions the room's Document via Documents)
- `createDocument` / `getDocument` / `saveDocument`
- `broadcastEdit` / `syncCursor` / `trackPresence`
- `runCode` *(SOAP partner, design-only — see `integration.md`)*

These nouns map 1:1 onto the five services in `design.md`, and `joinRoom` is
the operation specified in full detail there, since it is the one call that
touches three services (Auth → Rooms → Documents) in a single request.
