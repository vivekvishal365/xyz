import { redirect } from "next/navigation";

/**
 * Root. Middleware sends signed-in users to /home; anyone else lands on sign-in.
 * A real marketing page replaces this before launch.
 */
export default function RootPage() {
  redirect("/login");
}
