import { youtubeId } from "@/lib/treninzi";

/** YouTube video vježbe (bez kolačića za praćenje). */
export function VideoVjezbe({ url, naslov }: { url: string | null; naslov: string }) {
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-rub bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`}
        title={naslov}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

/** Mala sličica: slika vježbe ili sličica YouTube videa. */
export function SlicicaVjezbe({
  slikaUrl,
  youtubeUrl,
  className = "h-14 w-14",
}: {
  slikaUrl: string | null;
  youtubeUrl: string | null;
  className?: string;
}) {
  const ytId = youtubeId(youtubeUrl);
  const src = slikaUrl ?? (ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null);
  if (!src) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-povrsina-2 text-xl text-tekst-2 ${className}`}
        aria-hidden="true"
      >
        🏋️
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- slike su već smanjene, a optimizacija slika je isključena
    <img src={src} alt="" loading="lazy" className={`shrink-0 rounded-xl object-cover ${className}`} />
  );
}
