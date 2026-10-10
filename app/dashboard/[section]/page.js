"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CreateoraSparkle from "@/app/components/CreateoraSparkle";
import CreateoraLoadingState from "@/app/components/CreateoraLoadingState";
import ConnectMuApiModal from "@/components/ConnectMuApiModal";
import SocialPublishButton from "@/components/SocialPublishButton";
import SocialConnectionCard from "@/components/SocialConnectionCard";
import { AuthenticatedImage, AuthenticatedVideo } from "@/components/AuthenticatedMedia";
import { PRICING_PLANS } from "@/lib/pricingPlans";
import {
  addAsset,
  addTeamMember,
  addWorkflow,
  createProject,
  deleteAsset,
  deleteProject,
  deleteTeamMember,
  deleteWorkflow,
  getWorkspace,
  resetWorkspace,
  toggleTemplateFavourite,
  updateAsset,
  updateProject,
  updateTeamMember,
  updateWorkflow,
  updateWorkspace,
} from "@/lib/workspaceStore";
import { broadcastMuApiBalance, fetchMuApiBalance, invalidateMuApiBalance } from "@/lib/balanceClient";
import { getLanguageConfig, getVoiceOptions } from "@/lib/tts/languages.js";
import { AVATAR_MODEL_OPTIONS, getStockAvatar } from "@/lib/avatar/avatars.js";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout.js";
import { uniqueProjectAssets } from "@/lib/projectCategories.js";
import { isGeneratedAssetLibraryItem } from "@/lib/assetWorkspaceScope.js";
import PresenterPicker from "@/components/PresenterPicker";
import AvatarVideoControls from "@/components/AvatarVideoControls";

const details = {
  create: [
    "Create New Project",
    "Start a project, configure its outputs, and keep every generated asset together.",
  ],
  image: [
    "AI Image Studio",
    "Create product photography, lifestyle scenes and social content.",
  ],
  video: [
    "AI Video Studio",
    "Turn prompts and still images into polished short-form video.",
  ],
  "voice-video": [
    "Voice to Video Studio",
    "Describe your idea aloud, review the interpreted brief, and generate a finished video.",
  ],
  ads: [
    "AI Ad Creator",
    "Build an ad concept, copy and campaign assets from one product.",
  ],
  campaign: [
    "Campaign Agent",
    "Plan and produce a connected, multi-channel campaign.",
  ],
  templates: [
    "Template library",
    "Start fast with proven workflows for every industry.",
  ],
  workflows: [
    "Creative workflows",
    "Build and reuse multi-step generation recipes.",
  ],
  projects: [
    "Projects",
    "Organize campaign work, drafts and final deliverables.",
  ],
  assets: [
    "Asset library",
    "All your images, videos, audio and brand files in one place.",
  ],
  "brand-kit": [
    "Brand kit",
    "Keep every generation visually and verbally on-brand.",
  ],
  team: ["Team members", "Create together and control workspace access."],
  credits: [
    "Plan & Billing",
    "Track usage and choose a plan that fits your output.",
  ],
  settings: [
    "Workspace settings",
    "Manage your profile, defaults, integrations and API keys.",
  ],
};

const formats = {
  square: {
    label: "Square",
    ratio: "1:1",
    usage: "Instagram posts, marketplace products",
    width: 1080,
    height: 1080,
    className: "format-square",
  },
  portrait: {
    label: "Portrait",
    ratio: "4:5",
    usage: "Instagram and Facebook feeds",
    width: 1080,
    height: 1350,
    className: "format-portrait",
  },
  story: {
    label: "Story/Reel",
    ratio: "9:16",
    usage: "Stories, Reels, Shorts",
    width: 1080,
    height: 1920,
    className: "format-story",
  },
  landscape: {
    label: "Landscape",
    ratio: "16:9",
    usage: "YouTube, websites and presentations",
    width: 1920,
    height: 1080,
    className: "format-landscape",
  },
  linkedin: {
    label: "LinkedIn post",
    ratio: "1.91:1",
    usage: "LinkedIn sponsored content",
    width: 1200,
    height: 628,
    className: "format-linkedin",
  },
  marketplace: {
    label: "Marketplace",
    ratio: "1:1",
    usage: "Amazon, Flipkart and ecommerce",
    width: 2000,
    height: 2000,
    className: "format-square",
  },
};

const platformGuidance = {
  Instagram:
    "Keep product and headline away from top and bottom UI areas. Use short captions and 3-5 variations.",
  Facebook:
    "Use feed-safe framing, clear offer copy and multiple audience hooks.",
  YouTube: "Prioritize landscape or Shorts framing with strong opening text.",
  LinkedIn:
    "Use business-forward copy, restrained visuals and professional CTA language.",
  "Amazon/marketplace":
    "Use clean product focus, neutral background and marketplace-safe claims.",
  Website:
    "Leave room for layout crops, banners and responsive hero placement.",
  TikTok:
    "Use a vertical-first hook, fast pacing, native-feeling captions and a clear action in the first seconds.",
  "YouTube Shorts":
    "Use vertical framing, immediate visual context and concise captions that remain readable on mobile.",
  Pinterest:
    "Use inspiring vertical composition, clear product context and a save-worthy visual idea.",
  Podcast:
    "Prioritize clean stereo audio, a recognizable opening, consistent loudness and an uncluttered mix.",
  "Mobile app":
    "Use focused audio with clear pacing, comfortable loudness and no abrupt transitions.",
  Phone:
    "Keep speech exceptionally clear, concise and intelligible over narrow-band phone playback.",
  "In-store":
    "Use a seamless, unobtrusive mix with stable energy suitable for repeated ambient playback.",
  Game: "Build immersive spatial texture with a loop-friendly ending and enough headroom for gameplay effects.",
  Radio:
    "Lead with a strong audio hook, state the offer clearly and end with a memorable spoken CTA.",
  Venue:
    "Prioritize speech intelligibility, measured pacing and a mix that remains clear over a public-address system.",
  "Social ads":
    "Open with an immediate audio hook, keep the message compact and mix for phone speakers.",
};

const campaignSections = [
  [
    "Campaign Brief",
    [
      "Product name",
      "Target audience",
      "Objective",
      "Platforms",
      "Budget range",
    ],
  ],
  [
    "AI Strategy",
    [
      "Campaign concept",
      "Campaign name",
      "Audience segments",
      "Messaging angle",
    ],
  ],
  [
    "Content Plan",
    [
      "Headlines",
      "Ad copy",
      "Social captions",
      "Hashtags",
      "Reel/video scripts",
    ],
  ],
  [
    "Generated Assets",
    [
      "Product images",
      "Story creatives",
      "Generated videos",
      "Voiceover script",
    ],
  ],
  [
    "Publishing Calendar",
    ["Campaign duration", "Channel schedule", "Approval checkpoints"],
  ],
  [
    "Export Campaign",
    ["CTA variations", "Export presets", "Schedule-ready package"],
  ],
];

const pendingTemplateAssets = new Map();

async function loadTemplates(options = {}) {
  const query = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      query.set(key, String(value));
  });
  const response = await fetch(`/api/templates?${query}`, {
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Unable to load templates.");
  return result;
}

const workflowNodes = [
  "Product upload",
  "Background removal",
  "Prompt enhancement",
  "Image generation",
  "Image editing",
  "Image resizing",
  "Copy generation",
  "Video generation",
  "Voice generation",
  "Music generation",
  "Brand validation",
  "Manual approval",
  "Export",
  "Social publishing",
];
const campaignCountries = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "United Arab Emirates",
  "Singapore",
  "Germany",
  "France",
  "Japan",
  "Other",
];

const campaignStepCards = [
  { title: "Campaign Brief", doneStatus: "Completed" },
  { title: "AI Strategy", doneStatus: "Ready for review" },
  { title: "Content Plan", doneStatus: "Ready for review" },
  { title: "Generated Assets", doneStatus: "Waiting for approval" },
];

const assetEstimate = [
  ["3 product advertisement images", 15],
  ["1 Instagram carousel", 0],
  ["2 Story creatives", 10],
  ["1 fifteen-second Reel", null],
  ["Voiceover script", 5],
  ["Background music option", 0],
];
const CAMPAIGN_POLL_TIMEOUT_MS = 15 * 60 * 1000;

function downloadHref(url, name, type = "Video") {
  if (!url) return "#";
  const extension =
    type === "Video" && !/\.mp4$/i.test(name || "")
      ? ".mp4"
      : type === "Audio" && !/\.(mp3|wav|m4a|ogg)$/i.test(name || "")
        ? ".mp3"
        : "";
  // Locally-stored assets are same-origin, so the browser's native
  // `download` attribute already handles them without a proxy round-trip.
  if (url.startsWith("/")) return url;
  return `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${name || "creatora-video"}${extension}`)}`;
}

function downloadFilename(url, name, type = "Video") {
  const extension =
    type === "Video" && !/\.mp4$/i.test(name || "")
      ? ".mp4"
      : type === "Audio" && !/\.(mp3|wav|m4a|ogg)$/i.test(name || "")
        ? ".mp3"
        : type === "Image" && !/\.(png|jpe?g|webp)$/i.test(name || "")
          ? ".jpg"
          : "";
  return `${name || "creatora-video"}${extension}`;
}

function VideoPlayer({ src, className = "" }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const play = async () => {
    if (!videoRef.current) return;
    videoRef.current.muted = false;
    videoRef.current.volume = 1;
    try {
      await videoRef.current.play();
    } catch {}
  };
  return (
    <div className={`media-video-shell ${className}`}>
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        Your browser does not support video playback.
      </video>
      {!playing && (
        <button
          className="media-play-button"
          type="button"
          onClick={play}
          aria-label="Play video with sound"
        >
          <span aria-hidden="true">&#9654;</span>
          <small>Play with sound</small>
        </button>
      )}
    </div>
  );
}

function AudioPlayer({ src, className = "" }) {
  return (
    <div className={`media-audio-shell ${className}`}>
      <div className="audio-visualizer" aria-hidden="true">
        {[32, 58, 84, 46, 72, 96, 55, 78, 38, 66, 90, 48].map(
          (height, index) => (
            <i key={index} style={{ height: `${height}%` }} />
          ),
        )}
      </div>
      <audio src={src} controls preload="metadata">
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}

function VoiceVideoStudio() {
  const { authFetch } = useAuth();
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const runLock = useRef(false);
  const [recordingState, setRecordingState] = useState("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(15);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [outputPreference, setOutputPreference] = useState("AUTO");
  const [voiceInputId, setVoiceInputId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [brief, setBrief] = useState(null);
  const [settings, setSettings] = useState({
    voiceover: true,
    music: true,
    voiceGender: "Natural",
    accent: "Neutral",
    language: "English",
    speakingSpeed: "Normal",
    musicVolume: 35,
    voiceoverVolume: 85,
  });
  const [avatarMode, setAvatarMode] = useState("none");
  const [avatarSource, setAvatarSource] = useState("stock");
  const [selectedAvatarId, setSelectedAvatarId] = useState("aanya");
  const [avatarModel, setAvatarModel] = useState("wan2.2-speech-to-video");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("/avatars/presenters/aanya.webp");
  const [avatarLanguage, setAvatarLanguage] = useState("en-IN");
  const [avatarVoice, setAvatarVoice] = useState("Calm_Woman");
  const [avatarStyle, setAvatarStyle] = useState("Natural");
  const [avatarScript, setAvatarScript] = useState("");
  const [avatarConsent, setAvatarConsent] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarPreviewLoading, setAvatarPreviewLoading] = useState(false);
  const [avatarScriptLoading, setAvatarScriptLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [generatedAsset, setGeneratedAsset] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (recordingState !== "recording") return undefined;
    const timer = setInterval(
      () => setRecordingSeconds((value) => value + 1),
      1000,
    );
    return () => clearInterval(timer);
  }, [recordingState]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  const handleAudioFile = (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("Voice recordings must be 25MB or smaller.");
      return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setTranscript("");
    setBrief(null);
    setVoiceInputId("");
    setVideoUrl("");
    setGeneratedAsset(null);
    setError("");
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error("Voice recording is not supported by this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        preferred ? { mimeType: preferred } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : "webm";
        handleAudioFile(
          new File(
            chunksRef.current,
            `voice-request-${Date.now()}.${extension}`,
            { type },
          ),
        );
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      setRecordingSeconds(0);
      setError("");
      setRecordingState("recording");
      recorder.start(500);
    } catch (reason) {
      setError(reason.message || "Microphone access failed.");
    }
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setRecordingState("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setRecordingState("recording");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecordingState("ready");
  };

  const processVoice = async () => {
    if (!audioFile || runLock.current) return;
    runLock.current = true;
    setError("");
    setStage("Transcribing request...");
    setProgress(12);
    try {
      const body = new FormData();
      body.append("audio", audioFile);
      body.append("duration", String(duration));
      body.append("aspectRatio", aspectRatio);
      body.append("outputType", outputPreference);
      body.append("recordingDuration", String(recordingSeconds));
      const response = await authFetch("/api/video/voice-input", {
        method: "POST",
        body,
      });
      setStage("Understanding your prompt...");
      setProgress(30);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Voice processing failed.");
      setVoiceInputId(result.voiceInput.id);
      setTranscript(result.voiceInput.transcript);
      setBrief(result.brief);
      setDuration(result.brief.duration);
      setAspectRatio(result.brief.aspectRatio);
      setStage("Brief ready for review");
      setProgress(40);
    } catch (reason) {
      setError(reason.message);
      setStage("");
      setProgress(0);
    } finally {
      runLock.current = false;
    }
  };

  const pollMedia = async (id) => {
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const response = await authFetch(
        `/api/video/jobs/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok && response.status !== 202)
        throw new Error(
          result.error || result.job?.error || "Media generation failed.",
        );
      setProgress(result.job?.progress || 55);
      setStage(
        result.job?.status === "GENERATING_VIDEO"
          ? "Generating video and synchronized sound..."
          : result.job?.status === "GENERATING_AUDIO"
            ? "Generating the audio track..."
          : result.job?.status || "Processing...",
      );
      if (result.job?.status === "FAILED")
        throw new Error(result.job.error || "Media generation failed.");
      if (result.job?.status === "COMPLETED" && result.job.outputUrl)
        return result.job;
    }
    throw new Error(
      "Generation is still processing. It will remain available in the Asset Library.",
    );
  };

  const generateVideo = async () => {
    if (!brief || !voiceInputId || runLock.current) return;
    if (avatarMode === "avatar") {
      if (brief.outputType === "AUDIO") { setError("Avatar Video requires a video output."); return; }
      if (!avatarConsent) { setError("Confirm that you have permission to use this image before generating the avatar video."); return; }
    }
    runLock.current = true;
    setError("");
    setVideoUrl("");
    setGeneratedAsset(null);
    const requestedType = brief.outputType === "AUDIO" ? "audio" : "video";
    setStage(`Creating asynchronous ${requestedType} job...`);
    setProgress(45);
    try {
      const approvedBrief = { ...brief, duration, aspectRatio };
      const body = new FormData();
      body.append("voiceInputId", voiceInputId);
      body.append("brief", JSON.stringify(approvedBrief));
      body.append("duration", String(duration));
      body.append("format", aspectRatio);
      body.append("settings", JSON.stringify(settings));
      if (avatarMode === "avatar") {
        let avatarFileForGeneration = avatarFile;
        if (avatarSource === "stock") {
          const stockAvatar = getStockAvatar(selectedAvatarId);
          if (!stockAvatar) throw new Error("Choose an available presenter.");
          const stockResponse = await fetch(stockAvatar.imageUrl);
          if (!stockResponse.ok) throw new Error("The selected presenter is unavailable.");
          const stockBlob = await stockResponse.blob();
          avatarFileForGeneration = new File([stockBlob], `${stockAvatar.id}.webp`, { type: "image/webp" });
        }
        if (!avatarFileForGeneration) throw new Error("Choose or upload a portrait before generating the avatar video.");
        body.append("avatarReference", avatarFileForGeneration);
        body.append("avatarConfig", JSON.stringify({
          enabled: true,
          source: avatarSource.toUpperCase(),
          avatarId: avatarSource === "stock" ? selectedAvatarId : null,
          language: avatarLanguage,
          voice: avatarVoice,
          style: avatarStyle,
          script: (avatarScript || transcript || brief.title).trim(),
          model: avatarModel,
          consentConfirmed: avatarConsent,
        }));
      }
      const response = await authFetch("/api/video/generate", { method: "POST", body });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to create video job.");
      const completed =
        result.job.status === "COMPLETED"
          ? result.job
          : await pollMedia(result.job.id);
      setVideoUrl(completed.outputUrl);
      setGeneratedAsset({ id: completed.assetId, assetId: completed.assetId, type: requestedType === "audio" ? "Audio" : "Video", outputUrl: completed.outputUrl, title: brief.title, prompt: brief.title });
      setProgress(100);
      setStage(`${requestedType === "audio" ? "Audio" : "Video"} ready`);
      // Credits were just spent — refresh immediately so the header pill and
      // sidebar credit figures drop as soon as the video is ready.
      fetchMuApiBalance(authFetch, { force: true })
        .then(broadcastMuApiBalance)
        .catch(() => {});
    } catch (reason) {
      setError(reason.message);
      setStage("Generation failed");
    } finally {
      runLock.current = false;
    }
  };

  const generateAvatarScript = async () => {
    const textToDescribe = avatarScript || transcript || brief?.title;
    if (!textToDescribe?.trim()) {
      setError("Speak or describe your idea before generating a script.");
      return;
    }
    setAvatarScriptLoading(true);
    try {
      const response = await authFetch("/api/tts/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToDescribe,
          duration,
          language: avatarLanguage,
          style: avatarStyle,
        }),
      });
      const res = await response.json();
      if (!response.ok) throw new Error(res.error || "Script generation failed.");
      setAvatarScript(res.script || "");
      setAvatarPreviewUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setAvatarScriptLoading(false);
    }
  };

  const previewAvatarVoice = async () => {
    const text = (avatarScript || transcript || brief?.title || "").trim();
    if (!text) {
      setError("Add a script or transcription before previewing the voice.");
      return;
    }
    setAvatarPreviewLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          language: avatarLanguage,
          voice: avatarVoice,
          style: avatarStyle,
          provider: "muapi",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to preview the avatar voice.");
      setAvatarPreviewUrl(result.audioUrl || "");
      fetchMuApiBalance(authFetch, { force: true })
        .then(broadcastMuApiBalance)
        .catch(() => {});
    } catch (reason) {
      setError(reason.message);
    } finally {
      setAvatarPreviewLoading(false);
    }
  };

  const updateScene = (index, key, value) =>
    setBrief((current) => ({
      ...current,
      scenes: current.scenes.map((scene, sceneIndex) =>
        sceneIndex === index
          ? { ...scene, [key]: key === "duration" ? Number(value) : value }
          : scene,
      ),
    }));
  const estimatedCredits = Math.ceil(duration * 2.6);

  return (
    <main className="workspace-page voice-video-studio">
      <div className="page-title">
        <div>
          <span>CREATORA STUDIO / VOICE TO VIDEO</span>
          <h1>Voice to Video Studio</h1>
          <p>
            Speak or upload your idea, approve the interpreted brief, then
            generate a campaign-ready video or audio track.
          </p>
        </div>
        <div className="voice-credit-estimate">
          <span>Estimated cost</span>
          <b>{estimatedCredits} credits</b>
        </div>
      </div>
      {error && <div className="agent-clarification">{error}</div>}
      <div className="voice-video-layout">
        <section className="generator-form voice-workflow">
          <div className="form-step">
            <span>1</span>
            <div>
              <h3>Record or upload your request</h3>
              <p>
                Speak naturally about the subject, output, style, platform,
                narration and CTA. Uploading a file is optional.
              </p>
            </div>
          </div>
          <div className={`voice-recorder ${recordingState}`}>
            <div className="voice-recorder-orb">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <b>
              {recordingState === "recording"
                ? "Recording"
                : recordingState === "paused"
                  ? "Paused"
                  : audioFile
                    ? "Recording ready"
                    : "Microphone ready"}
            </b>
            <span>
              {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
              {String(recordingSeconds % 60).padStart(2, "0")}
            </span>
            <div className="voice-recorder-actions">
              {!audioFile && recordingState === "idle" && (
                <button
                  className="button"
                  type="button"
                  onClick={startRecording}
                >
                  Speak now
                </button>
              )}
              {["recording", "paused"].includes(recordingState) && (
                <>
                  <button type="button" onClick={togglePause}>
                    {recordingState === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={stopRecording}
                  >
                    Stop
                  </button>
                </>
              )}
              {audioFile && (
                <button
                  type="button"
                  onClick={() => {
                    setAudioFile(null);
                    setAudioUrl("");
                    setRecordingState("idle");
                    setRecordingSeconds(0);
                    setBrief(null);
                  }}
                >
                  Re-record
                </button>
              )}
            </div>
          </div>
          {audioUrl && (
            <audio className="voice-playback" controls src={audioUrl}>
              Your browser does not support audio playback.
            </audio>
          )}
          <label className="voice-upload">
            Or upload audio
            <input
              type="file"
              accept="audio/webm,audio/wav,audio/mpeg,audio/mp4,audio/ogg,.m4a"
              onChange={(event) => handleAudioFile(event.target.files?.[0])}
            />
            <small>WebM, WAV, MP3, M4A, MP4 or OGG · maximum 25MB</small>
          </label>
          <div className="form-row">
            <label>
              Duration
              <select
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
              </select>
            </label>
            <label>
              Requested output
              <select
                value={outputPreference}
                onChange={(event) => setOutputPreference(event.target.value)}
              >
                <option value="AUTO">Detect from my voice</option>
                <option value="VIDEO">Video</option>
                <option value="AUDIO">Audio only</option>
              </select>
            </label>
          </div>
          {(brief?.outputType || outputPreference) !== "AUDIO" && (
            <label>
              Video format
              <select
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value)}
              >
                <option>9:16</option>
                <option>16:9</option>
                <option>1:1</option>
                <option>4:5</option>
              </select>
            </label>
          )}
          {!brief && (
            <>
              {(brief?.outputType || outputPreference) !== "AUDIO" && (
                <div className="voice-settings project-output-toggles">
                  <AvatarVideoControls
                    videoMode={avatarMode === "avatar" ? "avatar" : "ai"}
                    setVideoMode={(m) => setAvatarMode(m === "avatar" ? "avatar" : "none")}
                    showModeToggle={true}
                    avatarSource={avatarSource}
                    setAvatarSource={setAvatarSource}
                    avatarModel={avatarModel}
                    setAvatarModel={setAvatarModel}
                    selectedAvatarId={selectedAvatarId}
                    setSelectedAvatarId={setSelectedAvatarId}
                    avatarFile={avatarFile}
                    setAvatarFile={setAvatarFile}
                    avatarPreview={avatarPreview}
                    setAvatarPreview={setAvatarPreview}
                    avatarConsent={avatarConsent}
                    setAvatarConsent={setAvatarConsent}
                    voiceLanguage={avatarLanguage}
                    setVoiceLanguage={setAvatarLanguage}
                    voiceProfile={avatarVoice}
                    setVoiceProfile={setAvatarVoice}
                    voiceStyle={avatarStyle}
                    setVoiceStyle={setAvatarStyle}
                    voiceScript={avatarScript}
                    setVoiceScript={setAvatarScript}
                    generateVoiceScript={generateAvatarScript}
                    previewVoice={previewAvatarVoice}
                    voiceScriptLoading={avatarScriptLoading}
                    voicePreviewLoading={avatarPreviewLoading}
                    voicePreviewUrl={avatarPreviewUrl}
                    setNotice={setError}
                    scriptPlaceholder="Enter script or speak your idea..."
                  />
                </div>
              )}
              <button className="button generate" type="button" disabled={!audioFile || runLock.current} onClick={processVoice}>
                {stage || "Transcribe and create brief"}
              </button>
            </>
          )}
          {transcript && (
            <label>
              Transcription
              <textarea
                value={transcript}
                onChange={(event) => { setTranscript(event.target.value); setAvatarPreviewUrl(""); }}
                rows="4"
              />
              <small>
                Review the transcript before approving the media brief.
              </small>
            </label>
          )}
          {brief && (
            <div className="voice-brief">
              <div className="form-step">
                <span>2</span>
                <div>
                  <h3>Review interpreted brief</h3>
                  <p>
                    Edit any incorrect transcription or creative decision before
                    generation.
                  </p>
                </div>
              </div>
              <label>
                Title
                <input
                  value={brief.title}
                  onChange={(event) =>
                    setBrief({ ...brief, title: event.target.value })
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  Output type
                  <select
                    value={brief.outputType || "VIDEO"}
                    onChange={(event) =>
                      setBrief({ ...brief, outputType: event.target.value })
                    }
                  >
                    <option value="VIDEO">Video</option>
                    <option value="AUDIO">Audio only</option>
                  </select>
                </label>
                <label>
                  Platform
                  <input
                    value={brief.platform}
                    onChange={(event) =>
                      setBrief({ ...brief, platform: event.target.value })
                    }
                  />
                </label>
                <label>
                  Style
                  <input
                    value={brief.style}
                    onChange={(event) =>
                      setBrief({ ...brief, style: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="voice-scenes">
                <b>
                  {brief.outputType === "AUDIO" ? "Audio segments" : "Scenes"}
                </b>
                {brief.scenes.map((scene, index) => (
                  <article key={index}>
                    <span>{index + 1}</span>
                    <label>
                      Seconds
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={scene.duration}
                        onChange={(event) =>
                          updateScene(index, "duration", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {brief.outputType === "AUDIO"
                        ? "Sound prompt"
                        : "Visual prompt"}
                      <textarea
                        value={scene.visualPrompt}
                        onChange={(event) =>
                          updateScene(index, "visualPrompt", event.target.value)
                        }
                      />
                    </label>
                    {brief.outputType !== "AUDIO" && (
                      <label>
                        On-screen text
                        <input
                          value={scene.text}
                          onChange={(event) =>
                            updateScene(index, "text", event.target.value)
                          }
                        />
                      </label>
                    )}
                  </article>
                ))}
              </div>
              <label>
                Call to action
                <input
                  value={brief.callToAction}
                  onChange={(event) =>
                    setBrief({ ...brief, callToAction: event.target.value })
                  }
                />
              </label>
              <div className="voice-settings">
                {brief.outputType !== "AUDIO" && (
                  <AvatarVideoControls
                    videoMode={avatarMode === "avatar" ? "avatar" : "ai"}
                    setVideoMode={(m) => setAvatarMode(m === "avatar" ? "avatar" : "none")}
                    showModeToggle={true}
                    avatarSource={avatarSource}
                    setAvatarSource={setAvatarSource}
                    avatarModel={avatarModel}
                    setAvatarModel={setAvatarModel}
                    selectedAvatarId={selectedAvatarId}
                    setSelectedAvatarId={setSelectedAvatarId}
                    avatarFile={avatarFile}
                    setAvatarFile={setAvatarFile}
                    avatarPreview={avatarPreview}
                    setAvatarPreview={setAvatarPreview}
                    avatarConsent={avatarConsent}
                    setAvatarConsent={setAvatarConsent}
                    voiceLanguage={avatarLanguage}
                    setVoiceLanguage={setAvatarLanguage}
                    voiceProfile={avatarVoice}
                    setVoiceProfile={setAvatarVoice}
                    voiceStyle={avatarStyle}
                    setVoiceStyle={setAvatarStyle}
                    voiceScript={avatarScript}
                    setVoiceScript={setAvatarScript}
                    generateVoiceScript={generateAvatarScript}
                    previewVoice={previewAvatarVoice}
                    voiceScriptLoading={avatarScriptLoading}
                    voicePreviewLoading={avatarPreviewLoading}
                    voicePreviewUrl={avatarPreviewUrl}
                    setNotice={setError}
                    scriptPlaceholder="The editable transcription or script for your presenter video..."
                  />
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={settings.voiceover}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        voiceover: event.target.checked,
                      })
                    }
                  />{" "}
                  Voiceover
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.music}
                    onChange={(event) =>
                      setSettings({ ...settings, music: event.target.checked })
                    }
                  />{" "}
                  Background music
                </label>
                <label>
                  Voice
                  <select
                    value={settings.voiceGender}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        voiceGender: event.target.value,
                      })
                    }
                  >
                    <option>Natural</option>
                    <option>Female</option>
                    <option>Male</option>
                  </select>
                </label>
                <label>
                  Accent
                  <input
                    value={settings.accent}
                    onChange={(event) =>
                      setSettings({ ...settings, accent: event.target.value })
                    }
                  />
                </label>
                <label>
                  Language
                  <input
                    value={settings.language}
                    onChange={(event) =>
                      setSettings({ ...settings, language: event.target.value })
                    }
                  />
                </label>
                <label>
                  Speed
                  <select
                    value={settings.speakingSpeed}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        speakingSpeed: event.target.value,
                      })
                    }
                  >
                    <option>Slow</option>
                    <option>Normal</option>
                    <option>Fast</option>
                  </select>
                </label>
                <label>
                  Music volume <b>{settings.musicVolume}%</b>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.musicVolume}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        musicVolume: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Voice volume <b>{settings.voiceoverVolume}%</b>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.voiceoverVolume}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        voiceoverVolume: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <button
                className="button generate"
                type="button"
                disabled={runLock.current || (avatarMode === "avatar" && !avatarConsent)}
                onClick={generateVideo}
              >
                Generate {duration}s{" "}
                {brief.outputType === "AUDIO" ? "audio" : "video"} ·{" "}
                {estimatedCredits} credits
              </button>
            </div>
          )}
        </section>
        <aside className="preview-panel voice-video-preview">
          <div className="preview-head">
            <span>
              {brief?.outputType === "AUDIO" ? "AUDIO" : "VIDEO"} PREVIEW
            </span>
            <b>
              {brief?.outputType === "AUDIO" ? `${duration}s` : aspectRatio}
            </b>
          </div>
          <div className="empty-preview">
            <div
              className={`format-frame ${brief?.outputType === "AUDIO" ? "format-audio" : aspectRatio === "9:16" ? "format-story" : aspectRatio === "16:9" ? "format-landscape" : aspectRatio === "4:5" ? "format-portrait" : "format-square"}`}
            >
              {videoUrl ? (
                brief?.outputType === "AUDIO" ? (
                  <AudioPlayer className="generated-media" src={videoUrl} />
                ) : (
                  <VideoPlayer className="generated-media" src={videoUrl} />
                )
              ) : (
                <div className="voice-preview-empty">
                  <CreateoraSparkle
                    state={runLock.current ? "generating" : error ? "error" : "idle"}
                    size={72}
                    label="Voice to video generation"
                  />
                  <b>
                    Your generated{" "}
                    {brief?.outputType === "AUDIO" ? "audio" : "video"} will
                    appear here
                  </b>
                  <small>
                    The player appears after the provider returns a valid media
                    URL.
                  </small>
                </div>
              )}
              {runLock.current && (
                <div className="generation-loader" role="status" aria-live="polite">
                  <CreateoraSparkle
                    state="generating"
                    size={56}
                    label="Voice to video generation in progress"
                  />
                  <b>{stage}</b>
                  <div className="job-progress">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                  <small>{progress}% · duplicate submissions are blocked</small>
                </div>
              )}
            </div>
            {stage && !runLock.current && <p>{stage}</p>}
            {videoUrl && (
              <div className="card-actions">
                <a
                  className="button"
                  href={downloadHref(
                    videoUrl,
                    brief?.title || "voice-media",
                    brief?.outputType === "AUDIO" ? "Audio" : "Video",
                  )}
                  download={downloadFilename(
                    videoUrl,
                    brief?.title || "voice-media",
                    brief?.outputType === "AUDIO" ? "Audio" : "Video",
                  )}
                >
                  Download {brief?.outputType === "AUDIO" ? "audio" : "video"}
                </a>
                <button type="button" onClick={generateVideo}>
                  Regenerate
                </button>
                <Link href="/dashboard/assets">Open Asset Library</Link>
              </div>
            )}
            <SocialPublishButton
              asset={generatedAsset || { type: brief?.outputType === "AUDIO" ? "Audio" : "Video" }}
              authFetch={authFetch}
              notify={setError}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function viewPlanFromCampaign(campaign) {
  const source = campaign.plan;
  return {
    name: source.campaignName,
    concept: source.concept,
    segments: source.audienceSegments,
    angle: source.messagingAngle,
    positioning: source.positioning,
    platformRecommendations: source.platformRecommendations || [],
    headlines: source.headlines,
    adCopy:
      source.adCopy
        ?.map(
          (item) =>
            `${item.platform}: ${item.primaryText}\nHeadline: ${item.headline}\nCTA: ${item.callToAction}`,
        )
        .join("\n\n") || "",
    caption: source.socialCaptions?.join("\n\n") || "",
    hashtags: source.hashtags,
    videoScripts: source.videoScripts || [],
    calendar:
      source.publishingCalendar?.map(
        (item) => `${item.day}: ${item.activity} (${item.channel})`,
      ) || [],
    assetRecommendations: source.assetRecommendations || [],
    source: campaign.source,
  };
}

