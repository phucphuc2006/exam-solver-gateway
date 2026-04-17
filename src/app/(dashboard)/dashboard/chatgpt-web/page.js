import { Suspense } from "react";
import ChatgptWebPageShell from "./ChatgptWebPageShell";

export default function ChatgptWebPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChatgptWebPageShell />
    </Suspense>
  );
}
