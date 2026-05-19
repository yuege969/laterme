import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
} from 'fs';

function extensionBuilder(): Plugin {
  let outDir = '';

  return {
    name: 'extension-builder',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const root = resolve(__dirname);

      const manifest = JSON.parse(
        readFileSync(resolve(root, 'manifest.json'), 'utf-8')
      );

      function mapPath(src: string): string {
        return src.replace(/^src\//, '').replace(/\.ts$/, '.js');
      }

      // Update content scripts
      if (manifest.content_scripts) {
        for (const cs of manifest.content_scripts) {
          cs.js = cs.js.map(mapPath);
          if (cs.css) {
            cs.css = cs.css.map((f: string) =>
              f.replace(/^src\//, '').replace(/\.css$/, '.css')
            );
          }
        }
      }

      // Update background
      if (manifest.background?.service_worker) {
        manifest.background.service_worker = mapPath(
          manifest.background.service_worker
        );
      }

      // Update chrome_url_overrides
      if (manifest.chrome_url_overrides) {
        for (const k of Object.keys(manifest.chrome_url_overrides)) {
          manifest.chrome_url_overrides[k] = manifest.chrome_url_overrides[k]
            .replace(/^src\//, '')
            .replace(/\.html$/, '.html');
        }
      }

      // Update action popup
      if (manifest.action?.default_popup) {
        manifest.action.default_popup = mapPath(manifest.action.default_popup);
      }

      // Update options_ui
      if (manifest.options_ui?.page) {
        manifest.options_ui.page = mapPath(manifest.options_ui.page);
      }

      // Update icon paths
      const stripPublic = (p: string) => p.replace('public/', '');
      if (manifest.action?.default_icon) {
        for (const k of Object.keys(manifest.action.default_icon)) {
          manifest.action.default_icon[k] = stripPublic(manifest.action.default_icon[k]);
        }
      }
      if (manifest.icons) {
        for (const k of Object.keys(manifest.icons)) {
          manifest.icons[k] = stripPublic(manifest.icons[k]);
        }
      }

      writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Copy HTML files and fix script/css references
      const htmlFiles = [
        { src: 'src/content/popup/index.html', scripts: ['index.ts'] },
        { src: 'src/options/index.html', scripts: ['index.ts'] },
        { src: 'src/welcome/index.html', scripts: ['index.ts'] },
        { src: 'src/bookmarks/index.html', scripts: ['index.ts'] },
      ];
      for (const { src: htmlPath, scripts } of htmlFiles) {
        const src = resolve(root, htmlPath);
        const dest = resolve(outDir, mapPath(htmlPath));
        if (existsSync(src)) {
          const destDir = dest.substring(0, dest.lastIndexOf('/'));
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
          let html = readFileSync(src, 'utf-8');
          for (const s of scripts) {
            html = html.replace(
              new RegExp(`src=["']${s.replace('.', '\\.')}["']`, 'g'),
              `src="./${s.replace('.ts', '.js')}"`
            );
          }
          html = html.replace(/href=["']style\.css["']/g, 'href="./style.css"');
          writeFileSync(dest, html);
        }
      }

      // Copy CSS files
      const cssFiles = [
        'src/content/popup/style.css',
        'src/options/style.css',
        'src/welcome/style.css',
        'src/bookmarks/style.css',
      ];
      for (const css of cssFiles) {
        const src = resolve(root, css);
        const dest = resolve(outDir, mapPath(css));
        if (existsSync(src)) {
          const destDir = dest.substring(0, dest.lastIndexOf('/'));
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
          copyFileSync(src, dest);
        }
      }

      // Copy icons
      const iconsDir = resolve(root, 'public/icons');
      const destIconsDir = resolve(outDir, 'icons');
      if (existsSync(iconsDir)) {
        if (!existsSync(destIconsDir)) mkdirSync(destIconsDir, { recursive: true });
        for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
          const src = resolve(iconsDir, icon);
          if (existsSync(src)) copyFileSync(src, resolve(destIconsDir, icon));
        }
      }

      // Wrap content-script entry files in IIFE so top-level const/let don't
      // collide when multiple content scripts share the same isolated world.
      for (const cs of manifest.content_scripts || []) {
        for (const js of cs.js) {
          const fp = resolve(outDir, js);
          if (existsSync(fp)) {
            writeFileSync(fp, `(function(){${readFileSync(fp, 'utf-8')}\n})();\n`);
          }
        }
      }
    },
  };
}

function findInputs(): Record<string, string> {
  const root = resolve(__dirname);
  return {
    'background/index': resolve(root, 'src/background/index.ts'),
    'content/capture': resolve(root, 'src/content/capture.ts'),
    'content/popup/index': resolve(root, 'src/content/popup/index.ts'),
    'welcome/index': resolve(root, 'src/welcome/index.ts'),
    'bookmarks/index': resolve(root, 'src/bookmarks/index.ts'),
    'options/index': resolve(root, 'src/options/index.ts'),
  };
}

export default defineConfig({
  plugins: [extensionBuilder()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: findInputs(),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
