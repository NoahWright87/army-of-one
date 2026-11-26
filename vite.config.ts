import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** The command's output, or '' (no git, shallow clones and the like). */
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

/** What the HQ's build sign shows: which build is this? (Set when the build or dev server starts.) */
const BUILD_INFO = {
  version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version,
  sha: git('rev-parse --short=7 HEAD'),
  branch: process.env.GITHUB_HEAD_REF || git('rev-parse --abbrev-ref HEAD'),
  time: new Date().toISOString(),
};

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  define: {
    __AOO_BUILD__: JSON.stringify(BUILD_INFO),
    // (PHASE12-e) Netlify's permanent URL for this exact deploy: shared replay links point at
    // it, so they keep working after the game is updated ([D79]). Empty elsewhere (the links
    // then use the page's own address).
    __AOO_DEPLOY_URL__: JSON.stringify(process.env.DEPLOY_URL ?? ''),
  },
});
