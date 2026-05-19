import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function globalSetup(): Promise<void> {
  execSync('npm run build', {
    cwd: resolve(__dirname, '../..'),
    stdio: 'inherit',
  });
}

export default globalSetup;
