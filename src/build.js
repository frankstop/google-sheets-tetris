#!/usr/bin/env node
/**
 * Builds the self-contained Sidebar.html by inlining tetris-core.js into Sidebar.template.html.
 * Also validates JS syntax of Code.gs and the generated Sidebar.html <script> blocks.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_PATH = path.join(SRC_DIR, 'tetris-core.js');
const TEMPLATE_PATH = path.join(SRC_DIR, 'Sidebar.template.html');
const OUTPUT_PATH = path.join(REPO_ROOT, 'Sidebar.html');
const CODE_GS_PATH = path.join(REPO_ROOT, 'Code.gs');
const MARKER = '/*__TETRIS_CORE_INJECT__*/';

function main() {
  if (!fs.existsSync(CORE_PATH)) {
    throw new Error(`Missing ${CORE_PATH}.`);
  }
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Missing ${TEMPLATE_PATH}.`);
  }

  const coreSource = fs.readFileSync(CORE_PATH, 'utf8');
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  if (!template.includes(MARKER)) {
    throw new Error(`Template ${TEMPLATE_PATH} is missing marker ${MARKER}`);
  }

  // Prevent accidental </script> termination inside inlined JS
  const safeCoreSource = coreSource.replace(/<\/script>/gi, '<\\/script>');
  const builtHtml = template.replace(MARKER, () => safeCoreSource);

  fs.writeFileSync(OUTPUT_PATH, builtHtml, 'utf8');
  console.log(`Built ${OUTPUT_PATH} (${builtHtml.length} bytes)`);

  // Validate syntax of all <script> blocks in Sidebar.html
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptIndex = 0;
  while ((match = scriptRegex.exec(builtHtml)) !== null) {
    scriptIndex++;
    const code = match[1];
    new vm.Script(code, { filename: `Sidebar.html#script-${scriptIndex}` });
  }
  if (scriptIndex === 0) {
    throw new Error('No <script> blocks found in Sidebar.html');
  }
  console.log(`Validated ${scriptIndex} <script> block(s) in Sidebar.html`);

  // Validate Code.gs syntax
  if (fs.existsSync(CODE_GS_PATH)) {
    const codeGs = fs.readFileSync(CODE_GS_PATH, 'utf8');
    new vm.Script(codeGs, { filename: 'Code.gs' });
    console.log('Validated Code.gs syntax');
  }
}

main();
