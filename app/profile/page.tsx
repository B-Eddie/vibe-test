import { ProfileForm } from "@/components/ProfileForm";

export default function ProfilePage() {
  return (
    <main>
      <header className="page-header">
        <h1>Background</h1>
        <p>The facts InternHarbor uses to draft your applications.</p>
      </header>
      <ProfileForm />
    </main>
  );
}
