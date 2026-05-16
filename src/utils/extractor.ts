export function extractFaviconUrl(): string {
  // Prefer explicit favicon link tags, fall back to /favicon.ico
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );
  if (link?.href) return link.href;
  try {
    return `${new URL(window.location.href).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function extractPageSummary(): string {
  // 1. OpenGraph description
  const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  if (ogDesc?.content?.trim()) {
    return truncate(ogDesc.content.trim());
  }

  // 2. Meta description
  const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDesc?.content?.trim()) {
    return truncate(metaDesc.content.trim());
  }

  // 3. First meaningful paragraph
  const paragraphs = document.querySelectorAll('p');
  for (const p of paragraphs) {
    const text = p.textContent?.trim();
    if (text && text.length > 15 && !isNavigationText(text)) {
      return truncate(text);
    }
  }

  return '';
}

function isNavigationText(text: string): boolean {
  return /^(菜单|导航|搜索|首页|关于|登录|注册|更多|下一页|上一页|回到顶部)$/.test(text);
}

function truncate(text: string): string {
  if (text.length <= 80) return text;
  return text.substring(0, 77) + '...';
}
