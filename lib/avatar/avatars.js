export const AVATAR_MODEL_OPTIONS = [
  {
    value: "wan2.2-speech-to-video",
    label: "Standard",
    providerModel: "wan2.2-speech-to-video",
  },
];

export const PRESENTER_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "professional", label: "Professional" },
  { value: "corporate", label: "Corporate" },
  { value: "creator", label: "Creator" },
  { value: "casual", label: "Casual" },
];

// These display identities resolve to the approved presenter sheet crops in
// public/avatars/presenters/.
export const PRESENTER_LIBRARY = [
  ["aanya", "Aanya", "professional", "Calm_Woman"],
  ["arjun", "Arjun", "professional", "Friendly_Person"],
  ["meera", "Meera", "creator", "Calm_Woman"],
  ["kabir", "Kabir", "casual", "Friendly_Person"],
  ["riya", "Riya", "professional", "Calm_Woman"],
  ["vikram", "Vikram", "corporate", "Friendly_Person"],
  ["tara", "Tara", "creator", "Calm_Woman"],
  ["aditya", "Aditya", "casual", "Friendly_Person"],
].map(([id, name, category, voiceId]) => ({
  id,
  name,
  category,
  imageUrl: `/avatars/presenters/${id}.webp`,
  enabled: true,
  assetAvailable: true,
  voiceId,
}));

// Compatibility alias for the existing Avatar Video call sites.
export const STOCK_AVATARS = PRESENTER_LIBRARY;

export function getAvatarModel(value) {
  return AVATAR_MODEL_OPTIONS.find((option) => option.value === value) || AVATAR_MODEL_OPTIONS[0];
}

export function getStockAvatar(id) {
  return PRESENTER_LIBRARY.find((avatar) => avatar.enabled && avatar.assetAvailable && avatar.id === id) || null;
}