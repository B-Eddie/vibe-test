"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  loadProfile,
  parseCsvList,
  saveProfile,
} from "@/lib/storage";
import { EMPTY_PROFILE, type StudentProfile } from "@/lib/types";

export function ProfileForm() {
  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  const [interestsText, setInterestsText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loaded = loadProfile();
    setProfile(loaded);
    setInterestsText(loaded.interests.join(", "));
    setSkillsText(loaded.skills.join(", "));
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: StudentProfile = {
      ...profile,
      interests: parseCsvList(interestsText),
      skills: parseCsvList(skillsText),
    };
    saveProfile(next);
    setProfile(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form className="profile-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label>
          Name
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="Your name"
          />
        </label>
        <label>
          Grade
          <select
            value={profile.grade}
            onChange={(e) => setProfile({ ...profile, grade: e.target.value })}
          >
            {["9", "10", "11", "12"].map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
        <label>
          City
          <input
            value={profile.city}
            onChange={(e) => setProfile({ ...profile, city: e.target.value })}
            placeholder="Toronto, ON"
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={profile.remoteOk}
            onChange={(e) =>
              setProfile({ ...profile, remoteOk: e.target.checked })
            }
          />
          Open to remote roles
        </label>
      </div>

      <label>
        Interests (comma-separated)
        <input
          value={interestsText}
          onChange={(e) => setInterestsText(e.target.value)}
          placeholder="computer science, research, medicine"
        />
      </label>

      <label>
        Skills (comma-separated)
        <input
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="python, writing, data analysis"
        />
      </label>

      <label>
        Short bio
        <textarea
          rows={4}
          value={profile.bio}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          placeholder="A few sentences about what you care about and how you work."
        />
      </label>

      <label>
        Résumé text (paste)
        <textarea
          rows={8}
          value={profile.resumeText}
          onChange={(e) =>
            setProfile({ ...profile, resumeText: e.target.value })
          }
          placeholder="Paste bullet points from your résumé for better drafts."
        />
      </label>

      <div className="form-actions">
        <button type="submit" className="btn-primary">
          Save profile
        </button>
        {saved ? <span className="save-pulse">Saved locally</span> : null}
      </div>
    </form>
  );
}
