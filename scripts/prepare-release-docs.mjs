import {fileURLToPath} from 'node:url';
import {prepareReleaseDocs} from './release-docs.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await prepareReleaseDocs(root);
console.log('Prepared public, version-matched README and release notes.');
