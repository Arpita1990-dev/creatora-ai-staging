const voiceBriefSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "outputType",
    "duration",
    "aspectRatio",
    "platform",
    "style",
    "scenes",
    "voiceover",
    "music",
    "callToAction",
  ],
  properties: {
    title: { type: "string" },
    outputType: { type: "string", enum: ["VIDEO", "AUDIO"] },
    duration: { type: "integer", enum: [5, 10, 15, 30] },
    aspectRatio: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9"] },
    platform: { type: "string" },
    style: { type: "string" },
    scenes: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["duration", "visualPrompt", "text"],
        properties: {
          duration: { type: "integer" },
          visualPrompt: { type: "string" },
          text: { type: "string" },
        },
      },
    },
    voiceover: { type: "boolean" },
    music: { type: "boolean" },
    callToAction: { type: "string" },
  },
};

function parseResponseText(data) {
  if (data.output_text) return data.output_text;
  return (
    data.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text || ""
  );
}

export async function transcribeVoice(file) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is required for voice transcription.");
  const body = new FormData();
  body.append("file", file, file.name || "voice-input.webm");
  body.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
  );
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        `Voice transcription failed (${response.status}).`,
    );
  const transcript = String(result.text || "").trim();
  if (!transcript)
    throw new Error("The recording did not contain recognizable speech.");
  return { transcript, language: result.language || null };
}

export async function interpretVoiceBrief(transcript, defaults = {}) {
  const duration = [5, 10, 15, 30].includes(Number(defaults.duration))
    ? Number(defaults.duration)
    : 15;
  const aspectRatio = ["1:1", "4:5", "9:16", "16:9"].includes(
    defaults.aspectRatio,
  )
    ? defaults.aspectRatio
    : "9:16";
  const requestedOutputType = ["VIDEO", "AUDIO"].includes(defaults.outputType)
    ? defaults.outputType
    : "AUTO";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is required to interpret the video brief.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VOICE_BRIEF_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Convert a creator's spoken request into a practical media-generation brief. Preserve the intent and correct obvious transcription errors. Set outputType to AUDIO when the user asks for audio, music, a voiceover, a podcast, narration, a jingle, a soundscape, or another audio-only result. Set it to VIDEO when the user asks for video, a reel, animation, moving visuals, or an audiovisual ad. If requestedOutputType is VIDEO or AUDIO, always use that explicit choice; when it is AUTO and the request is ambiguous, default to VIDEO. Use the requested total duration exactly and divide it into coherent scenes or audio segments whose durations sum to the total. For audio, put the desired sound for each segment in visualPrompt and leave text empty. Return only the required JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            transcript,
            requestedDuration: duration,
            requestedAspectRatio: aspectRatio,
            requestedOutputType,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "voice_video_brief",
          strict: true,
          schema: voiceBriefSchema,
        },
      },
    }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        `Video brief interpretation failed (${response.status}).`,
    );
  const brief = JSON.parse(parseResponseText(result));
  return {
    ...brief,
    outputType:
      requestedOutputType === "AUTO"
        ? brief.outputType
        : requestedOutputType,
    duration,
    aspectRatio,
  };
}

export function promptFromVoiceBrief(brief, settings = {}) {
  const outputType = brief.outputType === "AUDIO" ? "AUDIO" : "VIDEO";
  const scenes = brief.scenes
    .map(
      (scene, index) =>
        `${outputType === "AUDIO" ? "Audio segment" : "Scene"} ${index + 1} (${scene.duration}s): ${scene.visualPrompt}.${outputType === "VIDEO" ? ` On-screen text: ${scene.text || "none"}.` : ""}`,
    )
    .join(" ");
  const voice =
    settings.voiceover === false || brief.voiceover === false
      ? "No spoken narration."
      : `Include clear ${settings.language || "English"} narration with a ${settings.voiceGender || "natural"} voice, ${settings.accent || "neutral"} accent, at ${settings.speakingSpeed || "normal"} speed.`;
  const music =
    settings.music === false || brief.music === false
      ? "Use only appropriate ambient sound."
      : `Add background music at ${settings.musicVolume ?? 35}% beneath narration at ${settings.voiceoverVolume ?? 85}%.`;
  const outputInstruction =
    outputType === "AUDIO"
      ? `Produce one polished ${brief.duration}-second audio track with clean, audible sound.`
      : `Produce one coherent ${brief.duration}-second video in ${brief.aspectRatio} with synchronized sound.`;
  return `${brief.title}. Style: ${brief.style}. Platform: ${brief.platform}. ${scenes} ${voice} ${music} Finish with the call to action: ${brief.callToAction}. ${outputInstruction}`;
}
