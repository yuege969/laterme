import type { BrowserContext } from '@playwright/test';

export async function getExtensionId(context: BrowserContext): Promise<string> {
  const page = context.pages()[0] || await context.newPage();
  const cdp = await context.newCDPSession(page);
  const targets: any = await cdp.send('Target.getTargets');
  for (const t of targets.targetInfos || []) {
    const match = (t.url as string).match(/chrome-extension:\/\/([^/]+)\//);
    if (match && t.type === 'service_worker') return match[1];
  }
  throw new Error('Extension service worker not found');
}

export async function extensionUrl(
  context: BrowserContext,
  path: string,
): Promise<string> {
  const id = await getExtensionId(context);
  return `chrome-extension://${id}/${path}`;
}
