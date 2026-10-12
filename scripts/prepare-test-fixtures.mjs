import {existsSync,mkdirSync} from 'node:fs';

// Git stores files, not empty directories. Recreate these fixture contract
// directories without altering any captured fixture bytes or receipts.
const fixture=new URL('../src/test/fixtures/active-agent-site/',import.meta.url);
if(!existsSync(fixture))throw Error('Missing active-agent test fixture');
for(const path of ['media/harvest/','dist/media/harvest/'])mkdirSync(new URL(path,fixture),{recursive:true});
