// Renders the neofetch-style profile card (assets/neofetch.svg).
// No dependencies: Node >= 22.18 runs this .ts file directly (type stripping).
//   GITHUB_TOKEN=$(gh auth token) node scripts/neofetch.ts
// Runs daily in .github/workflows/profile.yml.

import { readFile, writeFile } from 'node:fs/promises';

const LOGIN = 'Mykyta135';
const CAREER_START = new Date(Date.UTC(2025, 4, 1)); // joined Kevych Solutions, May 2025
const FETCH_TIMEOUT_MS = 15_000;

// palette of the LinkedIn banner; a terminal stays dark on GitHub's light theme too
const theme = { bg: '#0b0908', border: '#2a2420', text: '#f3ede6', dim: '#8f857a', accent: '#ff9147', key: '#ffb37a' };

type Stats = {
  contributionsLastYear: number;
  contributionsAllTime: number;
  since: number;
  publicRepos: number;
  stars: number;
  languages: { name: string; share: number }[];
};

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'profile-neofetch' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length || !body.data) throw new Error(`GitHub GraphQL: ${body.errors?.map((e) => e.message).join('; ')}`);
  return body.data;
}

async function fetchStats(): Promise<Stats> {
  type Base = {
    user: {
      createdAt: string;
      contributionsCollection: { contributionCalendar: { totalContributions: number } };
      repositories: {
        totalCount: number;
        nodes: { stargazerCount: number; languages: { edges: { size: number; node: { name: string } }[] } }[];
      };
    };
  };
  const base = await gql<Base>(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        contributionsCollection { contributionCalendar { totalContributions } }
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
          totalCount
          nodes { stargazerCount languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
        }
      }
    }`,
    { login: LOGIN },
  );
  const u = base.user;

  // contributionsCollection spans at most one year, so walk year by year since the account was created.
  // Use the calendar total: private work (Kevych client repos) is in it as an anonymous count, and unlike
  // the commit/PR split it does not depend on what the token can see.
  let contributionsAllTime = 0;
  const now = new Date();
  for (let y = new Date(u.createdAt).getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
    const from = new Date(Date.UTC(y, 0, 1)).toISOString();
    const to = new Date(Math.min(Date.UTC(y + 1, 0, 1) - 1, now.getTime())).toISOString();
    const r = await gql<{ user: { contributionsCollection: { contributionCalendar: { totalContributions: number } } } }>(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) { contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions } } }
      }`,
      { login: LOGIN, from, to },
    );
    contributionsAllTime += r.user.contributionsCollection.contributionCalendar.totalContributions;
  }

  const bytes = new Map<string, number>();
  for (const repo of u.repositories.nodes)
    for (const e of repo.languages.edges) bytes.set(e.node.name, (bytes.get(e.node.name) ?? 0) + e.size);
  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  const languages = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, size]) => ({ name, share: size / total }))
    .filter((l, i) => i === 0 || l.share >= 0.03)
    .slice(0, 3);

  return {
    contributionsLastYear: u.contributionsCollection.contributionCalendar.totalContributions,
    contributionsAllTime,
    since: new Date(u.createdAt).getUTCFullYear(),
    publicRepos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
    languages,
  };
}

