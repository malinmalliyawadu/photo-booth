import { adminConfigured } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/login-form";

export default function LoginPage() {
  return <LoginForm configured={adminConfigured()} />;
}
