"use client";

import { useEffect } from "react";
import PresenterPicker from "@/components/PresenterPicker";
import { AVATAR_MODEL_OPTIONS, getStockAvatar } from "@/lib/avatar/avatars.js";

const AVATAR_VOICE_OPTIONS = [
  { value: "Calm_Woman", label: "Calm Woman (Female)" },
  { value: "Inspirational_girl", label: "Inspirational Girl (Female)" },
  { value: "Lively_Girl", label: "Lively Girl (Female)" },
  { value: "English_Upbeat_Woman", label: "English Upbeat Woman (Female)" },
  { value: "Friendly_Person", label: "Friendly Person (Male)" },
];

const VOICE_STYLES = ["Natural", "Professional", "Energetic", "Calm"];

export default function AvatarVideoControls({
  videoMode = "avatar",
  setVideoMode,
  showModeToggle = true,
  avatarSource = "stock",
  setAvatarSource,
  avatarModel = "wan2.2-speech-to-video",
  setAvatarModel,
  selectedAvatarId = "",
  setSelectedAvatarId,
  avatarFile = null,
  setAvatarFile,
  avatarPreview = "",
  setAvatarPreview,
  avatarConsent = false,
  setAvatarConsent,
  voiceLanguage = "en-IN",
  setVoiceLanguage,
  voiceProfile = "Calm_Woman",
  setVoiceProfile,
  voiceStyle = "Natural",
  setVoiceStyle,
  voiceScript = "",
  setVoiceScript,
  generateVoiceScript,
  previewVoice,
  voiceScriptLoading = false,
  voicePreviewLoading = false,
  voicePreviewUrl = "",
  voicePreviewDuration = null,
  setNotice = () => {},
  scriptPlaceholder = "",
}) {
  const selectedPresenter = getStockAvatar(selectedAvatarId);
  const avatarInputReady = Boolean(selectedPresenter || avatarFile);

  const handleSelectPresenter = (id) => {
    setSelectedAvatarId(id);
    const presenter = getStockAvatar(id);
    if (presenter) {
      setAvatarPreview(presenter.imageUrl || "");
      if (presenter.voiceId) {
        setVoiceProfile(presenter.voiceId);
      }
    }
  };

  const handleUploadFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setNotice("Portraits must be 10MB or smaller.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarConsent(false);
  };

  return (
    <div className="avatar-video-controls full-width">
      {showModeToggle && setVideoMode && (
        <div className="voice-mode-stack" role="tablist" aria-label="Video type">
          <label>
            <input
              type="radio"
              name="avatar-control-video-mode"
              checked={videoMode === "ai"}
              onChange={() => setVideoMode("ai")}
            />
            AI Video
          </label>
          <label>
            <input
              type="radio"
              name="avatar-control-video-mode"
              checked={videoMode === "avatar"}
              onChange={() => setVideoMode("avatar")}
            />
            Avatar Video
          </label>
        </div>
      )}

      {videoMode === "avatar" && (
        <>
          <div className="form-row">
            <label>
              Avatar source
              <select
                value={avatarSource}
                onChange={(event) => {
                  const next = event.target.value;
                  setAvatarSource(next);
                  if (next === "stock" && selectedAvatarId) {
                    const p = getStockAvatar(selectedAvatarId);
                    setAvatarPreview(p?.imageUrl || "");
                  } else if (next === "upload") {
                    setAvatarPreview(avatarFile ? URL.createObjectURL(avatarFile) : "");
                  }
                }}
              >
                <option value="stock">Choose Presenter</option>
                <option value="upload">Upload Photo</option>
              </select>
            </label>
            <label>
              Avatar quality / model
              <select
                value={avatarModel}
                onChange={(event) => setAvatarModel(event.target.value)}
              >
                {AVATAR_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {avatarSource === "stock" ? (
            <div className="stock-presenter-section">
              <PresenterPicker
                selectedId={selectedAvatarId}
                onSelect={handleSelectPresenter}
              />
              <button
                type="button"
                className="button secondary upload-switch-btn"
                onClick={() => setAvatarSource("upload")}
              >
                Upload Your Photo
              </button>
            </div>
          ) : (
            <label className="voice-upload">
              Upload portrait
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadFile}
              />
              <small>
                For best results, use a clear, front-facing portrait with one person and good lighting. PNG, JPG, or WebP up to 10MB.
              </small>
            </label>
          )}

          {avatarPreview && (
            <div className="selected-presenter" aria-live="polite">
              <img
                className="avatar-selected-preview"
                src={avatarPreview}
                alt={selectedPresenter ? selectedPresenter.name : "Uploaded portrait"}
              />
              <div className="selected-presenter-info">
                <span className="selected-presenter-badge">Selected Presenter</span>
                <span className="selected-presenter-name">
                  {avatarSource === "stock" && selectedPresenter
                    ? selectedPresenter.name
                    : "User Photo"}
                </span>
                <span className="selected-presenter-category">
                  {avatarSource === "stock" && selectedPresenter
                    ? selectedPresenter.category
                    : "Uploaded Portrait"}
                </span>
              </div>
            </div>
          )}

          <div className="form-row">
            <label>
              Language
              <select
                disabled={!avatarInputReady}
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value)}
              >
                <option value="en-IN">English</option>
                <option value="hi-IN">Hindi</option>
              </select>
            </label>
            <label>
              Voice
              <select
                disabled={!avatarInputReady}
                value={voiceProfile}
                onChange={(event) => setVoiceProfile(event.target.value)}
              >
                {AVATAR_VOICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Voice Style
            <select
              disabled={!avatarInputReady}
              value={voiceStyle}
              onChange={(event) => setVoiceStyle(event.target.value)}
            >
              {VOICE_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label full-width">
            Script
            <textarea
              disabled={!avatarInputReady}
              value={voiceScript}
              onChange={(event) => setVoiceScript(event.target.value)}
              rows={4}
              lang={voiceLanguage}
              maxLength={500}
              placeholder={
                scriptPlaceholder ||
                (voiceLanguage === "hi-IN"
                  ? "अपने बिज़नेस को आगे बढ़ाने के लिए Creatora AI के साथ आकर्षक वीडियो बनाएं।"
                  : "Write a natural presenter script for your video...")
              }
            />
          </label>

          <div className="voice-actions-row full-width">
            {generateVoiceScript && (
              <button
                type="button"
                className="button secondary"
                disabled={voiceScriptLoading || !avatarInputReady}
                onClick={generateVoiceScript}
              >
                {voiceScriptLoading ? "Generating script..." : "✨ Generate Script"}
              </button>
            )}
            {previewVoice && (
              <button
                type="button"
                className="button secondary"
                disabled={voicePreviewLoading || !voiceScript.trim() || !avatarInputReady}
                onClick={previewVoice}
              >
                {voicePreviewLoading ? "Generating preview..." : "▶ Preview Voice"}
              </button>
            )}
          </div>

          {voicePreviewUrl && (
            <div className="full-width audio-preview-box">
              <audio controls src={voicePreviewUrl} />
              {voicePreviewDuration ? (
                <small className="audio-duration-badge">{Number(voicePreviewDuration).toFixed(1)}s</small>
              ) : null}
            </div>
          )}

          <label className="full-width consent-checkbox-label">
            <input
              type="checkbox"
              checked={avatarConsent}
              onChange={(event) => setAvatarConsent(event.target.checked)}
            />
            <span>I confirm I have permission to use this image to generate an AI avatar video.</span>
          </label>
        </>
      )}
    </div>
  );
}
