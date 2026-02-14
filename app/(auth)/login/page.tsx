import { PinLoginForm } from "@/components/auth/pin-login-form";

export default function LoginPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = searchParams?.next ?? "/dashboard";
  return <PinLoginForm nextPath={nextPath} />;
}
