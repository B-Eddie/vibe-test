import { ProfileForm } from "@/components/ProfileForm";

export default function ProfilePage() {
  return (
    <main>
      <header className="page-header">
        <h1>Your profile</h1>
        <p>
          Stored only in this browser. Used for ranking listings and drafting
          application text.
        </p>
      </header>
      <ProfileForm />
    </main>
  );
}
