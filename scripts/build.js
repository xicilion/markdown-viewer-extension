#!/usr/bin/env fibjs

import { build } from 'esbuild';
import { createBuildConfig } from './build-config.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Check for missing translation keys
async function checkMissingKeys() {
  console.log('🔍 Checking translation keys...\n');
  try {
    const { stdout, stderr } = await execAsync('node scripts/check-missing-keys.js');
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
    
    // Check if there are missing keys
    if (stdout.includes('Missing Keys') || stdout.includes('Extra Keys')) {
      console.warn('⚠️  Warning: Some translation keys are missing or extra.\n');
    }
  } catch (error) {
    console.error('❌ Failed to check translation keys:', error.message);
  }
}

// Production build only
console.log('🔨 Building extension...\n');

try {
  // Check translations first
  await checkMissingKeys();
  
  const config = createBuildConfig();
  const result = await build(config);
  console.log('✅ Build complete');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
