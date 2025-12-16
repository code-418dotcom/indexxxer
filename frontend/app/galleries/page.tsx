import { Suspense } from "react";
import GalleriesClient from "./GalleriesClient";

export default function GalleriesPage() {
  return (
    <Suspense fallback={<div>Loading galleries…</div>}>
      <GalleriesClient />
    </Suspense>
  );
}
