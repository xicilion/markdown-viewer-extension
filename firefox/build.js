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

// Sync version from package.json to manifest.json
function syncVersion() {
  const packagePath = path.join(projectRoot, 'package.json');
  const manifestPath = path.join(__dirname, 'manifest.json');
  
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  if (manifest.version !== packageJson.version) {
    manifest.version = packageJson.version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`📌 Updated manifest.json version: ${packageJson.version}`);
  }
}

// Check for missing translation keys
async function checkMissingKeys() {
  console.log('🔍 Checking translation keys...\n');
  try {
    const { stdout, stderr } = await execAsync('node scripts/check-missing-keys.js', { cwd: projectRoot });
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
    
    if (stdout.includes('Missing Keys') || stdout.includes('Extra Keys')) {
      console.warn('⚠️  Warning: Some translation keys are missing or extra.\n');
    }
  } catch (error) {
    console.error('❌ Failed to check translation keys:', error.message);
  }
}

// Production build only
console.log('🦊 Building Firefox extension...\n');

try {
  // Sync version first
  syncVersion();
  
  // Check translations first
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
  
  // Analyze bundle sizes if metafile is available
  if (result.metafile) {
    const outputs = result.metafile.outputs;
    console.log('\n📊 Bundle Analysis:');
    const bundles = Object.entries(outputs)
      .filter(([name]) => name.endsWith('.js'))
      .map(([name, info]) => ({
        name: name.replace('dist/firefox/', ''),
        size: info.bytes,
        inputs: Object.keys(info.inputs || {})
      }))
      .sort((a, b) => b.size - a.size);
    
    for (const bundle of bundles) {
      console.log(`  ${bundle.name}: ${(bundle.size / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Write metafile for detailed analysis
    fs.writeFileSync(path.join(outdir, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
    console.log('\n📄 Metafile saved to dist/firefox/metafile.json');
  }
  
  console.log('✅ Firefox build complete');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
