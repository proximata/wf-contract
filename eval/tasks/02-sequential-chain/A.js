// FROZEN — arm A (prose). Do not edit; edits invalidate every recorded rep.
const recon = await agent(`Recon the token-estimation subsystem of wf-contract (src/tokens.mjs). What is measured, what is estimated, what is unknown?`, { label: 'recon' });

const spec = await agent(`Turn this recon into a spec: numbered decisions with reasons, explicit non-goals, and acceptance criteria.

${recon}
`, { label: 'spec' });

return await agent(`Given this spec, report what an implementer would change (paths and why), what they would deliberately skip, and the residual risks.

${spec}
`, { label: 'implement' });
