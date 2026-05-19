import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "playwright";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.RESPONSIVE_SMOKE_PORT ?? 3107);
const baseUrl = process.env.RESPONSIVE_BASE_URL ?? `http://127.0.0.1:${port}`;
const routes = ["/", "/schedule", "/live", "/portfolio", "/settlement", "/operator", "/markets/market-demo-63-73"];
const viewports = [
  { name: "narrow H5", width: 360, height: 740 },
  { name: "iPhone 12/13/14", width: 390, height: 844 },
  { name: "large H5", width: 430, height: 932 },
];

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function startServer(): Promise<ChildProcessWithoutNullStreams | undefined> {
  if (process.env.RESPONSIVE_BASE_URL) return undefined;

  const server = spawn(
    process.execPath,
    ["run", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: appDir, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  );

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer(baseUrl);
  return server;
}

async function assertNoHorizontalOverflow(browser: Browser): Promise<void> {
  const failures: string[] = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      const result = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      const overflow = Math.max(result.scrollWidth, result.bodyScrollWidth) - result.clientWidth;

      if (overflow > 1) {
        failures.push(`${viewport.name} ${route}: overflow ${overflow}px`);
      }
    }

    await context.close();
  }

  if (failures.length > 0) {
    throw new Error(`Responsive overflow detected:\n${failures.join("\n")}`);
  }
}

let server: ChildProcessWithoutNullStreams | undefined;
let browser: Browser | undefined;

try {
  server = await startServer();
  browser = await chromium.launch();
  await assertNoHorizontalOverflow(browser);
  console.log(`Responsive smoke passed for ${routes.length} routes across ${viewports.length} H5 viewports.`);
} finally {
  await browser?.close();
  server?.kill();
}
