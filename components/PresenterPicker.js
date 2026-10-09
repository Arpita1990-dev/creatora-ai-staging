"use client";

import { useState } from "react";
import { PRESENTER_CATEGORIES, PRESENTER_LIBRARY } from "@/lib/avatar/avatars.js";

export default function PresenterPicker({ selectedId, onSelect }) {
  const [category, setCategory] = useState("all");
  const available = PRESENTER_LIBRARY.filter((presenter) => presenter.enabled && presenter.assetAvailable);
  const filtered = category === "all" ? available : available.filter((presenter) => presenter.category === category);

  return (
    <div className="presenter-library" aria-label="Choose Presenter">
      <div className="presenter-filters" role="tablist" aria-label="Presenter categories">
        {PRESENTER_CATEGORIES.map((option) => (
          <button type="button" key={option.value} className={category === option.value ? "selected" : ""} onClick={() => setCategory(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="avatar-library-empty" aria-live="polite">
          <p>No presenter avatars have been added yet.</p>
        </div>
      ) : (
        <div className="presenter-grid">
          {filtered.map((presenter) => (
            <button type="button" key={presenter.id} className={`presenter-card ${selectedId === presenter.id ? "selected" : ""}`} onClick={() => onSelect(presenter.id)} aria-pressed={selectedId === presenter.id}>
              <img src={presenter.imageUrl} alt={`${presenter.name}, ${presenter.category}`} />
              <span>{presenter.name}</span>
              <small>{presenter.category}</small>
              {selectedId === presenter.id && <b className="presenter-check" aria-label="Selected">✓</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
