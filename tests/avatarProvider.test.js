import test from "node:test";
import assert from "node:assert/strict";

import { MuApiAvatarProvider } from "../lib/providers/muApiAvatarProvider.js";
import { AVATAR_MODEL_OPTIONS, PRESENTER_LIBRARY } from "../lib/avatar/avatars.js";

test("MuAPI avatar provider submits the documented image and audio fields", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ request_id: "avatar_request_1" }), { status: 200 });
  };
  try {
    const result = await new MuApiAvatarProvider().createAvatarTask({
      apiKey: "test-key",
      imageUrl: "https://assets.example/avatar.png",
      audioUrl: "https://assets.example/narration.mp3",
      prompt: "Create a natural talking presenter video.",
      idempotencyKey: "avatar-idempotency-1",
    });
    assert.equal(result.taskId, "avatar_request_1");
    assert.equal(request.url, "https://api.muapi.ai/api/v1/wan2.2-speech-to-video");
    assert.equal(request.options.headers["x-api-key"], "test-key");
    assert.equal(request.options.headers["Idempotency-Key"], "avatar-idempotency-1");
    assert.deepEqual(JSON.parse(request.options.body), {
      prompt: "Create a natural talking presenter video.",
      image_url: "https://assets.example/avatar.png",
      audio_url: "https://assets.example/narration.mp3",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("avatar configuration exposes eight named presenter slots with local assets", () => {
  assert.equal(AVATAR_MODEL_OPTIONS[0].providerModel, "wan2.2-speech-to-video");
  assert.deepEqual(PRESENTER_LIBRARY.map((presenter) => presenter.name), ["Aanya", "Arjun", "Meera", "Kabir", "Riya", "Vikram", "Tara", "Aditya"]);
  assert.equal(PRESENTER_LIBRARY.every((presenter) => presenter.assetAvailable === true), true);
  assert.equal(PRESENTER_LIBRARY.find((presenter) => presenter.id === "meera").voiceId, "Calm_Woman");
});