import { start } from './main.js';
import { harnessTransport } from './transport-harness.js';
start(harnessTransport, { allowFrame: true });
