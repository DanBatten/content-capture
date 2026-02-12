import { redirect } from 'next/navigation';

export default function Home() {
  // Middleware handles redirect to /login for unauthenticated users
  redirect('/archive');
}