function uptime(since: Date, now = new Date()): string {
  let months = (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + (now.getUTCMonth() - since.getUTCMonth());
  let days = now.getUTCDate() - since.getUTCDate();
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return [y && plural(y, 'year'), m && plural(m, 'month'), plural(days, 'day')].filter(Boolean).join(', ');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => n.toLocaleString('en-US');

type Line = { key?: string; value?: string; title?: string; blank?: true; swatches?: true };

function infoLines(s: Stats, now: Date): Line[] {
  return [
    { title: 'mykyta@lviv' },
    { key: 'Role', value: 'Full-stack engineer' },
    { key: 'Host', value: 'Kevych Solutions' },
    { key: 'Uptime', value: uptime(CAREER_START, now) },
    { key: 'Kernel', value: 'Node.js · TypeScript' },
    { key: 'Backend', value: 'NestJS · Firebase Functions' },
    { key: 'Database', value: 'PostgreSQL · Prisma · TypeORM' },
    { key: 'Frontend', value: 'Next.js · React · React Native' },
    { key: 'Infra', value: 'Docker · AWS ECS · GitHub Actions' },
    { key: 'Shell', value: 'zsh + Claude Code' },
    { key: 'Location', value: 'Lviv, Ukraine' },
    { key: 'Off-clock', value: 'BEST Lviv: CTF, hackathons, BEC' },
    { blank: true },
    { title: 'github' },
    { key: 'Contribs', value: `${fmt(s.contributionsLastYear)} in the last year` },
    { key: 'All time', value: `${fmt(s.contributionsAllTime)} since ${s.since}` },
    { key: 'Repos', value: s.stars >= 10 ? `${s.publicRepos} public · ${fmt(s.stars)} ★` : `${s.publicRepos} public` },
    { key: 'Langs', value: s.languages.map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(' · ') },
    { blank: true },
    { swatches: true },
  ];
}

type Portrait = { cols: number; rows: number; lines: [string, string][][] };

function render(portrait: Portrait, lines: Line[], syncedAt: string): string {
  const FONT = 13;
  const CW = FONT * 0.6; // JetBrains Mono advance width
  const LH = FONT * 1.5;
  const PAD = 24;
  const BAR = 30;
  // portrait uses a smaller grid; ART_CW / ART_LH must match CHAR_ASPECT in tools/portrait.py
  const ART_FONT = 9;
  const ART_CW = ART_FONT * 0.6;
  const artLH = ART_CW / 0.83;
  const artW = portrait.cols * ART_CW;
  const textX = PAD + artW + 32;
  const textCols = 46;
  const width = Math.ceil(textX + textCols * CW + PAD);
  const infoH = (lines.length + 1) * LH;
  const artH = portrait.rows * artLH;
  const height = Math.ceil(BAR + PAD + Math.max(infoH, artH) + PAD);

  // intro animation, played once on load: the portrait prints row by row while the info lines type in
  const START = 0.3;
  const ROW_STEP = 0.025;
  const LINE_STEP = 0.09;
  const TYPE_S = 0.3;
  const s = (n: number) => `${n.toFixed(3)}s`;
  const printed = (delay: number) => `class="row" style="animation-delay:${s(delay)}"`;
  const typed = (delay: number, chars: number) =>
    `class="ln" style="animation-delay:${s(delay)};animation-timing-function:steps(${Math.max(1, chars)})"`;

  // runs of one colour share a tspan
  const artTop = BAR + PAD + Math.max(0, (infoH - artH) / 2) - artLH * 0.25;
  const art = portrait.lines
    .map((row, i) => {
      const y = (artTop + (i + 1) * artLH).toFixed(1);
      let out = '';
      let run = '';
      let colour = '';
      for (const [c, col] of row) {
        if (col !== colour && run) {
          out += `<tspan fill="${colour}">${esc(run)}</tspan>`;
          run = '';
        }
        colour = col;
        run += c;
      }
      if (run) out += `<tspan fill="${colour}">${esc(run)}</tspan>`;
      return `<text x="${PAD}" y="${y}" ${printed(START + i * ROW_STEP)}>${out}</text>`;
    })
    .join('\n    ');

  const DOT_KEY = 10;
  let shown = 0;
  const info = lines
    .map((l, i) => {
      const y = (BAR + PAD + (i + 1) * LH).toFixed(1);
      if (l.blank) return '';
      const delay = START + shown++ * LINE_STEP;
      if (l.title) {
        const rule = '─'.repeat(Math.max(0, textCols - l.title.length - 1));
        return `<text x="${textX}" y="${y}" ${typed(delay, textCols)}><tspan fill="${theme.accent}" font-weight="700">${esc(l.title)}</tspan><tspan fill="${theme.border}"> ${rule}</tspan></text>`;
      }
      if (l.swatches) {
        const colours = ['#3a312a', '#8f857a', '#d9cfc4', '#ffb37a', '#ff9147', '#c4561a', '#6fb38f', '#5b8fd9'];
        const rects = colours
          .map((c, k) => `<rect x="${(textX + k * CW * 3).toFixed(1)}" y="${(Number(y) - FONT + 1).toFixed(1)}" width="${(CW * 2.6).toFixed(1)}" height="${FONT}" rx="2" fill="${c}"/>`)
          .join('');
        // clip-path typing cuts the last rect of a <g> in Chromium, so the swatches just appear
        return `<g ${printed(delay)}>${rects}</g>`;
      }
      const key = l.key ?? '';
      const dots = ' ' + '.'.repeat(Math.max(1, DOT_KEY - key.length)) + ' ';
      const value = l.value ?? '';
      return `<text x="${textX}" y="${y}" ${typed(delay, key.length + dots.length + value.length)}><tspan fill="${theme.key}">${esc(key)}</tspan><tspan fill="${theme.dim}">${dots}</tspan><tspan fill="${theme.text}">${esc(value)}</tspan></text>`;
    })
    .filter(Boolean)
    .join('\n    ');
  const done = Math.max(START + portrait.rows * ROW_STEP, START + shown * LINE_STEP + TYPE_S);

  const lights = ['#ff5f57', '#febc2e', '#28c840']
    .map((c, i) => `<circle cx="${PAD + i * 18}" cy="${BAR / 2 + 2}" r="5.5" fill="${c}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mykyta Klymenko: full-stack engineer, Node.js and TypeScript, Lviv">
  <style>
    text { font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace; font-size: ${FONT}px; white-space: pre; }
    .art text { font-size: ${ART_FONT}px; font-weight: 700; }
    .row { animation: print 0.01s linear both; }
    .ln { animation: type ${TYPE_S}s steps(1) both; }
    .cursor { animation: blink 1.1s steps(1) infinite; }
    @keyframes print { from { opacity: 0; } to { opacity: 1; } }
    @keyframes type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .row, .ln, .cursor { animation: none; }
    }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${theme.bg}" stroke="${theme.border}"/>
  <line x1="0" y1="${BAR + 4}" x2="${width}" y2="${BAR + 4}" stroke="${theme.border}"/>
  ${lights}
  <text x="${width / 2}" y="${BAR / 2 + 6}" text-anchor="middle" fill="${theme.dim}">~ — neofetch</text>
  <g class="art" xml:space="preserve">
    ${art}
  </g>
  <g xml:space="preserve">
    ${info}
  </g>
  <text x="${textX}" y="${(height - PAD + 4).toFixed(1)}" fill="${theme.dim}" ${printed(done)}>synced ${esc(syncedAt)} UTC <tspan class="cursor" fill="${theme.accent}">█</tspan></text>
</svg>
`;
}

async function main() {
  const root = new URL('..', import.meta.url);
  const portrait = JSON.parse(await readFile(new URL('assets/portrait.json', root), 'utf8')) as Portrait;
  const now = new Date();
  const stats = await fetchStats();
  const lines = infoLines(stats, now);
  await writeFile(new URL('assets/neofetch.svg', root), render(portrait, lines, now.toISOString().slice(0, 10)));
  console.log(JSON.stringify(stats));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
