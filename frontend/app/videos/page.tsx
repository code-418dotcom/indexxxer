import { Suspense } from "react";
import VideosClient from "./VideosClient";

export default function VideosPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading videos…</div>}>
      <VideosClient />
    </Suspense>
  );
}
