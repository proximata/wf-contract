// FROZEN — arm A (prose). Do not edit; edits invalidate every recorded rep.
const [taint, wrap, tokens] = await parallel([
  agent(`Survey src/taint.mjs in wf-contract. What does it do, what evidence backs each claim, what is still unknown?`, { label: 'recon-taint' }),
  agent(`Survey src/parse.mjs stripAndWrap in wf-contract. What does it do, what evidence backs each claim, what is still unknown?`, { label: 'recon-wrap' }),
  agent(`Survey src/tokens.mjs in wf-contract. What does it do, what evidence backs each claim, what is still unknown?`, { label: 'recon-tokens' }),
]);

return await agent(`Consolidate these three subsystem surveys into one answer. Account for every branch: what each found, and for anything you drop, say why.

--- taint ---
${taint}

--- wrap ---
${wrap}

--- tokens ---
${tokens}
`, { label: 'synthesis' });
