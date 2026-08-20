const recon = await agent(`look at the repo`, { label: 'recon' });
const [a, b] = await parallel([
  agent(`review joining: ${recon}`, { label: 'review_joining' }),
  agent(`review team: ${recon}`, { label: 'review_team' }),
]);
if (a.includes('CLEAN')) {
  await agent(`ship it: ${a.slice(0, 3000)} ${b}`, { label: 'ship' });
}