function assetRowsFromRecommendations(recommendations) {
  if (!recommendations?.length)
    return assetEstimate.map(([item, credits]) => ({ item, credits }));
  return recommendations.map((recommendation) => ({
    item:
      recommendation.title ||
      `${recommendation.quantity || 1} ${recommendation.type}`,
    credits: recommendation.estimatedCredits == null
      ? null
      : Number(recommendation.estimatedCredits),
    recommendation,
  }));
}

function InlineVoiceProjectInput({ authFetch, duration, aspectRatio, onTranscript }) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const selectAudio = (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return setError("Voice recordings must be 25MB or smaller.");
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setError("");
  };
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        selectAudio(new File(chunksRef.current, `project-voice-${Date.now()}.webm`, { type: recorder.mimeType || "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(500);
      setRecording(true);
    } catch (reason) { setError(reason.message || "Microphone access failed."); }
  };
  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };
  const transcribe = async () => {
    if (!audioFile || processing) return;
    setProcessing(true);
    setError("");
    try {
      const body = new FormData();
      body.append("audio", audioFile);
      body.append("duration", String(duration));
      body.append("aspectRatio", aspectRatio);
      body.append("outputType", "AUTO");
      const response = await authFetch("/api/video/voice-input", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Voice transcription failed.");
      onTranscript(result.voiceInput.transcript);
    } catch (reason) { setError(reason.message); }
    finally { setProcessing(false); }
  };

  return (
    <section className="inline-project-mode-panel">
      <div className="form-step"><span>2</span><div><h3>Describe the project with your voice</h3><p>Record or upload audio, then convert it into the project brief below.</p></div></div>
      <div className="inline-voice-actions">
        <button className="button" type="button" onClick={recording ? stop : start}>{recording ? "Stop recording" : "Record voice"}</button>
        <label className="button secondary">Upload audio<input type="file" hidden accept="audio/*,.m4a" onChange={(event) => selectAudio(event.target.files?.[0])} /></label>
      </div>
      {audioUrl && <audio controls src={audioUrl} />}
      {audioFile && <button type="button" className="button secondary" disabled={processing} onClick={transcribe}>{processing ? "Transcribing…" : "Use voice description"}</button>}
      {error && <p className="input-error">{error}</p>}
    </section>
  );
}

