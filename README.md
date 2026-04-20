# MeetUp

Open source, self-hostable video calling. No accounts, no subscriptions, pure peer-to-peer via WebRTC.

## Features

- Unlimited participants with simple 6-digit meeting codes
- Host controls — mute, lock mic/camera, kick, mute all
- Raise hand, reactions, chat, shared whiteboard
- Screen sharing, speaker detection, meeting timer
- WhatsApp & Email invite sharing
- Mobile friendly with sound notifications

## Stack

Node.js + Express + Socket.io + WebRTC. No database, no accounts, no tracking.

## Run locally

```bash
git clone https://github.com/siddhanrao/meetup
cd meetup
npm install
node server.js
```

Open http://localhost:3000

## Share over internet

```bash
ngrok http 3000
```

Share the ngrok URL — anyone can join with the meeting code.

## How it works

- Host creates a room → gets a code like `847-293`
- Share the code via WhatsApp or Email
- Participants enter the code and join
- Video and audio go peer-to-peer via WebRTC — server only handles signaling
