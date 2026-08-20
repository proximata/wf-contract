// FROZEN — arm A (prose). Do not edit; edits invalidate every recorded rep.
const impl = await agent(`Report the change made to wf-contract's shape files: paths, why, what was skipped, residual risks.`, { label: 'implement' });

const ver = await agent(`Verify this change by running real commands in the repo. For every check give the command you ran and its output, then a verdict.

${impl}
`, { label: 'verify' });

return await agent(`Review this verification. List findings with severity and location, and say whether anything blocks.

${ver}
`, { label: 'review' });
