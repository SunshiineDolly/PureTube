import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'

// Generate native assets from the existing Viddy artwork on every Mac checkout.
// npm ci runs this before Cargo's generate_context! reads the macOS config.
if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url))
  execFileSync(process.execPath, [
    resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'),
    'icon', resolve(root, 'src/assets/viddy-app.png'),
    '--output', resolve(root, 'src-tauri/icons/macos'),
  ], {cwd: root, stdio: 'inherit'})
}
