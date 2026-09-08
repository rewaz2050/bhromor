import Link from "next/link";

/** A hosted opt-in form owns consent/unsubscribe; never pretend a local click subscribes. */
export function newsletterSignupUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default function Newsletter({ signupUrl }: { signupUrl?: string }) {
  const url = newsletterSignupUrl(signupUrl);
  return (
    <div className="w-full border border-white/20 p-6 sm:p-8">
      <p className="font-display text-2xl text-ivory-100">
        A little inspiration in your inbox.
      </p>
      <p className="mt-3 text-sm leading-7 text-ivory-100/70">
        New collections, exclusive offers and seasonal edits. Join through our
        email signup page when it opens.
      </p>
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-button mt-6 w-full bg-gold-200 text-forest-950 hover:bg-gold-300"
          >
            Join the list ↗
          </a>
          <p className="mt-3 text-xs leading-6 text-ivory-100/60">
            Opens our email signup page in a new tab. Enter your email and
            confirm your preferences there.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="editorial-button mt-6 w-full cursor-not-allowed border border-white/25 text-ivory-100/60"
          >
            Signup opening soon
          </button>
          <p className="mt-3 text-xs leading-6 text-ivory-100/60">
            Email signup isn’t connected yet. We’re not collecting email
            addresses here.
          </p>
          <Link
            href="/shop?filter=new"
            className="mt-4 inline-flex min-h-11 items-center text-xs text-gold-200 underline underline-offset-4"
          >
            Explore new arrivals meanwhile →
          </Link>
        </>
      )}
    </div>
  );
}
