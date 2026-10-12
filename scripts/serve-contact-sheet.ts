#!/usr/bin/env node
import { resolve } from "node:path";
import { contactSheetServer } from "../src/stock/contact-sheet-server.ts";

const index = process.argv.indexOf("--site");
if (process.argv.includes('--help')) {
  console.log('Usage: vitris-media-serve --site SITE\nServe the media contact sheet on loopback only.');
  process.exit(0);
}
const root = resolve(index < 0 ? "." : process.argv[index + 1]!);
const server = contactSheetServer(root);
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") console.log("Media contact sheet: http://127.0.0.1:" + address.port + "/onboarding/contact-sheet.html");
});