export default function WorkspacePage() {
  const { authFetch, organization } = useAuth();
  const isOrganizationWorkspace = organization?.accountType === "ORGANIZATION";
  const params = useParams();
  const searchParams = useSearchParams();
  const section = params.section || "create";
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("Luxury");
  const [platform, setPlatform] = useState("Instagram");
  const [format, setFormat] = useState("square");
  const [prompt, setPrompt] = useState(() =>
    searchParams.get("template")
      ? `Create a ${searchParams.get("template")} for my brand`
      : searchParams.get("prompt") || "",
  );
  const [imageName, setImageName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [referenceFile, setReferenceFile] = useState(null);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [generatedKind, setGeneratedKind] = useState("image");
  const [generatedAsset, setGeneratedAsset] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [videoDuration, setVideoDuration] = useState(5);
  const [projectName, setProjectName] = useState("");
  const [outputType, setOutputType] = useState("IMAGE");
  const [inputMode, setInputMode] = useState("text");
  const [campaignAudience, setCampaignAudience] = useState("");
  const [campaignObjective, setCampaignObjective] = useState("Product launch");
  const [campaignOffer, setCampaignOffer] = useState("");
  const [voiceMode, setVoiceMode] = useState("none");
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");
  const [voiceProfile, setVoiceProfile] = useState("alloy");
  const [voiceStyle, setVoiceStyle] = useState("Natural");
  const [voiceScript, setVoiceScript] = useState("");
  const [voiceScriptLoading, setVoiceScriptLoading] = useState(false);
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState("");
  const [voicePreviewDuration, setVoicePreviewDuration] = useState(null);
  const [videoMode, setVideoMode] = useState("ai");
  const [avatarSource, setAvatarSource] = useState("stock");
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarConsent, setAvatarConsent] = useState(false);
  const [avatarModel, setAvatarModel] = useState(AVATAR_MODEL_OPTIONS[0]?.value || "");
  const [voiceover, setVoiceover] = useState(false);
  const [music, setMusic] = useState(true);
  const [callToAction, setCallToAction] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [brandKit, setBrandKit] = useState(null);
  const [brandKitLoading, setBrandKitLoading] = useState(false);
  const [brandKitError, setBrandKitError] = useState(false);
  const [applyBrandKit, setApplyBrandKit] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [generationStage, setGenerationStage] = useState("");
  const [generationError, setGenerationError] = useState("");
  const generationInFlight = useRef(false);
  const [title, subtitle] = details[section] || details.create;
  const activeFormat = formats[format];

  useEffect(() => {
    if (!isOrganizationWorkspace || !section || !["create", "image", "video"].includes(section)) return;
    let cancelled = false;
    setBrandKitLoading(true);
    setBrandKitError(false);
    setBrandKit(null);
    setBrandColors("");
    setCallToAction("");
    authFetch("/api/brand-kit", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load brand kit.");
        if (!cancelled) {
          setBrandKit(result.brandKit || null);
          setBrandColors((result.brandKit?.brandColors || [result.brandKit?.primaryColor, result.brandKit?.secondaryColor]).filter(Boolean).join(", "));
          setCallToAction((current) => current || result.brandKit?.defaultCallToAction || "");
        }
      })
      .catch(() => { if (!cancelled) setBrandKitError(true); })
      .finally(() => { if (!cancelled) setBrandKitLoading(false); });
    return () => { cancelled = true; };
  }, [authFetch, isOrganizationWorkspace, section]);

  useEffect(() => {
    const templateId = searchParams.get("template");
    if (!templateId || !["image", "video"].includes(section)) return;
    let cancelled = false;
    fetch(`/api/templates?slug=${encodeURIComponent(templateId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load template.");
        return result.template;
      })
      .then((template) => {
        if (cancelled) return;
        const transferred = pendingTemplateAssets.get(template.id);
        setSelected(template.style || "Luxury");
        setPlatform(
          Object.keys(platformGuidance).find((item) =>
            template.platform?.includes(item),
          ) || "Instagram",
        );
        setFormat(
          Object.keys(formats).find(
            (key) => formats[key].ratio === template.format,
          ) || "square",
        );
        setVideoDuration(
          Math.min(30, Math.max(5, Number.parseInt(template.duration, 10) || 5)),
        );
        setPrompt(
          [
            template.prompt,
            transferred?.details,
            transferred?.offer ? `Offer: ${transferred.offer}` : "",
            transferred?.brandColors
              ? `Brand colours: ${transferred.brandColors}`
              : "",
            template.cta ? `CTA: ${template.cta}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 500),
        );
        if (transferred?.productFile) {
          setReferenceFile(transferred.productFile);
          setImageName(transferred.productFile.name);
          setImagePreview(URL.createObjectURL(transferred.productFile));
        }
      })
      .catch((reason) => setNotice(reason.message));
    return () => {
      cancelled = true;
    };
  }, [searchParams, section]);

  useEffect(() => {
    if (!generating) return undefined;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [generating]);

  const waitForGeneration = async (requestId, kind) => {
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const response = await authFetch(
        `/api/generation-jobs/${encodeURIComponent(requestId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (response.status === 202) {
        continue;
      }
      if (!response.ok)
        throw new Error(result.error || "The generation request failed.");
      if (result.job?.status === "FAILED" || result.job?.status === "CANCELLED")
        throw new Error(result.job.error || "The generation request failed.");
      if (!result.job?.asset?.outputUrl)
        throw new Error("Generation completed without a media output.");
      return {
        ...result.job,
        kind,
        requestId: result.job.id,
        url: result.job.asset.outputUrl,
        cost: { amount_credits: result.job.chargedCredits || 0 },
      };
    }
    throw new Error(
      "Generation is still running after 30 minutes. Please try again later.",
    );
  };

  const voiceOptions = getVoiceOptions(voiceLanguage);
  const avatarVoiceOptions = [
    { value: "Friendly_Person", label: "Friendly Person" },
    { value: "Calm_Woman", label: "Calm Woman" },
    { value: "Inspirational_girl", label: "Inspirational Girl" },
    { value: "Lively_Girl", label: "Lively Girl" },
    { value: "English_Upbeat_Woman", label: "English Upbeat Woman" },
  ];
  const activeVoiceOptions = videoMode === "avatar" ? avatarVoiceOptions : voiceOptions;
  const avatarInputReady = Boolean(getStockAvatar(selectedAvatarId) || avatarFile);
  const voiceStyleOptions = getLanguageConfig(voiceLanguage).styles || ["Natural", "Professional", "Energetic", "Calm"];

  useEffect(() => {
    if (section !== "video") return;
    if (avatarSource === "stock") {
      const stockAvatar = getStockAvatar(selectedAvatarId);
      setAvatarPreview(stockAvatar?.imageUrl || "");
      setAvatarConsent(false);
    }
  }, [avatarSource, selectedAvatarId, section]);

  useEffect(() => {
    if (!activeVoiceOptions.some((voice) => voice.value === voiceProfile)) {
      setVoiceProfile(activeVoiceOptions[0]?.value || "alloy");
    }
  }, [voiceLanguage, activeVoiceOptions, voiceProfile, videoMode]);

  const generateVoiceScript = async () => {
    if (!prompt.trim()) {
      setNotice("Describe the video before generating a script.");
      return;
    }
    setVoiceScriptLoading(true);
    setNotice("");
    try {
      const response = await authFetch("/api/tts/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          duration: videoDuration,
          language: voiceLanguage,
          style: voiceStyle,
          applyBrandKit: isOrganizationWorkspace && applyBrandKit,
          campaign: campaignObjective || "",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate the voice script.");
      setVoiceScript(result.script || "");
      setNotice("Voice script generated.");
      setVoiceMode("ai");
      setVoicePreviewUrl("");
    } catch (error) {
      setNotice(error.message || "Unable to generate the script.");
    } finally {
      setVoiceScriptLoading(false);
    }
  };

  const previewVoice = async () => {
    if (!voiceScript.trim()) {
      setNotice("Add a script before previewing the voice.");
      return;
    }
    setVoicePreviewLoading(true);
    setNotice("");
    try {
      const response = await authFetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: voiceScript,
          language: voiceLanguage,
          voice: voiceProfile,
          style: voiceStyle,
          provider: videoMode === "avatar" ? "muapi" : "openai",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to preview the voice.");
      setVoicePreviewUrl(result.audioUrl || "");
      setVoicePreviewDuration(Number(result.duration || 0));
      setNotice("Voice preview ready.");
      fetchMuApiBalance(authFetch, { force: true })
        .then(broadcastMuApiBalance)
        .catch(() => {});
    } catch (error) {
      setNotice(error.message || "Unable to preview the voice.");
    } finally {
      setVoicePreviewLoading(false);
    }
  };

  const [showMuApiConnect, setShowMuApiConnect] = useState(false);
  const [muApiStatus, setMuApiStatus] = useState(null);

  useEffect(() => {
    authFetch("/api/integrations/muapi", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok) setMuApiStatus(result);
      })
      .catch(() => {});
  }, [authFetch]);

  const generate = async () => {
    if (generationInFlight.current) return;
    const avatarWorkflowEnabled = (section === "video" || section === "create") && videoMode === "avatar" && (section === "video" || ["VIDEO", "IMAGE_VIDEO"].includes(outputType));
    if (!prompt.trim()) {
      setNotice("Describe the project before creating it.");
      return;
    }
    if (section === "create" && inputMode === "upload" && !referenceFile) {
      setNotice("Choose a product or reference image before creating this project.");
      return;
    }
    if (voiceMode === "ai" && !voiceScript.trim()) {
      setNotice("Add a script before generating a video with AI voice over.");
      return;
    }
    if (avatarWorkflowEnabled) {
      if (!voiceScript.trim()) {
        setNotice("Add a script before generating the avatar video.");
        return;
      }
      if (avatarSource === "upload" && !avatarFile) {
        setNotice("Upload a portrait before generating the avatar video.");
        return;
      }
      if (avatarSource === "stock" && !selectedAvatarId) {
        setNotice("No presenter avatars have been added yet. Upload your photo to continue.");
        return;
      }
      if (!avatarConsent) {
        setNotice("Confirm that you have permission to use this image before generating the avatar video.");
        return;
      }
    }
    // BYOK: Check MuAPI connection before generation
    if (muApiStatus && !muApiStatus.connected) {
      if (muApiStatus.canManage) setShowMuApiConnect(true);
      else setNotice("MuAPI is not connected for this organization. Ask an organization owner or admin to connect MuAPI.");
      return;
    }
    const requestedOutput =
      section === "video"
        ? "VIDEO"
        : section === "image"
          ? "IMAGE"
          : inputMode === "campaign"
            ? "CAMPAIGN_PACKAGE"
            : outputType;
    const kinds = ["IMAGE_VIDEO", "CAMPAIGN_PACKAGE"].includes(requestedOutput)
      ? ["image", "video"]
      : [requestedOutput === "VIDEO" ? "video" : requestedOutput === "AUDIO" ? "audio" : "image"];
    generationInFlight.current = true;
    setGenerating(true);
    setGenerationStage(
      referenceFile
        ? "Uploading reference image..."
        : "Submitting generation request...",
    );
    setGeneratedUrl("");
    setGeneratedAsset(null);
    setNotice("Creating the project record...");
    let project;
    let campaignId = "";
    try {
      let avatarFileForGeneration = avatarFile;
      if (avatarWorkflowEnabled && avatarSource === "stock") {
        const stockAvatar = getStockAvatar(selectedAvatarId);
        if (!stockAvatar) throw new Error("Choose an available stock avatar.");
        const stockResponse = await fetch(stockAvatar.imageUrl);
        if (!stockResponse.ok) throw new Error("The selected stock avatar is unavailable.");
        const stockBlob = await stockResponse.blob();
        avatarFileForGeneration = new File([stockBlob], `${stockAvatar.id}.png`, { type: stockBlob.type || "image/png" });
      }
      const referenceFileForGeneration = avatarWorkflowEnabled ? avatarFileForGeneration : referenceFile;
      const enhancedPrompt = [
        prompt,
        inputMode === "campaign" && campaignAudience ? `Audience: ${campaignAudience}` : "",
        inputMode === "campaign" ? `Campaign objective: ${campaignObjective}` : "",
        inputMode === "campaign" && campaignOffer ? `Offer: ${campaignOffer}` : "",
        `Platform: ${platform}. Format: ${activeFormat.label} ${activeFormat.ratio}. ${platformGuidance[platform]}`,
      ].filter(Boolean).join("\n\n");
      const voiceoverConfig = voiceMode === "ai"
        ? {
            enabled: true,
            mode: "ai",
            language: voiceLanguage,
            voice: voiceProfile,
            style: voiceStyle,
            script: voiceScript.trim(),
          }
        : { enabled: false, mode: "none", language: voiceLanguage, voice: voiceProfile, style: voiceStyle, script: "" };
      const configuration = {
        creativeDirection: selected,
        platform,
        format: activeFormat.label,
        aspectRatio: activeFormat.ratio,
        outputType: requestedOutput,
        videoDuration,
        voiceover: videoMode === "avatar" || voiceMode === "ai" || voiceover,
        music,
        callToAction,
        brandColors,
        referenceFileName: referenceFileForGeneration?.name || null,
        campaignAudience: campaignAudience || null,
        campaignObjective: inputMode === "campaign" ? campaignObjective : null,
        campaignOffer: campaignOffer || null,
        brandKitApplied: isOrganizationWorkspace && applyBrandKit,
        voiceOverEnabled: videoMode === "avatar" || voiceMode === "ai",
        voiceLanguage: voiceLanguage,
        voiceProvider: videoMode === "avatar" ? "muapi" : voiceMode === "ai" ? "openai" : null,
        voiceId: voiceMode === "ai" ? voiceProfile : null,
        voiceStyle: voiceMode === "ai" ? voiceStyle : null,
        script: videoMode === "avatar" || voiceMode === "ai" ? voiceScript.trim() : "",
        voiceoverConfig,
        generationType: videoMode === "avatar" ? "AVATAR_VIDEO" : null,
        avatarSource: videoMode === "avatar" ? avatarSource.toUpperCase() : null,
        avatarId: videoMode === "avatar" && avatarSource === "stock" ? selectedAvatarId : null,
        avatarModel: videoMode === "avatar" ? avatarModel : null,
        avatarConsent: videoMode === "avatar" ? avatarConsent : false,
      };
      const createResponse = await authFetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim() || prompt.trim().slice(0, 60),
          description: prompt.trim(),
          prompt: enhancedPrompt,
          inputMethod: inputMode.toUpperCase(),
          platform,
          aspectRatio: activeFormat.ratio,
          outputType: requestedOutput,
          configuration,
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok)
        throw new Error(created.error || "Unable to create the project.");
      project = createProject({
        id: created.data.id,
        name: created.data.name,
        status: "NOT_STARTED",
        assets: 0,
        style: selected,
        prompt: enhancedPrompt,
        imageName,
        platform,
        format: activeFormat.ratio,
        outputType: requestedOutput,
        configuration,
        cost: 0,
      });
      if (inputMode === "campaign") {
        const campaignResponse = await authFetch("/api/workspace/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            name: project.name,
            productDescription: prompt.trim(),
            targetAudience: campaignAudience,
            objective: campaignObjective,
            offer: campaignOffer,
            platforms: [platform],
            contentPlan: configuration,
            status: "PLANNING",
          }),
        });
        const campaignResult = await campaignResponse.json();
        if (!campaignResponse.ok)
          throw new Error(campaignResult.error || "Unable to create the campaign.");
        campaignId = campaignResult.data.id;
      }
      if (referenceFileForGeneration) {
        const referenceBody = new FormData();
        referenceBody.append("projectId", project.id);
        if (campaignId) referenceBody.append("campaignId", campaignId);
        referenceBody.append("file", referenceFileForGeneration);
        const referenceResponse = await authFetch("/api/project-assets", {
          method: "POST",
          body: referenceBody,
        });
        if (!referenceResponse.ok) {
          const referenceError = await referenceResponse.json();
          throw new Error(referenceError.error || "Unable to link the reference asset.");
        }
      }
      await authFetch("/api/workspace/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: project.id,
          status: "IN_PROGRESS",
          configuration: { ...configuration, campaignId: campaignId || null },
        }),
      });
      if (campaignId)
        await authFetch("/api/workspace/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: campaignId, status: "GENERATING" }),
        });
      updateProject(project.id, { status: "IN_PROGRESS", progress: 10 });

      let lastResult;
      let thumbnailUrl = "";
      for (let index = 0; index < kinds.length; index += 1) {
        const kind = kinds[index];
        setGenerationStage(`Generating ${kind} ${index + 1} of ${kinds.length}...`);
        setNotice(`Sending the ${kind} request to MuAPI...`);
        const body = new FormData();
        body.append("kind", kind);
        body.append("projectId", project.id);
        if (campaignId) body.append("campaignId", campaignId);
        body.append("title", `${project.name} ${kind}`);
        body.append("prompt", enhancedPrompt);
        body.append("style", selected);
        body.append("platform", platform);
        body.append("format", activeFormat.label);
        body.append("aspectRatio", activeFormat.ratio);
        body.append("width", String(activeFormat.width));
        body.append("height", String(activeFormat.height));
        body.append("voiceover", String(videoMode === "avatar" || voiceMode === "ai" || voiceover));
        body.append("music", String(music));
        body.append("callToAction", callToAction || "");
        body.append("applyBrandKit", String(isOrganizationWorkspace && applyBrandKit));
        body.append("voiceoverConfig", JSON.stringify({
          enabled: voiceMode === "ai",
          mode: voiceMode,
          language: voiceLanguage,
          voice: voiceProfile,
          style: voiceStyle,
          script: voiceScript.trim(),
        }));
        body.append("avatarConfig", JSON.stringify({
          enabled: avatarWorkflowEnabled && kind === "video",
          source: avatarSource,
          avatarId: avatarSource === "stock" ? selectedAvatarId : null,
          model: avatarModel,
          language: voiceLanguage,
          voice: voiceProfile,
          style: voiceStyle,
          script: voiceScript.trim(),
          consentConfirmed: avatarConsent,
        }));
        if (["video", "audio"].includes(kind)) body.append("duration", String(videoDuration));
        const referenceForKind = avatarWorkflowEnabled ? (kind === "video" ? referenceFileForGeneration : null) : referenceFile;
        if (referenceForKind && kind !== "audio") body.append("reference", referenceForKind);
        const response = await authFetch("/api/generation-jobs", { method: "POST", body });
        const submission = await response.json();
        if (!response.ok)
          throw new Error(submission.error || `The ${kind} generation request failed.`);
        if (!submission.job?.id)
          throw new Error("The generation service did not return a job ID.");
        const result = await waitForGeneration(submission.job.id, kind);
        lastResult = result;
        if (kind === "image") thumbnailUrl = result.url;
        setGeneratedAsset({
          id: result.asset?.id,
          assetId: result.asset?.id,
          type: kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Image",
          outputUrl: result.url,
          prompt: enhancedPrompt,
          platform,
        });
        addAsset({
          id: result.asset?.id,
          name: `${project.name} ${kind}`,
          projectId: project.id,
          campaignId: campaignId || null,
          prompt: enhancedPrompt,
          style: selected,
          type: kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Image",
          url: result.url,
          outputUrl: result.url,
          status: "Ready",
          platform,
          format: activeFormat.label,
          aspectRatio: activeFormat.ratio,
          duration: ["video", "audio"].includes(kind) ? videoDuration : null,
          providerJobId: result.requestId || null,
        });
        updateProject(project.id, { assets: index + 1, progress: Math.round(((index + 1) / kinds.length) * 100) });
      }
      // Only an image may be stored as the project thumbnail: an <img> tag cannot
      // decode a video/audio file, so persisting lastResult.url for those kinds left
      // every video project with a permanently broken tile.
      const isImageUrl = (url) => typeof url === "string" && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
      const completedThumbnailUrl = [thumbnailUrl, lastResult?.url, lastResult?.thumbnailUrl].find(isImageUrl) || null;
      await authFetch("/api/workspace/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, status: "COMPLETED", thumbnailUrl: completedThumbnailUrl }),
      });
      updateProject(project.id, { status: "COMPLETED", progress: 100, outputUrl: lastResult?.url, thumbnailUrl: completedThumbnailUrl || "", updated: "just now" });
      if (campaignId)
        await authFetch("/api/workspace/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: campaignId, status: "COMPLETED" }),
        });
      setGeneratedUrl(lastResult?.url || "");
      setGeneratedKind(lastResult?.kind || kinds.at(-1));
      setGenerationStage("");
      setNotice(`Project created with ID ${project.id}. Its assets are ready in the project and Asset Library.`);
      // Credits were just spent, so bypass the balance throttle and push the new
      // figure to every mounted widget (header pill, sidebar, billing page).
      fetchMuApiBalance(authFetch, { force: true })
        .then(broadcastMuApiBalance)
        .catch(() => {});
    } catch (error) {
      if (project?.id) {
        updateProject(project.id, { status: "FAILED", updated: "just now" });
        await authFetch("/api/workspace/projects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: project.id, status: "FAILED" }),
        }).catch(() => {});
      }
      if (campaignId)
        await authFetch("/api/workspace/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: campaignId, status: "FAILED" }),
        }).catch(() => {});
      setNotice(error.message);
    } finally {
      generationInFlight.current = false;
      setGenerating(false);
      setGenerationStage("");
    }
  };

  if (
    [
      "projects",
      "assets",
      "templates",
      "credits",
      "settings",
    ].includes(section)
  )
    return (
      <CollectionPage section={section} title={title} subtitle={subtitle} />
    );
  if (section === "team" || section === "brand-kit") {
    if (organization?.accountType !== "ORGANIZATION") return <AccountScopeNotice section={section} />;
    if (section === "team") return <TeamPage />;
    return <CollectionPage section={section} title={title} subtitle={subtitle} />;
  }
  if (section === "workflows") return <AccountScopeNotice section={section} />;
  if (section === "campaign") return <CampaignAgentV2 />;
  if (section === "ads") return <AdCreator />;
  if (section === "voice-video") return <VoiceVideoStudio />;

  return (
    <main
      className={`workspace-page studio-generator-page ${section === "create" ? "create-project-page" : ""}`}
    >
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>
            {section === "create"
              ? "PROJECTS / CREATE NEW PROJECT"
              : `CREATORA STUDIO / ${section.toUpperCase()}`}
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <Link href="/studio" className="studio-link">
          Open advanced studio
        </Link>
      </div>
      {section === "create" && (
        <nav className="create-mode-selector" aria-label="Creation input mode">
          <span>Create with:</span>
          {[
            ["text", "Text"],
            ["voice", "Voice"],
            ["upload", "Upload reference"],
            ["campaign", "Campaign"],
          ].map(([mode, label]) => (
            <button
              type="button"
              className={inputMode === mode ? "active" : ""}
              onClick={() => {
                setInputMode(mode);
                if (mode === "campaign") setOutputType("CAMPAIGN_PACKAGE");
                else if (outputType === "CAMPAIGN_PACKAGE") setOutputType("IMAGE");
              }}
              key={mode}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="generator-layout">
        <section className="generator-form">
          {section === "create" && (
            <>
              <div className="form-step">
                <span>1</span>
                <div>
                  <h3>Project information</h3>
                  <p>Give this project a recognizable name.</p>
                </div>
              </div>
              <label>
                Project name
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Example: Wireless headphones launch"
                  maxLength="200"
                />
              </label>
            </>
          )}
          {section === "create" && inputMode === "voice" && (
            <InlineVoiceProjectInput
              authFetch={authFetch}
              duration={videoDuration}
              aspectRatio={activeFormat.ratio}
              onTranscript={(value) => {
                setPrompt(value);
                setNotice("Voice description added to the project brief.");
              }}
            />
          )}
          {section === "create" && inputMode === "campaign" && (
            <section className="inline-project-mode-panel campaign-mode-panel">
              <div className="form-step">
                <span>2</span>
                <div>
                  <h3>Campaign brief</h3>
                  <p>Define the audience, objective, and offer for a connected asset package.</p>
                </div>
              </div>
              <div className="form-row">
                <label>
                  Target audience
                  <input value={campaignAudience} onChange={(event) => setCampaignAudience(event.target.value)} placeholder="Young professionals, 25–40" />
                </label>
                <label>
                  Objective
                  <select value={campaignObjective} onChange={(event) => setCampaignObjective(event.target.value)}>
                    <option>Product launch</option>
                    <option>Brand awareness</option>
                    <option>Lead generation</option>
                    <option>Sales conversion</option>
                  </select>
                </label>
              </div>
              <label>
                Campaign offer
                <input value={campaignOffer} onChange={(event) => setCampaignOffer(event.target.value)} placeholder="20% launch offer" />
              </label>
            </section>
          )}
          {section === "create" && inputMode === "upload" && (
            <div className="mode-guidance">Upload a product or reference below. You can still add text instructions to guide the result.</div>
          )}
          <div className="form-step">
            <span>{section === "create" ? 2 : 1}</span>
            <div>
              <h3>Add your product or reference</h3>
              <p>PNG, JPG or WebP up to 10MB</p>
            </div>
          </div>
          <label className="dropzone" id="reference-upload">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setReferenceFile(file || null);
                setImageName(file?.name || "");
                setImagePreview(file ? URL.createObjectURL(file) : "");
              }}
            />
            {imagePreview ? (
              <img
                className="upload-preview"
                src={imagePreview}
                alt="Selected product preview"
              />
            ) : (
              <b>+</b>
            )}
            <strong>
              {imageName || "Drop an image here or click to browse"}
            </strong>
            <small>
              {imageName
                ? section === "video"
                  ? "This image will be used as the videoâ€™s first frame and subject"
                  : "Reference will be uploaded securely"
                : "Optional reference image for image-to-image or image-to-video"}
            </small>
          </label>
          <div className="form-step">
            <span>{section === "create" ? 3 : 2}</span>
            <div>
              <h3>Choose a creative direction</h3>
              <p>You can fine-tune it with your description</p>
            </div>
          </div>
          <div className="style-options">
            {[
              "Luxury",
              "Minimal",
              "Cinematic",
              "Lifestyle",
              "UGC",
              "Playful",
            ].map((item) => (
              <button
                className={selected === item ? "selected" : ""}
                onClick={() => setSelected(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="field-label">
            Describe what you want to create <small>{prompt.length}/500</small>
          </label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength="500"
            placeholder="Example: Premium launch creative for a natural skincare serum, warm morning light, clean stone pedestal..."
          />
          <div className="form-row">
            <label>
              Platform
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                {Object.keys(platformGuidance).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                {Object.entries(formats).map(([key, item]) => (
                  <option value={key} key={key}>
                    {item.label} - {item.ratio}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {section === "create" && (
            <>
              <div className="form-row">
                <label>
                  Output
                  <select
                    value={outputType}
                    onChange={(event) => {
                      const val = event.target.value;
                      setOutputType(val);
                      if (val === "AVATAR_VIDEO") {
                        setVideoMode("avatar");
                      }
                    }}
                  >
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="AVATAR_VIDEO">Avatar Video</option>
                    <option value="AUDIO">Audio / Voiceover</option>
                    <option value="IMAGE_VIDEO">Image + Video</option>
                    <option value="CAMPAIGN_PACKAGE">Campaign Package</option>
                  </select>
                </label>
                <label>
                  Video duration
                  <select
                    value={videoDuration}
                    disabled={outputType === "IMAGE"}
                    onChange={(event) =>
                      setVideoDuration(Number(event.target.value))
                    }
                  >
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                    <option value="15">15 seconds</option>
                    <option value="30">30 seconds</option>
                  </select>
                </label>
              </div>
              {outputType === "IMAGE" && <div className="mode-guidance">Select Video, Avatar Video, or Image + Video to configure video and voice options.</div>}
              <div className="form-row">
                {isOrganizationWorkspace && <section className="apply-brand-kit-control" aria-label="Brand Kit">
                  <div className="apply-brand-kit-heading">
                    <strong>Brand Kit</strong>
                    {brandKitLoading ? <span>Loading Brand Kit...</span> : brandKit ? <span>✓ {brandKit.brandName || "Organization brand"}</span> : <span>{brandKitError ? "Unable to load Brand Kit" : "No Brand Kit configured"}</span>}
                  </div>
                  {!brandKitLoading && !brandKit && !brandKitError && <Link href="/dashboard/brand-kit">Set Up Brand Kit</Link>}
                  {brandKit && <>
                    <label className="toggle">
                      <input type="checkbox" checked={applyBrandKit} onChange={(event) => setApplyBrandKit(event.target.checked)} />
                      Apply Brand Kit
                    </label>
                    {applyBrandKit && <p>Applying: {(videoMode === "avatar"
                      ? ["Tone", "Audience", "CTA", "Video style"]
                      : outputType === "VIDEO" || outputType === "AVATAR_VIDEO" || outputType === "IMAGE_VIDEO" || section === "video"
                        ? ["Brand colors", "Video style", "Audience", "Tone", "CTA"]
                        : ["Brand colors", "Image style", "Audience", "Tone"]).join(" · ")}</p>}
                    <Link href="/dashboard/brand-kit">View Brand Kit</Link>
                  </>}
                </section>}
                <label>
                  Call-to-action
                  <input
                    value={callToAction}
                    onChange={(event) => setCallToAction(event.target.value)}
                    placeholder="Shop now"
                  />
                </label>
                {isOrganizationWorkspace && <label>
                  Brand colors
                  <input
                    value={brandColors}
                    onChange={(event) => setBrandColors(event.target.value)}
                    placeholder="#FF5A36, #101010"
                  />
                </label>}
              </div>
              {outputType !== "IMAGE" && (
                <div className="voice-settings project-output-toggles">
                  <AvatarVideoControls
                    videoMode={videoMode}
                    setVideoMode={setVideoMode}
                    showModeToggle={true}
                    avatarSource={avatarSource}
                    setAvatarSource={setAvatarSource}
                    avatarModel={avatarModel}
                    setAvatarModel={setAvatarModel}
                    selectedAvatarId={selectedAvatarId}
                    setSelectedAvatarId={setSelectedAvatarId}
                    avatarFile={avatarFile}
                    setAvatarFile={setAvatarFile}
                    avatarPreview={avatarPreview}
                    setAvatarPreview={setAvatarPreview}
                    avatarConsent={avatarConsent}
                    setAvatarConsent={setAvatarConsent}
                    voiceLanguage={voiceLanguage}
                    setVoiceLanguage={setVoiceLanguage}
                    voiceProfile={voiceProfile}
                    setVoiceProfile={setVoiceProfile}
                    voiceStyle={voiceStyle}
                    setVoiceStyle={setVoiceStyle}
                    voiceScript={voiceScript}
                    setVoiceScript={setVoiceScript}
                    generateVoiceScript={generateVoiceScript}
                    previewVoice={previewVoice}
                    voiceScriptLoading={voiceScriptLoading}
                    voicePreviewLoading={voicePreviewLoading}
                    voicePreviewUrl={voicePreviewUrl}
                    voicePreviewDuration={voicePreviewDuration}
                    setNotice={setNotice}
                  />
                  {videoMode === "ai" && (
                    <>
                      <div className="voice-mode-stack">
                        <label>
                          <input
                            type="radio"
                            name="voice-mode"
                            checked={voiceMode === "none"}
                            onChange={() => setVoiceMode("none")}
                          />{" "}
                          No Voice
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="voice-mode"
                            checked={voiceMode === "ai"}
                            onChange={() => setVoiceMode("ai")}
                          />{" "}
                          AI Voice
                        </label>
                      </div>
                      {voiceMode === "ai" && (
                        <div className="voice-controls-grid">
                          <label>
                            Language
                            <select value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)}>
                              <option value="en-IN">English</option>
                              <option value="hi-IN">Hindi</option>
                            </select>
                          </label>
                          <label>
                            Voice
                            <select value={voiceProfile} onChange={(event) => setVoiceProfile(event.target.value)}>
                              {voiceOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Voice Style
                            <select value={voiceStyle} onChange={(event) => setVoiceStyle(event.target.value)}>
                              {voiceStyleOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </label>
                          <label className="field-label full-width">
                            Script
                            <textarea
                              value={voiceScript}
                              onChange={(event) => setVoiceScript(event.target.value)}
                              rows={5}
                              lang={voiceLanguage}
                              placeholder={voiceLanguage === "hi-IN" ? "अपने बिज़नेस के लिए शानदार सोशल मीडिया कंटेंट बनाना" : "Write a clear product pitch and call to action..."}
                            />
                          </label>
                          <div className="voice-actions-row full-width">
                            <button type="button" className="button secondary" disabled={voiceScriptLoading} onClick={generateVoiceScript}>
                              {voiceScriptLoading ? "Generating script..." : "Generate Script"}
                            </button>
                            <button type="button" className="button secondary" disabled={voicePreviewLoading || !voiceScript.trim()} onClick={previewVoice}>
                              {voicePreviewLoading ? "Generating preview..." : "Preview Voice"}
                            </button>
                          </div>
                          {voicePreviewUrl && (
                            <div className="full-width audio-preview-box">
                              <audio controls src={voicePreviewUrl} />
                              {voicePreviewDuration ? <small>{voicePreviewDuration.toFixed(1)}s</small> : null}
                            </div>
                          )}
                        </div>
                      )}
                      <label>
                        <input
                          type="checkbox"
                          checked={voiceover}
                          onChange={(event) => setVoiceover(event.target.checked)}
                        />{" "}
                        Voiceover
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={music}
                          onChange={(event) => setMusic(event.target.checked)}
                        />{" "}
                        Music
                      </label>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {section === "video" && (
            <>
              <div className="voice-settings project-output-toggles">
                <b>Create video</b>
                <AvatarVideoControls
                  videoMode={videoMode}
                  setVideoMode={setVideoMode}
                  showModeToggle={true}
                  avatarSource={avatarSource}
                  setAvatarSource={setAvatarSource}
                  avatarModel={avatarModel}
                  setAvatarModel={setAvatarModel}
                  selectedAvatarId={selectedAvatarId}
                  setSelectedAvatarId={setSelectedAvatarId}
                  avatarFile={avatarFile}
                  setAvatarFile={setAvatarFile}
                  avatarPreview={avatarPreview}
                  setAvatarPreview={setAvatarPreview}
                  avatarConsent={avatarConsent}
                  setAvatarConsent={setAvatarConsent}
                  voiceLanguage={voiceLanguage}
                  setVoiceLanguage={setVoiceLanguage}
                  voiceProfile={voiceProfile}
                  setVoiceProfile={setVoiceProfile}
                  voiceStyle={voiceStyle}
                  setVoiceStyle={setVoiceStyle}
                  voiceScript={voiceScript}
                  setVoiceScript={setVoiceScript}
                  generateVoiceScript={generateVoiceScript}
                  previewVoice={previewVoice}
                  voiceScriptLoading={voiceScriptLoading}
                  voicePreviewLoading={voicePreviewLoading}
                  voicePreviewUrl={voicePreviewUrl}
                  voicePreviewDuration={voicePreviewDuration}
                  setNotice={setNotice}
                />
              </div>
              <div className="form-row"><label>Video length<select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value))}><option value="5">5 seconds - fastest</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option></select></label><div className="video-duration-note"><b>{videoMode === "avatar" ? "Speech-led avatar video" : "Native audio video"}</b><span>{videoMode === "avatar" ? "MuAPI creates a talking video from the selected portrait and generated speech." : "MiniMax H3 generates stereo sound and follows the attached image as its first frame."}</span></div></div>
            </>
          )}
          <div className="format-guidance">
            <b>
              {activeFormat.width} x {activeFormat.height}
            </b>
            <span>{activeFormat.usage}</span>
            <p>{platformGuidance[platform]}</p>
          </div>
          <button
            className="button generate"
            onClick={generate}
            disabled={generating || (section === "video" || section === "create") && videoMode === "avatar" && !avatarConsent}
          >
            {generating
              ? `Creating project... ${elapsedSeconds}s`
              : section === "create"
                ? "Create Project"
                : `Generate ${section === "video" ? `${videoDuration}s video` : "creative"}`}{" "}
            <span>
              {section === "video"
                ? "Cost varies by length"
                : "MuAPI - 5 credits+"}
            </span>
          </button>
        </section>
        <aside className="preview-panel">
          <div className="preview-head">
            <span>PREVIEW</span>
            <button
              type="button"
              onClick={() =>
                setPrompt(
                  "Premium product launch creative with warm studio light",
                )
              }
            >
              Reset
            </button>
          </div>
          <div className="empty-preview">
            <div className={`format-frame ${activeFormat.className}`}>
              {generatedUrl ? (
                generatedKind === "audio" ? (
                  <AudioPlayer className="generated-media" src={generatedUrl} />
                ) : generatedKind === "video" || section === "video" ? (
                  <VideoPlayer className="generated-media" src={generatedUrl} />
                ) : (
                  <img
                    className="generated-media"
                    src={generatedUrl}
                    alt="AI-generated result"
                  />
                )
              ) : imageName ? (
                <img
                  className="generated-media"
                  src={imagePreview}
                  alt="Selected preview"
                />
              ) : (
                <CreateoraSparkle
                  state={generating ? "generating" : generationError ? "error" : "idle"}
                  size={72}
                  label={`${section === "video" ? "Video" : "Image"} preview`}
                />
              )}
              {generating && (
                <div
                  className="generation-loader"
                  role="status"
                  aria-live="polite"
                >
                  <CreateoraSparkle
                    state="generating"
                    size={56}
                    label="Generation in progress"
                  />
                  <b>{generationStage || "Generating..."}</b>
                  <small>
                    {elapsedSeconds}s elapsed Â· one generation request is
                    active
                  </small>
                </div>
              )}
              <i />
              <i />
            </div>
            <h3>
              {activeFormat.label} {activeFormat.ratio}
            </h3>
            <p>
              {generatedUrl
                ? "This result has been saved to your Projects and Asset library."
                : generating
                  ? "Your preview will switch to the finished video automatically."
                  : `${platform} safe areas and export settings are applied to the request.`}
            </p>
            <div className="card-actions preview-actions">
              {generatedUrl && (
                <a
                  className="button media-download"
                  href={downloadHref(
                    generatedUrl,
                    prompt.trim().slice(0, 42) || `creatora-${generatedKind}`,
                    generatedKind === "video" ? "Video" : generatedKind === "audio" ? "Audio" : "Image",
                  )}
                  download={downloadFilename(
                    generatedUrl,
                    prompt.trim().slice(0, 42) || `creatora-${generatedKind}`,
                    generatedKind === "video" ? "Video" : generatedKind === "audio" ? "Audio" : "Image",
                  )}
                >
                  Download {generatedKind}
                </a>
              )}
              <SocialPublishButton asset={generatedAsset || {}} authFetch={authFetch} notify={(text) => setNotice(text)} />
            </div>
          </div>
          <div className="generation-tip">
            <b>Prompt enhancement</b>
            <p>{platformGuidance[platform]}</p>
          </div>
        </aside>
      </div>
      {showMuApiConnect && muApiStatus?.canManage && (
        <ConnectMuApiModal
          onClose={() => setShowMuApiConnect(false)}
          onConnected={() => {
            setShowMuApiConnect(false);
            authFetch("/api/integrations/muapi", { cache: "no-store" })
              .then(async (response) => {
                const result = await response.json();
                if (response.ok) setMuApiStatus(result);
              })
              .catch(() => {});
          }}
          initialStatus={muApiStatus}
          authFetch={authFetch}
          organizationName={muApiStatus.scope === "ORGANIZATION" ? organization?.name : null}
        />
      )}
    </main>
  );
}

function AdCreator() {
  const searchParams = useSearchParams();
  const { authFetch, organization } = useAuth();
  const isOrganizationWorkspace = organization?.accountType === "ORGANIZATION";
  const templateId = searchParams.get("template");
  const [preset, setPreset] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(Boolean(templateId));
  const [brandKit, setBrandKit] = useState(null);
  const [brandKitLoading, setBrandKitLoading] = useState(false);
  const [brandKitError, setBrandKitError] = useState(false);
  const [applyBrandKit, setApplyBrandKit] = useState(true);
  const [form, setForm] = useState({
    product: "",
    description: "",
    style: "Luxury",
    platform: "Instagram",
    format: "square",
    outputType: "Image + Video",
    duration: 5,
    cta: "",
    brandColors: "",
    voiceover: true,
    music: true,
  });
  const [videoMode, setVideoMode] = useState("ai");
  const [avatarSource, setAvatarSource] = useState("stock");
  const [selectedAvatarId, setSelectedAvatarId] = useState("aanya");
  const [avatarModel, setAvatarModel] = useState("wan2.2-speech-to-video");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("/avatars/presenters/aanya.webp");
  const [avatarConsent, setAvatarConsent] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");
  const [voiceProfile, setVoiceProfile] = useState("Calm_Woman");
  const [voiceStyle, setVoiceStyle] = useState("Natural");
  const [voiceScript, setVoiceScript] = useState("");
  const [voiceScriptLoading, setVoiceScriptLoading] = useState(false);
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState("");
  const [voicePreviewDuration, setVoicePreviewDuration] = useState(null);
  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreview, setReferencePreview] = useState("");
  const [plan, setPlan] = useState(null);
  const [outputs, setOutputs] = useState([]);
  const [activeOutput, setActiveOutput] = useState("video");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [failedJob, setFailedJob] = useState(null);
  const runLock = useRef(false);
  const activeFormat = formats[form.format];
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!isOrganizationWorkspace) {
      setBrandKit(null);
      return;
    }
    let cancelled = false;
    setBrandKitLoading(true);
    setBrandKitError(false);
    authFetch("/api/brand-kit", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load Brand Kit.");
        if (!cancelled) {
          setBrandKit(result.brandKit || null);
          setForm((current) => ({ ...current, cta: current.cta || result.brandKit?.defaultCallToAction || "" }));
        }
      })
      .catch(() => { if (!cancelled) { setBrandKit(null); setBrandKitError(true); } })
      .finally(() => { if (!cancelled) setBrandKitLoading(false); });
    return () => { cancelled = true; };
  }, [authFetch, isOrganizationWorkspace]);

  const generateVoiceScript = async () => {
    const textToDescribe = form.description || form.product;
    if (!textToDescribe.trim()) {
      setError("Enter product description before generating script.");
      return;
    }
    setVoiceScriptLoading(true);
    try {
      const response = await authFetch("/api/tts/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToDescribe,
          duration: form.duration,
          language: voiceLanguage,
          style: voiceStyle,
          applyBrandKit: isOrganizationWorkspace && applyBrandKit,
        }),
      });
      const res = await response.json();
      if (!response.ok) throw new Error(res.error || "Script generation failed.");
      setVoiceScript(res.script || "");
      setVoicePreviewUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setVoiceScriptLoading(false);
    }
  };

  const previewVoice = async () => {
    const textToSynthesize = voiceScript || form.description;
    if (!textToSynthesize.trim()) {
      setError("Add a script before previewing the voice.");
      return;
    }
    setVoicePreviewLoading(true);
    try {
      const response = await authFetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSynthesize,
          language: voiceLanguage,
          voice: voiceProfile,
          style: voiceStyle,
          provider: "muapi",
        }),
      });
      const res = await response.json();
      if (!response.ok) throw new Error(res.error || "Voice preview failed.");
      setVoicePreviewUrl(res.audioUrl || "");
      setVoicePreviewDuration(Number(res.duration || 0));
      fetchMuApiBalance(authFetch, { force: true })
        .then(broadcastMuApiBalance)
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setVoicePreviewLoading(false);
    }
  };
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    setTemplateLoading(true);
    fetch(`/api/templates?slug=${encodeURIComponent(templateId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load template.");
        return result.template;
      })
      .then((template) => {
        if (cancelled) return;
        const transferred = pendingTemplateAssets.get(template.id);
        const brandColors =
          transferred?.brandColors ||
          [workspaceBrand.primaryColor, workspaceBrand.accentColor]
            .filter(Boolean)
            .join(", ");
        const audioPreference =
          transferred?.mediaPreference || "Voiceover + music";
        const outputType = /campaign|image \+ video/i.test(
          template.outputType || "",
        )
          ? "Image + Video"
          : /audio/i.test(template.outputType || "")
            ? "Audio"
            : /video/i.test(template.outputType || "")
              ? "Video"
              : "Image";
        setPreset(template);
        setForm((current) => ({
          ...current,
          description: [
            `Template: ${template.name}\nExpected output: ${template.outputType}\n${template.prompt}`,
            transferred?.details,
            brandColors ? `Brand colours: ${brandColors}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          style: template.style || "Luxury",
          platform:
            Object.keys(platformGuidance).find((item) =>
              template.platform?.includes(item),
            ) || "Instagram",
          format:
            Object.keys(formats).find(
              (key) => formats[key].ratio === template.format,
            ) || "square",
          outputType,
          duration: Math.min(
            30,
            Math.max(5, Number.parseInt(template.duration, 10) || 5),
          ),
          cta: transferred?.offer || template.cta || "Shop Now",
          brandColors,
          voiceover: !/music only|ambient/i.test(audioPreference),
          music: !/voiceover only|ambient/i.test(audioPreference),
        }));
        if (transferred?.productFile) {
          setReferenceFile(transferred.productFile);
          setReferencePreview(URL.createObjectURL(transferred.productFile));
        }
      })
      .catch((reason) => setError(reason.message))
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);
  useEffect(() => {
    if (!running) return undefined;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [running]);

  const poll = async (jobId) => {
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const response = await authFetch(
        `/api/generation-jobs/${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (result.job?.progress != null) setProgress(result.job.progress);
      if (response.status === 202) {
        continue;
      }
      if (!response.ok || result.job?.status === "FAILED") {
        const failure = new Error(
          result.job?.error || result.error || "Media generation failed.",
        );
        failure.job = result.job || { id: jobId };
        throw failure;
      }
      return result.job;
    }
    throw new Error(
      "Generation is taking longer than expected. Check the Asset Library later.",
    );
  };

  const generateMedia = async (kind, creativePlan, projectId, campaignId) => {
    const body = new FormData();
    const copy = creativePlan.adCopy?.[0];
    const sceneDirection =
      creativePlan.scenes
        ?.map(
          (scene, index) =>
            `Scene ${index + 1} (${scene.duration}s): ${scene.visualPrompt}`,
        )
        .join(" ") || "";
    const direction =
      kind === "video"
        ? `${sceneDirection} Script: ${creativePlan.script || creativePlan.videoScripts?.[0]?.voiceover || form.description}. Keep the uploaded product as the main subject and finish with ${form.cta}. ${form.voiceover ? "Include a clear natural voiceover." : "No spoken voiceover."} ${form.music ? "Include polished background music." : "Use natural ambient sound only."}`
        : kind === "audio"
          ? `${form.description}. ${creativePlan.script || creativePlan.videoScripts?.[0]?.voiceover || ""} Audio direction: ${form.style}; platform: ${form.platform}; finish with ${form.cta}. Create a polished stereo mix with clear pacing and no copyrighted melodies.`
          : `${creativePlan.headlines?.[0] || form.product}. ${copy?.primaryText || form.description}. Product advertisement with CTA: ${form.cta}.`;
    body.append("kind", kind);
    body.append("campaignId", campaignId);
    body.append("title", `${form.product} ${kind} ad`);
    body.append("prompt", direction);
    body.append("applyBrandKit", String(isOrganizationWorkspace && applyBrandKit));
    body.append("callToAction", form.cta);
    body.append("platform", form.platform);
    body.append("aspectRatio", activeFormat.ratio);
    body.append("voiceover", String(form.voiceover));
    body.append("music", String(form.music));
    if (kind === "video" || kind === "audio")
      body.append("duration", String(form.duration));
    if (kind === "video" && videoMode === "avatar") {
      let avatarFileForGeneration = avatarFile;
      if (avatarSource === "stock") {
        const stockAvatar = getStockAvatar(selectedAvatarId);
        if (stockAvatar) {
          const stockResponse = await fetch(stockAvatar.imageUrl);
          if (stockResponse.ok) {
            const stockBlob = await stockResponse.blob();
            avatarFileForGeneration = new File([stockBlob], `${stockAvatar.id}.webp`, { type: "image/webp" });
          }
        }
      }
      if (avatarFileForGeneration) {
        body.append("reference", avatarFileForGeneration);
      } else if (referenceFile) {
        body.append("reference", referenceFile);
      }
      body.append("avatarConfig", JSON.stringify({
        enabled: true,
        source: avatarSource.toUpperCase(),
        avatarId: avatarSource === "stock" ? selectedAvatarId : null,
        model: avatarModel,
        language: voiceLanguage,
        voice: voiceProfile,
        style: voiceStyle,
        script: (voiceScript || form.description).trim(),
        consentConfirmed: avatarConsent,
      }));
    } else if (referenceFile && kind !== "audio") {
      body.append("reference", referenceFile);
    }
    const response = await authFetch("/api/generation-jobs", {
      method: "POST",
      body,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || `${kind} generation failed.`);
    const job =
      result.job.status === "COMPLETED"
        ? result.job
        : await poll(result.job.id);
    const url = job.asset?.outputUrl || job.asset?.storageUrl;
    if (!url)
      throw new Error(`${kind} job completed without a playable asset URL.`);
    const assetType =
      kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Image";
    const asset = addAsset({
      id: job.assetId,
      name: `${form.product} ${kind} ad`,
      projectId,
      campaignId,
      type: assetType,
      status: "Ready",
      url,
      outputUrl: url,
      prompt: direction,
      platform: form.platform,
      format: kind === "audio" ? "Audio" : activeFormat.label,
      aspectRatio: kind === "audio" ? null : activeFormat.ratio,
      duration: kind === "video" || kind === "audio" ? form.duration : null,
      providerJobId: job.providerJobId || null,
    });
    // A finished generation job has debited the account, so bypass the balance
    // throttle and push the new figure to the header, sidebar and billing page.
    fetchMuApiBalance(authFetch, { force: true })
      .then(broadcastMuApiBalance)
      .catch(() => {});
    return { kind, url, asset, jobId: job.id };
  };

  const retryFailedJob = async () => {
    if (!failedJob?.id || runLock.current) return;
    runLock.current = true;
    setRunning(true);
    setError("");
    setProgress(0);
    setStage("Retrying failed generation job...");
    try {
      const response = await authFetch(
        `/api/generation-jobs/${encodeURIComponent(failedJob.id)}/retry`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Retry failed.");
      const job =
        result.job.status === "COMPLETED"
          ? result.job
          : await poll(result.job.id);
      const kind =
        job.type === "VIDEO"
          ? "video"
          : job.type === "AUDIO"
            ? "audio"
            : "image";
      const url = job.asset?.outputUrl || job.asset?.storageUrl;
      setOutputs((current) => [
        ...current.filter((item) => item.kind !== kind),
        { kind, url, jobId: job.id },
      ]);
      setActiveOutput(kind);
      setFailedJob(null);
      setProgress(100);
      setStage("Campaign ready");
    } catch (reason) {
      setError(reason.message);
    } finally {
      runLock.current = false;
      setRunning(false);
    }
  };

  const generateCampaign = async () => {
    if (runLock.current) return;
    if (!form.product.trim() || !form.description.trim()) {
      setError("Enter the product name and description.");
      return;
    }
    if (form.outputType !== "Image" && form.outputType !== "Audio" && videoMode === "avatar") {
      if (!avatarConsent) {
        setError("Confirm that you have permission to use this image before generating an avatar video.");
        return;
      }
    }
    if (
      preset?.requirements?.some((item) =>
        /product photo|reference image/i.test(item),
      ) &&
      !referenceFile
    ) {
      setError(`${preset.name} requires a product or reference image.`);
      return;
    }
    if (
      preset?.requirements?.some((item) => /brand colours/i.test(item)) &&
      !form.brandColors.trim()
    ) {
      setError(`${preset.name} requires brand colours.`);
      return;
    }
    const requiredCredits = Number(
      preset?.cost ||
        (form.outputType === "Image + Video"
          ? 36
          : form.outputType === "Video"
            ? 30
            : 18),
    );
    // Gate on the real MuAPI-derived balance. The workspace store keeps a local
    // `credits` number that is seeded with a hardcoded default and never
    // reconciled with the provider, so checking it blocked or allowed workflows
    // based on a fabricated figure. Fall back to no local gate when the real
    // balance is unknown rather than guessing from that seed value.
    const { credits: availableCredits } = await fetchMuApiBalance(authFetch, {
      force: true,
    }).then((value) => ({ credits: value }))
      .catch(() => ({ credits: null }));
    if (availableCredits != null && availableCredits < requiredCredits) {
      setError(
        `This workflow requires ${requiredCredits} AI Credits. You have ${availableCredits}. Top up your MuAPI balance to continue.`,
      );
      return;
    }
    runLock.current = true;
    setRunning(true);
    setElapsed(0);
    setProgress(5);
    setOutputs([]);
    setPlan(null);
    setError("");
    setFailedJob(null);
    setStage("Creating campaign strategy and copy...");
    try {
      const response = await authFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: {
            product: form.product,
            description: `${form.description}\nBrand colours: ${form.brandColors || "Use workspace brand kit"}`,
            country: "India",
            audience:
              "Digital shoppers and customers interested in this product",
            objective: preset?.campaignType || "Product launch",
            offer: form.cta,
            platforms: form.platform,
            brandKit: form.brandColors || "Workspace brand kit",
            duration: "14 days",
            style: form.style,
            budget: "Optimized for digital advertising",
          },
          applyBrandKit: isOrganizationWorkspace && applyBrandKit,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || result.error || "Campaign planning failed.",
        );
      const creativePlan = result.campaign.plan;
      setPlan(creativePlan);
      setProgress(15);
      const campaignCost = Number(
        preset?.cost ||
          (form.outputType === "Image + Video"
            ? 36
            : form.outputType === "Video"
              ? 30
              : 18),
      );
      const project = createProject({
        name: creativePlan.campaignName || `${form.product} campaign`,
        style: form.style,
        prompt: form.description,
        cost: campaignCost,
      });
      const kinds = [
        /(image|campaign)/i.test(form.outputType) && "image",
        /(video|campaign)/i.test(form.outputType) && "video",
        /audio/i.test(form.outputType) && "audio",
      ].filter(Boolean);
      const created = [];
      for (const kind of kinds) {
        setStage(
          kind === "video"
            ? "Generating video, voice and stereo sound..."
            : kind === "audio"
              ? "Generating voice, music and stereo audio..."
              : "Generating product advertisement image...",
        );
        setProgress(kind === "video" ? 55 : kind === "audio" ? 45 : 25);
        const output = await generateMedia(
          kind,
          creativePlan,
          project.id,
          result.campaign.id,
        );
        created.push(output);
        setOutputs([...created]);
        setActiveOutput(kind);
      }
      setProgress(100);
      updateProject(project.id, {
        status: "Completed",
        progress: 100,
        mediaType: form.outputType,
        outputUrl: created[0]?.url || "",
        updated: "just now",
      });
      setStage("Campaign ready");
    } catch (reason) {
      setError(reason.message);
      setFailedJob(reason.job || null);
    } finally {
      runLock.current = false;
      setRunning(false);
    }
  };

  const preview =
    outputs.find((item) => item.kind === activeOutput) || outputs[0];
  const publishAsset = preview?.asset
    ? {
        ...preview.asset,
        assetId: preview.asset.id,
        type: preview.kind === "video" ? "Video" : preview.kind === "audio" ? "Audio" : "Image",
        outputUrl: preview.url,
      }
    : {};
  return (
    <main className="workspace-page ad-creator">
      <div className="page-title">
        <div>
          <span>CREATORA STUDIO / ADS</span>
          <h1>AI Ad Creator</h1>
          <p>
            Turn one product brief into campaign-ready copy, imagery and video.
          </p>
        </div>
        <button
          className="button"
          onClick={generateCampaign}
          disabled={running || templateLoading}
        >
          {templateLoading
            ? "Loading template..."
            : running
              ? `Creating campaign Â· ${elapsed}s`
              : "Generate campaign"}
        </button>
      </div>
      {error && (
        <div className="agent-clarification">
          {error}
          {failedJob && (
            <button type="button" onClick={retryFailedJob}>
              Retry failed job
            </button>
          )}
        </div>
      )}
      <div className="generator-layout">
        <section className="generator-form">
          <label>
            Product name
            <input
              value={form.product}
              onChange={(event) => update("product", event.target.value)}
              placeholder="Natural skincare serum"
            />
          </label>
          <label>
            Product description
            <textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Describe benefits, audience, offer and the creative you want."
            />
          </label>
          <label className="dropzone">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setReferenceFile(file || null);
                setReferencePreview(file ? URL.createObjectURL(file) : "");
              }}
            />
            {referencePreview ? (
              <img
                className="upload-preview"
                src={referencePreview}
                alt="Product reference"
              />
            ) : (
              <b>+</b>
            )}
            <strong>
              {referenceFile?.name || "Upload product/reference image"}
            </strong>
            <small>Used as the product image and first video frame.</small>
          </label>
          <div className="style-options">
            {[
              "Luxury",
              "Minimal",
              "Cinematic",
              "Lifestyle",
              "UGC",
              "Playful",
            ].map((style) => (
              <button
                className={form.style === style ? "selected" : ""}
                type="button"
                onClick={() => update("style", style)}
                key={style}
              >
                {style}
              </button>
            ))}
          </div>
          <div className="form-row">
            <label>
              Platform
              <select
                value={form.platform}
                onChange={(event) => update("platform", event.target.value)}
              >
                {Object.keys(platformGuidance).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select
                value={form.format}
                onChange={(event) => update("format", event.target.value)}
              >
                {Object.entries(formats).map(([key, item]) => (
                  <option value={key} key={key}>
                    {item.label} - {item.ratio}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Output type
            <select
              value={form.outputType}
              onChange={(event) => update("outputType", event.target.value)}
            >
              <option>Image</option>
              <option>Video</option>
              <option>Audio</option>
              <option>Image + Video</option>
            </select>
          </label>
          {isOrganizationWorkspace && <section className="apply-brand-kit-control" aria-label="Brand Kit">
            <div className="apply-brand-kit-heading">
              <strong>Brand Kit</strong>
              <span>{brandKitLoading ? "Loading Brand Kit..." : brandKit ? `✓ ${brandKit.brandName || "Organization brand"}` : brandKitError ? "Unable to load Brand Kit" : "No Brand Kit configured"}</span>
            </div>
            {brandKit ? <>
              <label className="toggle">
                <input type="checkbox" checked={applyBrandKit} onChange={(event) => setApplyBrandKit(event.target.checked)} />
                Apply Brand Kit
              </label>
              {applyBrandKit && <p>Applying: {form.outputType === "Image" ? "Brand colors · Image style · Audience · Tone" : form.outputType === "Video" ? "Brand colors · Video style · Audience · Tone · CTA" : form.outputType === "Audio" ? "Tone · Audience · CTA" : "Brand colors · Tone · Audience · Image/video style · CTA"}</p>}
              <Link href="/dashboard/brand-kit">View Brand Kit</Link>
            </> : !brandKitLoading && !brandKitError && <Link href="/dashboard/brand-kit">Set Up Brand Kit</Link>}
          </section>}
          {form.outputType !== "Image" && form.outputType !== "Audio" && (
            <div className="voice-settings project-output-toggles">
              <AvatarVideoControls
                videoMode={videoMode}
                setVideoMode={setVideoMode}
                showModeToggle={true}
                avatarSource={avatarSource}
                setAvatarSource={setAvatarSource}
                avatarModel={avatarModel}
                setAvatarModel={setAvatarModel}
                selectedAvatarId={selectedAvatarId}
                setSelectedAvatarId={setSelectedAvatarId}
                avatarFile={avatarFile}
                setAvatarFile={setAvatarFile}
                avatarPreview={avatarPreview}
                setAvatarPreview={setAvatarPreview}
                avatarConsent={avatarConsent}
                setAvatarConsent={setAvatarConsent}
                voiceLanguage={voiceLanguage}
                setVoiceLanguage={setVoiceLanguage}
                voiceProfile={voiceProfile}
                setVoiceProfile={setVoiceProfile}
                voiceStyle={voiceStyle}
                setVoiceStyle={setVoiceStyle}
                voiceScript={voiceScript}
                setVoiceScript={setVoiceScript}
                generateVoiceScript={generateVoiceScript}
                previewVoice={previewVoice}
                voiceScriptLoading={voiceScriptLoading}
                voicePreviewLoading={voicePreviewLoading}
                voicePreviewUrl={voicePreviewUrl}
                voicePreviewDuration={voicePreviewDuration}
                setNotice={setError}
                scriptPlaceholder="Enter script for the product advertisement or generate with AI..."
              />
            </div>
          )}
          {form.outputType !== "Image" && (
            <div className="form-row">
              <label>
                {form.outputType === "Audio"
                  ? "Audio duration"
                  : "Video duration"}
                <select
                  value={form.duration}
                  onChange={(event) =>
                    update("duration", Number(event.target.value))
                  }
                >
                  <option value="5">5 seconds</option>
                  {form.outputType === "Audio" && (
                    <option value="8">8 seconds</option>
                  )}
                  <option value="10">10 seconds</option>
                  {form.outputType === "Audio" && (
                    <option value="12">12 seconds</option>
                  )}
                  <option value="15">15 seconds</option>
                  {form.outputType === "Audio" && (
                    <option value="20">20 seconds</option>
                  )}
                  <option value="30">30 seconds</option>
                </select>
              </label>
              <div className="ad-audio-options">
                <label>
                  <input
                    type="checkbox"
                    checked={form.voiceover}
                    onChange={(event) =>
                      update("voiceover", event.target.checked)
                    }
                  />{" "}
                  Voiceover
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.music}
                    onChange={(event) => update("music", event.target.checked)}
                  />{" "}
                  Music
                </label>
              </div>
            </div>
          )}
          <label>
            Call to action
            <input
              value={form.cta}
              onChange={(event) => update("cta", event.target.value)}
              placeholder="Shop Now"
            />
          </label>
          <button
            className="button generate ad-generate"
            type="button"
            onClick={generateCampaign}
            disabled={running || templateLoading || (form.outputType !== "Image" && form.outputType !== "Audio" && videoMode === "avatar" && !avatarConsent)}
          >
            {templateLoading
              ? "Loading template..."
              : running
                ? `${stage} ${progress}%`
                : `Generate ${form.outputType}`}
          </button>
        </section>
        <aside className="preview-panel">
          <div className="preview-head">
            <span>CAMPAIGN PREVIEW</span>
            <button
              type="button"
              onClick={() => {
                setOutputs([]);
                setPlan(null);
                setProgress(0);
              }}
            >
              Reset
            </button>
          </div>
          <div className="empty-preview">
            <div className={`format-frame ${activeFormat.className}`}>
              {preview ? (
                preview.kind === "video" ? (
                  <VideoPlayer className="generated-media" src={preview.url} />
                ) : preview.kind === "audio" ? (
                  <AudioPlayer className="generated-media" src={preview.url} />
                ) : (
                  <img
                    className="generated-media"
                    src={preview.url}
                    alt="Generated advertisement"
                  />
                )
              ) : referencePreview ? (
                <img
                  className="generated-media"
                  src={referencePreview}
                  alt="Product preview"
                />
              ) : (
                <CreateoraSparkle
                  state={running ? "generating" : error ? "error" : "idle"}
                  size={80}
                  label="Ad preview"
                />
              )}
              {running && (
                <div className="generation-loader" role="status" aria-live="polite">
                  <CreateoraSparkle
                    state="generating"
                    size={56}
                    label="Ad generation in progress"
                  />
                  <b>{stage}</b>
                  <div className="job-progress">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {progress}% · {elapsed}s elapsed · duplicate submissions
                    are blocked
                  </small>
                </div>
              )}
              <i />
              <i />
            </div>
            <div className="ad-preview-caption">
              <h3>
                {preview
                  ? `${preview.kind === "video" ? "Video" : preview.kind === "audio" ? "Audio" : "Image"} ready`
                  : referencePreview
                    ? "Reference preview"
                    : `${activeFormat.label} ${activeFormat.ratio}`}
              </h3>
              <p>
                {preview
                  ? "Play or download the completed campaign asset."
                  : referencePreview
                    ? "Your uploaded product will guide the generated campaign."
                    : "Your generated image, video, or audio will appear here."}
              </p>
            </div>
            {outputs.length > 1 && (
              <div className="preview-tabs">
                {outputs.map((item) => (
                  <button
                    className={activeOutput === item.kind ? "active" : ""}
                    type="button"
                    onClick={() => setActiveOutput(item.kind)}
                    key={item.kind}
                  >
                    {item.kind}
                  </button>
                ))}
              </div>
            )}
            {preview && (
              <a
                className="button media-download"
                href={downloadHref(
                  preview.url,
                  `${form.product}-${preview.kind}`,
                  preview.kind === "video" ? "Video" : preview.kind === "audio" ? "Audio" : "Image",
                )}
                download={downloadFilename(
                  preview.url,
                  `${form.product}-${preview.kind}`,
                  preview.kind === "video" ? "Video" : preview.kind === "audio" ? "Audio" : "Image",
                )}
              >
                Download {preview.kind}
              </a>
            )}
            <SocialPublishButton
              asset={publishAsset}
              authFetch={authFetch}
              notify={setError}
            />
          </div>
          {plan && (
            <div className="ad-copy-preview">
              <span>CAMPAIGN COPY</span>
              <h3>{plan.headlines?.[0]}</h3>
              <p>{plan.adCopy?.[0]?.primaryText}</p>
              <b>{plan.adCopy?.[0]?.callToAction || form.cta}</b>
              <small>{plan.socialCaptions?.[0]}</small>
              <em>{plan.hashtags?.join(" ")}</em>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function TeamPage() {
  const { authFetch, role, organization } = useAuth();
  const isAdmin = ["OWNER", "ADMIN"].includes(role);
  const isOrganization = organization?.accountType === "ORGANIZATION";
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const notify = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 3000);
  };
  const loadMembers = () => {
    setLoading(true);
    authFetch("/api/organization/members", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load team members.");
        setMembers(result.data || []);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!isOrganization) { setLoading(false); return; }
    loadMembers();
  }, [isOrganization]);
  const addMember = async (event) => {
    event.preventDefault();
    if (!email.trim() || adding) return;
    setAdding(true);
    setError("");
    try {
      const response = await authFetch("/api/organization/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add team member.");
      setMembers((current) => [...current, result.data]);
      setEmail("");
      setAddOpen(false);
      notify(`${result.data.name} was added to the workspace.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setAdding(false);
    }
  };
  const removeMember = async (member) => {
    if (!window.confirm(`Remove ${member.name}? They will lose access, but their projects and assets stay in the workspace.`)) return;
    try {
      const response = await authFetch(`/api/organization/members/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to remove team member.");
      setMembers((current) => current.filter((item) => item.id !== member.id));
      notify(`${member.name} was removed from the workspace.`);
    } catch (reason) {
      notify(reason.message);
    }
  };
  if (!isOrganization) {
    return (
      <main className="workspace-page collection">
        <div className="page-title">
          <div>
            <span>WORKSPACE / TEAM</span>
            <h1>Team members</h1>
            <p>Team management is only available for organization workspaces.</p>
          </div>
        </div>
        <p>
          Your account is a Personal workspace. Create an organization from
          signup, or ask an organization Admin to add you as a member, to
          collaborate with a team.
        </p>
      </main>
    );
  }
  return (
    <main className="workspace-page collection">
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>WORKSPACE / TEAM</span>
          <h1>Team members</h1>
            <p>{members.length} member{members.length === 1 ? "" : "s"} share this workspace. Add existing Createora users by their registered email.</p>
        </div>
        {isAdmin && (
          <button className="button" onClick={() => setAddOpen(true)}>
            + Add member
          </button>
        )}
      </div>
      {error && <div className="agent-clarification">{error}</div>}
      {loading ? (
        <p>Loading team members...</p>
      ) : (
        <div className="collection-grid">
          {members.map((member) => (
            <article key={member.id}>
              <h3>{member.name}</h3>
              <p>{member.email}</p>
              <p>{member.isAdmin ? "Admin" : "Member"} - Active</p>
              {isAdmin && !member.isAdmin && (
                <div className="card-actions">
                  <button type="button" onClick={() => removeMember(member)}>
                    Remove
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {addOpen && (
        <div className="asset-dialog-backdrop" onClick={() => setAddOpen(false)}>
          <form
            className="settings-card asset-dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={addMember}
          >
            <h3>Add member</h3>
            <label>
              Registered Createora email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
              />
            </label>
            <small>The user must already have a Createora account. Access is active immediately after they are added.</small>
            <div className="card-actions">
              <button type="button" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button className="button" type="submit" disabled={adding}>
                {adding ? "Adding..." : "Add member"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function CollectionPage({ section, title, subtitle }) {
  const { authFetch, organization, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const [workspace, setWorkspace] = useState(getWorkspace);
  const [query, setQuery] = useState(() => queryParam);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All");
  const [databaseProjects, setDatabaseProjects] = useState([]);
  const [databaseAssets, setDatabaseAssets] = useState([]);
  const [collectionLoading, setCollectionLoading] = useState(
    section === "projects" || section === "assets",
  );
  const [collectionError, setCollectionError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const refresh = () => setWorkspace(getWorkspace());
  useEffect(() => {
    refresh();
    window.addEventListener("creatora:workspace-updated", refresh);
    return () =>
      window.removeEventListener("creatora:workspace-updated", refresh);
  }, []);
  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);
  useEffect(() => {
    if (section !== "projects") return;
    let cancelled = false;
    setCollectionLoading(true);
    setCollectionError("");
    authFetch("/api/workspace/projects?limit=100", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load projects.");
        if (!cancelled)
          setDatabaseProjects(
            (result.data || []).map((project) => ({
              ...project,
              assets: project.assetCount || 0,
              outputUrl: project.thumbnailUrl || "",
              previewUrl: project.previewUrl || "",
              thumbnailKind: project.thumbnailKind || "",
              updated: project.updatedAt,
            })),
          );
      })
      .catch((error) => {
        if (!cancelled) {
          setCollectionError(error.message);
          setNotice(error.message);
        }
      })
      .finally(() => { if (!cancelled) setCollectionLoading(false); });
    return () => { cancelled = true; };
  }, [authFetch, section]);
  useEffect(() => {
    if (section !== "assets") return;
    let cancelled = false;
    setCollectionLoading(true);
    setCollectionError("");
    setDatabaseAssets([]);
    const loadAssets = async () => {
      const [assetsResponse, projectsResponse] = await Promise.all([
        authFetch("/api/assets", { cache: "no-store" }),
        authFetch("/api/workspace/projects?limit=100", { cache: "no-store" }),
      ]);
      const [assetsResult, projectsResult] = await Promise.all([
        assetsResponse.json(),
        projectsResponse.json(),
      ]);
      if (!assetsResponse.ok && !projectsResponse.ok) {
        throw new Error(assetsResult.error || projectsResult.error || "Unable to load assets.");
      }

      const assets = assetsResponse.ok
        ? assetsResult.assets || []
        : projectsResponse.ok
          ? (projectsResult.data || []).flatMap((project) => project.assets || [])
          : [];
      const uniqueAssets = new Map();
      uniqueProjectAssets(assets).filter(isGeneratedAssetLibraryItem).forEach((asset) => {
        if (!asset?.id || uniqueAssets.has(asset.id)) return;
        let platforms = asset.platforms || [];
        if (typeof platforms === "string") {
          try {
            platforms = JSON.parse(platforms);
          } catch {
            platforms = platforms.split(",");
          }
        }
        if (!Array.isArray(platforms)) platforms = [];
        uniqueAssets.set(asset.id, {
          id: asset.id,
          name: asset.title,
          type:
            asset.assetType === "VIDEO"
              ? "Video"
              : asset.assetType === "AUDIO"
                ? "Audio"
                : "Image",
          campaignId: asset.campaignId,
          jobId: asset.providerJobId || asset.id,
          status: asset.status,
          url: asset.outputUrl || "",
          outputUrl: asset.outputUrl || "",
          thumbnailUrl: asset.thumbnailUrl || "",
          prompt: asset.prompt || "",
          platform: platforms.join(", "),
          format: asset.aspectRatio || "",
          duration: asset.durationSeconds || null,
          errorMessage: asset.errorMessage || "",
        });
      });
      if (!cancelled) setDatabaseAssets([...uniqueAssets.values()]);
    };
    loadAssets()
      .catch((error) => {
        if (!cancelled) {
          setDatabaseAssets([]);
          setCollectionError(error.message);
          setNotice(error.message);
        }
      })
      .finally(() => { if (!cancelled) setCollectionLoading(false); });
    return () => { cancelled = true; };
  }, [authFetch, organization?.id, section]);
  const notify = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 3000);
  };
  const action = () => {
    if (section === "team") {
      addTeamMember({
        name: "New teammate",
        email: `invite-${Date.now()}@example.com`,
      });
      notify("Invitation added to your team.");
    } else if (section === "assets") {
      addAsset({ name: "Uploaded asset", source: "Workspace upload" });
      notify("Asset added.");
    } else if (section === "projects") {
      router.push("/dashboard/create");
    } else notify("New workspace item is ready.");
  };
  const editItem = (item) => {
    const name = window.prompt("Enter a new name", item.name);
    if (!name || name === item.name) return;
    if (section === "projects") {
      updateProject(item.id, { name, updated: "just now" });
      setDatabaseProjects((current) =>
        current.map((project) =>
          project.id === item.id ? { ...project, name } : project,
        ),
      );
      authFetch("/api/workspace/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, name, applyToCategory: true }),
      }).catch(() => {});
    }
    if (section === "assets") setDatabaseAssets((current) => current.map((asset) => asset.id === item.id ? { ...asset, name } : asset));
    if (section === "team") updateTeamMember(item.id, { name });
    notify("Changes saved.");
  };
  const archiveProject = async (item) => {
    const previous = databaseProjects;
    setDatabaseProjects((current) => current.filter((project) => project.id !== item.id));
    try {
      const response = await authFetch("/api/workspace/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: "ARCHIVED", applyToCategory: true, statusGroup: item.status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to archive project.");
      updateProject(item.id, { status: "ARCHIVED", updated: "just now" });
      notify("Project archived and removed from the active project list.");
    } catch (error) {
      setDatabaseProjects(previous);
      notify(error.message);
    }
  };
  const permanentlyDeleteItem = async (item) => {
    const itemType = section === "projects" ? "project" : "asset";
    const warning = section === "projects"
      ? `Permanently delete \"${item.name}\" and all of its assets? This cannot be undone.`
      : `Permanently delete \"${item.name}\"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setDeletingId(item.id);
    try {
      const response = section === "projects"
        ? await authFetch("/api/workspace/projects", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id }),
          })
        : await authFetch(`/api/assets?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Unable to delete ${itemType}.`);
      if (section === "projects") {
        setDatabaseProjects((current) => current.filter((project) => project.id !== item.id));
        deleteProject(item.id);
      } else {
        setDatabaseAssets((current) => current.filter((asset) => asset.id !== item.id));
        deleteAsset(item.id);
      }
      notify(`${section === "projects" ? "Project" : "Asset"} permanently deleted.`);
    } catch (error) {
      notify(error.message || `Unable to delete ${itemType}.`);
    } finally {
      setDeletingId("");
    }
  };
  const source =
    section === "projects"
      ? databaseProjects
      : section === "assets"
        ? databaseAssets
        : section === "team"
          ? workspace.team
          : [];
  const visible = source.filter((item) => {
    const text = JSON.stringify(item).toLowerCase();
    return (
      !(section === "projects" && item.status === "ARCHIVED") &&
      !(section === "projects" && item.status === "IN_PROGRESS") &&
      text.includes(query.toLowerCase()) &&
      (filter === "All" ||
        item.type === filter ||
        item.status === filter ||
        item.role === filter)
    );
  });
  if (section === "templates")
    return <Templates notify={notify} notice={notice} />;
  if (section === "brand-kit")
    return <BrandKit workspace={workspace} authFetch={authFetch} notify={notify} notice={notice} role={role} />;
  // Billing renders the toast above the plan cards: checkout failures
  // (Razorpay Checkout not loading, a rejected subscription request, a
  // cancelled or failed payment) are surfaced through notify(), so this
  // section must render the notice itself.
  if (section === "credits")
    return <><BillingCredits workspace={workspace} authFetch={authFetch} notify={notify} notice={notice} /></>;
  if (section === "settings")
    return <Settings workspace={workspace} authFetch={authFetch} notify={notify} notice={notice} />;
  return (
    <main className="workspace-page collection">
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>WORKSPACE / {section.toUpperCase()}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button className="button" onClick={action}>
          {section === "team" ? "Invite member" : "Add new"}
        </button>
      </div>
      <div className="toolbar">
        <label className="search wide">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${section.replace("-", " ")}`}
          />
        </label>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option>All</option>
          <option>Image</option>
          <option>Video</option>
          <option>Audio</option>
          <option>Ready</option>
          <option>PROCESSING</option>
          <option>COMPLETED</option>
          <option>FAILED</option>
          <option>Active</option>
          <option>Invited</option>
          <option>Editor</option>
          <option>Viewer</option>
        </select>
        <button type="button" onClick={() => setFilter("All")}>
          Reset filters
        </button>
        <button type="button" onClick={() => setQuery("")}>
          Clear search
        </button>
      </div>
      {collectionLoading ? (
        <CreateoraLoadingState
          label={section === "projects" ? "Loading projects..." : "Loading assets..."}
        />
      ) : collectionError ? (
        <div className="empty-state">
          <b>{section === "projects" ? "Unable to load projects" : "Unable to load assets"}</b>
          <p>{collectionError}</p>
        </div>
      ) : visible.length ? (
        <div className="collection-grid">
          {visible.map((item, index) => {
            const outputUrl = item.url || item.outputUrl;
            return (
              <article key={item.id}>
                <CollectionArt item={item} section={section} index={index} authFetch={authFetch} />
                <h3>{item.name}</h3>
                <p>
                  {section === "projects"
                    ? `${item.assets ?? 0} assets - ${item.status}${item.platform ? ` - ${item.platform}` : ""}`
                    : section === "assets"
                      ? `${item.type} - ${item.status}${item.platform ? ` - ${item.platform}` : ""}`
                      : `${item.role} - ${item.status}`}
                </p>
                <div className="card-actions">
                  {section === "projects" && (
                    <Link href={`/dashboard/projects/${encodeURIComponent(item.id)}`}>
                      Open
                    </Link>
                  )}
                  <button type="button" onClick={() => editItem(item)}>
                    Edit
                  </button>
                  {section === "assets" && outputUrl && (
                    <a
                      href={downloadHref(outputUrl, item.name, item.type)}
                      download={downloadFilename(outputUrl, item.name, item.type)}
                    >
                      Download
                    </a>
                  )}
                  {section === "assets" && outputUrl && (
                    <SocialPublishButton
                      asset={{ ...item, outputUrl, assetId: item.id }}
                      authFetch={authFetch}
                      notify={notify}
                    />
                  )}
                  {section === "projects" && (
                    <button
                      type="button"
                      onClick={() => archiveProject(item)}
                    >
                      Archive
                    </button>
                  )}
                  {section === "projects" && (
                    <button type="button" disabled={deletingId === item.id} onClick={() => permanentlyDeleteItem(item)}>
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                  {section === "assets" && (
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => permanentlyDeleteItem(item)}
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                  {section === "team" && (
                    <button
                      type="button"
                      onClick={() => {
                        deleteTeamMember(item.id);
                        notify("Team member removed.");
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          {source.length === 0 && !query && filter === "All" ? (
            <>
              <b>{section === "projects" ? "No projects yet" : "No assets yet"}</b>
              <p>{section === "projects" ? "Create your first project to see it here." : "Generated and uploaded assets will appear here."}</p>
            </>
          ) : (
            <>
              <b>No matches found</b>
              <p>Try a different search or reset the filter.</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function AccountScopeNotice({ section }) {
  const copy = section === "workflows"
    ? ["Workflow removed", "Creative workflows have been removed from this workspace. Use Create Image, Create Ad Creative, or Create Video instead."]
    : ["Organization only", "Brand Kit and Team are available only in organization workspaces."];
  return (
    <main className="workspace-page collection">
      <div className="page-title">
        <div>
          <span>WORKSPACE</span>
          <h1>{copy[0]}</h1>
          <p>{copy[1]}</p>
        </div>
        <Link className="button" href="/dashboard/create">Create asset</Link>
      </div>
    </main>
  );
}

function CollectionArt({ item, section, index, authFetch }) {
  const outputUrl = item.url || item.outputUrl || item.thumbnailUrl;
  const status = String(item.status || "").toUpperCase();
  if (section === "team")
    return (
      <div className={`collection-art art-${index % 4}`}>
        <span className="member-avatar">
          {item.name
            .split(" ")
            .map((name) => name[0])
            .join("")}
        </span>
      </div>
    );
  if (section === "assets" && ["QUEUED", "PROCESSING"].includes(status))
    return (
      <div className="collection-art asset-processing">
        <span>Generating...</span>
        <div className="upload-meter indeterminate">
          <i />
        </div>
        <small>You can safely leave this page.</small>
      </div>
    );
  if (section === "assets" && status === "FAILED")
    return (
      <div className="collection-art asset-failed">
        <span>Failed</span>
        <small>
          {item.errorMessage || "Retry generation from the campaign."}
        </small>
      </div>
    );
  if (section === "assets" && outputUrl)
    return (
      <div className="collection-art asset-preview">
        {item.type === "Video" ? (
          <VideoPlayer src={outputUrl} />
        ) : item.type === "Audio" ? (
          <AudioPlayer src={outputUrl} />
        ) : (
          <CollectionPreviewImage src={outputUrl} alt={item.name} authFetch={authFetch} />
        )}
      </div>
    );
  if (section === "projects") {
    const kind = item.thumbnailKind;
    const media = kind === "image" ? "" : item.previewUrl || outputUrl;
    const image = kind === "video" || kind === "audio" ? "" : outputUrl;
    if (image || media)
      return (
        <div className="collection-art asset-preview">
          {kind === "video" && media ? (
            <AuthenticatedVideo
              src={media}
              authFetch={authFetch}
              muted
              playsInline
              preload="metadata"
              fallback={<ProjectArtFallback index={index} />}
            />
          ) : kind === "audio" && media ? (
            <ProjectArtFallback index={index} />
          ) : (
            <AuthenticatedImage
              src={image || media}
              alt={item.name}
              authFetch={authFetch}
              fallback={<ProjectArtFallback index={index} />}
            />
          )}
        </div>
      );
    return <ProjectArtFallback index={index} />;
  }
  return <ProjectArtFallback index={index} />;
}

function ProjectArtFallback({ index }) {
  return (
    <div className={`collection-art art-${index % 4}`}>
      <span>{["*", "#", ">", "@"][index % 4]}</span>
      <i />
    </div>
  );
}

function CollectionPreviewImage({ src, alt, authFetch }) {
  return (
    <AuthenticatedImage
      src={src}
      alt={alt}
      authFetch={authFetch}
      fallback={<div className="collection-preview-state">Preview unavailable</div>}
    />
  );
}

function CampaignAgent() {
  const { authFetch, organization } = useAuth();
  const isOrganizationWorkspace = organization?.accountType === "ORGANIZATION";
  const [brief, setBrief] = useState({
    product: "",
    description: "",
    audience: "",
    objective: "Product launch",
    offer: "",
    platforms: "Instagram, Facebook",
    brand: "",
    duration: "14 days",
    style: "Premium educational",
    budget: "$500 - $1,000",
  });
  const [plan, setPlan] = useState(null);
  const [campaignId, setCampaignId] = useState("");
  const [agentSource, setAgentSource] = useState("");
  const [clarification, setClarification] = useState("");
  const [planning, setPlanning] = useState(false);
  const [approved, setApproved] = useState(false);
  const [editing, setEditing] = useState(true);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const v1SettledJobs = useRef(0);
  const [assetRows, setAssetRows] = useState(assetRowsFromRecommendations());
  const [generationJobs, setGenerationJobs] = useState([]);
  const [generatedAssets, setGeneratedAssets] = useState([]);
  const [productImage, setProductImage] = useState(null);
  const update = (key, value) => setBrief({ ...brief, [key]: value });
  const hasProviderPricedAssets = assetRows.some((row) => row.credits == null);
  const assetTotal = assetRows.reduce((total, row) => total + (row.credits || 0), 0);
  const handleProductImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Use a PNG, JPG, or WebP product image.");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("The product image must be 10MB or smaller.");
      event.target.value = "";
      return;
    }
    if (productImage?.url) URL.revokeObjectURL(productImage.url);
    setProductImage({
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      progress: 100,
      status: "Valid image - ready for campaign assets",
    });
    setMessage("");
  };
  const removeProductImage = () => {
    if (productImage?.url) URL.revokeObjectURL(productImage.url);
    setProductImage(null);
  };
  const removeImage = () => setProductImage(null);
  useEffect(() => {
    if (
      !campaignId ||
      !generationJobs.some(
        (job) => !["COMPLETED", "FAILED"].includes(job.status),
      )
    )
      return undefined;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/campaign-agent/${campaignId}/status`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) return;
      setGenerationJobs(result.jobs || []);
      setGeneratedAssets(result.assets || []);
      (result.assets || []).forEach((asset) =>
        updateAsset(asset.jobId, {
          url: asset.url,
          status: asset.status,
          thumbnailUrl: asset.thumbnailUrl,
        }),
      );
      // Newly settled jobs mean credits were spent, so bypass the balance
      // throttle. Comparing the settled count keeps this to one request per
      // finished batch instead of on every 4s tick.
      const settled = (result.jobs || []).filter(
        (job) => ["COMPLETED", "FAILED"].includes(job.status),
      ).length;
      if (settled > v1SettledJobs.current) {
        v1SettledJobs.current = settled;
        fetchMuApiBalance(authFetch, { force: true })
          .then(broadcastMuApiBalance)
          .catch(() => {});
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [campaignId, generationJobs, authFetch]);
  const requestCampaign = async (endpoint) => {
    setPlanning(true);
    setClarification("");
    setApproved(false);
    setEditing(false);
    try {
      const response = await fetch(`/api/campaign-agent/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, brief }),
      });
      const result = await response.json();
      if (!response.ok) {
        setClarification(
          result.message ||
            result.error ||
            "Campaign Strategist needs more detail.",
        );
        return;
      }
      setCampaignId(result.campaign.id);
      setAgentSource(result.campaign.source);
      setPlan(viewPlanFromCampaign(result.campaign));
      const estimateResponse = await fetch("/api/campaign-agent/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: result.campaign.id }),
      });
      const estimateResult = await estimateResponse.json();
      setAssetRows(
        assetRowsFromRecommendations(
          estimateResponse.ok
            ? estimateResult.assetRecommendations
            : result.campaign.plan.assetRecommendations,
        ),
      );
    } catch (error) {
      setClarification(error.message || "Campaign Strategist request failed.");
    } finally {
      setPlanning(false);
    }
  };
  const generatePlan = () => requestCampaign("plan");
  const regeneratePlan = () => requestCampaign("regenerate");
  const approveStrategy = async () => {
    if (!campaignId) return;
    const response = await fetch("/api/campaign-agent/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, stage: "strategy" }),
    });
    const result = await response.json();
    if (!response.ok) {
      setClarification(result.error || "Approval failed.");
      return;
    }
    setApproved(true);
  };
  const prepareAssets = async () => {
    if (!campaignId) return;
    const response = await fetch("/api/campaign-agent/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    const result = await response.json();
    if (!response.ok) {
      setClarification(result.error || "Asset recommendation failed.");
      return;
    }
    setAssetRows(assetRowsFromRecommendations(result.assetRecommendations));
    setAssetDialogOpen(true);
  };
  const confirmAssetGeneration = async () => {
    if (!campaignId || !plan) return;
    const response = await fetch("/api/campaign-agent/generate-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, assets: plan.assetRecommendations }),
    });
    const result = await response.json();
    if (!response.ok) {
      setClarification(result.error || "Asset generation failed.");
      return;
    }
    const project = createProject({
      name: plan.name,
      cost: 0,
      prompt: plan.concept,
      style: brief.style,
    });
    updateProject(project.id, {
      status: "Generating assets",
      progress: 0,
      campaignId,
      assets: result.jobs?.length || assetRows.length,
      updated: "just now",
    });
    setGenerationJobs(result.jobs || []);
    (result.jobs || []).forEach((job) =>
      addAsset({
        id: job.jobId,
        name: job.title || `${plan.name} - ${job.type}`,
        projectId: project.id,
        campaignId,
        jobId: job.jobId,
        type:
          job.type === "video"
            ? "Video"
            : job.type === "audio"
              ? "Audio"
              : "Image",
        prompt: job.prompt,
        platform: job.platform,
        format: job.aspectRatio,
        status: job.status.toUpperCase(),
      }),
    );
    setAssetDialogOpen(false);
    setClarification(
      `Submitted ${result.jobs?.length || 0} MuAPI jobs and saved queued assets to the Asset Library.`,
    );
  };
  const stepStatus = (index) => {
    if (!plan)
      return index === 0
        ? { label: "â—‹ Not started", active: true }
        : { label: "â—‹ Not started", active: false };
    if (approved)
      return index < 3
        ? { label: "âœ“ Completed", active: false }
        : { label: "â— Ready to generate", active: true };
    if (index === 0) return { label: "âœ“ Completed", active: false };
    if (index === 1) return { label: "â— In review", active: true };
    if (index === 2) return { label: "â— In review", active: false };
    return { label: "â—‹ Waiting for approval", active: false };
  };
  return (
    <main className="workspace-page campaign-agent">
      <div className="page-title">
        <div>
          <span>WORKSPACE / CAMPAIGN AGENT</span>
          <h1>Campaign Strategist Agent</h1>
          <p>
            Campaign brief to structured strategy, approval, MuAPI prompts and
            real assets.
          </p>
        </div>
        <button className="button" onClick={generatePlan} disabled={planning}>
          {planning
            ? "Asking strategist..."
            : plan
              ? "Regenerate campaign plan"
              : "Generate campaign plan"}
        </button>
      </div>
      {clarification && (
        <div className="agent-clarification">{clarification}</div>
      )}
      <div className="campaign-layout">
        <section className="settings-card campaign-brief">
          <h3>Campaign Brief</h3>
          <label>
            Product name
            <input
              value={brief.product}
              onChange={(event) => update("product", event.target.value)}
              placeholder="AI Ad Prompt Ebook"
            />
          </label>
          <label>
            Product description
            <textarea
              value={brief.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="200 ready-to-use ChatGPT prompts for product ads, headlines and social campaigns."
            />
          </label>
          <label>
            Product image
            <span className="field-hint">
              Upload the ebook cover or product visual.
            </span>
            <input
              id="campaign-product-image"
              type="file"
              accept="image/*"
              onChange={handleProductImage}
            />
          </label>
          {productImage && (
            <div className="image-upload-preview">
              <img src={productImage.url} alt="Selected campaign product" />
              <div>
                <b>{productImage.name}</b>
                <span>{productImage.status}</span>
                <div className="upload-meter">
                  <i style={{ width: `${productImage.progress}%` }} />
                </div>
                <small>Upload progress {productImage.progress}%</small>
                <div className="card-actions">
                  <label htmlFor="campaign-product-image">Replace</label>
                  <button type="button" onClick={removeImage}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
          <label>
            Target audience
            <span className="field-hint">
              Example: Indian ecommerce sellers and small-business owners aged
              22-45
            </span>
            <input
              value={brief.audience}
              onChange={(event) => update("audience", event.target.value)}
              placeholder="Indian ecommerce sellers and small-business owners aged 22-45"
            />
          </label>
          <label>
            Campaign objective
            <select
              value={brief.objective}
              onChange={(event) => update("objective", event.target.value)}
            >
              <option>Sales</option>
              <option>Awareness</option>
              <option>Lead generation</option>
              <option>Product launch</option>
              <option>Retention</option>
            </select>
          </label>
          <label>
            Offer or discount
            <input
              value={brief.offer}
              onChange={(event) => update("offer", event.target.value)}
              placeholder="40% off during launch period"
            />
          </label>
          <label>
            Platforms
            <input
              value={brief.platforms}
              onChange={(event) => update("platforms", event.target.value)}
            />
          </label>
          {isOrganizationWorkspace && (
            <label>
              Brand kit
              <input
                value={brief.brand}
                onChange={(event) => update("brand", event.target.value)}
                placeholder="MoodMap"
              />
            </label>
          )}
          <label>
            Campaign duration
            <input
              value={brief.duration}
              onChange={(event) => update("duration", event.target.value)}
            />
          </label>
          <label>
            Preferred creative style
            <input
              value={brief.style}
              onChange={(event) => update("style", event.target.value)}
            />
          </label>
          <label>
            Advertising budget range
            <input
              value={brief.budget}
              onChange={(event) => update("budget", event.target.value)}
            />
          </label>
        </section>
        <section className="campaign-board campaign-status-board">
          {campaignStepCards.map((step, index) => {
            const status = stepStatus(index);
            return (
              <article
                className={status.active ? "active" : plan ? "ready" : ""}
                key={step.title}
              >
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{plan ? step.doneStatus : "Waiting for campaign brief"}</p>
                <b>{status.label}</b>
              </article>
            );
          })}
        </section>
      </div>
      {plan && (
        <section className="settings-card campaign-output professional-output">
          <div className="campaign-output-head">
            <div>
              <span>
                {approved
                  ? "APPROVED PLAN"
                  : `READY FOR REVIEW - ${agentSource}`}
              </span>
              <h3>{plan.name}</h3>
            </div>
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(!editing)}>
                Edit Strategy
              </button>
              <button
                type="button"
                onClick={regeneratePlan}
                disabled={planning}
              >
                Regenerate Strategy
              </button>
              <button type="button" onClick={approveStrategy}>
                Approve Strategy
              </button>
            </div>
          </div>
          <div>
            <b>Campaign concept</b>
            <p>{plan.concept}</p>
          </div>
          <div>
            <b>Audience segments</b>
            <ul>
              {plan.segments.map((segment) => (
                <li key={segment}>{segment}</li>
              ))}
            </ul>
          </div>
          <div>
            <b>Messaging angle</b>
            <p>{plan.angle}</p>
          </div>
          {plan.positioning && (
            <div>
              <b>Positioning</b>
              <p>{plan.positioning}</p>
            </div>
          )}
          {plan.platformRecommendations?.length > 0 && (
            <div>
              <b>Platform recommendations</b>
              <ul>
                {plan.platformRecommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <b>Headlines</b>
            <ul>
              {plan.headlines.map((headline) => (
                <li key={headline}>{headline}</li>
              ))}
            </ul>
          </div>
          <div>
            <b>Advertisement copy</b>
            <p>{plan.adCopy}</p>
          </div>
          <div>
            <b>Social captions</b>
            <p>{plan.caption}</p>
          </div>
          {plan.videoScripts?.length > 0 && (
            <div>
              <b>Reel scripts</b>
              <ul>
                {plan.videoScripts.map((script) => (
                  <li key={script.hook}>
                    {script.format}: {script.hook} {script.beats.join(" - ")}{" "}
                    Voiceover: {script.voiceover}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <b>Hashtags</b>
            <p>{plan.hashtags.join(" ")}</p>
          </div>
          <div>
            <b>Publishing calendar</b>
            <ul>
              {plan.calendar.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {editing && (
            <textarea
              className="strategy-editor"
              value={plan.angle}
              onChange={(event) =>
                setPlan({ ...plan, angle: event.target.value })
              }
            />
          )}
          <button
            className="button"
            disabled={!approved}
            onClick={prepareAssets}
          >
            Generate {assetRows.length} Assets - Estimated {assetTotal} Credits
          </button>
        </section>
      )}
      {assetDialogOpen && (
        <div className="asset-dialog-backdrop">
          <section className="settings-card asset-dialog">
            <div className="campaign-output-head">
              <div>
                <span>ASSET GENERATION</span>
                <h3>Select asset types</h3>
              </div>
              <button type="button" onClick={() => setAssetDialogOpen(false)}>
                Close
              </button>
            </div>
            {assetRows.map(({ item, credits }) => (
              <label className="asset-row" key={item}>
                <span>{item}</span>
                <input type="checkbox" defaultChecked />
                <b>{credits == null ? "Provider-priced" : credits ? `${credits} credits` : "Included"}</b>
              </label>
            ))}
            <div className="asset-total">
              <span>Estimated total</span>
              <b>{hasProviderPricedAssets ? "Confirmed by provider" : `${assetTotal} credits`}</b>
            </div>
            <button className="button" onClick={confirmAssetGeneration}>
              Confirm generation
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function CampaignAgentV2() {
  const { authFetch, organization } = useAuth();
  const isOrganizationWorkspace = organization?.accountType === "ORGANIZATION";
  const [brandKit, setBrandKit] = useState(null);
  const [brandKitLoading, setBrandKitLoading] = useState(false);
  const [brandKitError, setBrandKitError] = useState(false);
  const [applyBrandKit, setApplyBrandKit] = useState(true);
  const [brief, setBrief] = useState({
    product: "",
    description: "",
    country: "India",
    audience: "",
    objective: "Product launch",
    offer: "",
    platforms: "Instagram, Facebook",
    duration: "14 days",
    style: "Premium educational",
    budget: "$500 - $1,000",
  });
  const [plan, setPlan] = useState(null);
  const [campaignId, setCampaignId] = useState("");
  const [agentSource, setAgentSource] = useState("");
  const [message, setMessage] = useState("");
  const [planning, setPlanning] = useState(false);
  const [approved, setApproved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [generationStarting, setGenerationStarting] = useState(false);
  const [assetRows, setAssetRows] = useState(assetRowsFromRecommendations());
  const [generationJobs, setGenerationJobs] = useState([]);
  const [generatedAssets, setGeneratedAssets] = useState([]);
  const [productImage, setProductImage] = useState(null);
  const pollInFlight = useRef(false);
  const pollStartedAt = useRef(0);
  const pollFailureCount = useRef(0);
  const settledJobsSeen = useRef(0);
  const generationSubmissionInFlight = useRef(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const hasProviderPricedAssets = assetRows.some((row) => row.credits == null);
  const assetTotal = assetRows.reduce((total, row) => total + (row.credits || 0), 0);
  const hasActiveJobs =
    generationJobs.some(
      (job) => !["COMPLETED", "FAILED"].includes(job.status),
    ) && !pollTimedOut;
  const update = (key, value) => setBrief({ ...brief, [key]: value });
  useEffect(() => {
    if (!isOrganizationWorkspace) {
      setBrandKit(null);
      return;
    }
    let cancelled = false;
    setBrandKitLoading(true);
    setBrandKitError(false);
    authFetch("/api/brand-kit", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load Brand Kit.");
        if (!cancelled) setBrandKit(result.brandKit || null);
      })
      .catch(() => { if (!cancelled) setBrandKitError(true); })
      .finally(() => { if (!cancelled) setBrandKitLoading(false); });
    return () => { cancelled = true; };
  }, [authFetch, isOrganizationWorkspace]);
  const stepStatus = (index) => {
    if (!plan)
      return index === 0
        ? { label: "â—‹ Not started", active: true }
        : { label: "â—‹ Not started", active: false };
    if (generationJobs.length)
      return index < 3
        ? { label: "âœ“ Completed", active: false }
        : { label: "â— Processing", active: true };
    if (approved)
      return index < 3
        ? { label: "âœ“ Completed", active: false }
        : { label: "â— Ready to generate", active: true };
    if (index === 0) return { label: "âœ“ Completed", active: false };
    if (index === 1) return { label: "â— In review", active: true };
    if (index === 2) return { label: "â— In review", active: false };
    return { label: "â—‹ Waiting for approval", active: false };
  };
  useEffect(() => {
    const savedCampaignId = window.sessionStorage.getItem(
      "creatora_active_campaign_id",
    );
    if (!savedCampaignId) return;
    setCampaignId(savedCampaignId);
    authFetch(`/api/campaign-agent/${savedCampaignId}/status`, {
      cache: "no-store",
    })
      .then((response) => {
        if (response.status === 404) {
          // Campaign belonged to a previous session/organization and no
          // longer exists here - drop it instead of reusing a dead id.
          window.sessionStorage.removeItem("creatora_active_campaign_id");
          setCampaignId("");
          return null;
        }
        return response.ok ? response.json() : null;
      })
      .then((result) => {
        if (!result) return;
        setGenerationJobs(result.jobs || []);
        setGeneratedAssets(result.assets || []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!campaignId || !hasActiveJobs) return undefined;
    if (!pollStartedAt.current) pollStartedAt.current = Date.now();
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      if (pollInFlight.current) return;
      if (Date.now() - pollStartedAt.current > CAMPAIGN_POLL_TIMEOUT_MS) {
        setPollTimedOut(true);
        setMessage(
          "Generation is taking longer than expected. You can safely leave this page and check the Asset Library later.",
        );
        return;
      }
      pollInFlight.current = true;
      try {
        const response = await authFetch(
          `/api/campaign-agent/${campaignId}/status`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Status check failed.");
        pollFailureCount.current = 0;
        setGenerationJobs(result.jobs || []);
        setGeneratedAssets(result.assets || []);
        (result.assets || []).forEach((asset) =>
          updateAsset(asset.jobId, {
            url: asset.outputUrl || asset.url,
            status: asset.status,
            thumbnailUrl: asset.thumbnailUrl,
          }),
        );
        // Every job that reaches a terminal state has spent real credits. Compare
        // the settled count against the previous poll so we refresh exactly once
        // per newly-finished batch instead of on every 5s poll tick.
        const settledCount = (result.jobs || []).filter(
          (job) => job.status === "COMPLETED" || job.status === "FAILED",
        ).length;
        if (settledCount > settledJobsSeen.current) {
          settledJobsSeen.current = settledCount;
          fetchMuApiBalance(authFetch, { force: true })
            .then(broadcastMuApiBalance)
            .catch(() => {});
        }
      } catch (error) {
        pollFailureCount.current += 1;
        if (pollFailureCount.current >= 3)
          setMessage(
            "Temporary network issue while checking generation status. Retrying automatically.",
          );
      } finally {
        pollInFlight.current = false;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [campaignId, hasActiveJobs]);
  const handleProductImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Use a PNG, JPG, or WebP product image.");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("The product image must be 10MB or smaller.");
      event.target.value = "";
      return;
    }
    if (productImage?.url) URL.revokeObjectURL(productImage.url);
    setProductImage({
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      progress: 100,
      status: "Valid image - ready for campaign assets",
    });
    setMessage("");
  };
  const removeProductImage = () => {
    if (productImage?.url) URL.revokeObjectURL(productImage.url);
    setProductImage(null);
  };
  const requestCampaign = async (endpoint) => {
    setPlanning(true);
    setMessage("");
    setApproved(false);
    setGenerationJobs([]);
    setGeneratedAssets([]);
    setPollTimedOut(false);
    try {
      const response = await authFetch(`/api/campaign-agent/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, brief: { ...brief, productImageProvided: Boolean(productImage) }, applyBrandKit: isOrganizationWorkspace && applyBrandKit }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          result.message ||
            result.error ||
            "Campaign Strategist needs more detail.",
        );
        return;
      }
      setCampaignId(result.campaign.id);
      window.sessionStorage.setItem(
        "creatora_active_campaign_id",
        result.campaign.id,
      );
      setAgentSource(result.campaign.source);
      setPlan(viewPlanFromCampaign(result.campaign));
      setAssetRows(
        assetRowsFromRecommendations(result.campaign.plan.assetRecommendations),
      );
    } catch (error) {
      setMessage(error.message || "Campaign Strategist request failed.");
    } finally {
      setPlanning(false);
    }
  };
  const resetStaleCampaign = () => {
    window.sessionStorage.removeItem("creatora_active_campaign_id");
    setCampaignId("");
    setPlan(null);
    setApproved(false);
    setMessage(
      "That campaign is no longer available. Generate a new campaign plan to continue.",
    );
  };
  const approveCampaignPlan = async () => {
    const response = await authFetch("/api/campaign-agent/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, stage: "strategy" }),
    });
    if (response.status === 404) return resetStaleCampaign();
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Approval failed.");
      return;
    }
    setApproved(true);
    setMessage(
      "Campaign plan approved. Review the credit estimate before generating MuAPI assets.",
    );
  };
  const prepareAssets = async () => {
    const response = await authFetch("/api/campaign-agent/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    if (response.status === 404) return resetStaleCampaign();
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Asset recommendation failed.");
      return;
    }
    setAssetRows(assetRowsFromRecommendations(result.assetRecommendations));
    setAssetDialogOpen(true);
  };
  const confirmAssetGeneration = async () => {
    if (generationSubmissionInFlight.current) return;
    const selectedAssets = assetRows
      .map((row) => row.recommendation)
      .filter(Boolean);
    generationSubmissionInFlight.current = true;
    setGenerationStarting(true);
    setMessage("");
    try {
      const generationForm = new FormData();
      generationForm.append("assets", JSON.stringify(selectedAssets));
      if (productImage?.file) generationForm.append("productImage", productImage.file, productImage.name);
      const response = await authFetch(`/api/campaign-agent/generate-assets?campaignId=${encodeURIComponent(campaignId)}`, { method: "POST", body: generationForm });
      if (response.status === 404) return resetStaleCampaign();
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Asset generation failed.");
        return;
      }

      // The request has been accepted: leave the review modal and let the real
      // job state drive the page-level generation experience.
      setGenerationJobs(result.jobs || []);
      setAssetDialogOpen(false);
      const project = createProject({
        name: plan.name,
        cost: 0,
        prompt: plan.concept,
        style: brief.style,
      });
      updateProject(project.id, {
        status: "Generating assets",
        progress: 0,
        campaignId,
        assets: result.jobs?.length || assetRows.length,
        updated: "just now",
      });
      (result.jobs || []).forEach((job) =>
        addAsset({
          id: job.jobId,
          name: job.title || `${plan.name} - ${job.type}`,
          projectId: project.id,
          campaignId,
          jobId: job.jobId,
          type:
            job.type === "video"
              ? "Video"
              : job.type === "audio"
                ? "Audio"
                : "Image",
          prompt: job.prompt,
          platform: job.platform,
          format: job.aspectRatio,
          status: job.status === "QUEUED" ? "PROCESSING" : job.status,
          url: job.outputUrl || "",
          thumbnailUrl: job.thumbnailUrl || "",
        }),
      );
      window.sessionStorage.setItem("creatora_active_campaign_id", campaignId);
      setPollTimedOut(false);
      pollStartedAt.current = Date.now();
      pollFailureCount.current = 0;
      // Submission itself debits the account, so refresh immediately and reset the
      // settled-job counter so the completion refresh fires again for this batch.
      settledJobsSeen.current = 0;
      fetchMuApiBalance(authFetch, { force: true })
        .then(broadcastMuApiBalance)
        .catch(() => {});
      window.dispatchEvent(new Event("creatora:workspace-updated"));
      setMessage(
        `Submitted ${result.jobs?.length || 0} MuAPI jobs${
          result.remainingCredits != null ? ` - ${result.remainingCredits} MuAPI credits remaining` : ""
        } and added them to the Asset Library.`,
      );
    } catch (error) {
      setMessage(error.message || "Asset generation failed.");
    } finally {
      generationSubmissionInFlight.current = false;
      setGenerationStarting(false);
    }
  };
  const retryAsset = async (asset) => {
    const retryAssets = [{
      type: asset.type,
      title: asset.title,
      prompt: asset.prompt,
      platform: asset.platform,
      aspectRatio: asset.format,
      duration: asset.type === "video" ? Math.max(10, Number(asset.duration || 10)) : undefined,
    }];
    const generationForm = new FormData();
    generationForm.append("assets", JSON.stringify(retryAssets));
    if (asset.type === "video" && productImage?.file) generationForm.append("productImage", productImage.file, productImage.name);
    const response = await authFetch(`/api/campaign-agent/generate-assets?campaignId=${encodeURIComponent(campaignId)}`, { method: "POST", body: generationForm });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Retry failed.");
      return;
    }
    setGenerationJobs((jobs) => [...jobs, ...(result.jobs || [])]);
    setPollTimedOut(false);
    pollStartedAt.current = Date.now();
    settledJobsSeen.current = 0;
    fetchMuApiBalance(authFetch, { force: true })
      .then(broadcastMuApiBalance)
      .catch(() => {});
    setMessage(`Retry submitted for ${asset.title}.`);
  };
  return (
    <main className="workspace-page campaign-agent">
      <div className="page-title">
        <div>
          <span>WORKSPACE / CAMPAIGN AGENT</span>
          <h1>Campaign Strategist Agent</h1>
          <p>
            Campaign brief to structured strategy, approval, MuAPI prompts and
            real assets.
          </p>
        </div>
        <button
          className="button"
          onClick={() => requestCampaign("plan")}
          disabled={planning}
        >
          {planning
            ? "Asking strategist..."
            : plan
              ? "Regenerate Plan"
              : "Generate campaign plan"}
        </button>
      </div>
      {message && <div className="agent-clarification">{message}</div>}
      <div className="campaign-layout">
        <section className="settings-card campaign-brief">
          <h3>Campaign Brief</h3>
          <label>
            Product name
            <input
              value={brief.product}
              onChange={(event) => update("product", event.target.value)}
              placeholder="AI Ad Prompt Ebook"
            />
          </label>
          <label>
            Product description
            <textarea
              value={brief.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="200 ready-to-use ChatGPT prompts for product ads, headlines and social campaigns."
            />
          </label>
          <label>
            Product image
            <span className="field-hint">
              Upload the ebook cover or product visual.
            </span>
            <input
              id="campaign-v2-product-image"
              type="file"
              accept="image/*"
              onChange={handleProductImage}
            />
          </label>
          {productImage && (
            <div className="image-upload-preview">
              <img src={productImage.url} alt="Selected campaign product" />
              <div>
                <b>{productImage.name}</b>
                <span>{productImage.status}</span>
                <div className="upload-meter">
                  <i style={{ width: `${productImage.progress}%` }} />
                </div>
                <small>Upload progress {productImage.progress}%</small>
                <div className="card-actions">
                  <label htmlFor="campaign-v2-product-image">Replace</label>
                  <button type="button" onClick={removeProductImage}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
          <label>
            Target country
            <select
              value={brief.country}
              onChange={(event) => update("country", event.target.value)}
            >
              {campaignCountries.map((country) => (
                <option key={country}>{country}</option>
              ))}
            </select>
          </label>
          <label>
            Target audience
            <span className="field-hint">
              Example:{" "}
              {brief.country === "India"
                ? "Indian ecommerce sellers and small-business owners aged 22-45"
                : `${brief.country} ecommerce sellers and small-business owners aged 22-45`}
            </span>
            <input
              value={brief.audience}
              onChange={(event) => update("audience", event.target.value)}
              placeholder={`${brief.country} ecommerce sellers and small-business owners aged 22-45`}
            />
          </label>
          <label>
            Campaign objective
            <select
              value={brief.objective}
              onChange={(event) => update("objective", event.target.value)}
            >
              <option>Sales</option>
              <option>Awareness</option>
              <option>Lead generation</option>
              <option>Product launch</option>
              <option>Retention</option>
            </select>
          </label>
          <label>
            Offer or discount
            <input
              value={brief.offer}
              onChange={(event) => update("offer", event.target.value)}
              placeholder="40% off during launch period"
            />
          </label>
          <label>
            Platforms
            <input
              value={brief.platforms}
              onChange={(event) => update("platforms", event.target.value)}
            />
          </label>
          {isOrganizationWorkspace && <section className="apply-brand-kit-control" aria-label="Brand Kit">
            <div className="apply-brand-kit-heading">
              <strong>Brand Kit</strong>
              <span>{brandKitLoading ? "Loading Brand Kit..." : brandKitError ? "Unable to load Brand Kit" : brandKit ? `✓ ${brandKit.brandName || "Organization brand"}` : "No Brand Kit configured"}</span>
            </div>
            {!brandKitLoading && !brandKit && !brandKitError && <Link href="/dashboard/brand-kit">Set Up Brand Kit</Link>}
            {brandKit && <>
              <label className="toggle">
                <input type="checkbox" checked={applyBrandKit} onChange={(event) => setApplyBrandKit(event.target.checked)} />
                Apply Brand Kit
              </label>
              {applyBrandKit && <p>Applying: Brand name · Description · Audience · Tone · Image/video style · CTA</p>}
              <Link href="/dashboard/brand-kit">View Brand Kit</Link>
            </>}
          </section>}
          <label>
            Campaign duration
            <input
              value={brief.duration}
              onChange={(event) => update("duration", event.target.value)}
            />
          </label>
          <label>
            Preferred creative style
            <input
              value={brief.style}
              onChange={(event) => update("style", event.target.value)}
            />
          </label>
          <label>
            Advertising budget range
            <input
              value={brief.budget}
              onChange={(event) => update("budget", event.target.value)}
            />
          </label>
        </section>
        <section className="campaign-board campaign-status-board">
          {campaignStepCards.map((step, index) => {
            const status = stepStatus(index);
            return (
              <article
                className={status.active ? "active" : plan ? "ready" : ""}
                key={step.title}
              >
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{plan ? step.doneStatus : "Waiting for campaign brief"}</p>
                <b>{status.label}</b>
              </article>
            );
          })}
        </section>
      </div>
      {plan && (
        <section className="settings-card campaign-output professional-output">
          <div className="campaign-output-head">
            <div>
              <span>
                {approved
                  ? "APPROVED PLAN"
                  : `READY FOR REVIEW - ${agentSource}`}
              </span>
              <h3>{plan.name}</h3>
            </div>
            <div className="card-actions">
              <button type="button" onClick={() => setEditing(!editing)}>
                Edit Plan
              </button>
              <button
                type="button"
                onClick={() => requestCampaign("regenerate")}
                disabled={planning}
              >
                Regenerate Plan
              </button>
              <button type="button" onClick={approveCampaignPlan}>
                Approve Campaign Plan
              </button>
            </div>
          </div>
          <div>
            <b>Campaign concept</b>
            <p>{plan.concept}</p>
          </div>
          <div>
            <b>Audience segments</b>
            <ul>
              {plan.segments.map((segment) => (
                <li key={segment}>{segment}</li>
              ))}
            </ul>
          </div>
          <div>
            <b>Messaging angle</b>
            <p>{plan.angle}</p>
          </div>
          {plan.positioning && (
            <div>
              <b>Positioning</b>
              <p>{plan.positioning}</p>
            </div>
          )}
          <div>
            <b>Headlines</b>
            <ul>
              {plan.headlines.map((headline) => (
                <li key={headline}>{headline}</li>
              ))}
            </ul>
          </div>
          <div>
            <b>Advertisement copy</b>
            <p>{plan.adCopy}</p>
          </div>
          <div>
            <b>Social captions</b>
            <p>{plan.caption}</p>
          </div>
          <div>
            <b>Hashtags</b>
            <p>{plan.hashtags.join(" ")}</p>
          </div>
          <div>
            <b>Publishing calendar</b>
            <ul>
              {plan.calendar.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {editing && (
            <textarea
              className="strategy-editor"
              value={plan.angle}
              onChange={(event) =>
                setPlan({ ...plan, angle: event.target.value })
              }
            />
          )}
          <button
            className="button"
            disabled={!approved}
            onClick={prepareAssets}
          >
            Generate {assetRows.length} Assets - Estimated {assetTotal} Credits
          </button>
        </section>
      )}
      {hasActiveJobs && (
        <section className="settings-card campaign-generation-loader">
          <CreateoraLoadingState label="Generating your campaign assets..." />
        </section>
      )}
      {generationJobs.length > 0 && (
        <section className="settings-card generation-jobs">
          <h3>Generation jobs</h3>
          <p>
            Videos can take several minutes. Status checks run about every 5
            seconds while jobs are active.
          </p>
          {generationJobs.map((job) => {
            const hasProgress = typeof job.progress === "number";
            return (
              <article key={job.jobId}>
                <div>
                  <b>{job.title || job.type}</b>
                  <span>{job.status}</span>
                </div>
                <div
                  className={`upload-meter ${!hasProgress && !["COMPLETED", "FAILED"].includes(job.status) ? "indeterminate" : ""}`}
                >
                  <i
                    style={{
                      width: `${hasProgress ? job.progress : job.status === "COMPLETED" ? 100 : 0}%`,
                    }}
                  />
                </div>
                <small>
                  {job.platform} - {job.aspectRatio || job.format}
                  {job.error ? ` - ${job.error}` : ""}
                </small>
              </article>
            );
          })}
        </section>
      )}
      {generatedAssets.length > 0 && (
        <section className="settings-card generated-results">
          <h3>Generated results</h3>
          {generatedAssets.map((asset) => {
            const outputUrl = asset.outputUrl || asset.url;
            const failed = asset.status === "FAILED";
            return (
              <article key={asset.assetId}>
                {failed ? (
                  <div className="collection-art asset-failed">
                    <span>Failed</span>
                    <small>
                      {asset.errorMessage ||
                        "MuAPI could not generate this asset."}
                    </small>
                  </div>
                ) : asset.type === "video" && outputUrl ? (
                  <VideoPlayer className="generated-video" src={outputUrl} />
                ) : asset.type === "audio" && outputUrl ? (
                  <AudioPlayer className="generated-audio" src={outputUrl} />
                ) : (
                  <img
                    src={outputUrl || asset.thumbnailUrl}
                    alt="Generated campaign asset"
                  />
                )}
                <div>
                  <b>
                    {asset.type === "video"
                      ? "Generated video"
                      : asset.type === "audio"
                        ? "Generated audio"
                        : "Generated image"}
                  </b>
                  <span>
                    {asset.platform} - {asset.format}
                  </span>
                  <div className="card-actions">
                    {failed ? (
                      <button type="button" onClick={() => retryAsset(asset)}>
                        Retry
                      </button>
                    ) : (
                      <>
                        <a
                          href={downloadHref(
                            outputUrl,
                            asset.title || `campaign-${asset.type}`,
                            asset.type === "video"
                              ? "Video"
                              : asset.type === "audio"
                                ? "Audio"
                                : "Image",
                          )}
                          download={downloadFilename(
                            outputUrl,
                            asset.title || `campaign-${asset.type}`,
                            asset.type === "video"
                              ? "Video"
                              : asset.type === "audio"
                                ? "Audio"
                                : "Image",
                          )}
                        >
                          Download
                        </a>
                        <SocialPublishButton
                          asset={{
                            ...asset,
                            id: asset.assetId || asset.id,
                            assetId: asset.assetId || asset.id,
                            type: asset.type === "video" ? "Video" : asset.type === "audio" ? "Audio" : "Image",
                            outputUrl,
                            caption: [plan?.caption, plan?.hashtags?.join(" ")].filter(Boolean).join("\n\n"),
                          }}
                          authFetch={authFetch}
                          notify={setMessage}
                        />
                        <button type="button">Regenerate</button>
                        <button type="button">Edit prompt</button>
                        <button type="button">Save to Asset Library</button>
                        <button type="button">Mark as approved</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {assetDialogOpen && (
        <div className="asset-dialog-backdrop">
          <section className="settings-card asset-dialog">
            <div className="campaign-output-head">
              <div>
                <span>ASSET GENERATION</span>
                <h3>Generate Campaign Assets</h3>
              </div>
              <button type="button" onClick={() => setAssetDialogOpen(false)}>
                Cancel
              </button>
            </div>
            {assetRows.map(({ item, credits, recommendation }) => (
              <label className="asset-row" key={item}>
                <span>
                  {item}
                  <small>
                    {recommendation
                      ? `${recommendation.platform} - ${recommendation.format || recommendation.aspectRatio}`
                      : ""}
                  </small>
                </span>
                <input type="checkbox" defaultChecked />
                <b>{credits == null ? "Provider-priced" : credits ? `${credits} credits` : "Included"}</b>
              </label>
            ))}
            <div className="asset-total">
              <span>Estimated total</span>
              <b>{hasProviderPricedAssets ? "Confirmed by provider" : `${assetTotal} credits`}</b>
            </div>
            <button className="button" onClick={confirmAssetGeneration} disabled={generationStarting}>
              {generationStarting ? "Starting generation..." : `Generate ${assetRows.length} Assets`}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function Templates({ notify, notice }) {
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [facets, setFacets] = useState({
    category: [],
    platform: [],
    output: [],
    campaign: [],
  });
  const [playingId, setPlayingId] = useState("");
  const [filters, setFilters] = useState({
    category: "All",
    platform: "All",
    output: "All",
    campaign: "All",
  });

  const canPlayTemplatePreview = (template) => Boolean(
    template.previewUrl && (/\.(mp4|webm|mov|m3u8)(?:\?|$)/i.test(template.previewUrl) || template.previewUrl.startsWith("blob:")),
  );
  const [productFile, setProductFile] = useState(null);
  const [brandColors, setBrandColors] = useState(() =>
    [
      getWorkspace().brandKit?.primaryColor,
      getWorkspace().brandKit?.accentColor,
    ]
      .filter(Boolean)
      .join(", "),
  );
  const [offer, setOffer] = useState("");
  const [details, setDetails] = useState("");
  const [mediaPreference, setMediaPreference] = useState("Voiceover + music");
  const [inputError, setInputError] = useState("");
  const [savedIds, setSavedIds] = useState(
    () =>
      new Set(
        (getWorkspace().templates || [])
          .filter((item) => item.favourite)
          .map((item) => item.id),
      ),
  );
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError("");
    loadTemplates({ page, pageSize: 12, ...filters })
      .then((result) => {
        if (cancelled) return;
        const records = result.templates || [];
        setTemplates(records);
        setPagination(result.pagination || { page: 1, total: 0, totalPages: 1 });
        setFacets(result.facets || facets);
        setSelected((current) =>
          records.some((item) => item.id === current?.id)
            ? current
            : records[0] || current,
        );
        setPlayingId("");
      })
      .catch((reason) => setCatalogError(reason.message))
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, filters.category, filters.platform, filters.output, filters.campaign]);
  const choices = (key) => ["All", ...(facets[key] || [])];
  const visible = templates;
  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const selectTemplate = (template, playPreview = false) => {
    setSelected(template);
    setProductFile(null);
    setOffer("");
    setDetails("");
    setInputError("");
    setPlayingId(playPreview && canPlayTemplatePreview(template) ? template.id : "");
  };
  const validateFile = (file) => {
    if (!file) {
      setProductFile(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setInputError("Upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setInputError("The product image must be 10MB or smaller.");
      return;
    }
    setInputError("");
    setProductFile(file);
  };
  const saveTemplate = (template) => {
    toggleTemplateFavourite(template.id);
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(template.id)) next.delete(template.id);
      else next.add(template.id);
      return next;
    });
    notify(
      savedIds.has(template.id)
        ? `${template.name} removed from saved templates.`
        : `${template.name} saved for later.`,
    );
  };
  const templateRoute = (template) => {
    const output = String(template.outputType || template.type || "").toLowerCase();
    if (output.includes("campaign") || output.includes("image + video"))
      return "ads";
    if (output.includes("audio")) return "ads";
    if (output.includes("video")) return "video";
    return "image";
  };
  const useTemplate = () => {
    const requiresImage = selected.requirements.some((item) =>
      /product photo|reference image/i.test(item),
    );
    const requiresColors = selected.requirements.some((item) =>
      /brand colours/i.test(item),
    );
    const requiresOffer = selected.requirements.some((item) =>
      /offer/i.test(item),
    );
    const requiresDetails = selected.requirements.some(
      (item) =>
        !/product photo|reference image|brand colours|offer|voice preference/i.test(
          item,
        ),
    );
    if (requiresImage && !productFile) {
      setInputError(
        "Upload the required product or reference image before continuing.",
      );
      return;
    }
    if (requiresColors && !brandColors.trim()) {
      setInputError("Enter the required brand colours before continuing.");
      return;
    }
    if (requiresOffer && !offer.trim()) {
      setInputError("Enter the promotional offer before continuing.");
      return;
    }
    if (requiresDetails && !details.trim()) {
      setInputError(
        "Complete the campaign details requested by this workflow.",
      );
      return;
    }
    pendingTemplateAssets.set(selected.id, {
      productFile,
      brandColors,
      offer,
      details,
      mediaPreference,
    });
    router.push(
      `/dashboard/${templateRoute(selected)}?template=${encodeURIComponent(selected.id)}`,
    );
  };
  const openTemplate = (template) => {
    pendingTemplateAssets.set(template.id, {
      brandColors: [
        getWorkspace().brandKit?.primaryColor,
        getWorkspace().brandKit?.accentColor,
      ]
        .filter(Boolean)
        .join(", "),
      mediaPreference:
        template.video || template.audio ? "Voiceover + music" : "",
    });
    router.push(
      `/dashboard/${templateRoute(template)}?template=${encodeURIComponent(template.id)}`,
    );
  };
  if (!selected) {
    return (
      <main className="workspace-page collection template-library">
        <div className="page-title">
          <div>
            <span>WORKSPACE / TEMPLATES</span>
            <h1>Template library</h1>
            <p>Ready-made AI workflows with preconfigured inputs, outputs and generation settings.</p>
          </div>
        </div>
        {catalogLoading ? (
          <CreateoraLoadingState label="Loading templates..." />
        ) : (
          <div className="empty-state">
            <b>{catalogError ? "Unable to load templates" : "No templates available"}</b>
            <p>{catalogError || "No templates match the current library filters."}</p>
          </div>
        )}
      </main>
    );
  }
  return (
    <main className="workspace-page collection template-library">
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>WORKSPACE / TEMPLATES</span>
          <h1>Template library</h1>
          <p>
            Ready-made AI workflows with preconfigured inputs, outputs and
            generation settings.
          </p>
        </div>
      </div>
      <section className="template-filters" aria-label="Template filters">
        <label>
          Category
          <select
            value={filters.category}
            onChange={(event) => updateFilter("category", event.target.value)}
          >
            {choices("category").map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Platform
          <select
            value={filters.platform}
            onChange={(event) => updateFilter("platform", event.target.value)}
          >
            {choices("platform").map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Output type
          <select
            value={filters.output}
            onChange={(event) => updateFilter("output", event.target.value)}
          >
            {choices("output").map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Campaign type
          <select
            value={filters.campaign}
            onChange={(event) => updateFilter("campaign", event.target.value)}
          >
            {choices("campaign").map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>
      <div className="template-workspace">
        <section className="template-catalog">
          {catalogLoading ? (
            <CreateoraLoadingState label="Loading templates..." />
          ) : visible.length ? (
            visible.map((template) => (
              <article
                className={selected.id === template.id ? "selected" : ""}
                key={template.id}
              >
                <div className="template-preview-button">
                  <div
                    className={`template-media ${template.tone}`}
                    style={{
                      backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(0,0,0,.58)), url(${template.image})`,
                    }}
                    onClick={() => selectTemplate(template, template.video || template.audio)}
                  >
                    {playingId === template.id && canPlayTemplatePreview(template) ? (
                      <video
                        src={template.previewUrl}
                        poster={template.image}
                        controls
                        autoPlay
                        playsInline
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : null}
                    {template.video && canPlayTemplatePreview(template) && (
                      <button
                        className="play-chip"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(template);
                          setPlayingId((current) =>
                            current === template.id ? "" : template.id,
                          );
                        }}
                      >
                        {playingId === template.id ? "Close preview" : "Play video"}
                      </button>
                    )}
                    <b>{template.format}</b>
                  </div>
                  <button
                    className="template-copy"
                    type="button"
                    onClick={() => selectTemplate(template)}
                  >
                    <h3>{template.name}</h3>
                    <p>
                      {template.industry} · {template.platform}
                    </p>
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Output</dt>
                    <dd>{template.type}</dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>{template.format}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{template.duration}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{template.cost} credits</dd>
                  </div>
                </dl>
                <div className="template-card-actions">
                  <button
                    className={`button secondary template-save ${savedIds.has(template.id) ? "saved" : ""}`}
                    type="button"
                    onClick={() => saveTemplate(template)}
                  >
                    {savedIds.has(template.id) ? "Saved" : "Save"}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => openTemplate(template)}
                  >
                    Use Template
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h3>No matching templates</h3>
              <p>Change one or more filters to see additional workflows.</p>
            </div>
          )}
          {!catalogLoading && pagination.totalPages > 1 && (
            <nav className="template-pagination" aria-label="Template pages">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages} ·{" "}
                {pagination.total} templates
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(pagination.totalPages, current + 1),
                  )
                }
              >
                Next
              </button>
            </nav>
          )}
        </section>
        <aside className="template-detail settings-card">
          <div
            className={`template-media large ${selected.tone}`}
            style={{
              backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(0,0,0,.62)), url(${selected.image})`,
            }}
          >
            {playingId === selected.id && canPlayTemplatePreview(selected) ? (
              selected.audio ? (
                <AudioPlayer src={selected.previewUrl} />
              ) : (
                <video
                  src={selected.previewUrl}
                  poster={selected.image}
                  controls
                  autoPlay
                  playsInline
                />
              )
            ) : null}
            {(selected.video || selected.audio) && canPlayTemplatePreview(selected) && (
              <button
                className="play-chip"
                type="button"
                onClick={() =>
                  setPlayingId((current) =>
                    current === selected.id ? "" : selected.id,
                  )
                }
              >
                {playingId === selected.id
                  ? "Close preview"
                  : selected.audio
                    ? "Play audio"
                    : "Play video"}
              </button>
            )}
            <b>{selected.format}</b>
          </div>
          <span className="template-detail-kicker">
            {selected.campaignType} · {selected.platform}
          </span>
          <h3>{selected.name}</h3>
          <p>{selected.description}</p>
          <dl>
            <div>
              <dt>Required inputs</dt>
              <dd>{selected.inputs}</dd>
            </div>
            <div>
              <dt>Expected outputs</dt>
              <dd>{selected.outputs}</dd>
            </div>
            <div>
              <dt>Credit cost</dt>
              <dd>{selected.cost} credits</dd>
            </div>
          </dl>
          <div className="template-required">
            <b>Required workflow inputs</b>
            <ul>
              {selected.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="template-inputs">
            <label>
              Product or reference image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => validateFile(event.target.files?.[0])}
              />
              <small>
                {productFile
                  ? `${productFile.name} ready`
                  : "JPG, PNG or WebP Â· maximum 10MB"}
              </small>
            </label>
            {selected.requirements.some((item) =>
              /brand colours/i.test(item),
            ) && (
              <label>
                Brand colours
                <input
                  value={brandColors}
                  onChange={(event) => setBrandColors(event.target.value)}
                  placeholder="#FF5A36, #101011"
                />
              </label>
            )}
            {selected.requirements.some((item) => /offer/i.test(item)) && (
              <label>
                Promotional offer
                <input
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  placeholder="40% off this week"
                />
              </label>
            )}
            <label>
              Campaign details
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Benefits, location, dates, disclaimers, audience, or other required details"
              />
            </label>
            {(selected.video || selected.audio) && (
              <label>
                Audio preference
                <select
                  value={mediaPreference}
                  onChange={(event) => setMediaPreference(event.target.value)}
                >
                  <option>Voiceover + music</option>
                  <option>Voiceover only</option>
                  <option>Music only</option>
                  <option>Ambient sound only</option>
                </select>
              </label>
            )}
          </div>
          {inputError && (
            <div className="template-input-error">{inputError}</div>
          )}
          <div className="template-detail-actions">
            <button
              className={`button secondary ${savedIds.has(selected.id) ? "saved" : ""}`}
              type="button"
              onClick={() => saveTemplate(selected)}
            >
              {savedIds.has(selected.id) ? "Saved" : "Save for later"}
            </button>
            <button className="button" type="button" onClick={useTemplate}>
              Use Template
            </button>
          </div>
          <small className="template-credit-note">
            Using a template does not consume credits. Credits are checked only
            when you generate content.
          </small>
        </aside>
      </div>
    </main>
  );
}

function WorkflowBuilder({ workspace, notify, notice }) {
  const [selectedNodes, setSelectedNodes] = useState(workflowNodes.slice(0, 7));
  const [running, setRunning] = useState(false);
  const toggleNode = (node) =>
    setSelectedNodes((current) =>
      current.includes(node)
        ? current.filter((item) => item !== node)
        : [...current, node],
    );
  const save = () => {
    addWorkflow({
      name: "Visual creative workflow",
      description: selectedNodes.join(" -> "),
      status: "Ready",
    });
    notify("Workflow saved.");
  };
  const duplicate = (item) => {
    addWorkflow({
      name: `${item.name} copy`,
      description: item.description,
      status: "Draft",
    });
    notify("Workflow duplicated.");
  };
  return (
    <main className="workspace-page workflow-page">
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>WORKSPACE / CREATIVE WORKFLOWS</span>
          <h1>Creative workflows</h1>
          <p>
            Build reusable generation flows, run them with a product and review
            every output.
          </p>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={save}>
            Save workflow
          </button>
          <button
            className="button"
            onClick={() => {
              setRunning(true);
              notify("Workflow run started.");
            }}
          >
            Run with product
          </button>
        </div>
      </div>
      <div className="workflow-layout">
        <aside className="settings-card node-palette">
          <h3>Workflow nodes</h3>
          {workflowNodes.map((node) => (
            <button
              className={selectedNodes.includes(node) ? "selected" : ""}
              type="button"
              key={node}
              onClick={() => toggleNode(node)}
            >
              {node}
            </button>
          ))}
        </aside>
        <section className="workflow-canvas">
          {selectedNodes.map((node, index) => (
            <article key={node}>
              <span>{index + 1}</span>
              <h3>{node}</h3>
              <p>
                {running
                  ? index < 3
                    ? "Completed"
                    : index === 3
                      ? "Running"
                      : "Waiting"
                  : "Configured"}
              </p>
              <div
                className={
                  running && index < 3
                    ? "node-status done"
                    : running && index === 3
                      ? "node-status active"
                      : "node-status"
                }
              />
            </article>
          ))}
        </section>
        <aside className="settings-card workflow-monitor">
          <h3>Saved workflows</h3>
          {workspace.workflows.map((workflow) => (
            <div className="saved-workflow" key={workflow.id}>
              <b>{workflow.name}</b>
              <p>{workflow.description}</p>
              <span>{workflow.status}</span>
              <div className="card-actions">
                <button type="button" onClick={() => duplicate(workflow)}>
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateWorkflow(workflow.id, {
                      status: workflow.status === "Ready" ? "Paused" : "Ready",
                    })
                  }
                >
                  Toggle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteWorkflow(workflow.id);
                    notify("Workflow deleted.");
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}

const TONE_OPTIONS = [
  "Professional",
  "Friendly & Warm",
  "Bold & Energetic",
  "Luxury & Premium",
  "Fun & Playful",
  "Educational",
  "Minimal & Direct",
  "Custom",
];

function BrandKit({ workspace, authFetch, notify, notice, role }) {
  const canManage = role === "OWNER" || role === "ADMIN";
  const initialColors = workspace.brandKit?.brandColors || [workspace.brandKit?.primaryColor, workspace.brandKit?.secondaryColor].filter(Boolean);
  const [kit, setKit] = useState({ ...workspace.brandKit, brandColors: initialColors.length ? initialColors : ["#ff5a36", "#101011"] });
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [customTone, setCustomTone] = useState(
    Boolean(workspace.brandKit?.voice) &&
      !TONE_OPTIONS.slice(0, -1).includes(workspace.brandKit?.voice),
  );
  const update = (key, value) => setKit({ ...kit, [key]: value });
  const updateColor = (index, value) => setKit({
    ...kit,
    brandColors: (kit.brandColors || []).map((color, colorIndex) => colorIndex === index ? value : color),
  });
  const addColor = () => setKit({ ...kit, brandColors: [...(kit.brandColors || []), "#ffffff"].slice(0, 8) });
  const removeColor = (index) => setKit({
    ...kit,
    brandColors: (kit.brandColors || []).filter((_, colorIndex) => colorIndex !== index),
  });
  useEffect(() => {
    let cancelled = false;
    authFetch("/api/brand-kit", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load brand kit.");
        if (!cancelled && result.brandKit) {
          setKit(result.brandKit);
          setCustomTone(
            Boolean(result.brandKit.voice) &&
              !TONE_OPTIONS.slice(0, -1).includes(result.brandKit.voice),
          );
        }
      })
      .catch((error) => notify(error.message));
    return () => { cancelled = true; };
  }, [authFetch]);
  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const response = await authFetch("/api/brand-kit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kit),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save brand kit.");
      if (logoFile) {
        const logoBody = new FormData();
        logoBody.append("slot", "primary");
        logoBody.append("file", logoFile);
        const logoResponse = await authFetch("/api/brand-kit/logo", { method: "POST", body: logoBody });
        const logoResult = await logoResponse.json();
        if (!logoResponse.ok) throw new Error(logoResult.error || "Unable to upload the logo.");
      }
      const savedKit = { ...result.brandKit, logoName: logoFile?.name || result.brandKit.logoName };
      setKit(savedKit);
      setLogoFile(null);
      updateWorkspace({ brandKit: savedKit });
      notify("Brand Kit saved.");
    } catch (error) {
      notify(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="workspace-page collection brand-kit-page">
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>WORKSPACE / BRAND KIT</span>
          <h1>Brand kit</h1>
          <p>
            Keep every Createora generation consistent with your brand. Save
            it once and it is automatically applied to new projects.
          </p>
        </div>
        {canManage && (
          <button className="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save brand kit"}
          </button>
        )}
        {!canManage && (
          <span className="read-only-badge">Managed by your organization (read-only)</span>
        )}
      </div>
      <div className="settings-grid brand-grid">
        <section className="settings-card">
          <h3>Brand identity</h3>
          <label>
            Brand name
            <input
              value={kit.brandName || ""}
              onChange={canManage ? (event) => update("brandName", event.target.value) : undefined}
              disabled={!canManage}
              placeholder="MoodMap"
            />
          </label>
          {canManage ? (
            <label className="dropzone compact">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => { const file = event.target.files?.[0] || null; setLogoFile(file); update("logoName", file?.name || ""); }}
              />
              <b>+</b>
              <strong>{kit.logoName || "Upload logo"}</strong>
              <small>PNG / JPG / WebP</small>
            </label>
          ) : (
            <label className="dropzone compact read-only">
              <div className="logo-display">
                {kit.logoName ? <strong>{kit.logoName}</strong> : <span>No logo uploaded</span>}
              </div>
              <small>Managed by organization administrators</small>
            </label>
          )}
          <label>
            Brand description
            <textarea
              value={kit.description || ""}
              onChange={canManage ? (event) => update("description", event.target.value) : undefined}
              disabled={!canManage}
              placeholder="Briefly describe what your brand does and what you offer."
            />
          </label>
          <label>
            Brand colors
            <div className="brand-color-list">
              {(kit.brandColors || []).map((color, index) => (
                <div className="brand-color-row" key={`${color}-${index}`}>
                  <input
                    type="color"
                    value={color || "#ffffff"}
                    onChange={canManage ? (event) => updateColor(index, event.target.value) : undefined}
                    disabled={!canManage}
                    aria-label={`Brand color ${index + 1}`}
                  />
                  <input
                    value={color || ""}
                    onChange={canManage ? (event) => updateColor(index, event.target.value) : undefined}
                    disabled={!canManage}
                    aria-label={`Brand color ${index + 1} value`}
                  />
                  {canManage && (kit.brandColors || []).length > 1 && (
                    <button type="button" onClick={() => removeColor(index)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </label>
          {canManage && (
            <button type="button" className="button secondary" onClick={addColor} disabled={(kit.brandColors || []).length >= 8}>
              Add brand color
            </button>
          )}
          <div className="brand-swatches">
            {(kit.brandColors || []).map((color, index) => <i key={`${color}-${index}`} style={{ background: color || "#ffffff" }} />)}
          </div>
        </section>
        <section className="settings-card">
          <h3>Brand communication</h3>
          <label>
            Tone of voice
            <select
              value={customTone ? "Custom" : kit.voice || ""}
              onChange={canManage ? (event) => {
                if (event.target.value === "Custom") { setCustomTone(true); update("voice", ""); return; }
                setCustomTone(false);
                update("voice", event.target.value);
              } : undefined}
              disabled={!canManage}
            >
              <option value="" disabled>Select a tone</option>
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone}>{tone}</option>
              ))}
            </select>
          </label>
          {customTone && (
            <label>
              Custom tone
              <input
                value={kit.voice || ""}
                onChange={canManage ? (event) => update("voice", event.target.value) : undefined}
                disabled={!canManage}
                placeholder="Describe the tone in your own words"
              />
            </label>
          )}
          <label>
            Target audience
            <textarea
              value={kit.targetAudience || ""}
              onChange={canManage ? (event) => update("targetAudience", event.target.value) : undefined}
              disabled={!canManage}
              placeholder="Young professionals aged 20-40 who are interested in wellness and mindfulness."
            />
          </label>
          <label>
            Default call-to-action
            <input
              value={kit.defaultCallToAction || ""}
              onChange={canManage ? (event) => update("defaultCallToAction", event.target.value) : undefined}
              disabled={!canManage}
              placeholder="Start Your Journey"
            />
          </label>
          <label>
            Image style
            <input
              value={kit.imageStyle || ""}
              onChange={canManage ? (event) => update("imageStyle", event.target.value) : undefined}
              disabled={!canManage}
              placeholder="Clean product photography with branded accents"
            />
          </label>
          <label>
            Video style
            <input
              value={kit.videoStyle || ""}
              onChange={canManage ? (event) => update("videoStyle", event.target.value) : undefined}
              disabled={!canManage}
              placeholder="Short-form product motion with brand-safe framing"
            />
          </label>
          <fieldset className="brand-logo-settings">
            <legend>Logo placement</legend>
            <div className="logo-placement-options" role="group" aria-label="Logo placement">
              {[
                ["top-left", "Top left"],
                ["top-right", "Top right"],
                ["center", "Center"],
                ["bottom-left", "Bottom left"],
                ["bottom-right", "Bottom right"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={kit.logoPlacement === value || (!kit.logoPlacement && value === "bottom-right") ? "selected" : ""}
                  aria-pressed={kit.logoPlacement === value || (!kit.logoPlacement && value === "bottom-right")}
                  onClick={canManage ? () => update("logoPlacement", value) : undefined}
                  disabled={!canManage}
                >
                  <span className={`logo-placement-preview ${value}`} aria-hidden="true"><i /></span>
                  {label}
                </button>
              ))}
            </div>
            <label className="toggle">
              <input type="checkbox" checked={kit.applyLogoToVideos !== false} onChange={canManage ? (event) => update("applyLogoToVideos", event.target.checked) : undefined} disabled={!canManage} />
              Apply logo to generated videos
            </label>
            <p className="brand-logo-note">An uploaded logo is overlaid during final video rendering. Logo overlays on generated images are not supported yet.</p>
          </fieldset>
        </section>
      </div>
    </main>
  );
}

function BillingCredits({ workspace, authFetch, notify, notice }) {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState("");
  const checkoutLock = useRef(false);
  const [balance, setBalance] = useState(null);
  const [balanceError, setBalanceError] = useState("");
  const [creditHistory, setCreditHistory] = useState([]);
  const [creditHistoryLoading, setCreditHistoryLoading] = useState(true);
  const [creditHistoryError, setCreditHistoryError] = useState("");
  const [planUsage, setPlanUsage] = useState(null);
  const loadBilling = async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/billing/subscription", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load billing.");
      setBilling(result);
      window.dispatchEvent(new Event("creatora:billing-updated"));
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  };
  const refreshBalance = () => fetchMuApiBalance(authFetch).then((value) => { setBalance(value); setBalanceError(""); }).catch((error) => setBalanceError(error.message));
  const loadCreditHistory = async () => {
    setCreditHistoryLoading(true);
    try {
      const response = await authFetch("/api/billing/usage", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load credit history.");
      setCreditHistory(result.usage || []);
      setPlanUsage(result.planUsage || null);
      setCreditHistoryError("");
    } catch (error) {
      setCreditHistoryError(error.message);
    } finally {
      setCreditHistoryLoading(false);
    }
  };
  useEffect(() => { loadBilling(); refreshBalance(); loadCreditHistory(); }, [authFetch]);
  useEffect(() => {
    const onBalance = (event) => {
      const next = event?.detail?.balance;
      if (next != null) {
        setBalance(next);
        setBalanceError("");
      } else {
        refreshBalance();
      }
    };
    window.addEventListener("creatora:muapi-balance", onBalance);
    return () => window.removeEventListener("creatora:muapi-balance", onBalance);
  }, []);

  useEffect(() => {
    if (!billing?.paymentPending && !billing?.planChangePending) return;
    let inFlight = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 60_000) { clearInterval(timer); return; }
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await authFetch("/api/billing/subscription", { cache: "no-store" });
        if (response.ok) {
          setBilling(await response.json());
          window.dispatchEvent(new Event("creatora:billing-updated"));
        }
      } catch {}
      finally { inFlight = false; }
    }, 3000);
    return () => clearInterval(timer);
  }, [authFetch, billing?.paymentPending, billing?.planChangePending]);

  const choosePlan = async (plan) => {
    if (plan.code === "free" || checkoutLock.current) return;
    if (!billing?.canManage) { notify("Only the workspace owner, admin or billing manager can change plans."); return; }
    if (!billing?.razorpayConfigured) { notify("Paid checkout is currently unavailable. Please try again later."); return; }
    checkoutLock.current = true;
    setCheckoutPlan(plan.code);
    const release = () => { checkoutLock.current = false; setCheckoutPlan(""); };
    let paymentReceived = false;
    try {
      const response = await authFetch("/api/billing/subscription", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode: plan.code }),
      });
      const checkout = await response.json();
      if (!response.ok) throw new Error(checkout.error || "Unable to start checkout.");
      if (checkout.upgrade) {
        notify(checkout.pending ? `${checkout.plan.name} upgrade is processing. Your current plan remains active until Razorpay confirms it.` : `${checkout.plan.name} is now active.`);
        await loadBilling();
        release();
        return;
      }
      await loadRazorpayCheckout();
      const instance = new window.Razorpay({
        key: checkout.keyId,
        subscription_id: checkout.subscriptionId,
        name: "Creatora AI",
        description: `${checkout.plan.name} monthly subscription`,
        notes: { workspace: checkout.organizationName },
        theme: { color: "#ff5a36" },
        modal: { ondismiss: () => { if (!paymentReceived) { notify("Checkout cancelled. Your plan has not changed."); release(); } } },
        handler: async (payment) => {
          paymentReceived = true;
          try {
          const verifyResponse = await authFetch("/api/billing/verify", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payment),
          });
          const verified = await verifyResponse.json();
          if (!verifyResponse.ok) { notify(verified.error || "Payment verification failed."); return; }
          notify(verified.pending ? "Payment received. Subscription activation is waiting for confirmation." : `${checkout.plan.name} is now active.`);
          await loadBilling();
          } catch { notify("Payment confirmation could not be checked. Refresh billing before retrying."); }
          finally { release(); }
        },
      });
      instance.on("payment.failed", () => {
        notify("Payment failed. Your plan was not activated. You can retry from the checkout.");
        release();
      });
      instance.open();
    } catch (error) { notify(error.message); release(); }
  };

  const cancelPlan = async () => {
    if (!window.confirm("Cancel this subscription at the end of the current billing period?")) return;
    try {
      const response = await authFetch("/api/billing/subscription", { method: "PATCH" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to cancel subscription.");
      notify("Subscription will cancel at the end of the current billing period.");
      await loadBilling();
    } catch (error) { notify(error.message); }
  };

  const plans = billing?.plans || [];
  const currentCode = billing?.effectivePlan?.code || "free";
  const currentPlan = plans.find((plan) => plan.code === currentCode);
  const cancellationDate = billing?.subscription?.currentPeriodEnd ? new Date(billing.subscription.currentPeriodEnd) : null;
  const validCancellationDate = cancellationDate && !Number.isNaN(cancellationDate.getTime()) ? cancellationDate : null;
  const cancellationDateLong = validCancellationDate?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const cancellationDateShort = validCancellationDate?.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const projectAllowance = currentPlan
    ? currentPlan.maxProjects == null
      ? "your plan has unlimited projects"
      : `your current plan allows ${currentPlan.maxProjects} projects`
    : "your current plan allowance is loading";
  return (
    <main className="workspace-page collection billing-page">
      {notice && <div className="toast" role="status">{notice}</div>}
      <div className="page-title"><div><span>WORKSPACE / BILLING</span><h1>Plan &amp; Billing</h1><p>Your Creatora AI subscription and AI generation balance.</p></div></div>
      <div className="billing-subscription-heading">
        <h2>Creatora AI Subscription</h2>
        {billing?.accountType && <p><strong>{billing.accountType === "ORGANIZATION" ? "Organization subscription" : "Personal subscription"}</strong><span>{billing.accountType === "ORGANIZATION" ? "Covers this workspace" : "Covers your personal workspace"}</span></p>}
      </div>
      {loading ? <div className="template-loading"><span className="generation-spinner" /><b>Loading plans…</b></div> : (
        <div className="plan-grid">
          {plans.map((plan) => {
            const current = currentCode === plan.code;
            const pricingPlan = PRICING_PLANS.find((item) => item.code === plan.code);
            return <article className={`settings-card ${current ? "featured" : ""}`} key={plan.code}>
              <div className="billing-plan-status">
                {current && <><em>{billing.subscription?.status === "ACTIVE" && <span aria-hidden="true">✓ </span>}CURRENT PLAN</em>{cancellationDateLong && (billing.subscription?.cancelAtPeriodEnd ? <><span>Cancels {cancellationDateLong}</span><p>You&#39;ll retain your current plan features until this date.</p></> : billing.subscription?.status === "ACTIVE" && plan.code !== "free" ? <span>Renews {cancellationDateLong}</span> : null)}</>}
              </div>
              <h3>{plan.name}</h3>
              <b className="plan-price">₹{(plan.monthlyPrice / 100).toLocaleString("en-IN")} {plan.code !== "free" && <small>/month</small>}</b>
              <p className="billing-plan-description">{pricingPlan?.description}</p>
              <ul className="billing-plan-features">
                {pricingPlan?.features.map((feature) => (
                  <li className={feature.included ? "included" : "excluded"} key={feature.text}>
                    <span aria-hidden="true">{feature.included ? "+" : "-"}</span>
                    {feature.text}
                  </li>
                ))}
              </ul>
              <button className={`button${current && billing.subscription?.cancelAtPeriodEnd && cancellationDateShort ? " current-cancellation" : ""}`} disabled={current || plan.code === "free" || Boolean(checkoutPlan) || (billing?.planChangePending && billing?.pendingPlan?.code !== plan.code) || !billing?.canManage} onClick={() => choosePlan(plan)}>
                {current ? <><span>Current plan</span>{billing.subscription?.cancelAtPeriodEnd && cancellationDateShort && <small>Cancels {cancellationDateShort}</small>}</> : checkoutPlan === plan.code ? "Processing…" : billing?.planChangePending && billing?.pendingPlan?.code === plan.code ? `Complete ${plan.name} upgrade` : currentCode === "creator" && plan.code === "pro" ? "Upgrade to Pro" : `Choose ${plan.name}`}
              </button>
            </article>;
          })}
        </div>
      )}
      {billing?.paymentPending && <p className="auth-status" role="status">Payment confirmation is pending. Your paid plan will become current after confirmation.</p>}
      {billing?.planChangePending && <p className="auth-status" role="status">Your upgrade to {billing.pendingPlan?.name || "the selected plan"} is processing. Your current plan and entitlements remain unchanged until Razorpay confirms the transition.</p>}
      {billing?.subscription?.cancelAtPeriodEnd && cancellationDateLong && <p className="auth-status billing-cancellation-notice" role="status"><strong>Your {billing.subscription.plan.name} subscription is set to cancel.</strong> You&#39;ll continue to have access to {billing.subscription.plan.name} features until {cancellationDateLong}. After that, your workspace will switch to the Free plan and you won&#39;t be charged again.</p>}
      {billing?.canManage && billing?.subscription?.status === "ACTIVE" && !billing.subscription.cancelAtPeriodEnd && billing.subscription.plan.code !== "free" && <button className="button secondary" onClick={cancelPlan}>Cancel subscription</button>}
      {planUsage?.plan === "free" && <section className="billing-plan-usage" aria-labelledby="billing-plan-usage-title">
        <h2 id="billing-plan-usage-title">Free Plan Usage</h2>
        <div className="billing-plan-usage-grid">
          <div><span>Projects</span><strong>{planUsage.projects.used} / {planUsage.projects.limit}</strong></div>
          <div><span>AI Images</span><strong>{planUsage.images.used} / {planUsage.images.limit}</strong></div>
          <div><span>AI Videos</span><strong>{planUsage.videos.used} / {planUsage.videos.limit}</strong></div>
        </div>
        <p>Generation limits count successful creations. Pending generations temporarily reserve a slot. Deleting a completed image or video does not restore your allowance. Failed generations do not count.</p>
      </section>}
      <section className="billing-provider-balance" aria-labelledby="billing-provider-title">
        <div>
          <h2 id="billing-provider-title">AI Generation Balance</h2>
          <span className="billing-provider-name">MuAPI</span>
          <div className="billing-provider-amount">
            <strong>{balance != null ? balance.toLocaleString() : "—"} Provider Credits</strong>
            <span className="billing-balance-info">
              <button type="button" aria-label="About Provider Credits" aria-describedby="billing-provider-tooltip">i</button>
              <span id="billing-provider-tooltip" role="tooltip">Your AI generation balance comes from your connected MuAPI account. Multiple API keys belonging to the same MuAPI account may display the same provider balance.</span>
            </span>
          </div>
          {balanceError && <p role="status">{balanceError}</p>}
          <p>Generation usage is charged against your connected MuAPI account.</p>
        </div>
        <Link className="button secondary" href="/dashboard/settings">Manage MuAPI</Link>
      </section>
      <section className="billing-credit-usage" aria-labelledby="billing-credit-usage-title">
        <h2 id="billing-credit-usage-title">Provider credit usage</h2>
        <div className="billing-credit-usage-grid">
          <article><h3>Images</h3><strong>About 4 credits per image</strong><p>Estimate only. The completed asset records the actual provider charge.</p></article>
          <article><h3>Videos</h3><strong>About 2.6 credits per second</strong><p>For example, a 15-second video is about 39 credits. Actual provider charges can vary.</p></article>
          <article><h3>Projects</h3><strong>0 credits per project</strong><p>Projects use your plan allowance, not credits; {projectAllowance}.</p></article>
        </div>
      </section>
      <section className="billing-credit-history" aria-labelledby="billing-credit-history-title">
        <div className="billing-credit-history-heading">
          <h2 id="billing-credit-history-title">Recent provider credit history</h2>
          <span>Latest 100 completed image and video generations</span>
        </div>
        {creditHistoryError ? <p className="billing-credit-history-message">{creditHistoryError}</p> : creditHistoryLoading ? (
          <p className="billing-credit-history-message">Loading credit history…</p>
        ) : creditHistory.length ? (
          <div className="billing-credit-history-scroll">
            <table className="billing-credit-history-table">
              <thead><tr><th>Asset</th><th>Type</th><th>Credits used</th><th>Completed</th></tr></thead>
              <tbody>
                {creditHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.type === "VIDEO" ? "Video" : "Image"}</td>
                    <td>{item.credits > 0 ? `${item.credits.toLocaleString()} credits` : "Not reported"}</td>
                    <td>{new Date(item.completedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="billing-credit-history-message">No completed image or video generations yet.</p>
        )}
      </section>
    </main>
  );
}

function Credits({ workspace, authFetch, notify }) {
  const plans = [
    { name: "Free", target: "Individual", price: "₹0", summary: "2 projects · 5 AI images · 5 AI videos" },
    { name: "Creator", target: "Individual / Creator", price: "₹599", summary: "10 projects · 25 AI images · 15 AI videos · 15 AI avatar videos" },
    { name: "Pro", target: "Professional", price: "₹1,499", summary: "Unlimited projects · 5 Facebook + 5 Instagram accounts" },
    { name: "Business", target: "Organization / Team", price: "₹4,999", summary: "10 members · shared workspace · 10 Facebook + 10 Instagram accounts" },
  ];
  const [balance, setBalance] = useState(null);
  const [balanceError, setBalanceError] = useState("");
  const refreshBalance = () => {
    fetchMuApiBalance(authFetch)
      .then((value) => {
        setBalance(value);
        setBalanceError("");
      })
      .catch((error) => setBalanceError(error.message));
  };
  useEffect(() => {
    refreshBalance();
    const onBalance = (event) => {
      const next = event?.detail?.balance;
      if (next != null) {
        setBalance(next);
        setBalanceError("");
      } else {
        refreshBalance();
      }
    };
    window.addEventListener("creatora:muapi-balance", onBalance);
    window.addEventListener("creatora:workspace-updated", refreshBalance);
    return () => {
      window.removeEventListener("creatora:muapi-balance", onBalance);
      window.removeEventListener("creatora:workspace-updated", refreshBalance);
    };
  }, []);
  return (
    <main className="workspace-page collection">
      <div className="page-title">
        <div>
          <span>WORKSPACE / CREDITS</span>
          <h1>Plan &amp; Billing</h1>
          <p>
            {balanceError
              ? balanceError
              : `${balance != null ? balance.toLocaleString() : "—"} Provider Credits remaining.`}{" "}
            Choose a plan for your next campaign.
          </p>
        </div>
      </div>
      <div className="plan-grid">
        {plans.map((plan) => (
          <article className="settings-card" key={plan.name}>
            <h3>{plan.name}</h3>
            <b className="plan-price">
              {plan.price}
              {plan.name !== "Free" && <small>/month</small>}
            </b>
            <p><strong>{plan.target}</strong><br />{plan.summary}</p>
            <button
              className="button"
              onClick={() => notify(`${plan.name} plan selected for checkout.`)}
            >
              Choose plan
            </button>
          </article>
        ))}
      </div>

    </main>
  );
}


function MuApiKeyCard({ authFetch, notify }) {
  const { organization } = useAuth();
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [credits, setCredits] = useState(null);
  const load = () => authFetch("/api/settings/muapi-key", { cache: "no-store" }).then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load MuAPI settings.");
    setStatus(result);
  }).catch((error) => notify(error.message));
  const loadBalance = () => authFetch("/api/muapi/balance", { cache: "no-store" }).then(async (response) => {
    const result = await response.json();
    // Always read `credits` so this card shows the same AI-Credit figure as the
    // header pill and sidebar instead of a raw USD balance.
    if (response.ok) setCredits(result.credits ?? null);
  }).catch(() => {});
  useEffect(() => { setStatus(null); setCredits(null); load(); loadBalance(); }, [organization?.id]);
  const save = async () => {
    setSaving(true);
    try {
      const response = await authFetch("/api/settings/muapi-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save MuAPI key.");
      setApiKey("");
      notify(`${status.scope === "ORGANIZATION" ? "Organization" : "Personal"} MuAPI key saved securely.`);
      // The stored key changed, so the cached balance is stale. Drop it and push
      // the fresh figure to the header pill and sidebar, which would otherwise
      // keep rendering "Not connected".
      invalidateMuApiBalance(authFetch.balanceScopeKey);
      await load();
      const updated = await authFetch("/api/muapi/balance", { cache: "no-store" })
        .then(async (response) => (await response.json()).credits ?? null)
        .catch(() => null);
      setCredits(updated);
      broadcastMuApiBalance(updated, authFetch.balanceScopeKey);
    } catch (error) { notify(error.message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    const response = await authFetch("/api/settings/muapi-key", { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { notify(result.error || "Unable to remove MuAPI key."); return; }
    notify("Stored MuAPI key removed.");
    await load();
    setCredits(null);
    // Clear the shared cache too, otherwise the header pill and sidebar would
    // keep showing the removed key's balance until the throttle expires.
    invalidateMuApiBalance(authFetch.balanceScopeKey);
    broadcastMuApiBalance(null, authFetch.balanceScopeKey);
  };
  return <article className="meta-connection-card">
    <div><b>{status?.scope === "ORGANIZATION" ? "Organization MuAPI key" : "Personal MuAPI key"}</b><span>{status?.configured ? status.canManage ? `Connected (${status.prefix})` : "Connected by your organization" : "Not connected"}</span><small>{status?.canManage ? "The key is encrypted at rest and is never shown again after saving." : status?.configured ? "AI generation is available." : "Ask an organization owner or admin to connect MuAPI."}</small></div>
    {status?.configured && credits != null && <div className="muapi-balance-display">✦ {credits.toLocaleString()} AI Credits</div>}
    {status?.canManage && <div className="muapi-key-actions"><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste a new MuAPI key" autoComplete="off" /><button className="button secondary" type="button" disabled={saving || apiKey.length < 12} onClick={save}>{saving ? "Saving…" : status?.configured ? "Replace key" : "Save key"}</button>{status?.configured && <button type="button" onClick={remove}>Remove stored key</button>}</div>}
    {status && !status.canManage && <small>Only an organization owner or admin can change this shared key.</small>}
  </article>;
}

function Settings({ workspace, authFetch, notify, notice }) {
  const [settings, setSettings] = useState(workspace.settings);
  const save = () => {
    updateWorkspace({ settings });
    notify("Workspace settings saved.");
  };
  const reset = () => {
    resetWorkspace();
    notify("Demo data reset.");
  };
  return (
    <main className="workspace-page collection settings-page">
      {notice && <div className="toast">{notice}</div>}
      <div className="page-title">
        <div>
          <span>WORKSPACE / SETTINGS</span>
          <h1>Workspace settings</h1>
          <p>Manage workspace defaults, integrations and demo data.</p>
        </div>
        <button className="button" onClick={save}>
          Save settings
        </button>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h3>Generation defaults</h3>
          <label>
            Default platform
            <select
              value={settings.defaultPlatform}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  defaultPlatform: event.target.value,
                })
              }
            >
              <option>Instagram</option>
              <option>Facebook</option>
              <option>YouTube</option>
              <option>LinkedIn</option>
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(event) =>
                setSettings({ ...settings, autoSave: event.target.checked })
              }
            />{" "}
            Auto-save projects
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  notifications: event.target.checked,
                })
              }
            />{" "}
            Enable notifications
          </label>
        </section>
       
      </div>
      <section className="settings-card integrations-card">
        <h3>Connections</h3>
        <MuApiKeyCard authFetch={authFetch} notify={notify} />
        <SocialConnectionCard provider="meta" authFetch={authFetch} notify={notify} />
        <SocialConnectionCard provider="linkedin" authFetch={authFetch} notify={notify} />
        <SocialConnectionCard provider="youtube" authFetch={authFetch} notify={notify} />
        <p>
          Tokens are never stored in browser localStorage. Real publishing
          requires OAuth, token refresh, connection health checks and
          disconnect/revoke support.
        </p>
      </section>
    </main>
  );
}
