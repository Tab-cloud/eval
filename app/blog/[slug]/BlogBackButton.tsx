"use client";

import { useRouter } from "next/navigation";

export function BlogBackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function goBack() {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const canReturnInsideSite = window.history.length > 1 && referrer?.origin === window.location.origin;
    if (canReturnInsideSite) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return <button type="button" className="blog-back-button" onClick={goBack}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.75 4.5 6.25 10l5.5 5.5M6.75 10h7"/>
    </svg>
    返回上一页
  </button>;
}
