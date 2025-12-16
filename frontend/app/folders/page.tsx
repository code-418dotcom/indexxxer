import { Suspense } from "react";
import FoldersClient from "./FoldersClient";

export default function FoldersPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading folders…</div>}>
      <FoldersClient />
    </Suspense>
  );
}
