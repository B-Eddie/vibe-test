"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadProfile,
  parseCsvList,
  profileCompleteness,
  saveProfile,
} from "@/lib/storage";
import {
  EMPTY_PROFILE,
  type CustomFact,
  type StudentProfile,
} from "@/lib/types";

function newFact(): CustomFact {
  return {
    id: `fact-${Math.random().toString(36).slice(2, 9)}`,
    label: "",
    value: "",
  };
}

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

  const completeness = useMemo(() => profileCompleteness(profile), [profile]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: StudentProfile = {
      ...profile,
      interests: parseCsvList(interestsText),
      skills: parseCsvList(skillsText),
      customFacts: profile.customFacts.filter(
        (fact) => fact.label.trim() || fact.value.trim(),
      ),
    };
    saveProfile(next);
    setProfile(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  function updateFact(id: string, patch: Partial<CustomFact>) {
    setProfile((current) => ({
      ...current,
      customFacts: current.customFacts.map((fact) =>
        fact.id === id ? { ...fact, ...patch } : fact,
      ),
    }));
  }

  return (
    <form className="profile-form" onSubmit={onSubmit}>
      <div className="profile-progress">
        <div className="profile-progress-bar">
          <span style={{ width: `${completeness}%` }} />
        </div>
        <p>
          <strong>{completeness}%</strong>
          {" · "}
          <Link href="/apply">Apply →</Link>
        </p>
      </div>

      <div className="form-grid">
        <label>
          Full name
          <input
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="Your name"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            placeholder="you@school.edu"
          />
        </label>
        <label>
          Phone
          <input
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            placeholder="Optional"
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
          School
          <input
            value={profile.school}
            onChange={(e) => setProfile({ ...profile, school: e.target.value })}
            placeholder="Your high school"
          />
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
        Interests
        <input
          value={interestsText}
          onChange={(e) => setInterestsText(e.target.value)}
          placeholder="computer science, research, medicine"
        />
      </label>

      <label>
        Skills
        <input
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="python, writing, data analysis"
        />
      </label>

      <label>
        Activities
        <textarea
          rows={2}
          value={profile.activities}
          onChange={(e) =>
            setProfile({ ...profile, activities: e.target.value })
          }
          placeholder="Clubs, teams, volunteering"
        />
      </label>

      <label>
        Awards
        <textarea
          rows={2}
          value={profile.awards}
          onChange={(e) => setProfile({ ...profile, awards: e.target.value })}
          placeholder="Highlights"
        />
      </label>

      <label>
        Links
        <input
          value={profile.links}
          onChange={(e) => setProfile({ ...profile, links: e.target.value })}
          placeholder="Portfolio, GitHub, LinkedIn"
        />
      </label>

      <div className="form-grid">
        <label>
          Guardian name
          <input
            value={profile.parentName}
            onChange={(e) =>
              setProfile({ ...profile, parentName: e.target.value })
            }
          />
        </label>
        <label>
          Guardian email
          <input
            type="email"
            value={profile.parentEmail}
            onChange={(e) =>
              setProfile({ ...profile, parentEmail: e.target.value })
            }
          />
        </label>
      </div>

      <label>
        Bio
        <textarea
          rows={3}
          value={profile.bio}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          placeholder="A few sentences about you"
        />
      </label>

      <label>
        Résumé
        <textarea
          rows={6}
          value={profile.resumeText}
          onChange={(e) =>
            setProfile({ ...profile, resumeText: e.target.value })
          }
          placeholder="Paste résumé bullets"
        />
      </label>

      <label>
        Writing samples
        <textarea
          rows={5}
          value={profile.writingSamples}
          onChange={(e) =>
            setProfile({ ...profile, writingSamples: e.target.value })
          }
          placeholder="Paste writing that sounds like you"
        />
      </label>

      <div className="custom-facts">
        <div className="section-heading">
          <h2>Facts</h2>
        </div>
        {profile.customFacts.map((fact) => (
          <div key={fact.id} className="fact-row">
            <input
              value={fact.label}
              onChange={(e) => updateFact(fact.id, { label: e.target.value })}
              placeholder="Label (e.g. GPA)"
            />
            <input
              value={fact.value}
              onChange={(e) => updateFact(fact.id, { value: e.target.value })}
              placeholder="Value"
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                setProfile((current) => ({
                  ...current,
                  customFacts: current.customFacts.filter(
                    (item) => item.id !== fact.id,
                  ),
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setProfile((current) => ({
              ...current,
              customFacts: [...current.customFacts, newFact()],
            }))
          }
        >
          Add fact
        </button>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-primary">
          Save
        </button>
        {saved ? <span className="save-pulse">Saved</span> : null}
      </div>
    </form>
  );
}
