#!/usr/bin/env fibjs

import { build } from 'esbuild';
import { createBuildConfig } from './build-config.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/**
 * Sync version from package.json to manifest.json
 * @returns {string} Current version
 */
function syncVersion() {
  const packagePath = path.join(projectRoot, 'package.json');
  const manifestPath = path.join(__dirname, 'manifest.json');
  
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  if (manifest.version !== packageJson.version) {
    manifest.version = packageJson.version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`  • Updated manifest.json version`);
  }
  return packageJson.version;
}

/**
 * Check for missing translation keys
 */
async function checkMissingKeys() {
  console.log('📦 Checking translations...');
  try {
    const { stdout, stderr } = await execAsync('node scripts/check-missing-keys.js', { cwd: projectRoot });
    if (stderr) {
      console.error(stderr);
    }
    
    if (stdout.includes('Missing Keys') || stdout.includes('Extra Keys')) {
      console.warn('⚠️  Warning: Some translation keys are missing or extra');
    } else {
      console.log('✅ Translations checked');
    }
  } catch (error) {
    console.error('⚠️  Warning: Failed to check translation keys');
  }
}

// Production build
const version = syncVersion();
console.log(`🔨 Building Firefox Extension... v${version}\n`);

try {
  // Check translations
  await checkMissingKeys();

  // Clean dist/firefox to avoid stale artifacts
  const outdir = path.join(projectRoot, 'dist/firefox');
  if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true, force: true });
  }
  
  // Change to project root for esbuild to work correctly
  process.chdir(projectRoot);
  
  const config = createBuildConfig();
  const result = await build(config);
  
  // Analyze bundle sizes
  if (result.metafile) {
    const outputs = result.metafile.outputs;
    console.log('\n📊 Bundle sizes:');
    const bundles = Object.entries(outputs)
      .filter(([name]) => name.endsWith('.js'))
      .map(([name, info]) => ({
        name: name.replace('dist/firefox/', ''),
        size: info.bytes
      }))
      .sort((a, b) => b.size - a.size);
    
    for (const bundle of bundles) {
      const size = bundle.size >= 1024 * 1024 
        ? `${(bundle.size / 1024 / 1024).toFixed(2)} MB`
        : `${(bundle.size / 1024).toFixed(2)} KB`;
      console.log(`   ${bundle.name}: ${size}`);
    }
  }
  
  console.log(`\n✅ Build complete! Output: dist/firefox/`);
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
