import { ProfileForm } from "@/components/ProfileForm";

export default function ProfilePage() {
  return (
    <main>
      <header className="page-header">
        <h1>Background</h1>
        <p>
          Your reusable applicant packet — stored only in this browser. The
          apply desk uses it to fill Google Forms and other applications.
        </p>
      </header>
      <ProfileForm />
    </main>
  );
}
