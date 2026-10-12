/** Forward Jev / design-assist flags into runWorkflow argv (ralph and vitris run share loadJevConfig). */
export function workflowArgvFromFlags(flags: Record<string, string | boolean>): string[] {
  const argv: string[] = [];
  if (flags["design-assist"]) argv.push("--design-assist");
  if (flags["creative-efficiency"]) argv.push("--creative-efficiency");
  if (flags["no-jev"]) argv.push("--no-jev");
  const jevMode = flags["jev-mode"];
  if (typeof jevMode === "string" && jevMode) argv.push("--jev-mode", jevMode);
  if (flags["compact-packets"]) argv.push("--compact-packets");
  if (flags["no-compact-packets"]) argv.push("--no-compact-packets");
  return argv;
}
