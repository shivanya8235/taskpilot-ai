# TaskPilot AI — Autonomous Task Execution Agent

TaskPilot AI is a prototype AI task worker that accepts natural-language instructions, uses tools to perform supported tasks, records execution logs, and verifies results.

It combines a React dashboard, a Node.js/Express backend, Google's Gemini API, and Playwright browser automation.

## Features

- **Natural-language tasks:** Submit instructions through a web dashboard.
- **AI-powered execution:** Uses Gemini to interpret tasks and select available tools.
- **Workspace tools:** List and read supported workspace files.
- **Browser automation:** Uses Playwright to interact with a simulated company invoice application.
- **Invoice workflow:** Submit invoice information and check the saved record.
- **Duplicate prevention:** Checks for an existing invoice before attempting to create another.
- **Execution logs:** View task activity, outcomes, and available verification evidence.
- **Fallback handling:** Uses a deterministic invoice workflow when supported Gemini API errors occur.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express |
| AI | Google Gemini API |
| Browser automation | Playwright |
| Package manager | npm |

## Architecture

1. The user submits a task through the React dashboard.
2. The frontend sends the task to the backend API.
3. The agent interprets the request and invokes supported tools.
4. Playwright interacts with the simulated company application when browser actions are needed.
5. The backend checks the result and returns execution details to the dashboard.

## Project Structure

```text
taskpilot-ai/
├── backend/
│   ├── data/
│   │   └── workspace/
│   ├── src/
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── package-lock.json
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 22.12.0 or newer
- npm
- A Google Gemini API key for AI-powered execution

## Setup

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd taskpilot-ai
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with the repository URL.

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory. Add your own API key and the model configuration:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash
PORT=8080
```

Never commit your `.env` file or expose your API key.

### 3. Start the backend

From the `backend` directory, run the development command defined in `backend/package.json`. For example, if the package defines a `dev` script:

```bash
npm run dev
```

The backend is expected to run at `http://localhost:8080`.

Check its health endpoint:

```text
http://localhost:8080/api/health
```

### 4. Start the frontend

Open a second terminal:

```bash
cd C:\Users\hello\taskpilot-ai\frontend
npm install
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

### 5. Try a task

Start with a read-only instruction, such as:

```text
List the files in the workspace. Do not create, edit, or delete anything.
```

Then test the supported invoice workflow using the invoice data available in the workspace.

## Verification and Reliability

TaskPilot AI includes result checks for supported invoice operations. A successful tool call alone should not be treated as proof that a task completed: the resulting application record should also be checked.

Gemini availability and quotas can affect AI-powered execution. The deterministic fallback supports only a limited set of workflows; it is not a general replacement for the AI agent.

## Current Limitations

- This is a prototype, not a production-ready autonomous agent.
- Invoice records are stored in backend memory and may be lost when the backend restarts.
- The agent supports a limited set of tools and task types.
- Gemini requests may fail because of API quotas, temporary service errors, or model availability.
- Browser automation depends on the simulated company's current UI.
- Authentication, durable storage, comprehensive audit trails, and production deployment hardening require further work.

## Future Improvements

- Persistent database storage.
- More robust retries, timeouts, and recovery strategies.
- Stronger task permissions and approval steps for sensitive actions.
- Expanded automated tests and verification evidence.
- Functional tool activity and verification views.
- Deployment configuration, monitoring, and security hardening.

## Security

- Keep API keys in environment variables.
- Do not commit `.env` files or credentials.
- Use a restricted API key and appropriate access controls.
- Review task permissions before enabling write operations in a production environment.

## Project Status

Prototype under development.
