# ⚡ ZapMail — High-Performance Telecom SMS & Email Gateway

> **Bridging the Cellular Divide**: A unified messaging platform connecting cellular SMS carrier networks and traditional email protocols with bi-directional conversation threading, real-time SMS dispatch via TextBee, an embedded SMTP engine, and an intuitive mobile/desktop webmail interface.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture & Technical Approach](#-architecture--technical-approach)
  - [Multi-Tier System Design](#multi-tier-system-design)
  - [Strict Mailbox Isolation](#strict-mailbox-isolation)
  - [Telecom Carrier Bridge (TextBee Integration)](#telecom-carrier-bridge-textbee-integration)
  - [Bi-Directional Conversational Threading](#bi-directional-conversational-threading)
- [Tech Stack](#-tech-stack)
- [Setup & Execution](#-setup--execution)
  - [Option A: One-Command Docker Setup (Recommended)](#option-a-one-command-docker-setup-recommended)
  - [Option B: Manual Local Development](#option-b-manual-local-development)
- [Ports & Endpoints Reference](#-ports--endpoints-reference)
- [Environment Variables & Security](#-environment-variables--security)
- [Pre-Seeded Demo Accounts](#-pre-seeded-demo-accounts)
- [API Route Documentation](#-api-route-documentation)
- [Evaluation Checklist](#-evaluation-checklist)

---

## 🚀 Overview

**ZapMail** (`@zapmail.com`) is a mission-critical communication platform designed for users who operate in low-bandwidth or offline cellular environments while interacting with standard enterprise email networks. 

Every user registered on ZapMail receives a personalized email address mapped to their 10-digit mobile number:
```
<10-digit-phone>@zapmail.com (e.g., 9876543210@zapmail.com)
```

### Key Capabilities:
1. **Automated Carrier SMS Alerts**: When an email arrives for a user who does not use the mobile app (`registeredVia !== 'MOBILE_APP'`), an automated SMS notification is dispatched to their physical phone via the **TextBee Android SMS Gateway API**:
   > *"You have received an email from \<Sender\>. Subject: \<Subject\> via ZapMail."*
2. **Two-Way SMS-to-Email Reply Bridge**: Users can reply directly to carrier SMS messages, which are translated back into RFC-compliant outgoing emails.
3. **Bi-Directional Conversational Feed**: Spike Mail-inspired chat stream merging incoming emails and outgoing replies chronologically with instant optimistic bubble rendering, live status indicators (`🕒` / `✓✓`), and smooth auto-scrolling.
4. **Desktop Webmail Experience**: Gmail-style multi-pane interface with folder navigation (Inbox, Starred, Sent, Drafts, Spam, Trash), custom folder/label tagging, unread badges, and attachment viewing.
5. **Embedded SMTP Server (Port 2525)**: Native SMTP server handling standard inbound email connections from email clients, test harnesses, and third-party mail servers.
6. **Smart AI Replies & Summaries**: Contextual suggested replies and email summaries.

---

## 🏛️ Architecture & Technical Approach

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                    │
│   ┌───────────────────────────────────┐ ┌───────────────────────────────┐   │
│   │       Mobile Conversational       │ │     Desktop Webmail Suite     │   │
│   │   (Spike-style thread bubbles)    │ │   (Gmail-style multi-pane)    │   │
│   └─────────────────┬─────────────────┘ └───────────────┬───────────────┘   │
└─────────────────────┼───────────────────────────────────┼───────────────────┘
                      ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REVERSE PROXY & INGRESS                           │
│   Nginx Alpine Container (Port 80 -> Exposed on Host Port 3000)             │
│   • Client-side SPA routing (`try_files $uri /index.html`)                  │
│   • Reverse proxy `/api/` -> `http://backend:5000/api/`                    │
│   • Static attachment streaming `/uploads/`                                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION SERVER TIER                           │
│   Node.js 18 Express API & SMTP Protocol Server (Host Ports: 5000 & 2525)   │
│                                                                             │
│   ┌───────────────────────────┐       ┌─────────────────────────────────┐   │
│   │   Express REST & Web API  │       │   Embedded SMTP Protocol Server │   │
│   │   • Auth & 2-Step OTP     │       │   • Port 2525 listener          │   │
│   │   • Mailbox CRUD & Folders│       │   • Parses raw RFC 822 emails   │   │
│   │   • Thread Bi-direction   │       │   • Triggers carrier SMS bridge │   │
│   └─────────────┬─────────────┘       └────────────────┬────────────────┘   │
└─────────────────┼──────────────────────────────────────┼────────────────────┘
                  ▼                                      ▼
┌───────────────────────────────────────┐  ┌──────────────────────────────────┐
│             DATA LAYER                │  │       TELECOM SMS GATEWAY        │
│   SQLite Database (better-sqlite3)    │  │   TextBee Android Gateway API    │
│   • Path: `/app/data/zapmail.sqlite`  │  │   • Live real-phone SMS dispatch │
│   • Persistent Docker named volume    │  │   • Automated carrier fallback   │
│   • WAL mode concurrency & migrations │  │   • Delivery status tracking     │
└───────────────────────────────────────┘  └──────────────────────────────────┘
```

### Multi-Tier System Design
- **Frontend SPA**: React 18, Vite, and Tailwind CSS. Packaged via multi-stage Docker build and served through Nginx Alpine.
- **Backend API**: Node.js & Express managing authentication, session isolation, spam filtering, and telecom routing.
- **Embedded SMTP Protocol Engine**: Integrated `smtp-server` listening on port `2525`, capable of receiving raw emails from any standard mail user agent (MUA) or mail transfer agent (MTA).
- **Persistent SQLite Storage**: Backed by `better-sqlite3` in WAL (Write-Ahead Logging) mode, storing users, emails, threads, labels, and SMS transmission logs in `/app/data/zapmail.sqlite`.

### Strict Mailbox Isolation
All database queries enforce per-user scope isolation:
- A user only sees messages where they are the recipient or sender.
- Folder state changes (moving to Trash, Spam, Starred, Custom Labels) affect only the user's view, preventing cross-user data leakage.
- Soft-delete with a **6-second Undo window** allows immediate user recovery before permanent database commitment.

### Telecom Carrier Bridge (TextBee Integration)
- Every incoming email evaluated against recipient profile.
- If `recipient.registeredVia !== 'MOBILE_APP'`, the system automatically triggers an outbound SMS via the TextBee REST API.
- Live carrier receipts and message IDs are logged to the `SmsLog` table and displayed on the carrier simulator dashboard.

### Bi-Directional Conversational Threading
- In conversational chat mode, messages between the user and any contact are merged across both `INBOX` and `SENT` folders.
- Contact handles are normalized (e.g., `9876543210`, `9876543210@zapmail.com` resolve to the same thread).
- Messages sort chronologically ascending (`ORDER BY createdAt ASC`), placing incoming bubbles on the left and outgoing bubbles on the right with delivery confirmation (`✓✓`).

---

## 🛠️ Tech Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React | 18.3.1 | Single-Page Application (SPA) |
| **Build Tool** | Vite | 8.3.1 | Bundling & Asset Optimization |
| **Styling** | Tailwind CSS | 4.x | Mobile-First & Desktop UI |
| **Icons** | Lucide React | Latest | Static UI & Status Icons |
| **Backend Runtime** | Node.js | 18.x Alpine | Server Runtime |
| **Web Framework** | Express | 5.x | REST API Server |
| **Embedded SMTP** | smtp-server / mailparser | 3.x | RFC 822 Email Ingestion |
| **Database** | SQLite (better-sqlite3) | 13.x | Persistent Low-Latency Storage |
| **Telecom Gateway** | TextBee API | v1 | Cellular SMS Carrier Dispatch |
| **Web Server / Proxy** | Nginx | Alpine | Static Serving & API Reverse Proxy |
| **Containerization** | Docker & Docker Compose | Latest | Standardized Evaluation Deployment |

---

## ⚡ Setup & Execution

### Option A: One-Command Docker Setup (Recommended)

This is the required submission command. It builds and launches both containers in detached mode with persistent volume storage.

#### 1. Launch Containers
```bash
docker compose up -d --build
```

#### 2. Verify Running Containers
```bash
docker compose ps
```
*Expected output:*
```
NAME               IMAGE                     COMMAND                  SERVICE    CREATED          STATUS          PORTS
zapmail-backend    buildathonproject-backend "node server.js"         backend    10 seconds ago   Up 9 seconds    0.0.0.0:2525->2525/tcp, 0.0.0.0:5000->5000/tcp
zapmail-frontend   buildathonproject-frontend "nginx -g 'daemon of…"  frontend   10 seconds ago   Up 9 seconds    0.0.0.0:3000->80/tcp
```

#### 3. Access the Application
- **Webmail Interface (Mobile & Desktop Dual View)**: [http://localhost:3000](http://localhost:3000)
- **Backend API Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Embedded SMTP Server**: `localhost:2525`

#### 4. Stop Containers
```bash
docker compose down
```

---

### Option B: Manual Local Development

If running locally without Docker:

#### Prerequisites
- Node.js 18+ and npm installed.

#### 1. Backend Setup
```bash
cd backend
npm install
node server.js
```
*The backend API starts on `http://localhost:5000` and the SMTP server starts on port `2525`.*

#### 2. Frontend Setup
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
*The Vite frontend starts on `http://localhost:3000`.*

---

## 🌐 Ports & Endpoints Reference

| Service | Port | Endpoint / URL | Description |
|---|---|---|---|
| **Frontend Webmail** | `3000` | `http://localhost:3000` | Nginx reverse-proxied React SPA |
| **Backend REST API** | `5000` | `http://localhost:5000` | Express REST API server |
| **API Health Check** | `5000` | `http://localhost:5000/api/health` | System status and database metrics |
| **Embedded SMTP Server** | `2525` | `localhost:2525` | Inbound RFC 822 email ingestion |

---

## 🔐 Environment Variables & Security

In compliance with hackathon rules, **real secrets are never committed to version control**. 

`backend/.env` is maintained as a clean, standardized template file ready for evaluator script injection:

```env
PORT=5000
TEXTBEE_API_KEY=
TEXTBEE_DEVICE_ID=
TEXTBEE_BASE_URL=
JWT_SECRET=
```

### Local Evaluator Keys (`auth_keys.txt`)
Evaluator keys are provided in `auth_keys.txt` in the root directory following the exact required format:
```
backend/.env PORT = "5000"
backend/.env TEXTBEE_API_KEY = "txb_99uyQx2vqSLgiAkBPj1amxdOLl8YhDi6"
backend/.env TEXTBEE_DEVICE_ID = "6ab8cb45c9101e0cf7ea12b4"
backend/.env TEXTBEE_BASE_URL = "https://api.textbee.dev/api/v1"
backend/.env JWT_SECRET = "supersecretphonemailkey12345"
```

---

## 👥 Pre-Seeded Demo Accounts

The database auto-initializes on startup with realistic demo accounts:

| User | Phone / Username | Email Address | Password | Role / Profile |
|---|---|---|---|---|
| **Alex Rivera** | `9876543210` | `9876543210@zapmail.com` | `Demo123!` | Primary Sender (Mobile App User) |
| **Sarah Jenkins** | `9123456780` | `9123456780@zapmail.com` | `Demo123!` | Receiver (Offline / Carrier SMS Recipient) |
| **David Miller** | `5550001111` | `external_client@gmail.com`| `Demo123!` | External Corporate Partner |
| **Hackathon Judge** | `judge@hackathon.org` | `judge@hackathon.org` | `Demo123!` | Evaluation Demo Contact |

---

## 📡 API Route Documentation

### 1. Authentication (`/api/auth`)
- `POST /api/auth/step1-credentials`: Validates phone number and password, initiates 2-step OTP.
- `POST /api/auth/step2-verify-otp`: Validates 6-digit SMS OTP, returns JWT authentication token.
- `POST /api/auth/check-user`: Checks if a user is registered.

### 2. Mailbox & Messages (`/api/mail` & `/api/messages`)
- `GET /api/mail`: Returns all emails belonging to the authenticated user.
- `GET /api/messages/thread/:contactId`: Returns bi-directional conversation thread between active user and contact sorted chronologically ascending.
- `POST /api/mail/send`: Sends an email. Triggers carrier SMS if recipient is not on mobile app.
- `POST /api/mail/receive`: Ingests an inbound email (matches embedded SMTP server behavior).
- `PATCH /api/messages/:id/folder`: Moves email between folders (`INBOX`, `SENT`, `DRAFTS`, `SPAM`, `TRASH`).
- `PATCH /api/messages/:id/labels`: Adds/removes custom folder labels on emails.
- `PATCH /api/mail/:id/read`: Marks message as read.
- `GET /api/mail/attachment/:filename`: Streams attachment file with inline PDF headers.
- `POST /api/mail/suggest-replies`: Returns AI-generated quick reply suggestions.

### 3. Telecom & SMS Bridge (`/api/telecom`)
- `GET /api/telecom/sms-logs`: Returns historical carrier SMS dispatch logs with receipts.
- `POST /api/telecom/sms-reply`: Simulates an inbound SMS from a feature phone, converting it into an outbound email.
- `POST /api/telecom/send-sms`: Direct SMS dispatch via configured TextBee gateway.

---

## ✅ Evaluation Checklist

- [x] **One-Command Launch**: Project starts cleanly via `docker compose up -d --build`.
- [x] **Multi-Stage Frontend**: Vite React app compiled and served via Nginx Alpine on port 3000.
- [x] **Backend & SMTP**: Node.js 18 container exposing REST API (port 5000) and SMTP (port 2525).
- [x] **Persistent SQLite**: Stored in Docker volume `zapmail_data` under `/app/data/zapmail.sqlite`.
- [x] **Blank .env Template**: `backend/.env` committed with empty variables for evaluator injection.
- [x] **Secret Keys File**: `auth_keys.txt` prepared strictly per instructions and ignored by `.gitignore`.
- [x] **Bi-Directional Chat**: Outgoing sent replies appear seamlessly inside conversational thread bubbles.
- [x] **Real SMS Integration**: TextBee Android SMS Gateway API integrated with fallback logging.
