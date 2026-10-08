import { adminConfigured } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/login-form";

// Rendered per request: ADMIN_PASSWORD is a runtime secret, absent when
// the image is built, and a prerendered page would say nobody can sign in.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm configured={adminConfigured()} />;
}
