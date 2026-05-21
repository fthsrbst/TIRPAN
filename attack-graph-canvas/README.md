# TIRPAN — Attack Graph Canvas

React/TypeScript single-page application providing rich visualization and mission
management for the TIRPAN autonomous pentesting platform.

## Tech Stack

- **Vite 5** + **React 18** + **TypeScript 5.8**
- **shadcn/ui** (Radix UI primitives) + **Tailwind CSS 3**
- **Cytoscape.js** for interactive attack graph visualization
- **Recharts** for analytics and statistics dashboards
- **@xterm/xterm** for terminal emulation
- **react-router-dom v6** for client-side routing
- **@tanstack/react-query** for server state management
- **react-hook-form** + **zod** for form validation
- **Vitest** + **Testing Library** for tests

## Routes (16 pages)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Overview | Mission dashboard with key metrics |
| `/missions` | Missions | Active/completed mission list |
| `/missions/new` | New Mission | Mission creation form |
| `/attack-graph` | Attack Graph | Interactive attack path visualization |
| `/agents` | Agents | Agent status and orchestration panel |
| `/hosts` | Hosts | Discovered hosts and services |
| `/findings` | Findings | Vulnerability findings table |
| `/credentials` | Credentials | Harvested credentials table |
| `/reports` | Reports | Generated pentest reports |
| `/terminal` | Terminal | Live terminal emulator via xterm.js |
| `/expert-log` | Expert Log | Brain agent reasoning feed |
| `/exploits` | Exploits | Exploit execution history |
| `/v3-intel` | Intel | Intelligence and analytics panel |
| `/settings` | Settings | Configuration and preferences |
| `/team` | Team | User and team management |
| `/login` / `/signup` | Auth | Authentication pages |

## Development

```bash
# Install dependencies
npm install

# Start dev server (port 5173)
npm run dev

# Build for production (output to ../web/static/normal/)
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Integration with TIRPAN

The build output (`dist/`) is deployed to `../web/static/normal/` and served by the
FastAPI backend alongside the static HTML/JS frontend. The React SPA communicates with
the same REST API and WebSocket endpoints as the vanilla frontend.

The Vite dev server runs on port 5173 and proxies API requests to the FastAPI backend
on port 8001 (see `.claude/launch.json` for launch configs).
