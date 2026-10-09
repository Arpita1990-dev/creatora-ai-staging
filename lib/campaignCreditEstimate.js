export function getCampaignCreditEstimate(asset) {
  if (asset.type === 'video') return null;
  if (asset.type === 'audio') return 5;
  return 10;
}

export function calculateCampaignCreditEstimate(assets = []) {
  if (assets.some((asset) => asset.type === 'video')) return null;
  return assets.reduce((total, asset) => total + getCampaignCreditEstimate(asset), 0);
}