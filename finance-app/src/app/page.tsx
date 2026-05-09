import { redirect } from "next/navigation";

export default function Home() {
  // Middleware will catch unauth'd users and bounce them to /login.
  redirect("/dashboard");
}
